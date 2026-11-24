from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import sys
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Ensure backend directory is importable regardless of cwd
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from auth import auth_manager
from config import config
from qr_utils import build_pairing_url, generate_qr_png_bytes, get_all_lan_ips, get_primary_lan_ip, print_startup_banner
from screen_stream import screen_streamer
from system_control import OS_NAME, system_controller
from tray import SystemTrayApp

FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"


class LoginRequest(BaseModel):
    pin: str | None = None
    pairingSecret: str | None = None
    deviceName: str = "Phone"


class ChangePinRequest(BaseModel):
    newPin: str


class ConnectionHub:
    """Manages active mobile PWA clients, Chrome MV3 extension socket, and Sleep Timer."""

    def __init__(self) -> None:
        self.clients: dict[str, WebSocket] = {}
        self.extension_ws: WebSocket | None = None
        self.cached_tabs: list[dict[str, Any]] = []
        self.cached_windows: list[dict[str, Any]] = []
        self.cached_media: dict[str, Any] = {
            "hasMedia": False,
            "title": "",
            "domain": "",
            "currentTime": 0,
            "duration": 0,
            "paused": True,
            "muted": False,
            "volume": 1.0,
            "playbackRate": 1.0,
            "canSkipAd": False,
            "captionsEnabled": False,
            "pipActive": False,
        }
        self._sleep_task: asyncio.Task[None] | None = None
        self._sleep_end_ts: float | None = None
        self._sleep_mode: str = "suspend"

    @property
    def extension_connected(self) -> bool:
        return self.extension_ws is not None

    def get_sleep_timer_state(self) -> dict[str, Any]:
        if self._sleep_end_ts is None:
            return {"active": False, "remainingSeconds": 0, "mode": self._sleep_mode}
        rem = max(0, int(round(self._sleep_end_ts - time.time())))
        if rem <= 0:
            return {"active": False, "remainingSeconds": 0, "mode": self._sleep_mode}
        return {"active": True, "remainingSeconds": rem, "mode": self._sleep_mode}

    async def start_sleep_timer(self, minutes: float, mode: str = "suspend") -> dict[str, Any]:
        await self.cancel_sleep_timer(broadcast=False)
        seconds = max(10, int(round(float(minutes) * 60)))
        self._sleep_mode = mode if mode in ("suspend", "shutdown", "lock") else "suspend"
        self._sleep_end_ts = time.time() + seconds
        self._sleep_task = asyncio.create_task(self._run_sleep_countdown())
        state = self.get_sleep_timer_state()
        await self.broadcast_to_clients({"target": "client", "action": "sleep_timer_state", "payload": state})
        return state

    async def cancel_sleep_timer(self, broadcast: bool = True) -> dict[str, Any]:
        if self._sleep_task and not self._sleep_task.done():
            self._sleep_task.cancel()
        self._sleep_task = None
        self._sleep_end_ts = None
        state = self.get_sleep_timer_state()
        if broadcast:
            await self.broadcast_to_clients({"target": "client", "action": "sleep_timer_state", "payload": state})
        return state

    async def _run_sleep_countdown(self) -> None:
        try:
            while self._sleep_end_ts is not None:
                rem = self._sleep_end_ts - time.time()
                await asyncio.sleep(1.0 if rem <= 60 else 5.0)
                if self._sleep_end_ts is None:
                    break
                rem = self._sleep_end_ts - time.time()
                if rem <= 0:
                    mode = self._sleep_mode
                    self._sleep_end_ts = None
                    await self.broadcast_to_clients(
                        {
                            "target": "client",
                            "action": "sleep_timer_state",
                            "payload": {"active": False, "remainingSeconds": 0, "mode": mode, "triggered": True},
                        }
                    )
                    await asyncio.to_thread(system_controller.execute_power_action, mode)
                    break
                await self.broadcast_to_clients(
                    {
                        "target": "client",
                        "action": "sleep_timer_state",
                        "payload": self.get_sleep_timer_state(),
                    }
                )
        except asyncio.CancelledError:
            pass

    async def send_to_client(self, client_id: str, message: dict[str, Any]) -> None:
        ws = self.clients.get(client_id)
        if not ws:
            return
        try:
            await ws.send_json(message)
        except Exception:
            self.clients.pop(client_id, None)
            screen_streamer.unsubscribe(client_id)

    async def broadcast_to_clients(
        self, message: dict[str, Any], target_ids: set[str] | None = None
    ) -> None:
        ids = list(target_ids) if target_ids is not None else list(self.clients.keys())
        if not ids:
            return
        dead: list[str] = []
        for cid in ids:
            ws = self.clients.get(cid)
            if not ws:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(cid)
        for cid in dead:
            self.clients.pop(cid, None)
            screen_streamer.unsubscribe(cid)

    async def send_to_extension(self, message: dict[str, Any]) -> bool:
        if self.extension_ws is None:
            return False
        try:
            await self.extension_ws.send_json(message)
            return True
        except Exception:
            self.extension_ws = None
            await self.broadcast_to_clients(
                {"target": "client", "action": "extension_status", "payload": {"connected": False}}
            )
            return False

    async def build_initial_state(self) -> dict[str, Any]:
        audio = await asyncio.to_thread(system_controller.get_audio_state)
        return {
            "os": OS_NAME,
            "paused": bool(config.get("paused", False)),
            "extensionConnected": self.extension_connected,
            "audio": audio,
            "mouse": config.get("mouse", {}),
            "screen": screen_streamer.get_settings(),
            "macros": config.get("macros", []),
            "sleepTimer": self.get_sleep_timer_state(),
            "tabs": self.cached_tabs,
            "windows": self.cached_windows,
            "media": self.cached_media,
        }


hub = ConnectionHub()
screen_streamer.set_broadcast_callback(hub.broadcast_to_clients)
tray_app: SystemTrayApp | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    s_cfg = config.get("screen_stream", {})
    screen_streamer.configure(
        fps=s_cfg.get("fps", 8),
        quality=s_cfg.get("quality", 55),
        scale=s_cfg.get("scale", 0.5),
        img_format=s_cfg.get("format", "jpeg"),
    )
    yield
    await hub.cancel_sleep_timer(broadcast=False)


app = FastAPI(title="Chrome Remote Control Backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _extract_token(request: Request, query_token: str | None = None) -> str | None:
    if query_token:
        return query_token
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


# ============================================================================
# REST API Endpoints
# ============================================================================
@app.get("/api/status")
async def api_status(request: Request, token: str | None = Query(default=None)) -> dict[str, Any]:
    tok = _extract_token(request, token)
    authenticated = auth_manager.validate_token(tok)
    client_host = request.client.host if request.client else ""
    return {
        "server": "online",
        "os": OS_NAME,
        "authenticated": authenticated,
        "isLocalhost": auth_manager.is_loopback(client_host),
        "extensionConnected": hub.extension_connected,
        "paused": bool(config.get("paused", False)),
    }


@app.post("/api/auth/login")
async def api_login(body: LoginRequest, request: Request) -> JSONResponse:
    client_ip = request.client.host if request.client else "unknown"
    token: str | None = None
    try:
        if body.pairingSecret:
            token = auth_manager.verify_pairing_secret(
                body.pairingSecret, client_ip=client_ip, device_name=body.deviceName
            )
        if token is None and body.pin:
            token = auth_manager.verify_pin(body.pin, client_ip=client_ip, device_name=body.deviceName)
    except PermissionError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    if not token:
        raise HTTPException(status_code=401, detail="Incorrect PIN or pairing code.")

    return JSONResponse({"ok": True, "token": token})


@app.get("/api/pairing-info")
async def api_pairing_info(request: Request, token: str | None = Query(default=None)) -> dict[str, Any]:
    client_host = request.client.host if request.client else ""
    tok = _extract_token(request, token)
    if not auth_manager.is_loopback(client_host) and not auth_manager.validate_token(tok):
        raise HTTPException(status_code=403, detail="Only available from localhost or an authenticated session.")
    ip = get_primary_lan_ip()
    port = int(config.get("port", 8765))
    secret = str(config.get("pairing_secret", ""))
    return {
        "ip": ip,
        "allIps": get_all_lan_ips(),
        "port": port,
        "pin": str(config.get("pin", "")),
        "pairingUrl": build_pairing_url(ip, port, secret),
        "connectedClients": len(hub.clients),
        "extensionConnected": hub.extension_connected,
    }


@app.get("/api/qr.png")
async def api_qr_png(request: Request, token: str | None = Query(default=None)) -> Response:
    client_host = request.client.host if request.client else ""
    tok = _extract_token(request, token)
    if not auth_manager.is_loopback(client_host) and not auth_manager.validate_token(tok):
        raise HTTPException(status_code=403, detail="Unauthorized.")
    ip = get_primary_lan_ip()
    port = int(config.get("port", 8765))
    secret = str(config.get("pairing_secret", ""))
    png_bytes = generate_qr_png_bytes(build_pairing_url(ip, port, secret))
    return Response(content=png_bytes, media_type="image/png")


@app.post("/api/auth/change-pin")
async def api_change_pin(body: ChangePinRequest, request: Request, token: str | None = Query(default=None)) -> dict[str, Any]:
    client_host = request.client.host if request.client else ""
    tok = _extract_token(request, token)
    if not auth_manager.is_loopback(client_host) and not auth_manager.validate_token(tok):
        raise HTTPException(status_code=403, detail="Unauthorized.")
    try:
        saved_pin = config.set_pin(body.newPin, revoke_sessions=False)
        new_token = auth_manager.issue_token(device_name="Renewed Session", client_ip=client_host)
        return {"ok": True, "pin": saved_pin, "token": new_token}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ============================================================================
# Macro Execution Helper
# ============================================================================
async def execute_macro(macro: dict[str, Any]) -> None:
    steps = macro.get("steps", [])
    if not isinstance(steps, list):
        return
    for step in steps:
        if not isinstance(step, dict):
            continue
        stype = str(step.get("type", "")).lower()
        val = step.get("value")
        if stype == "delay_ms":
            await asyncio.sleep(min(10.0, max(0.05, float(val or 250) / 1000.0)))
        elif stype == "open_url" and val:
            url = system_controller.resolve_omnibox_input(str(val))
            if hub.extension_connected:
                await hub.send_to_extension({"target": "chrome", "action": "tab_new", "payload": {"url": url, "active": True}})
            else:
                await asyncio.to_thread(system_controller.open_url_in_chrome, url)
        elif stype == "set_volume" and val is not None:
            audio = await asyncio.to_thread(system_controller.set_volume, int(val))
            await hub.broadcast_to_clients({"target": "client", "action": "audio_state", "payload": audio})
        elif stype == "mute":
            audio = await asyncio.to_thread(system_controller.toggle_mute, bool(val) if val is not None else None)
            await hub.broadcast_to_clients({"target": "client", "action": "audio_state", "payload": audio})
        elif stype == "key" and val:
            await asyncio.to_thread(system_controller.press_key, str(val))
        elif stype == "hotkey" and isinstance(val, list):
            await asyncio.to_thread(system_controller.hotkey, *[str(x) for x in val])
        elif stype == "chrome_action" and val:
            act = str(val)
            if hub.extension_connected:
                await hub.send_to_extension({"target": "chrome", "action": act, "payload": {}})
            else:
                await asyncio.to_thread(system_controller.chrome_fallback, act, {})
        elif stype == "media_action" and val:
            act = str(val)
            if hub.extension_connected:
                await hub.send_to_extension({"target": "media", "action": act, "payload": {}})
            else:
                await asyncio.to_thread(system_controller.media_fallback, act, {})


# ============================================================================
# Message Dispatchers (System / Chrome / Media)
# ============================================================================
async def handle_system_action(client_id: str, action: str, payload: dict[str, Any]) -> None:
    act = action.lower()

    # High-frequency low-latency mouse paths (avoid thread overhead when < 1ms on Win32)
    if act == "mouse_move":
        m_cfg = config.get("mouse", {})
        dx = float(payload.get("dx", 0.0))
        dy = float(payload.get("dy", 0.0))
        sens = float(payload.get("sensitivity", m_cfg.get("sensitivity", 1.6)))
        accel = float(payload.get("acceleration", m_cfg.get("acceleration", 1.25)))
        system_controller.move_mouse(dx, dy, sensitivity=sens, acceleration=accel)
        return

    if act == "mouse_click":
        system_controller.mouse_click(
            button=str(payload.get("button", "left")),
            count=int(payload.get("count", 1)),
        )
        return

    if act == "mouse_button":
        system_controller.mouse_button(
            button=str(payload.get("button", "left")),
            state=str(payload.get("state", "up")),
        )
        return

    if act == "mouse_scroll":
        m_cfg = config.get("mouse", {})
        invert = bool(payload.get("invert", m_cfg.get("invert_scroll", False)))
        system_controller.mouse_scroll(
            dx=float(payload.get("dx", 0.0)),
            dy=float(payload.get("dy", 0.0)),
            invert=invert,
        )
        return

    if act == "pinch_zoom":
        system_controller.pinch_zoom(float(payload.get("delta", 0.0)))
        return

    if act == "mouse_settings":
        current = dict(config.get("mouse", {}))
        if "sensitivity" in payload:
            current["sensitivity"] = max(0.3, min(5.0, float(payload["sensitivity"])))
        if "acceleration" in payload:
            current["acceleration"] = max(1.0, min(3.0, float(payload["acceleration"])))
        if "invert_scroll" in payload:
            current["invert_scroll"] = bool(payload["invert_scroll"])
        config.set("mouse", current)
        await hub.broadcast_to_clients({"target": "client", "action": "mouse_settings", "payload": current})
        return

    # Keyboard & Clipboard
    if act == "key_type":
        text = str(payload.get("text", ""))
        if text:
            await asyncio.to_thread(system_controller.type_text, text)
        return

    if act == "key_press":
        key = str(payload.get("key", ""))
        if key:
            await asyncio.to_thread(system_controller.press_key, key)
        return

    if act == "key_combo":
        keys = payload.get("keys", [])
        if isinstance(keys, list) and keys:
            await asyncio.to_thread(system_controller.hotkey, *[str(k) for k in keys])
        return

    if act == "shortcut":
        name = str(payload.get("name", ""))
        if name:
            await asyncio.to_thread(system_controller.shortcut_action, name)
        return

    if act == "clipboard_set":
        text = str(payload.get("text", ""))
        auto_paste = bool(payload.get("autoPaste", False))
        ok = await asyncio.to_thread(system_controller.set_clipboard, text, auto_paste)
        await hub.send_to_client(
            client_id,
            {
                "target": "client",
                "action": "toast",
                "payload": {
                    "message": "Copied to PC clipboard" if ok else "Failed to copy to PC clipboard",
                    "type": "success" if ok else "error",
                },
            },
        )
        return

    if act == "clipboard_get":
        content = await asyncio.to_thread(system_controller.get_clipboard)
        await hub.send_to_client(
            client_id,
            {"target": "client", "action": "clipboard_content", "payload": {"text": content}},
        )
        return

    # Audio
    if act == "audio_get":
        audio = await asyncio.to_thread(system_controller.get_audio_state)
        await hub.send_to_client(client_id, {"target": "client", "action": "audio_state", "payload": audio})
        return

    if act == "audio_set_volume":
        level = int(payload.get("volume", 50))
        audio = await asyncio.to_thread(system_controller.set_volume, level)
        await hub.broadcast_to_clients({"target": "client", "action": "audio_state", "payload": audio})
        return

    if act == "audio_toggle_mute":
        mute_arg = payload.get("muted") if "muted" in payload else None
        audio = await asyncio.to_thread(system_controller.toggle_mute, mute_arg)
        await hub.broadcast_to_clients({"target": "client", "action": "audio_state", "payload": audio})
        return

    # Live Screen Preview ("Screen Spy Mode")
    if act == "screen_start":
        if payload:
            screen_streamer.configure(
                fps=payload.get("fps"),
                quality=payload.get("quality"),
                scale=payload.get("scale"),
                img_format=payload.get("format"),
                monitor_index=payload.get("monitor"),
            )
        screen_streamer.subscribe(client_id)
        await hub.send_to_client(
            client_id,
            {"target": "client", "action": "screen_settings", "payload": screen_streamer.get_settings()},
        )
        return

    if act == "screen_stop":
        screen_streamer.unsubscribe(client_id)
        await hub.send_to_client(
            client_id,
            {"target": "client", "action": "screen_settings", "payload": screen_streamer.get_settings()},
        )
        return

    if act == "screen_config":
        settings = screen_streamer.configure(
            fps=payload.get("fps"),
            quality=payload.get("quality"),
            scale=payload.get("scale"),
            img_format=payload.get("format"),
            monitor_index=payload.get("monitor"),
        )
        config.set(
            "screen_stream",
            {
                "fps": settings["fps"],
                "quality": settings["quality"],
                "scale": settings["scale"],
                "format": settings["format"],
            },
        )
        await hub.broadcast_to_clients({"target": "client", "action": "screen_settings", "payload": settings})
        return

    if act == "screen_tap":
        x, y = screen_streamer.map_ratio_to_screen(
            float(payload.get("xRatio", 0.5)),
            float(payload.get("yRatio", 0.5)),
        )
        system_controller.set_cursor_position(x, y)
        if payload.get("click", True):
            system_controller.mouse_click(
                button=str(payload.get("button", "left")),
                count=int(payload.get("count", 1)),
            )
        return

    # Macros
    if act == "macro_run":
        macro_id = str(payload.get("id", ""))
        macros: list[dict[str, Any]] = config.get("macros", [])
        found = next((m for m in macros if m.get("id") == macro_id), None)
        if found:
            asyncio.create_task(execute_macro(found))
            await hub.send_to_client(
                client_id,
                {"target": "client", "action": "toast", "payload": {"message": f"Running: {found.get('name')}", "type": "info"}},
            )
        return

    if act == "macro_save":
        macro_obj = payload.get("macro", {})
        if not isinstance(macro_obj, dict) or not macro_obj.get("name"):
            return
        macros = list(config.get("macros", []))
        mid = str(macro_obj.get("id") or f"macro-{secrets.token_hex(4)}")
        clean_macro = {
            "id": mid,
            "name": str(macro_obj.get("name", "Macro"))[:40],
            "icon": str(macro_obj.get("icon", "zap"))[:24],
            "color": str(macro_obj.get("color", "#06b6d4"))[:16],
            "description": str(macro_obj.get("description", ""))[:120],
            "steps": macro_obj.get("steps", []) if isinstance(macro_obj.get("steps"), list) else [],
        }
        replaced = False
        for i, existing in enumerate(macros):
            if existing.get("id") == mid:
                macros[i] = clean_macro
                replaced = True
                break
        if not replaced:
            macros.append(clean_macro)
        config.set("macros", macros)
        await hub.broadcast_to_clients({"target": "client", "action": "macros_list", "payload": {"macros": macros}})
        return

    if act == "macro_delete":
        mid = str(payload.get("id", ""))
        macros = [m for m in config.get("macros", []) if m.get("id") != mid]
        config.set("macros", macros)
        await hub.broadcast_to_clients({"target": "client", "action": "macros_list", "payload": {"macros": macros}})
        return

    # Sleep Timer & Power
    if act == "sleep_timer_set":
        minutes = float(payload.get("minutes", 30))
        mode = str(payload.get("mode", "suspend"))
        await hub.start_sleep_timer(minutes=minutes, mode=mode)
        return

    if act == "sleep_timer_cancel":
        await hub.cancel_sleep_timer(broadcast=True)
        return

    if act == "power_action":
        p_action = str(payload.get("powerAction", ""))
        res = await asyncio.to_thread(system_controller.execute_power_action, p_action)
        await hub.send_to_client(
            client_id,
            {
                "target": "client",
                "action": "toast",
                "payload": {
                    "message": f"Power action triggered: {p_action}" if res.get("ok") else res.get("error", "Error"),
                    "type": "info" if res.get("ok") else "error",
                },
            },
        )
        return


async def handle_chrome_or_media_action(client_id: str, target: str, action: str, payload: dict[str, Any]) -> None:
    # Pre-resolve omnibox search queries into canonical URLs so Extension & Fallback share identical logic
    if target == "chrome" and action in ("omnibox", "navigate") and ("query" in payload or "url" in payload):
        resolved_url = system_controller.resolve_omnibox_input(
            str(payload.get("url") or payload.get("query") or ""),
            str(payload.get("engine") or "google"),
        )
        payload = {**payload, "url": resolved_url}

    sent = await hub.send_to_extension({"target": target, "action": action, "payload": payload, "clientId": client_id})
    if sent:
        return

    # Automatic OS/Keyboard Fallback when Chrome Extension is not active!
    if target == "chrome":
        await asyncio.to_thread(system_controller.chrome_fallback, action, payload)
    elif target == "media":
        await asyncio.to_thread(system_controller.media_fallback, action, payload)


# ============================================================================
# WebSocket Endpoints
# ============================================================================
@app.websocket("/ws/client")
async def ws_client_endpoint(websocket: WebSocket, token: str | None = Query(default=None)) -> None:
    if not auth_manager.validate_token(token):
        await websocket.accept()
        await websocket.close(code=4401, reason="Unauthorized: invalid PIN or token")
        return

    await websocket.accept()
    client_id = str(uuid.uuid4())
    hub.clients[client_id] = websocket

    try:
        init_payload = await hub.build_initial_state()
        await websocket.send_json({"target": "client", "action": "init_state", "payload": init_payload})
        # Ask extension to refresh live tabs & media immediately on mobile connect
        if hub.extension_connected:
            await hub.send_to_extension({"target": "chrome", "action": "sync_all", "payload": {}})

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            target = str(msg.get("target", "")).lower()
            action = str(msg.get("action", ""))
            payload = msg.get("payload") if isinstance(msg.get("payload"), dict) else {}

            if action == "ping":
                await websocket.send_json(
                    {
                        "target": "client",
                        "action": "pong",
                        "payload": {
                            "ts": payload.get("ts", 0),
                            "paused": bool(config.get("paused", False)),
                            "extensionConnected": hub.extension_connected,
                        },
                    }
                )
                continue

            if bool(config.get("paused", False)):
                await websocket.send_json(
                    {
                        "target": "client",
                        "action": "toast",
                        "payload": {"message": "Remote control is paused from the PC system tray", "type": "warning"},
                    }
                )
                continue

            if target == "system":
                await handle_system_action(client_id, action, payload)
            elif target in ("chrome", "media"):
                await handle_chrome_or_media_action(client_id, target, action, payload)

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.clients.pop(client_id, None)
        screen_streamer.unsubscribe(client_id)


@app.websocket("/ws/extension")
async def ws_extension_endpoint(websocket: WebSocket) -> None:
    client_host = websocket.client.host if websocket.client else ""
    if not auth_manager.is_loopback(client_host):
        await websocket.accept()
        await websocket.close(code=4403, reason="Extension may only connect from localhost")
        return

    await websocket.accept()
    hub.extension_ws = websocket
    await hub.broadcast_to_clients(
        {"target": "client", "action": "extension_status", "payload": {"connected": True}}
    )

    try:
        await websocket.send_json({"target": "chrome", "action": "sync_all", "payload": {}})
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            action = str(msg.get("action", ""))
            payload = msg.get("payload") if isinstance(msg.get("payload"), dict) else {}
            req_client = msg.get("clientId")

            if action == "ping":
                await websocket.send_json({"target": "extension", "action": "pong", "payload": payload})
                continue

            if action == "tabs_list":
                hub.cached_tabs = payload.get("tabs", [])
                hub.cached_windows = payload.get("windows", [])
                await hub.broadcast_to_clients(
                    {"target": "client", "action": "tabs_list", "payload": payload}
                )
            elif action == "media_state":
                hub.cached_media = payload
                await hub.broadcast_to_clients(
                    {"target": "client", "action": "media_state", "payload": payload}
                )
            elif action in ("bookmarks_list", "history_list", "downloads_list", "toast", "find_result"):
                out = {"target": "client", "action": action, "payload": payload}
                if req_client and req_client in hub.clients:
                    await hub.send_to_client(str(req_client), out)
                else:
                    await hub.broadcast_to_clients(out)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if hub.extension_ws is websocket:
            hub.extension_ws = None
            await hub.broadcast_to_clients(
                {"target": "client", "action": "extension_status", "payload": {"connected": False}}
            )


# ============================================================================
# Static Frontend PWA Serving (Built Vite App)
# ============================================================================


@app.get("/{full_path:path}")
async def serve_pwa(full_path: str) -> Response:
    if full_path.startswith("api/") or full_path.startswith("ws/"):
        raise HTTPException(status_code=404, detail="Route not found")

    if FRONTEND_DIST.is_dir():
        if full_path:
            candidate = (FRONTEND_DIST / full_path).resolve()
            if str(candidate).startswith(str(FRONTEND_DIST.resolve())) and candidate.is_file():
                headers = {}
                if candidate.name == "sw.js":
                    headers["Service-Worker-Allowed"] = "/"
                    headers["Cache-Control"] = "no-cache"
                return FileResponse(str(candidate), headers=headers)
        index_file = FRONTEND_DIST / "index.html"
        if index_file.is_file():
            return FileResponse(str(index_file), headers={"Cache-Control": "no-cache"})

    return JSONResponse(
        {
            "message": "Chrome Remote Control Backend active. Build the frontend with 'npm run build' inside /frontend.",
            "docs": "/docs",
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Local server for Chrome Remote Control")
    parser.add_argument("--host", default=None, help="Bind host (default 0.0.0.0)")
    parser.add_argument("--port", type=int, default=None, help="TCP port (default 8765)")
    parser.add_argument("--pin", default=None, help="Set a fixed 4-6 digit PIN on startup")
    parser.add_argument("--no-tray", action="store_true", help="Disable system tray icon")
    args = parser.parse_args()

    if args.host:
        config.set("host", args.host)
    if args.port:
        config.set("port", args.port)
    if args.pin:
        config.set_pin(args.pin, revoke_sessions=False)

    host = str(config.get("host", "0.0.0.0"))
    port = int(config.get("port", 8765))
    pin = str(config.get("pin", "1234"))
    secret = str(config.get("pairing_secret", ""))
    lan_ip = get_primary_lan_ip()
    all_ips = get_all_lan_ips()
    pairing_url = build_pairing_url(lan_ip, port, secret)

    print_startup_banner(lan_ip, port, pin, pairing_url, all_ips)

    global tray_app
    disable_tray = args.no_tray or os.environ.get("DISABLE_TRAY") == "1"
    if not disable_tray:
        tray_app = SystemTrayApp(on_exit_callback=lambda: None, main_script_path=Path(__file__).resolve())
        tray_app.start()

    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
