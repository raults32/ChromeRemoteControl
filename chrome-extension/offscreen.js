// Offscreen document: maintains persistent WebSocket connection to local PC backend.
// Uses ONLY Web APIs (WebSocket, timers) and chrome.runtime messaging (MV3 compliant).

let socket = null;
let currentPort = 8765;
let reconnectTimer = null;
let heartbeatTimer = null;
let reconnectDelay = 1200;

async function notifyServiceWorker(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (_err) {
    // Service worker wakes up on next runtime message if idle
  }
}

function clearTimers() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket(currentPort);
  }, reconnectDelay);
  reconnectDelay = Math.min(8000, Math.round(reconnectDelay * 1.4));
}

function connectWebSocket(port) {
  if (port) {
    currentPort = Number(port) || 8765;
  }
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  clearTimers();
  const wsUrl = `ws://127.0.0.1:${currentPort}/ws/extension`;

  try {
    socket = new WebSocket(wsUrl);
  } catch (_err) {
    scheduleReconnect();
    return;
  }

  socket.addEventListener("open", () => {
    reconnectDelay = 1200;
    notifyServiceWorker({ source: "offscreen", type: "WS_STATUS", connected: true, port: currentPort });

    heartbeatTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ target: "server", action: "ping", payload: { ts: Date.now() } }));
      }
    }, 20000);
  });

  socket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.action === "pong") return;
      notifyServiceWorker({ source: "offscreen", type: "WS_COMMAND", data: parsed });
    } catch (_err) {
      // Ignore malformed frame
    }
  });

  socket.addEventListener("close", () => {
    clearTimers();
    socket = null;
    notifyServiceWorker({ source: "offscreen", type: "WS_STATUS", connected: false, port: currentPort });
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    if (socket) {
      try {
        socket.close();
      } catch (_e) {
        // Ignore close errors
      }
    }
  });
}

function sendOverSocket(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "offscreen") {
    return false;
  }

  if (message.type === "OFFSCREEN_INIT" || message.type === "OFFSCREEN_RECONNECT") {
    if (message.port && Number(message.port) !== currentPort && socket) {
      try {
        socket.close();
      } catch (_e) {
        // Ignore
      }
      socket = null;
    }
    connectWebSocket(message.port || currentPort);
    sendResponse({ ok: true, connected: Boolean(socket && socket.readyState === WebSocket.OPEN) });
    return false;
  }

  if (message.type === "OFFSCREEN_SEND") {
    const sent = sendOverSocket(message.payload);
    sendResponse({ ok: sent });
    return false;
  }

  if (message.type === "OFFSCREEN_GET_STATE") {
    sendResponse({
      connected: Boolean(socket && socket.readyState === WebSocket.OPEN),
      port: currentPort
    });
    return false;
  }

  return false;
});

connectWebSocket(currentPort);
