const statusBadge = document.getElementById("statusBadge");
const statusText = document.getElementById("statusText");
const qrCanvas = document.getElementById("qrCanvas");
const roomCodeText = document.getElementById("roomCodeText");
const pinText = document.getElementById("pinText");
const devicesLabel = document.getElementById("devicesLabel");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const rotateQrBtn = document.getElementById("rotateQrBtn");
const modeIcon = document.getElementById("modeIcon");
const modeTitle = document.getElementById("modeTitle");
const modeDesc = document.getElementById("modeDesc");
const pwaUrlInput = document.getElementById("pwaUrlInput");
const portInput = document.getElementById("portInput");
const saveBtn = document.getElementById("saveBtn");
const reconnectBtn = document.getElementById("reconnectBtn");

let currentPairingUrl = "";
let lastRenderedUrl = "";

function formatRoomCode(code) {
  const digits = String(code || "").replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return digits || "----";
}

async function drawQr(url) {
  if (!url || url === lastRenderedUrl || !globalThis.QRCode) return;
  lastRenderedUrl = url;
  try {
    await globalThis.QRCode.toCanvas(qrCanvas, url, {
      width: 176,
      margin: 1,
      errorCorrectionLevel: "M",
      color: {
        dark: "#09090b",
        light: "#ffffff"
      }
    });
  } catch (err) {
    console.warn("QR render error:", err);
  }
}

function renderPopupState(state) {
  if (!state) return;

  currentPairingUrl = state.pairingUrl || "";
  roomCodeText.textContent = formatRoomCode(state.roomCode);
  pinText.textContent = state.pairingPin || "----";

  if (document.activeElement !== pwaUrlInput && state.pwaBaseUrl) {
    pwaUrlInput.value = state.pwaBaseUrl;
  }
  if (document.activeElement !== portInput && state.port) {
    portInput.value = String(state.port);
  }

  drawQr(currentPairingUrl);

  const clients = Array.isArray(state.webrtcClients) ? state.webrtcClients : [];
  statusBadge.classList.remove("ready", "connected");

  if (clients.length > 0) {
    statusBadge.classList.add("connected");
    statusText.textContent = `${clients.length} Phone${clients.length > 1 ? "s" : ""} Live`;
    const names = clients.map((c) => c.deviceName || "Phone").join(", ");
    devicesLabel.textContent = `Connected: ${names}`;
  } else if (state.peerListening) {
    statusBadge.classList.add("ready");
    statusText.textContent = "Ready to Scan";
    devicesLabel.textContent = "Zero laptop scripts needed — pairs directly with Chrome";
  } else {
    statusText.textContent = state.peerError ? "Reconnecting..." : "Preparing QR...";
    devicesLabel.textContent = "Initializing encrypted WebRTC signaling...";
  }

  if (state.wsConnected) {
    modeIcon.textContent = "🖥️";
    modeTitle.textContent = "Full Windows + Chrome Mode Active";
    modeDesc.textContent = "Silent PC Agent detected: OS-wide mouse, master Windows audio & PC power unlocked.";
  } else {
    modeIcon.textContent = "⚡";
    modeTitle.textContent = "Instant Browser Mode (Serverless)";
    modeDesc.textContent = "Controls live tabs, YouTube/Netflix, in-page cursor & tab preview with zero PC setup.";
  }
}

async function refreshStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ source: "popup", type: "POPUP_GET_STATUS" });
    if (res) {
      renderPopupState(res);
    }
  } catch (_err) {
    statusText.textContent = "Offline";
  }
}

copyLinkBtn.addEventListener("click", async () => {
  if (!currentPairingUrl) return;
  try {
    await navigator.clipboard.writeText(currentPairingUrl);
    const prev = copyLinkBtn.textContent;
    copyLinkBtn.textContent = "Copied!";
    setTimeout(() => {
      copyLinkBtn.textContent = prev;
    }, 1600);
  } catch (_err) {
    // Ignore
  }
});

rotateQrBtn.addEventListener("click", async () => {
  rotateQrBtn.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ source: "popup", type: "POPUP_ROTATE_QR" });
    if (res) {
      lastRenderedUrl = "";
      renderPopupState({ ...res, peerListening: true, webrtcClients: [] });
    }
  } finally {
    rotateQrBtn.disabled = false;
    setTimeout(refreshStatus, 600);
  }
});

saveBtn.addEventListener("click", async () => {
  const port = Number(portInput.value) || 8765;
  const pwaBaseUrl = pwaUrlInput.value.trim();
  const res = await chrome.runtime.sendMessage({
    source: "popup",
    type: "POPUP_SAVE_SETTINGS",
    port,
    pwaBaseUrl
  });
  if (res) {
    lastRenderedUrl = "";
    refreshStatus();
  }
});

reconnectBtn.addEventListener("click", async () => {
  statusText.textContent = "Reconnecting...";
  await chrome.runtime.sendMessage({ source: "popup", type: "POPUP_RECONNECT" });
  setTimeout(refreshStatus, 700);
});

refreshStatus();
setInterval(refreshStatus, 2000);
