// Offscreen document: maintains BOTH
// 1) WebRTC P2P Host (PeerJS) so phones pair directly with Chrome with zero PC server setup, AND
// 2) Optional Local PC Agent WebSocket bridge (127.0.0.1:8765) for OS-level mouse, audio & power.

let extSocket = null;
let wasExtSocketOpen = false;
let localClientSocket = null;
let currentPort = 8765;
let reconnectTimer = null;
let heartbeatTimer = null;
let reconnectDelay = 1500;

// WebRTC PeerJS state
let peerInstance = null;
let peerReconnectTimer = null;
let activeIdentity = null; // { roomCode, pairingKey, pairingPin }
let peerListening = false;
let peerErrorText = "";
const authedPeers = new Map(); // peerId -> { conn, deviceName, connectedAt }
const incomingChunks = new Map(); // chunkId -> { parts: [], received: 0, total: 0, ts: number }

const CHUNK_LIMIT = 12000;

async function notifyServiceWorker(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (_err) {
    // Service worker wakes up on next runtime message
  }
}

function getWebRtcClientsSummary() {
  return Array.from(authedPeers.entries()).map(([id, info]) => ({
    peerId: id,
    deviceName: info.deviceName || "Phone",
    connectedAt: info.connectedAt
  }));
}

function pushBridgeStatus() {
  notifyServiceWorker({
    source: "offscreen",
    type: "BRIDGE_STATUS",
    wsConnected: Boolean(extSocket && extSocket.readyState === WebSocket.OPEN),
    port: currentPort,
    peerListening,
    peerError: peerErrorText,
    roomCode: activeIdentity?.roomCode || "",
    webrtcClients: getWebRtcClientsSummary()
  });
}

// ============================================================================
// Chunked WebRTC DataChannel Sender (avoids 64KB SCTP message ceiling on mobile)
// ============================================================================
function sendOverDataConnection(conn, obj) {
  if (!conn || !conn.open) return false;
  try {
    const raw = JSON.stringify(obj);
    if (raw.length <= CHUNK_LIMIT) {
      conn.send(raw);
      return true;
    }
    const chunkId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const total = Math.ceil(raw.length / CHUNK_LIMIT);
    for (let i = 0; i < total; i += 1) {
      const slice = raw.slice(i * CHUNK_LIMIT, (i + 1) * CHUNK_LIMIT);
      conn.send(JSON.stringify({ __crcChunk: chunkId, idx: i, total, data: slice }));
    }
    return true;
  } catch (_err) {
    return false;
  }
}

function broadcastToWebRtcPeers(obj, targetPeerId = null) {
  if (targetPeerId && authedPeers.has(targetPeerId)) {
    return sendOverDataConnection(authedPeers.get(targetPeerId).conn, obj);
  }
  let anySent = false;
  for (const [, entry] of authedPeers.entries()) {
    if (sendOverDataConnection(entry.conn, obj)) {
      anySent = true;
    }
  }
  return anySent;
}

function decodeIncomingData(rawData) {
  let parsed = rawData;
  if (typeof rawData === "string") {
    try {
      parsed = JSON.parse(rawData);
    } catch (_e) {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;

  if (parsed.__crcChunk) {
    const { __crcChunk: id, idx, total, data } = parsed;
    if (!incomingChunks.has(id)) {
      incomingChunks.set(id, { parts: new Array(total), received: 0, total, ts: Date.now() });
    }
    const entry = incomingChunks.get(id);
    if (!entry.parts[idx]) {
      entry.parts[idx] = data;
      entry.received += 1;
    }
    if (entry.received >= entry.total) {
      incomingChunks.delete(id);
      try {
        return JSON.parse(entry.parts.join(""));
      } catch (_e) {
        return null;
      }
    }
    // Prune stale chunks older than 15s
    const now = Date.now();
    for (const [k, v] of incomingChunks.entries()) {
      if (now - v.ts > 15000) incomingChunks.delete(k);
    }
    return null;
  }

  return parsed;
}

// ============================================================================
// Optional Local PC Agent Client Proxy (bridges WebRTC system actions -> Win32)
// ============================================================================
async function ensureLocalSystemProxy() {
  if (!extSocket || extSocket.readyState !== WebSocket.OPEN) return;
  if (
    localClientSocket &&
    (localClientSocket.readyState === WebSocket.OPEN || localClientSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  try {
    const infoRes = await fetch(`http://127.0.0.1:${currentPort}/api/pairing-info`);
    if (!infoRes.ok) return;
    const info = await infoRes.json();
    const pairUrl = new URL(info.pairingUrl);
    const secret = pairUrl.searchParams.get("pair") || "";

    const loginRes = await fetch(`http://127.0.0.1:${currentPort}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingSecret: secret, deviceName: "Chrome WebRTC Bridge" })
    });
    if (!loginRes.ok) return;
    const loginData = await loginRes.json();
    if (!loginData.token) return;

    const ws = new WebSocket(`ws://127.0.0.1:${currentPort}/ws/client?token=${encodeURIComponent(loginData.token)}`);
    localClientSocket = ws;

    ws.addEventListener("message", (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const { action, payload = {} } = msg;
        // Tabs, media, bookmarks, history & downloads already go directly from background.js -> WebRTC
        if (
          action === "tabs_list" ||
          action === "media_state" ||
          action === "bookmarks_list" ||
          action === "history_list" ||
          action === "downloads_list" ||
          action === "find_result" ||
          action === "extension_status" ||
          action === "pong"
        ) {
          return;
        }
        if (action === "init_state") {
          const { tabs: _t, windows: _w, media: _m, ...systemFields } = payload;
          broadcastToWebRtcPeers({
            target: "client",
            action: "init_state",
            payload: { ...systemFields, pcAgentConnected: true, extensionConnected: true }
          });
          return;
        }
        broadcastToWebRtcPeers(msg);
      } catch (_err) {
        // Ignore
      }
    });

    ws.addEventListener("close", () => {
      if (localClientSocket === ws) {
        localClientSocket = null;
      }
    });

    ws.addEventListener("error", () => {
      try {
        ws.close();
      } catch (_e) {
        // Ignore
      }
    });
  } catch (_err) {
    // Local PC agent not running
  }
}

function closeLocalSystemProxy() {
  if (localClientSocket) {
    try {
      localClientSocket.close();
    } catch (_e) {
      // Ignore
    }
    localClientSocket = null;
  }
}

// ============================================================================
// WebRTC P2P Host (PeerJS)
// ============================================================================
function buildPeerId(roomCode) {
  return `crc-v1-${String(roomCode || "").replace(/\D/g, "")}`;
}

function destroyPeerHost() {
  if (peerReconnectTimer) {
    clearTimeout(peerReconnectTimer);
    peerReconnectTimer = null;
  }
  for (const [, entry] of authedPeers.entries()) {
    try {
      entry.conn.close();
    } catch (_e) {
      // Ignore
    }
  }
  authedPeers.clear();
  if (peerInstance) {
    try {
      peerInstance.destroy();
    } catch (_e) {
      // Ignore
    }
    peerInstance = null;
  }
  peerListening = false;
}

function startPeerHost(identity, forceRestart = false) {
  if (!identity || !identity.roomCode || typeof globalThis.Peer !== "function") {
    return;
  }

  const sameRoom =
    activeIdentity &&
    activeIdentity.roomCode === identity.roomCode &&
    activeIdentity.pairingKey === identity.pairingKey &&
    activeIdentity.pairingPin === identity.pairingPin;

  activeIdentity = { ...identity };

  if (!forceRestart && sameRoom && peerInstance && !peerInstance.destroyed) {
    if (peerInstance.disconnected) {
      try {
        peerInstance.reconnect();
      } catch (_e) {
        // Will recreate below if needed
      }
    }
    pushBridgeStatus();
    return;
  }

  destroyPeerHost();
  peerErrorText = "";

  const peerId = buildPeerId(identity.roomCode);
  let peer;
  try {
    peer = new globalThis.Peer(peerId, {
      debug: 0,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      }
    });
  } catch (err) {
    peerErrorText = String(err?.message || "WebRTC init error");
    pushBridgeStatus();
    return;
  }

  peerInstance = peer;

  peer.on("open", () => {
    peerListening = true;
    peerErrorText = "";
    pushBridgeStatus();
  });

  peer.on("connection", (conn) => {
    let authenticated = false;
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        try {
          conn.close();
        } catch (_e) {
          // Ignore
        }
      }
    }, 10000);

    conn.on("data", async (raw) => {
      const msg = decodeIncomingData(raw);
      if (!msg) return;

      const target = String(msg.target || "").toLowerCase();
      const action = String(msg.action || "");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};

      if (!authenticated) {
        if (target === "auth" && action === "hello") {
          const providedKey = String(payload.key || "");
          const providedPin = String(payload.pin || "").trim();
          const keyOk = Boolean(providedKey && activeIdentity?.pairingKey && providedKey === activeIdentity.pairingKey);
          const pinOk = Boolean(providedPin && activeIdentity?.pairingPin && providedPin === activeIdentity.pairingPin);

          if (keyOk || pinOk) {
            authenticated = true;
            clearTimeout(authTimeout);
            const deviceName = String(payload.deviceName || "Phone").slice(0, 32);
            authedPeers.set(conn.peer, { conn, deviceName, connectedAt: Date.now() });
            pushBridgeStatus();

            sendOverDataConnection(conn, {
              target: "client",
              action: "auth_ok",
              payload: {
                key: activeIdentity.pairingKey,
                roomCode: activeIdentity.roomCode,
                pcAgentConnected: Boolean(extSocket && extSocket.readyState === WebSocket.OPEN)
              }
            });

            if (extSocket && extSocket.readyState === WebSocket.OPEN) {
              await ensureLocalSystemProxy();
            }

            notifyServiceWorker({
              source: "offscreen",
              type: "WEBRTC_CLIENT_READY",
              peerId: conn.peer
            });
          } else {
            sendOverDataConnection(conn, {
              target: "client",
              action: "auth_error",
              payload: { message: "Incorrect PIN or expired QR pairing link." }
            });
            setTimeout(() => {
              try {
                conn.close();
              } catch (_e) {
                // Ignore
              }
            }, 250);
          }
        }
        return;
      }

      // Heartbeat ping from WebRTC phone
      if (action === "ping") {
        sendOverDataConnection(conn, {
          target: "client",
          action: "pong",
          payload: {
            ts: payload.ts || 0,
            paused: false,
            extensionConnected: true,
            pcAgentConnected: Boolean(extSocket && extSocket.readyState === WebSocket.OPEN)
          }
        });
        return;
      }

      // Route Chrome & Media commands directly to MV3 Service Worker
      if (target === "chrome" || target === "media") {
        notifyServiceWorker({
          source: "offscreen",
          type: "WS_COMMAND",
          data: { target, action, payload, clientId: conn.peer }
        });
        return;
      }

      // Route System commands: use Local Windows Agent if active, else Browser-Only Fallback!
      if (target === "system") {
        if (extSocket && extSocket.readyState === WebSocket.OPEN) {
          await ensureLocalSystemProxy();
          if (localClientSocket && localClientSocket.readyState === WebSocket.OPEN) {
            localClientSocket.send(JSON.stringify({ target: "system", action, payload }));
            return;
          }
        }
        notifyServiceWorker({
          source: "offscreen",
          type: "WEBRTC_SYSTEM_FALLBACK",
          action,
          payload,
          peerId: conn.peer
        });
      }
    });

    const cleanupPeer = () => {
      clearTimeout(authTimeout);
      if (authedPeers.has(conn.peer)) {
        authedPeers.delete(conn.peer);
        pushBridgeStatus();
        notifyServiceWorker({
          source: "offscreen",
          type: "WEBRTC_CLIENT_DISCONNECTED",
          peerId: conn.peer,
          remainingCount: authedPeers.size
        });
      }
    };

    conn.on("close", cleanupPeer);
    conn.on("error", cleanupPeer);
  });

  peer.on("disconnected", () => {
    peerListening = false;
    pushBridgeStatus();
    if (peerReconnectTimer) clearTimeout(peerReconnectTimer);
    peerReconnectTimer = setTimeout(() => {
      if (peerInstance && !peerInstance.destroyed && peerInstance.disconnected) {
        try {
          peerInstance.reconnect();
        } catch (_e) {
          startPeerHost(activeIdentity, true);
        }
      }
    }, 2500);
  });

  peer.on("error", (err) => {
    const errType = String(err?.type || "");
    if (errType === "unavailable-id") {
      // Request background SW to rotate roomCode on collision
      notifyServiceWorker({ source: "offscreen", type: "ROTATE_ROOM_CODE" });
      return;
    }
    if (errType === "peer-unavailable") {
      return;
    }
    peerListening = false;
    peerErrorText = errType || String(err?.message || "Signaling reconnecting");
    pushBridgeStatus();
    if (peerReconnectTimer) clearTimeout(peerReconnectTimer);
    peerReconnectTimer = setTimeout(() => {
      if (activeIdentity) {
        startPeerHost(activeIdentity, true);
      }
    }, 4000);
  });
}

// ============================================================================
// Local PC Server WebSocket Bridge (127.0.0.1:8765 — Optional Windows Agent)
// ============================================================================
function clearWsTimers() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleWsReconnect() {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket(currentPort);
  }, reconnectDelay);
  reconnectDelay = Math.min(10000, Math.round(reconnectDelay * 1.5));
}

function connectWebSocket(port) {
  if (port) {
    currentPort = Number(port) || 8765;
  }
  if (extSocket && (extSocket.readyState === WebSocket.OPEN || extSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  clearWsTimers();
  const wsUrl = `ws://127.0.0.1:${currentPort}/ws/extension`;

  try {
    extSocket = new WebSocket(wsUrl);
  } catch (_err) {
    scheduleWsReconnect();
    return;
  }

  extSocket.addEventListener("open", () => {
    wasExtSocketOpen = true;
    reconnectDelay = 1500;
    pushBridgeStatus();
    if (authedPeers.size > 0) {
      ensureLocalSystemProxy();
      broadcastToWebRtcPeers({
        target: "client",
        action: "pc_agent_status",
        payload: { pcAgentConnected: true }
      });
    }

    heartbeatTimer = setInterval(() => {
      if (extSocket && extSocket.readyState === WebSocket.OPEN) {
        extSocket.send(JSON.stringify({ target: "server", action: "ping", payload: { ts: Date.now() } }));
      }
    }, 20000);
  });

  extSocket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.action === "pong") return;
      notifyServiceWorker({ source: "offscreen", type: "WS_COMMAND", data: parsed });
    } catch (_err) {
      // Ignore malformed frame
    }
  });

  extSocket.addEventListener("close", () => {
    const previouslyOpen = wasExtSocketOpen;
    wasExtSocketOpen = false;
    clearWsTimers();
    extSocket = null;
    closeLocalSystemProxy();
    pushBridgeStatus();
    if (previouslyOpen && authedPeers.size > 0) {
      broadcastToWebRtcPeers({
        target: "client",
        action: "pc_agent_status",
        payload: { pcAgentConnected: false }
      });
    }
    scheduleWsReconnect();
  });

  extSocket.addEventListener("error", () => {
    if (extSocket) {
      try {
        extSocket.close();
      } catch (_e) {
        // Ignore
      }
    }
  });
}

function sendOverLocalWs(payload) {
  if (extSocket && extSocket.readyState === WebSocket.OPEN) {
    extSocket.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

// ============================================================================
// Clipboard Helper (for Browser-Only Mode)
// ============================================================================
async function writeOffscreenClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_e) {
    const el = document.getElementById("clipHelper");
    if (!el) return false;
    el.value = text;
    el.select();
    return Boolean(document.execCommand("copy"));
  }
}

async function readOffscreenClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch (_e) {
    const el = document.getElementById("clipHelper");
    if (!el) return "";
    el.value = "";
    el.focus();
    document.execCommand("paste");
    return el.value || "";
  }
}

// ============================================================================
// Runtime Message Router from Service Worker
// ============================================================================
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "offscreen") {
    return false;
  }

  if (message.type === "OFFSCREEN_INIT" || message.type === "OFFSCREEN_RECONNECT") {
    if (message.port && Number(message.port) !== currentPort && extSocket) {
      try {
        extSocket.close();
      } catch (_e) {
        // Ignore
      }
      extSocket = null;
      closeLocalSystemProxy();
    }
    connectWebSocket(message.port || currentPort);
    if (message.identity) {
      startPeerHost(message.identity, Boolean(message.forcePeerRestart));
    }
    sendResponse({
      ok: true,
      wsConnected: Boolean(extSocket && extSocket.readyState === WebSocket.OPEN),
      peerListening,
      webrtcClients: getWebRtcClientsSummary()
    });
    return false;
  }

  if (message.type === "OFFSCREEN_SEND") {
    const payload = message.payload;
    const sentWs = sendOverLocalWs(payload);
    const sentRtc = broadcastToWebRtcPeers(payload, message.clientId || null);
    sendResponse({ ok: sentWs || sentRtc });
    return false;
  }

  if (message.type === "OFFSCREEN_CLIPBOARD_WRITE") {
    (async () => {
      const ok = await writeOffscreenClipboard(String(message.text || ""));
      sendResponse({ ok });
    })();
    return true;
  }

  if (message.type === "OFFSCREEN_CLIPBOARD_READ") {
    (async () => {
      const text = await readOffscreenClipboard();
      sendResponse({ ok: true, text });
    })();
    return true;
  }

  if (message.type === "OFFSCREEN_GET_STATE") {
    sendResponse({
      wsConnected: Boolean(extSocket && extSocket.readyState === WebSocket.OPEN),
      port: currentPort,
      peerListening,
      peerError: peerErrorText,
      webrtcClients: getWebRtcClientsSummary()
    });
    return false;
  }

  return false;
});

connectWebSocket(currentPort);
