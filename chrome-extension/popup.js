const statusBadge = document.getElementById("statusBadge");
const statusText = document.getElementById("statusText");
const portInput = document.getElementById("portInput");
const saveBtn = document.getElementById("saveBtn");
const reconnectBtn = document.getElementById("reconnectBtn");

function renderStatus(connected, port) {
  if (port) {
    portInput.value = String(port);
  }
  if (connected) {
    statusBadge.classList.add("online");
    statusText.textContent = "Connected";
  } else {
    statusBadge.classList.remove("online");
    statusText.textContent = "Server offline";
  }
}

async function refreshStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ source: "popup", type: "POPUP_GET_STATUS" });
    if (res) {
      renderStatus(Boolean(res.connected), res.port);
    }
  } catch (_err) {
    renderStatus(false, null);
  }
}

saveBtn.addEventListener("click", async () => {
  const port = Number(portInput.value) || 8765;
  await chrome.runtime.sendMessage({ source: "popup", type: "POPUP_SAVE_PORT", port });
  setTimeout(refreshStatus, 400);
});

reconnectBtn.addEventListener("click", async () => {
  statusText.textContent = "Connecting...";
  await chrome.runtime.sendMessage({ source: "popup", type: "POPUP_RECONNECT" });
  setTimeout(refreshStatus, 500);
});

refreshStatus();
