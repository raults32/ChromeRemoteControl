// Service Worker (Manifest V3) — stateless, storage-backed, async/await only.

const OFFSCREEN_PATH = "offscreen.html";
const ALARM_NAME = "ensure-remote-bridge";

// ============================================================================
// Offscreen Document Management (with session state lock per MV3 best practice)
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

async function ensureOffscreenBridge(forceReconnect = false) {
  const port = await getConfiguredPort();
  const exists = await hasOffscreenDocument();

  if (!exists) {
    const { offscreenLock = "idle" } = await chrome.storage.session.get("offscreenLock");
    if (offscreenLock === "creating") {
      return;
    }
    await chrome.storage.session.set({ offscreenLock: "creating" });
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ["BLOBS"],
        justification: "Maintain local WebSocket bridge with PC remote control server"
      });
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
      port
    });
  } catch (_err) {
    // Offscreen initializing
  }
}

async function sendToBackend(payload) {
  try {
    await ensureOffscreenBridge(false);
    await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "OFFSCREEN_SEND",
      payload
    });
  } catch (_err) {
    // Backend may be offline
  }
}

async function updateActionBadge(connected) {
  try {
    await chrome.action.setBadgeText({ text: connected ? "ON" : "" });
    await chrome.action.setBadgeBackgroundColor({
      color: connected ? "#06b6d4" : "#52525b"
    });
  } catch (_err) {
    // Ignore badge errors
  }
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

async function broadcastTabsAndWindows() {
  try {
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
          title: tab.title || "Nueva pestaña",
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

    await sendToBackend({
      target: "client",
      action: "tabs_list",
      payload: {
        tabs: tabsSummary,
        windows: windowsSummary
      }
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
      // Fallback to active tab
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

// ============================================================================
// Bookmarks, History & Downloads Helpers
// ============================================================================
function flattenBookmarks(nodes, folderName = "", acc = []) {
  for (const node of nodes) {
    if (node.url) {
      acc.push({
        id: node.id,
        title: node.title || extractDomain(node.url) || "Marcador",
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
        await sendToBackend({ target: "client", action: "media_state", payload: { ...state, tabId: mediaTab.id } });
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
    const url = payload.url || "chrome://newtab";
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
      url: payload.url || "chrome://newtab",
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
    const url = payload.url || "https://www.google.com";
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
        // Ignore if at start of history
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
        // Ignore if at end of history
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
        // Ignore restricted chrome:// pages
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
    await sendToBackend({
      target: "client",
      action: "bookmarks_list",
      clientId,
      payload: { bookmarks }
    });
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
    await sendToBackend({
      target: "client",
      action: "history_list",
      clientId,
      payload: { history }
    });
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
    await sendToBackend({
      target: "client",
      action: "downloads_list",
      clientId,
      payload: { downloads }
    });
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
      await sendToBackend({
        target: "client",
        action: "find_result",
        clientId,
        payload: res || { found: false, query: payload.query || "" }
      });
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
    await sendToBackend({
      target: "client",
      action: "media_state",
      payload: { ...response, tabId: targetTab.id }
    });
  }
}

// ============================================================================
// Top-Level Synchronous Event Listeners (MV3 Service Worker Lifecycle)
// ============================================================================
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get("serverPort");
  if (!existing.serverPort) {
    await chrome.storage.local.set({ serverPort: 8765 });
  }
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  await ensureOffscreenBridge(false);
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  await ensureOffscreenBridge(false);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await ensureOffscreenBridge(false);
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

  // Messages from offscreen WebSocket bridge
  if (message.source === "offscreen") {
    (async () => {
      if (message.type === "WS_STATUS") {
        await chrome.storage.session.set({ wsConnected: Boolean(message.connected) });
        await updateActionBadge(Boolean(message.connected));
        if (message.connected) {
          await broadcastTabsAndWindows();
        }
      } else if (message.type === "WS_COMMAND" && message.data) {
        const { target, action, payload, clientId } = message.data;
        if (target === "chrome") {
          await handleChromeCommand(action, payload, clientId);
        } else if (target === "media") {
          await handleMediaCommand(action, payload);
        }
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
      await sendToBackend({
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
        await ensureOffscreenBridge(false);
        const port = await getConfiguredPort();
        const { wsConnected = false } = await chrome.storage.session.get("wsConnected");
        sendResponse({ connected: wsConnected, port });
      } else if (message.type === "POPUP_SAVE_PORT") {
        const nextPort = Math.max(1024, Math.min(65535, Number(message.port) || 8765));
        await chrome.storage.local.set({ serverPort: nextPort });
        await ensureOffscreenBridge(true);
        sendResponse({ ok: true, port: nextPort });
      } else if (message.type === "POPUP_RECONNECT") {
        await ensureOffscreenBridge(true);
        sendResponse({ ok: true });
      }
    })();
    return true;
  }

  return false;
});

// Kick off bridge on initial SW evaluation
ensureOffscreenBridge(false);
