# Chrome Remote Control

> **Low-latency WebRTC & Wi-Fi remote control (`< 20 ms`) for Google Chrome and your PC from any Android or iPhone — scan the QR code directly inside the Chrome Extension popup with zero laptop scripts, or enable the silent Windows background agent for full OS control.**

---

## Overview

**Chrome Remote Control (v1.1)** turns any smartphone into an ergonomic, true-black AMOLED remote control for **Google Chrome** and your desktop—with zero mobile app store downloads and zero terminal windows.

### Dual-Mode Architecture

```text
MODE 1 — Instant Serverless Mode (Extension Only, Zero Laptop Setup):
[ Smartphone (HTTPS AMOLED PWA) ] <=== Encrypted WebRTC P2P ===> [ Chrome Extension (MV3 Popup QR + Offscreen) ]
                                                                     └── Tabs, Media, In-Page Cursor & Tab Preview

MODE 2 — Full PC Upgrade (Optional Invisible Auto-Start Windows Agent):
[ Chrome Extension Bridge ] <=== 127.0.0.1 Loopback ===> [ Silent Windows Agent (pythonw + System Tray) ]
                                                             └── Global Win32 Mouse, Master Audio & PC Power
```

1. **Instant Extension Mode (`chrome-extension/` — Zero PC Setup):** Load the Manifest V3 Chrome Extension, click its toolbar icon, and scan the **QR code** right inside the popup. Connects peer-to-peer over **WebRTC** to the hosted HTTPS AMOLED PWA (`https://raults32.github.io/ChromeRemoteControl/app/`) to control live tabs, windows, bookmarks, history, YouTube/Netflix timeline scrubbing, *Skip Intro/Ad*, in-page virtual touchpad cursor, live typing, voice dictation, and active-tab *Screen Spy*—without installing Python or running any script on your laptop.
2. **Optional Silent Windows Agent (`backend/` + `install-silent-startup.bat`):** Want global OS-wide cursor control outside Chrome, master Windows volume (`pycaw`), full-desktop multi-monitor Screen Spy (`mss`), and PC Lock / Sleep / Shut Down? Double-click **`install-silent-startup.bat`** once. It registers `pythonw.exe` to start **100% invisibly with Windows** (zero black console windows) and automatically upgrades your phone connection to **Full PC + Chrome Mode**.
3. **Mobile AMOLED PWA (`frontend/`):** Touch-first **React 19 + Vite + Tailwind CSS v4** Progressive Web App with `#000000` OLED surfaces, haptic feedback, Screen Wake Lock, persistent pairing (scan once, auto-reconnect forever), and offline LAN support.

---

## Quick Start

### Option A — Instant Chrome Extension Only (20 Seconds, No PC Scripts)

1. Download **`ChromeRemoteControl-Extension-v1.1.0.zip`** (or use the `chrome-extension/` folder).
2. Open **`chrome://extensions`** in Google Chrome, enable **Developer mode** (top right), click **Load unpacked**, and select the `chrome-extension` folder.
3. Click the **Chrome Remote Control** icon in your Chrome toolbar—a crisp **QR Code**, **Room ID**, and **PIN** appear immediately.
4. Scan the QR code with your iPhone or Android camera (and tap **Add to Home Screen** so it reconnects in 1 tap forever).

### Option B — Add Silent Full-Windows Control (Optional 1-Click Autostart)

If you also want OS-wide Win32 mouse movement outside Chrome, Windows Master Volume, and remote PC Sleep / Shut Down without ever opening a terminal:

1. Double-click **`install-silent-startup.bat`** once.
2. It creates the virtual environment automatically, registers `pythonw.exe` in Windows Startup, and launches the background System Tray agent immediately with **zero console windows**.
3. Your Chrome Extension popup automatically switches to **Full Windows + Chrome Mode Active**. *(Run `uninstall-silent-startup.bat` anytime to remove it from startup.)*

> **Offline Local LAN Mode:** You can also run `start.bat` (Windows) or `./start.sh` (macOS/Linux) to serve the PWA directly over local Wi-Fi at `http://<PC-IP>:8765` with zero internet access required.

---

## Feature Matrix

| Module | Instant Extension Mode (Zero Setup) | + Silent Windows Agent (Full OS) |
| :--- | :--- | :--- |
| **Pairing** | QR & PIN right inside Chrome Extension popup | Auto-detected by Extension + System Tray QR |
| **Tabs & Windows** | Live tabs, favicons, mute, pin, duplicate, incognito | Same real-time MV3 tab & window sync |
| **Media (YouTube / Netflix)** | Timeline scrubber, ±5s/10s/30s, *Skip Intro/Ad*, PiP, CC | Same precision HTML5 player control |
| **Touchpad & Scroll** | Glowing in-page virtual cursor, tap-to-click, 2-finger scroll | Native `< 5 ms` OS-wide Win32 `SendInput` cursor |
| **Keyboard & Voice** | Live typing into web inputs, Web Speech voice & clipboard | Global OS Unicode/Emoji typing across all apps |
| **Screen Spy** | Live active Chrome tab preview + tap-to-click | Full-desktop multi-monitor preview + tap-to-click |
| **Audio & Sleep Timer** | Active tab/video volume + auto-pause media sleep timer | Master Windows OS volume + PC Sleep / Shut Down |

---

## Project Structure

```text
ChromeRemoteControl/
├── backend/                     # Optional Python FastAPI + System Tray OS agent
│   ├── main.py                  # WebSocket hub, REST API & windowless pythonw entry
│   ├── system_control.py        # Native Win32 SendInput + pynput + pycaw + power
│   ├── screen_stream.py         # On-demand JPEG/WebP desktop streamer (mss + Pillow)
│   ├── tray.py                  # pystray System Tray controller & QR dialog
│   └── tests/                   # Automated pytest suite
├── chrome-extension/            # Manifest V3 Extension (Standalone WebRTC + Local Bridge)
│   ├── manifest.json            # MV3 configuration
│   ├── popup.html / popup.js    # Instant QR Code & Room/PIN pairing popup
│   ├── background.js            # Tabs, media, omnibox & browser-mode system fallbacks
│   ├── offscreen.js             # Dual WebRTC PeerJS host + optional localhost proxy
│   └── content_media.js         # HTML5 media scrubber, Skip Intro & virtual cursor
├── frontend/                    # Mobile AMOLED Progressive Web App (React + Vite)
├── website/                     # Product showcase & download site (GitHub Pages)
├── install-silent-startup.bat   # 1-click invisible Windows startup installer (pythonw)
└── uninstall-silent-startup.bat # Removes Windows startup entry & stops background agent
```

---

## Running Automated Tests

```powershell
.\backend\.venv\Scripts\pytest.exe backend\tests -v
```
