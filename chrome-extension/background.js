// Service Worker (Manifest V3) — Dual-Mode Remote Hub:
// 1) Instant WebRTC P2P mode (zero laptop setup, QR right in popup)
// 2) Seamless Local Windows Agent bridge (127.0.0.1:8765) when running silently in background

const OFFSCREEN_PATH = "offscreen.html";
const ALARM_NAME = "ensure-remote-bridge";
const SLEEP_ALARM_NAME = "browser-sleep-timer";
const DEFAULT_PWA_URL = "https://raults32.github.io/ChromeRemoteControl/app/";

const DEFAULT_BROWSER_MACROS = [
  {
    id: "cinema-mode",
    name: "Cinema Mode",
    description: "Open Netflix, set volume to 80%, and enter fullscreen",
    steps: [
      { type: "set_volume", value: 80 },
      { type: "open_url", value: "https://www.netflix.com" },
      { type: "fullscreen", value: true }
    ]
  },
  {
    id: "work-mode",
    name: "Work Mode",
    description: "Open Gmail, Calendar, and GitHub at 35% volume",
    steps: [
      { type: "set_volume", value: 35 },
      { type: "open_url", value: "https://mail.google.com" },
      { type: "open_url", value: "https://calendar.google.com" },
      { type: "open_url", value: "https://github.com" }
    ]
  },
  {
    id: "night-mode",
    name: "Night Mode",
    description: "Lower volume to 20% and start a 45m sleep timer",
    steps: [
      { type: "set_volume", value: 20 },
      { type: "sleep_timer", value: 45 }
    ]
  }
];

let screenCaptureTimer = null;
const screenSubscribers = new Set();

// ============================================================================
// Pairing Identity Generation & Persistence
// ============================================================================
function randomDigits(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += String(bytes[i] % 10);
  }
  if (out[0] === "0") {
    out = String((bytes[0] % 9) + 1) + out.slice(1);
  }
  return out;
}

function randomHex(byteLen = 12) {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getOrCreateIdentity(rotate = false) {
  const stored = await chrome.storage.local.get([
    "roomCode",
    "pairingKey",
    "pairingPin",
    "pwaBaseUrl",
    "browserMacros",
    "browserMouseSettings",
    "browserVolume"
  ]);

  let { roomCode, pairingKey, pairingPin } = stored;
  const pwaBaseUrl = stored.pwaBaseUrl || DEFAULT_PWA_URL;

  if (rotate || !roomCode || !pairingKey || !pairingPin) {
    roomCode = randomDigits(8);
    pairingPin = randomDigits(4);
    pairingKey = randomHex(12);
    await chrome.storage.local.set({ roomCode, pairingKey, pairingPin });
  }

  if (!Array.isArray(stored.browserMacros)) {
    await chrome.storage.local.set({ browserMacros: DEFAULT_BROWSER_MACROS });
  }
  if (!stored.browserMouseSettings) {
    await chrome.storage.local.set({
      browserMouseSettings: { sensitivity: 1.7, acceleration: 1.2, invert_scroll: false }
    });
  }
  if (!stored.browserVolume) {
    await chrome.storage.local.set({
      browserVolume: { volume: 80, muted: false }
    });
  }

  const sep = pwaBaseUrl.includes("?") ? "&" : "?";
  const pairingUrl = `${pwaBaseUrl}${sep}room=${encodeURIComponent(roomCode)}&key=${encodeURIComponent(pairingKey)}`;

  return { roomCode, pairingKey, pairingPin, pwaBaseUrl, pairingUrl };
}

// ============================================================================
// Offscreen Document Management
// ============================================================================
async function getConfiguredPort() {
  const { serverPort = 8765 } = await chrome.storage.local.get("serverPort");
  return Number(serverPort) || 8765;
}

async function hasOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreenBridge(forceReconnect = false, forcePeerRestart = false) {
  const port = await getConfiguredPort();
  const identity = await getOrCreateIdentity(false);
  const exists = await hasOffscreenDocument();

  if (!exists) {
    const { offscreenLock = "idle" } = await chrome.storage.session.get("offscreenLock");
    if (offscreenLock === "creating") {
      return;
    }
    await chrome.storage.session.set({ offscreenLock: "creating" });
    try {
      try {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_PATH,
          reasons: ["WEB_RTC", "CLIPBOARD", "BLOBS"],
          justification: "Maintain WebRTC P2P phone pairing and optional localhost PC agent bridge"
        });
      } catch (_firstErr) {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_PATH,
          reasons: ["BLOBS"],
          justification: "Maintain remote control bridge"
        });
      }
    } catch (err) {
      if (!String(err?.message || "").includes("Only a single offscreen")) {
        console.warn("Offscreen create notice:", err);
      }
    } finally {
      await chrome.storage.session.set({ offscreenLock: "idle" });
    }
  }

  try {
    await chrome.runtime.sendMessage({
      target: "offscreen",
      type: forceReconnect ? "OFFSCREEN_RECONNECT" : "OFFSCREEN_INIT",
      port,
      identity: {
        roomCode: identity.roomCode,
        pairingKey: identity.pairingKey,
        pairingPin: identity.pairingPin
      },
      forcePeerRestart
    });
  } catch (_err) {
    // Offscreen still booting
  }
}

async function sendToClients(payload, clientId = null) {
  try {
    await ensureOffscreenBridge(false, false);
    await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "OFFSCREEN_SEND",
      payload,
      clientId
    });
  } catch (_err) {
    // Ignore
  }
}

async function updateActionBadge(wsConnected, webrtcCount) {
  try {
    if (webrtcCount > 0) {
      await chrome.action.setBadgeText({ text: String(webrtcCount) });
      await chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    } else if (wsConnected) {
      await chrome.action.setBadgeText({ text: "PC" });
      await chrome.action.setBadgeBackgroundColor({ color: "#06b6d4" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch (_err) {
    // Ignore badge errors
  }
}

// ============================================================================
// Omnibox URL Resolver (works identically with or without Python PC server)
// ============================================================================
const SEARCH_ENGINES = {
  google: "https://www.google.com/search?q=",
  youtube: "https://www.youtube.com/results?search_query=",
  bing: "https://www.bing.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q="
};

function resolveOmniboxUrl(rawInput, engine = "google") {
  const text = String(rawInput || "").trim();
  if (!text) return "https://www.google.com";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text) || text.startsWith("chrome://") || text.startsWith("about:")) {
    return text;
  }
  if (!text.includes(" ") && (text.includes(".") || text.startsWith("localhost"))) {
    return `https://${text}`;
  }
  const base = SEARCH_ENGINES[String(engine || "google").toLowerCase()] || SEARCH_ENGINES.google;
  return `${base}${encodeURIComponent(text)}`;
}

// ============================================================================
// Tabs & Windows Telemetry
// ============================================================================
function extractDomain(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_err) {
    return url.split("/")[0] || "";
  }
}

async function collectTabsAndWindows() {
  const allWindows = await chrome.windows.getAll({ populate: true });
  const windowsSummary = [];
  const tabsSummary = [];

  for (const win of allWindows) {
    if (win.type !== "normal" && win.type !== "popup") continue;
    const winTabs = win.tabs || [];
    windowsSummary.push({
      id: win.id,
      focused: Boolean(win.focused),
      incognito: Boolean(win.incognito),
      state: win.state || "normal",
      tabsCount: winTabs.length
    });

    for (const tab of winTabs) {
      tabsSummary.push({
        id: tab.id,
        windowId: tab.windowId,
        index: tab.index,
        title: tab.title || "New Tab",
        url: tab.url || "",
        domain: extractDomain(tab.url),
        favIconUrl: tab.favIconUrl || "",
        active: Boolean(tab.active),
        windowFocused: Boolean(win.focused),
        pinned: Boolean(tab.pinned),
        audible: Boolean(tab.audible),
        muted: Boolean(tab.mutedInfo?.muted),
        incognito: Boolean(tab.incognito),
        status: tab.status || "complete"
      });
    }
  }
  return { tabs: tabsSummary, windows: windowsSummary };
}

async function broadcastTabsAndWindows() {
  try {
    const payload = await collectTabsAndWindows();
    await sendToClients({
      target: "client",
      action: "tabs_list",
      payload
    });
  } catch (err) {
    console.warn("Failed to query tabs/windows:", err);
  }
}

// ============================================================================
// Active Tab & Media Resolution
// ============================================================================
async function getTargetTab(explicitTabId) {
  if (explicitTabId) {
    try {
      return await chrome.tabs.get(Number(explicitTabId));
    } catch (_err) {
      // Fallback
    }
  }
  const [focusedActive] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (focusedActive) return focusedActive;
  const [anyActive] = await chrome.tabs.query({ active: true });
  return anyActive || null;
}

async function getBestMediaTab() {
  const { lastMediaTabId = null } = await chrome.storage.session.get("lastMediaTabId");
  const audibleTabs = await chrome.tabs.query({ audible: true });
  if (audibleTabs.length > 0) {
    return audibleTabs[0];
  }
  if (lastMediaTabId) {
    try {
      const remembered = await chrome.tabs.get(Number(lastMediaTabId));
      if (remembered) return remembered;
    } catch (_err) {
      await chrome.storage.session.remove("lastMediaTabId");
    }
  }
  return await getTargetTab();
}

async function ensureContentScriptAndSend(tabId, message) {
  if (!tabId) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_firstErr) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content_media.js"]
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (_secondErr) {
      return null;
    }
  }
}

function flattenBookmarks(nodes, folderName = "", acc = []) {
  for (const node of nodes) {
    if (node.url) {
      acc.push({
        id: node.id,
        title: node.title || extractDomain(node.url) || "Bookmark",
        url: node.url,
        domain: extractDomain(node.url),
        folder: folderName
      });
    }
    if (node.children && node.children.length > 0) {
      const nextFolder = node.title || folderName;
      flattenBookmarks(node.children, nextFolder, acc);
    }
    if (acc.length >= 120) break;
  }
  return acc;
}

// ============================================================================
// Browser-Only Mode System Fallbacks (when PC Agent is not running)
// ============================================================================
async function getBrowserSleepTimerState() {
  const { browserSleepEndTs = null, browserSleepMode = "pause_media" } = await chrome.storage.local.get([
    "browserSleepEndTs",
    "browserSleepMode"
  ]);
  if (!browserSleepEndTs) {
    return { active: false, remainingSeconds: 0, mode: browserSleepMode };
  }
  const rem = Math.max(0, Math.round((Number(browserSleepEndTs) - Date.now()) / 1000));
  if (rem <= 0) {
    return { active: false, remainingSeconds: 0, mode: browserSleepMode };
  }
  return { active: true, remainingSeconds: rem, mode: browserSleepMode };
}

async function sendBrowserInitState(peerId) {
  const { wsConnected = false } = await chrome.storage.session.get("wsConnected");
  const {
    browserMacros = DEFAULT_BROWSER_MACROS,
    browserMouseSettings = { sensitivity: 1.7, acceleration: 1.2, invert_scroll: false },
    browserVolume = { volume: 80, muted: false }
  } = await chrome.storage.local.get(["browserMacros", "browserMouseSettings", "browserVolume"]);

  const { tabs, windows } = await collectTabsAndWindows();
  const sleepTimer = await getBrowserSleepTimerState();

  await sendToClients(
    {
      target: "client",
      action: "init_state",
      payload: {
        os: "browser",
        paused: false,
        extensionConnected: true,
        pcAgentConnected: Boolean(wsConnected),
        audio: browserVolume,
        mouse: browserMouseSettings,
        screen: { fps: 4, quality: 50, scale: 0.5, format: "jpeg", active: false },
        macros: browserMacros,
        sleepTimer,
        tabs,
        windows
      }
    },
    peerId
  );

  const mediaTab = await getBestMediaTab();
  if (mediaTab?.id) {
    const state = await ensureContentScriptAndSend(mediaTab.id, { type: "MEDIA_GET_STATE" });
    if (state) {
      await sendToClients({ target: "client", action: "media_state", payload: { ...state, tabId: mediaTab.id } }, peerId);
    }
  }
}

function startTabScreenLoop() {
  if (screenCaptureTimer !== null) return;
  screenCaptureTimer = setInterval(async () => {
    if (screenSubscribers.size === 0) {
      clearInterval(screenCaptureTimer);
      screenCaptureTimer = null;
      return;
    }
    try {
      const win = await chrome.windows.getLastFocused();
      if (!win?.id) return;
      const dataUrl = await chrome.tabs.captureVisibleTab(win.id, { format: "jpeg", quality: 48 });
      if (!dataUrl) return;
      const commaIdx = dataUrl.indexOf(",");
      const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      for (const peerId of screenSubscribers) {
        await sendToClients(
          {
            target: "client",
            action: "screen_frame",
            payload: {
              format: "jpeg",
              data: base64Data,
              dataUrl,
              ts: Date.now()
            }
          },
          peerId
        );
      }
    } catch (_err) {
      // Restricted chrome:// tab cannot be captured; silently skip frame
    }
  }, 320);
}

async function handleBrowserSystemFallback(action, payload = {}, peerId = null) {
  const act = String(action || "").toLowerCase();

  // Virtual In-Page Touchpad & Keyboard
  if (act === "mouse_move" || act === "mouse_click" || act === "mouse_scroll" || act === "screen_tap") {
    const { browserMouseSettings = { sensitivity: 1.7, invert_scroll: false } } =
      await chrome.storage.local.get("browserMouseSettings");
    const target = await getTargetTab();
    if (!target?.id) return;

    const adjusted = { ...payload, sensitivity: browserMouseSettings.sensitivity || 1.7 };
    if (act === "mouse_scroll" && browserMouseSettings.invert_scroll) {
      adjusted.dy = -Number(payload.dy || 0);
    }
    await ensureContentScriptAndSend(target.id, { type: "PAGE_INPUT", action: act, payload: adjusted });
    return;
  }

  if (act === "mouse_button") {
    if (payload.state === "down") {
      const target = await getTargetTab();
      if (target?.id) {
        await ensureContentScriptAndSend(target.id, {
          type: "PAGE_INPUT",
          action: "mouse_click",
          payload: { button: payload.button || "left", count: 1 }
        });
      }
    }
    return;
  }

  if (act === "pinch_zoom") {
    await handleChromeCommand(Number(payload.delta || 0) >= 0 ? "zoom_in" : "zoom_out", {});
    return;
  }

  if (act === "mouse_update_settings") {
    const { browserMouseSettings = { sensitivity: 1.7, acceleration: 1.2, invert_scroll: false } } =
      await chrome.storage.local.get("browserMouseSettings");
    const updated = {
      sensitivity: payload.sensitivity !== undefined ? Number(payload.sensitivity) : browserMouseSettings.sensitivity,
      acceleration: payload.acceleration !== undefined ? Number(payload.acceleration) : browserMouseSettings.acceleration,
      invert_scroll:
        payload.invert_scroll !== undefined ? Boolean(payload.invert_scroll) : browserMouseSettings.invert_scroll
    };
    await chrome.storage.local.set({ browserMouseSettings: updated });
    await sendToClients({ target: "client", action: "mouse_settings", payload: updated }, peerId);
    return;
  }

  if (act === "key_type" || act === "key_press") {
    if (act === "key_press" && String(payload.key || "").toLowerCase() === "f11") {
      await handleChromeCommand("fullscreen", {});
      return;
    }
    const target = await getTargetTab();
    if (target?.id) {
      await ensureContentScriptAndSend(target.id, { type: "PAGE_INPUT", action: act, payload });
    }
    return;
  }

  if (act === "shortcut") {
    const sc = String(payload.shortcut || payload.name || "").toLowerCase();
    if (sc === "alt_tab") {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      if (tabs.length > 1) {
        const activeIdx = tabs.findIndex((t) => t.active);
        const nextTab = tabs[(activeIdx + 1) % tabs.length];
        if (nextTab?.id) {
          await chrome.tabs.update(nextTab.id, { active: true });
        }
      }
      return;
    }
    if (sc === "paste") {
      try {
        const clipRes = await chrome.runtime.sendMessage({ target: "offscreen", type: "OFFSCREEN_CLIPBOARD_READ" });
        if (clipRes?.text) {
          const target = await getTargetTab();
          if (target?.id) {
            await ensureContentScriptAndSend(target.id, {
              type: "PAGE_INPUT",
              action: "key_type",
              payload: { text: clipRes.text }
            });
          }
        }
      } catch (_e) {
        // Ignore
      }
      return;
    }
    const target = await getTargetTab();
    if (target?.id) {
      const res = await ensureContentScriptAndSend(target.id, { type: "PAGE_INPUT", action: "shortcut", payload });
      if (sc === "copy" && res?.selectedText) {
        await chrome.runtime.sendMessage({
          target: "offscreen",
          type: "OFFSCREEN_CLIPBOARD_WRITE",
          text: res.selectedText
        });
      }
    }
    return;
  }

  // Audio fallback -> controls active Chrome media / tab mute
  if (act === "audio_set_volume") {
    const volPct = Math.max(0, Math.min(100, Number(payload.volume ?? 80)));
    const state = { volume: Math.round(volPct), muted: volPct === 0 };
    await chrome.storage.local.set({ browserVolume: state });
    await handleMediaCommand("set_video_volume", { volume: volPct / 100 });
    await sendToClients({ target: "client", action: "audio_state", payload: state });
    return;
  }

  if (act === "audio_toggle_mute") {
    const { browserVolume = { volume: 80, muted: false } } = await chrome.storage.local.get("browserVolume");
    const nextMuted = typeof payload.muted === "boolean" ? payload.muted : !browserVolume.muted;
    const state = { ...browserVolume, muted: nextMuted };
    await chrome.storage.local.set({ browserVolume: state });
    const mediaTab = await getBestMediaTab();
    if (mediaTab?.id) {
      await chrome.tabs.update(mediaTab.id, { muted: nextMuted });
      await broadcastTabsAndWindows();
    }
    await sendToClients({ target: "client", action: "audio_state", payload: state });
    return;
  }

  // Live Active Tab Preview ("Screen Spy" in Browser-Only Mode)
  if (act === "screen_start") {
    if (peerId) {
      screenSubscribers.add(peerId);
      startTabScreenLoop();
    }
    return;
  }

  if (act === "screen_stop") {
    if (peerId) {
      screenSubscribers.delete(peerId);
    }
    return;
  }

  // Two-Way Clipboard
  if (act === "clipboard_set") {
    const text = String(payload.text || "");
    await chrome.runtime.sendMessage({ target: "offscreen", type: "OFFSCREEN_CLIPBOARD_WRITE", text });
    if (payload.autoPaste) {
      const target = await getTargetTab();
      if (target?.id) {
        await ensureContentScriptAndSend(target.id, {
          type: "PAGE_INPUT",
          action: "key_type",
          payload: { text }
        });
      }
    }
    await sendToClients(
      {
        target: "client",
        action: "toast",
        payload: { message: payload.autoPaste ? "Text pasted into active tab" : "Copied to PC clipboard", type: "success" }
      },
      peerId
    );
    return;
  }

  if (act === "clipboard_get") {
    const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "OFFSCREEN_CLIPBOARD_READ" });
    await sendToClients(
      { target: "client", action: "clipboard_content", payload: { text: res?.text || "" } },
      peerId
    );
    return;
  }

  // Macros in chrome.storage.local
  if (act === "macro_run") {
    const { browserMacros = DEFAULT_BROWSER_MACROS } = await chrome.storage.local.get("browserMacros");
    const found = browserMacros.find((m) => m.id === payload.id);
    if (!found) return;
    for (const step of found.steps || []) {
      if (step.type === "open_url" && step.value) {
        await chrome.tabs.create({ url: String(step.value), active: true });
      } else if (step.type === "set_volume") {
        await handleBrowserSystemFallback("audio_set_volume", { volume: Number(step.value ?? 70) }, peerId);
      } else if (step.type === "fullscreen" || (step.type === "key" && String(step.value).toLowerCase() === "f11")) {
        await handleChromeCommand("fullscreen", {});
      } else if (step.type === "sleep_timer") {
        await handleBrowserSystemFallback("sleep_timer_set", { minutes: Number(step.value || 30) }, peerId);
      }
    }
    await sendToClients(
      { target: "client", action: "toast", payload: { message: `Running: ${found.name}`, type: "info" } },
      peerId
    );
    return;
  }

  if (act === "macro_save") {
    const macroObj = payload.macro || {};
    if (!macroObj.name) return;
    const { browserMacros = DEFAULT_BROWSER_MACROS } = await chrome.storage.local.get("browserMacros");
    const list = [...browserMacros];
    const id = macroObj.id || `macro-${randomHex(4)}`;
    const clean = {
      id,
      name: String(macroObj.name).slice(0, 40),
      description: String(macroObj.description || "").slice(0, 120),
      steps: Array.isArray(macroObj.steps) ? macroObj.steps : []
    };
    const idx = list.findIndex((m) => m.id === id);
    if (idx >= 0) list[idx] = clean;
    else list.push(clean);
    await chrome.storage.local.set({ browserMacros: list });
    await sendToClients({ target: "client", action: "macros_list", payload: { macros: list } });
    return;
  }

  if (act === "macro_delete") {
    const { browserMacros = DEFAULT_BROWSER_MACROS } = await chrome.storage.local.get("browserMacros");
    const list = browserMacros.filter((m) => m.id !== payload.id);
    await chrome.storage.local.set({ browserMacros: list });
    await sendToClients({ target: "client", action: "macros_list", payload: { macros: list } });
    return;
  }

  // Sleep Timer in Browser Mode -> pauses all videos & mutes audible tabs when timer finishes!
  if (act === "sleep_timer_set") {
    const minutes = Math.max(1, Number(payload.minutes || 30));
    const endTs = Date.now() + Math.round(minutes * 60 * 1000);
    await chrome.storage.local.set({ browserSleepEndTs: endTs, browserSleepMode: "pause_media" });
    await chrome.alarms.create(SLEEP_ALARM_NAME, { when: endTs });
    const state = await getBrowserSleepTimerState();
    await sendToClients({ target: "client", action: "sleep_timer_state", payload: state });
    await sendToClients(
      {
        target: "client",
        action: "toast",
        payload: { message: `Browser sleep timer set (${minutes}m — pauses playback automatically)`, type: "info" }
      },
      peerId
    );
    return;
  }

  if (act === "sleep_timer_cancel") {
    await chrome.alarms.clear(SLEEP_ALARM_NAME);
    await chrome.storage.local.remove("browserSleepEndTs");
    await sendToClients({
      target: "client",
      action: "sleep_timer_state",
      payload: { active: false, remainingSeconds: 0, mode: "pause_media" }
    });
    return;
  }

  if (act === "power_action") {
    await sendToClients(
      {
        target: "client",
        action: "toast",
        payload: {
          message: "Enable the optional Silent Windows Agent (in Extension Popup) to Lock, Sleep, or Shut Down Windows.",
          type: "warning"
        }
      },
      peerId
    );
  }
}

// ============================================================================
// Command Execution (Chrome & Media)
// ============================================================================
async function handleChromeCommand(action, payload = {}, clientId = null) {
  const act = String(action || "").toLowerCase();

  if (act === "sync_all" || act === "get_tabs") {
    await broadcastTabsAndWindows();
    const mediaTab = await getBestMediaTab();
    if (mediaTab?.id) {
      const state = await ensureContentScriptAndSend(mediaTab.id, { type: "MEDIA_GET_STATE" });
      if (state) {
        await sendToClients({ target: "client", action: "media_state", payload: { ...state, tabId: mediaTab.id } });
      }
    }
    return;
  }

  if (act === "tab_activate") {
    const tabId = Number(payload.tabId);
    if (!tabId) return;
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab?.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    await broadcastTabsAndWindows();
    return;
  }

  if (act === "tab_close") {
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      await chrome.tabs.remove(target.id);
    }
    return;
  }

  if (act === "tab_mute") {
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      const nextMuted = typeof payload.muted === "boolean" ? payload.muted : !Boolean(target.mutedInfo?.muted);
      await chrome.tabs.update(target.id, { muted: nextMuted });
      await broadcastTabsAndWindows();
    }
    return;
  }

  if (act === "tab_pin") {
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      const nextPinned = typeof payload.pinned === "boolean" ? payload.pinned : !Boolean(target.pinned);
      await chrome.tabs.update(target.id, { pinned: nextPinned });
      await broadcastTabsAndWindows();
    }
    return;
  }

  if (act === "tab_duplicate") {
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      await chrome.tabs.duplicate(target.id);
    }
    return;
  }

  if (act === "tab_reopen") {
    try {
      await chrome.sessions.restore();
    } catch (_err) {
      // No recently closed session
    }
    return;
  }

  if (act === "tab_new") {
    const url = payload.url ? resolveOmniboxUrl(payload.url, payload.engine) : "chrome://newtab";
    if (payload.incognito || payload.newWindow) {
      await chrome.windows.create({
        url,
        incognito: Boolean(payload.incognito),
        focused: true
      });
    } else {
      await chrome.tabs.create({ url, active: payload.active !== false });
    }
    return;
  }

  if (act === "window_new") {
    await chrome.windows.create({
      url: payload.url ? resolveOmniboxUrl(payload.url, payload.engine) : "chrome://newtab",
      incognito: Boolean(payload.incognito),
      focused: true
    });
    return;
  }

  if (act === "window_focus") {
    if (payload.windowId) {
      await chrome.windows.update(Number(payload.windowId), { focused: true });
      await broadcastTabsAndWindows();
    }
    return;
  }

  if (act === "omnibox" || act === "navigate") {
    const url = resolveOmniboxUrl(payload.url || payload.query || "", payload.engine || "google");
    if (payload.incognito || payload.newWindow) {
      await chrome.windows.create({ url, incognito: Boolean(payload.incognito), focused: true });
      return;
    }
    if (payload.newTab) {
      await chrome.tabs.create({ url, active: true });
      return;
    }
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      await chrome.tabs.update(target.id, { url });
    } else {
      await chrome.tabs.create({ url, active: true });
    }
    return;
  }

  if (act === "nav_back") {
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      try {
        await chrome.tabs.goBack(target.id);
      } catch (_e) {
        // Start of history
      }
    }
    return;
  }

  if (act === "nav_forward") {
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      try {
        await chrome.tabs.goForward(target.id);
      } catch (_e) {
        // End of history
      }
    }
    return;
  }

  if (act === "nav_reload" || act === "nav_hard_reload") {
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      await chrome.tabs.reload(target.id, { bypassCache: act === "nav_hard_reload" });
    }
    return;
  }

  if (act === "nav_stop") {
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: target.id },
          func: () => window.stop()
        });
      } catch (_e) {
        // Restricted chrome:// page
      }
    }
    return;
  }

  if (act === "nav_home") {
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      await chrome.tabs.update(target.id, { url: "https://www.google.com" });
    }
    return;
  }

  if (act === "zoom_in" || act === "zoom_out" || act === "zoom_reset") {
    const target = await getTargetTab(payload.tabId);
    if (!target?.id) return;
    try {
      if (act === "zoom_reset") {
        await chrome.tabs.setZoom(target.id, 1.0);
      } else {
        const currentZoom = await chrome.tabs.getZoom(target.id);
        const step = act === "zoom_in" ? 0.15 : -0.15;
        const nextZoom = Math.max(0.25, Math.min(5.0, Number((currentZoom + step).toFixed(2))));
        await chrome.tabs.setZoom(target.id, nextZoom);
      }
    } catch (_e) {
      // Restricted page
    }
    return;
  }

  if (act === "fullscreen") {
    const win = await chrome.windows.getLastFocused();
    if (win?.id) {
      const nextState = win.state === "fullscreen" ? "maximized" : "fullscreen";
      await chrome.windows.update(win.id, { state: nextState });
    }
    return;
  }

  if (act === "get_bookmarks") {
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = flattenBookmarks(tree);
    await sendToClients(
      {
        target: "client",
        action: "bookmarks_list",
        clientId,
        payload: { bookmarks }
      },
      clientId
    );
    return;
  }

  if (act === "get_history") {
    const items = await chrome.history.search({
      text: String(payload.query || ""),
      maxResults: 40
    });
    const history = items.map((h) => ({
      id: h.id,
      title: h.title || extractDomain(h.url),
      url: h.url || "",
      domain: extractDomain(h.url),
      lastVisitTime: h.lastVisitTime || 0
    }));
    await sendToClients(
      {
        target: "client",
        action: "history_list",
        clientId,
        payload: { history }
      },
      clientId
    );
    return;
  }

  if (act === "get_downloads") {
    const rawDownloads = await chrome.downloads.search({
      limit: 25,
      orderBy: ["-startTime"]
    });
    const downloads = rawDownloads.map((d) => ({
      id: d.id,
      filename: (d.filename || "").split(/[\\/]/).pop() || d.url,
      url: d.url || "",
      state: d.state,
      bytesReceived: d.bytesReceived || 0,
      totalBytes: d.totalBytes || 0,
      paused: Boolean(d.paused)
    }));
    await sendToClients(
      {
        target: "client",
        action: "downloads_list",
        clientId,
        payload: { downloads }
      },
      clientId
    );
    return;
  }

  if (act === "open_history") {
    await chrome.tabs.create({ url: "chrome://history", active: true });
    return;
  }

  if (act === "open_downloads") {
    await chrome.tabs.create({ url: "chrome://downloads", active: true });
    return;
  }

  if (act === "open_bookmarks_manager") {
    await chrome.tabs.create({ url: "chrome://bookmarks", active: true });
    return;
  }

  if (act === "find_in_page") {
    const target = await getTargetTab(payload.tabId);
    if (target?.id) {
      const res = await ensureContentScriptAndSend(target.id, {
        type: "PAGE_FIND",
        query: String(payload.query || ""),
        backwards: Boolean(payload.backwards)
      });
      await sendToClients(
        {
          target: "client",
          action: "find_result",
          clientId,
          payload: res || { found: false, query: payload.query || "" }
        },
        clientId
      );
    }
  }
}

async function handleMediaCommand(action, payload = {}) {
  const targetTab = payload.tabId ? await getTargetTab(payload.tabId) : await getBestMediaTab();
  if (!targetTab?.id) return;

  const response = await ensureContentScriptAndSend(targetTab.id, {
    type: "MEDIA_COMMAND",
    action,
    payload
  });

  if (response && response.hasMedia) {
    await chrome.storage.session.set({ lastMediaTabId: targetTab.id });
    await sendToClients({
      target: "client",
      action: "media_state",
      payload: { ...response, tabId: targetTab.id }
    });
  }
}

// ============================================================================
// Top-Level Synchronous Event Listeners (MV3 Lifecycle)
// ============================================================================
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get("serverPort");
  if (!existing.serverPort) {
    await chrome.storage.local.set({ serverPort: 8765 });
  }
  await getOrCreateIdentity(false);
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  await ensureOffscreenBridge(false, false);
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  await ensureOffscreenBridge(false, false);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await ensureOffscreenBridge(false, false);
  } else if (alarm.name === SLEEP_ALARM_NAME) {
    await chrome.storage.local.remove("browserSleepEndTs");
    const audibleTabs = await chrome.tabs.query({ audible: true });
    for (const t of audibleTabs) {
      if (t.id) {
        await ensureContentScriptAndSend(t.id, { type: "MEDIA_COMMAND", action: "pause", payload: {} });
        await chrome.tabs.update(t.id, { muted: true });
      }
    }
    const mediaTab = await getBestMediaTab();
    if (mediaTab?.id) {
      await ensureContentScriptAndSend(mediaTab.id, { type: "MEDIA_COMMAND", action: "pause", payload: {} });
    }
    await sendToClients({
      target: "client",
      action: "sleep_timer_state",
      payload: { active: false, remainingSeconds: 0, mode: "pause_media", triggered: true }
    });
    await broadcastTabsAndWindows();
  }
});

chrome.tabs.onCreated.addListener(async () => {
  await broadcastTabsAndWindows();
});

chrome.tabs.onRemoved.addListener(async () => {
  await broadcastTabsAndWindows();
});

chrome.tabs.onActivated.addListener(async () => {
  await broadcastTabsAndWindows();
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo) => {
  if (
    changeInfo.status === "complete" ||
    changeInfo.title !== undefined ||
    changeInfo.audible !== undefined ||
    changeInfo.mutedInfo !== undefined ||
    changeInfo.pinned !== undefined ||
    changeInfo.favIconUrl !== undefined
  ) {
    await broadcastTabsAndWindows();
  }
});

chrome.windows.onFocusChanged.addListener(async () => {
  await broadcastTabsAndWindows();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target === "offscreen") {
    return false;
  }

  // Messages from offscreen Dual Bridge (WebRTC + Local WS)
  if (message.source === "offscreen") {
    (async () => {
      if (message.type === "BRIDGE_STATUS" || message.type === "WS_STATUS") {
        const wsConnected = Boolean(message.wsConnected ?? message.connected);
        const webrtcClients = Array.isArray(message.webrtcClients) ? message.webrtcClients : [];
        await chrome.storage.session.set({
          wsConnected,
          peerListening: Boolean(message.peerListening),
          peerError: message.peerError || "",
          webrtcClients
        });
        await updateActionBadge(wsConnected, webrtcClients.length);
        if (wsConnected) {
          await broadcastTabsAndWindows();
        }
      } else if (message.type === "WEBRTC_CLIENT_READY") {
        await sendBrowserInitState(message.peerId);
      } else if (message.type === "WEBRTC_CLIENT_DISCONNECTED") {
        screenSubscribers.delete(message.peerId);
      } else if (message.type === "ROTATE_ROOM_CODE") {
        await getOrCreateIdentity(true);
        await ensureOffscreenBridge(false, true);
      } else if (message.type === "WS_COMMAND" && message.data) {
        const { target, action, payload, clientId } = message.data;
        if (target === "chrome") {
          await handleChromeCommand(action, payload, clientId);
        } else if (target === "media") {
          await handleMediaCommand(action, payload);
        }
      } else if (message.type === "WEBRTC_SYSTEM_FALLBACK") {
        await handleBrowserSystemFallback(message.action, message.payload, message.peerId);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  // Live media telemetry pushed from content_media.js
  if (message.source === "content_media" && message.type === "MEDIA_STATE_PUSH") {
    (async () => {
      if (sender.tab?.id && message.state?.hasMedia) {
        await chrome.storage.session.set({ lastMediaTabId: sender.tab.id });
      }
      await sendToClients({
        target: "client",
        action: "media_state",
        payload: {
          ...message.state,
          tabId: sender.tab?.id || null,
          tabTitle: sender.tab?.title || ""
        }
      });
      sendResponse({ ok: true });
    })();
    return true;
  }

  // Messages from extension popup UI
  if (message.source === "popup") {
    (async () => {
      if (message.type === "POPUP_GET_STATUS") {
        const identity = await getOrCreateIdentity(false);
        await ensureOffscreenBridge(false, false);
        const port = await getConfiguredPort();
        const {
          wsConnected = false,
          peerListening = false,
          peerError = "",
          webrtcClients = []
        } = await chrome.storage.session.get(["wsConnected", "peerListening", "peerError", "webrtcClients"]);

        sendResponse({
          wsConnected,
          port,
          peerListening,
          peerError,
          webrtcClients,
          ...identity
        });
      } else if (message.type === "POPUP_ROTATE_QR") {
        const identity = await getOrCreateIdentity(true);
        await ensureOffscreenBridge(false, true);
        sendResponse({ ok: true, ...identity });
      } else if (message.type === "POPUP_SAVE_SETTINGS") {
        const updates = {};
        if (message.port) {
          updates.serverPort = Math.max(1024, Math.min(65535, Number(message.port) || 8765));
        }
        if (typeof message.pwaBaseUrl === "string" && message.pwaBaseUrl.trim()) {
          updates.pwaBaseUrl = message.pwaBaseUrl.trim();
        }
        await chrome.storage.local.set(updates);
        const identity = await getOrCreateIdentity(false);
        await ensureOffscreenBridge(true, false);
        sendResponse({ ok: true, ...identity, port: updates.serverPort || (await getConfiguredPort()) });
      } else if (message.type === "POPUP_RECONNECT") {
        await ensureOffscreenBridge(true, true);
        sendResponse({ ok: true });
      }
    })();
    return true;
  }

  return false;
});

ensureOffscreenBridge(false, false);
