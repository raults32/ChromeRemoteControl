# Chrome Remote Control

> **Low-latency Wi-Fi remote control (`< 20 ms`) for Google Chrome and your PC from any Android or iPhone — powered by a FastAPI WebSocket server, a Manifest V3 Chrome Extension bridge, and a true-black AMOLED Progressive Web App (PWA) with instant QR pairing.**

---

## Overview

**Chrome Remote Control** turns any smartphone on your local Wi-Fi network into a full-featured remote control for **Google Chrome** and essential desktop operations—with zero mobile app store downloads required.

### Hybrid 3-Component Architecture

```text
[ Smartphone (AMOLED PWA) ] <--- WebSocket / HTTP (Local Wi-Fi) ---> [ Local PC Server (FastAPI + System Tray) ]
                                                                                |                |
                                                           (OS Control) <-------+                +------> [ Chrome Extension (MV3) ]
                                                 (Mouse, Keyboard, Audio, Screen, Power)                  (Live Tabs, Media, Bookmarks)
```

1. **Local PC Server (`backend/`):** Built with **Python 3.11+ & FastAPI**, handling sub-millisecond cursor/keyboard input (`Win32 SendInput` on Windows + `pynput` on macOS/Linux), master system audio (`pycaw` / `osascript` / `pactl`), two-way clipboard sync, lightweight interactive screen preview (`mss` + `Pillow`), customizable macros, sleep timer, and a background system tray controller (`pystray`).
2. **Google Chrome Extension (`chrome-extension/`):** **Manifest V3** extension using an `offscreen` WebSocket bridge for real-time tab & multi-window management, bookmarks, history, downloads, and precision HTML5 media control (YouTube, Netflix, Twitch, Disney+, Prime Video)—even when Chrome is minimized or unfocused.
3. **Mobile AMOLED Interface (`frontend/`):** Touch-first **React + Vite + Tailwind CSS** Progressive Web App designed for one-handed ergonomics, `#000000` OLED dark surfaces, haptic feedback, Screen Wake Lock, and instant QR / PIN pairing.

---

## Quick Start

### 1. Start the Local Server on Your PC

#### Windows
Double-click **`start.bat`** or run from PowerShell / Command Prompt:
```bat
.\start.bat
```

#### macOS / Linux
```bash
chmod +x start.sh
./start.sh
```

On launch:
- A scannable **QR Code** and a **4–6 digit PIN** are printed in the console.
- A **System Tray icon** starts in the background with quick actions to *View QR & PIN*, *Change PIN*, *Pause Remote Input*, *Launch on Startup*, or *Quit*.

Optional CLI flags:
```bash
python backend/main.py --port 8765 --pin 2580
```

---

### 2. Load the Chrome Extension Bridge (Recommended)

> **Built-in Resilience:** If the Chrome extension is not installed or Chrome is closed, the backend automatically falls back to native OS shortcuts so navigation, trackpad, keyboard, and basic playback keys continue working seamlessly.

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the **`chrome-extension`** folder inside this repository.
4. The extension badge displays **`ON`** automatically once connected to `127.0.0.1:8765`.

---

### 3. Pair Your Phone & Install the PWA

1. Connect your phone to the **same Wi-Fi network** as your PC.
2. **Instant QR Pairing:** Scan the QR code shown in the terminal or System Tray window with your phone camera.
3. **Manual PIN Pairing:** Or visit `http://<YOUR_PC_LAN_IP>:8765` on your phone and enter the 4–6 digit PIN. A persistent session token is saved so you do not need to re-enter it every time.
4. **Install to Home Screen (Optional):**
   - **Android (Chrome):** Menu `⋮` → *Install app* / *Add to Home screen*.
   - **iPhone (Safari):** *Share* → *Add to Home Screen*.

---

## Feature Matrix

| Mobile Tab | Capabilities |
| :--- | :--- |
| **1. Chrome** | Smart Omnibox with search engine selector (Google, YouTube, Wikipedia, ChatGPT, DuckDuckGo, GitHub), Back / Forward / Reload / Hard Reload / Stop / Home, New Tab / Window / Incognito, Zoom (`-` / `100%` / `+`), `F11` Fullscreen, in-page search (`Ctrl+F`), and live **Bookmarks**, **History**, and **Downloads** drawers. |
| **2. Media** | Play/Pause, Previous/Next track, precision jumps (`-30s`, `-10s`, `-5s`, `+5s`, `+10s`, `+30s`), real-time interactive **Timeline Scrubber**, smart **Skip Intro / Ad** detector (YouTube, Netflix, Prime Video), playback speed (`0.5x`–`2x`), Captions (`CC`), Fullscreen, Theater Mode, **Picture-in-Picture (PiP)**, and independent Video Mute vs. PC Master Volume. |
| **3. Touchpad** | Low-latency multi-touch surface (`1 finger`: move/left-click, `double-tap + drag`: drag & drop, `2 fingers`: right-click / smooth vertical & horizontal scroll / pinch-to-zoom), Left / Middle / Right physical buttons, **Live Unicode Keyboard** (accents, symbols, emojis), **Voice Dictation** (`Web Speech API`), special keys (`Esc`, `Tab`, arrows, `Alt+Tab`, `Win/Cmd`), quick shortcuts, and interactive **Screen Spy** live preview with tap-to-click. |
| **4. Tabs** | Real-time open tabs list with favicons, titles, domains, audio indicators, and multi-window filtering; 1-tap tab switching, per-tab mute, pin/unpin, duplicate, close, reopen last closed tab (`Ctrl+Shift+T`), and favorite bookmarks browser. |
| **5. System** | Master PC volume (`0–100%` + Mute), **Two-Way Clipboard Sync** (*Send / Paste to PC* and *Fetch from PC*), customizable **Macros & Scenes** (*Cinema Mode*, *Work Mode*, *Night Mode* + custom builder), **Sleep Timer** (`15/30/60/90 min`), confirmation-protected **Power Controls** (*Lock*, *Sleep*, *Restart*, *Shut Down*), cursor sensitivity, *Wake Lock*, and haptic feedback. |

---

## Repository Structure

```text
ChromeRemoteControl/
├── backend/                # FastAPI WebSocket hub, PIN/QR auth, OS input, Screen Spy & System Tray
├── chrome-extension/       # Manifest V3 extension bridge + HTML5/YouTube/Netflix media script
├── frontend/               # React + Vite + Tailwind CSS mobile AMOLED PWA
├── website/                # Official product showcase & download landing page
├── start.bat               # One-click Windows setup & launcher
└── start.sh                # One-click macOS / Linux setup & launcher
```

---

## Automated Tests

```bash
backend/.venv/Scripts/pytest backend/tests -v
```

## License

MIT
