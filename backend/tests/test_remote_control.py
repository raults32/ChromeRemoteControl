from __future__ import annotations

import ctypes
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from auth import auth_manager
from config import config
import main as backend_main
from screen_stream import screen_streamer
import system_control


def setup_function() -> None:
    config.set("paused", False)
    auth_manager._failed_attempts.clear()


def test_status_and_pwa_static_serving() -> None:
    client = TestClient(backend_main.app)

    status_res = client.get("/api/status")
    assert status_res.status_code == 200
    data = status_res.json()
    assert data["server"] == "online"
    assert data["authenticated"] is False

    # Built PWA files served directly by FastAPI
    index_res = client.get("/")
    assert index_res.status_code == 200
    assert "Chrome Remote Control" in index_res.text

    manifest_res = client.get("/manifest.json")
    assert manifest_res.status_code == 200
    assert manifest_res.json()["display"] == "standalone"

    sw_res = client.get("/sw.js")
    assert sw_res.status_code == 200
    assert sw_res.headers.get("service-worker-allowed") == "/"


def test_pin_and_qr_authentication() -> None:
    client = TestClient(backend_main.app)
    current_pin = config.set_pin("4826", revoke_sessions=True)
    assert current_pin == "4826"

    # Wrong PIN rejected
    bad_res = client.post("/api/auth/login", json={"pin": "0000", "deviceName": "TestPhone"})
    assert bad_res.status_code == 401

    # Valid PIN issues persistent token
    ok_res = client.post("/api/auth/login", json={"pin": "4826", "deviceName": "TestPhone"})
    assert ok_res.status_code == 200
    token = ok_res.json()["token"]
    assert auth_manager.validate_token(token) is True

    # QR pairing secret also issues persistent token
    secret = config.get("pairing_secret")
    qr_res = client.post("/api/auth/login", json={"pairingSecret": secret, "deviceName": "QRPhone"})
    assert qr_res.status_code == 200
    assert auth_manager.validate_token(qr_res.json()["token"]) is True

    # QR PNG endpoint returns valid PNG bytes
    png_res = client.get(f"/api/qr.png?token={token}")
    assert png_res.status_code == 200
    assert png_res.headers["content-type"] == "image/png"
    assert png_res.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_websocket_auth_and_extension_bridge() -> None:
    client = TestClient(backend_main.app)
    config.set_pin("1357", revoke_sessions=True)
    token = client.post("/api/auth/login", json={"pin": "1357"}).json()["token"]

    # Unauthorized client WS closes with 4401
    with client.websocket_connect("/ws/client?token=invalid_token") as bad_ws:
        try:
            bad_ws.receive_json()
            assert False, "Expected close on invalid token"
        except Exception:
            pass

    # Authenticated mobile PWA + Chrome Extension bridge round-trip
    with client.websocket_connect(f"/ws/client?token={token}") as mobile_ws:
        init_msg = mobile_ws.receive_json()
        assert init_msg["action"] == "init_state"
        assert init_msg["payload"]["extensionConnected"] is False

        # Ping/Pong latency check
        mobile_ws.send_json({"target": "system", "action": "ping", "payload": {"ts": 12345.0}})
        pong_msg = mobile_ws.receive_json()
        assert pong_msg["action"] == "pong"
        assert pong_msg["payload"]["ts"] == 12345.0

        # Connect simulated Chrome Extension from localhost
        with client.websocket_connect("/ws/extension") as ext_ws:
            ext_status = mobile_ws.receive_json()
            assert ext_status["action"] == "extension_status"
            assert ext_status["payload"]["connected"] is True

            sync_cmd = ext_ws.receive_json()
            assert sync_cmd["action"] == "sync_all"

            # Extension pushes live tabs -> relayed to mobile PWA
            sample_tabs = [{"id": 101, "title": "YouTube", "domain": "youtube.com", "active": True}]
            ext_ws.send_json({"target": "client", "action": "tabs_list", "payload": {"tabs": sample_tabs, "windows": []}})
            relayed_tabs = mobile_ws.receive_json()
            assert relayed_tabs["action"] == "tabs_list"
            assert relayed_tabs["payload"]["tabs"][0]["id"] == 101

            # Mobile sends smart omnibox search -> backend resolves URL & forwards to Extension
            mobile_ws.send_json(
                {
                    "target": "chrome",
                    "action": "omnibox",
                    "payload": {"query": "lofi hip hop", "engine": "youtube", "newTab": True},
                }
            )
            forwarded = ext_ws.receive_json()
            assert forwarded["target"] == "chrome"
            assert forwarded["action"] == "omnibox"
            assert "youtube.com/results?search_query=lofi+hip+hop" in forwarded["payload"]["url"]

            # Mobile sends media seek -> forwarded to Extension
            mobile_ws.send_json({"target": "media", "action": "seek_to", "payload": {"time": 95}})
            media_cmd = ext_ws.receive_json()
            assert media_cmd["target"] == "media"
            assert media_cmd["action"] == "seek_to"
            assert media_cmd["payload"]["time"] == 95


def test_macros_sleep_timer_and_pause_guard() -> None:
    client = TestClient(backend_main.app)
    token = auth_manager.issue_token(device_name="Pytest")

    with client.websocket_connect(f"/ws/client?token={token}") as ws:
        _ = ws.receive_json()  # init_state

        # Save custom macro
        ws.send_json(
            {
                "target": "system",
                "action": "macro_save",
                "payload": {
                    "macro": {
                        "id": "test-macro",
                        "name": "Macro Prueba",
                        "steps": [{"type": "set_volume", "value": 40}],
                    }
                },
            }
        )
        macros_msg = ws.receive_json()
        assert macros_msg["action"] == "macros_list"
        assert any(m["id"] == "test-macro" for m in macros_msg["payload"]["macros"])

        # Delete custom macro
        ws.send_json({"target": "system", "action": "macro_delete", "payload": {"id": "test-macro"}})
        macros_after = ws.receive_json()
        assert not any(m["id"] == "test-macro" for m in macros_after["payload"]["macros"])

        # Sleep timer start & cancel
        ws.send_json({"target": "system", "action": "sleep_timer_set", "payload": {"minutes": 30, "mode": "suspend"}})
        timer_on = ws.receive_json()
        assert timer_on["action"] == "sleep_timer_state"
        assert timer_on["payload"]["active"] is True
        assert timer_on["payload"]["remainingSeconds"] > 1700

        ws.send_json({"target": "system", "action": "sleep_timer_cancel", "payload": {}})
        timer_off = ws.receive_json()
        assert timer_off["action"] == "sleep_timer_state"
        assert timer_off["payload"]["active"] is False

        # Pause guard blocks remote input
        config.set("paused", True)
        ws.send_json({"target": "system", "action": "mouse_move", "payload": {"dx": 10, "dy": 10}})
        paused_toast = ws.receive_json()
        assert paused_toast["action"] == "toast"
        assert "pausa" in paused_toast["payload"]["message"].lower()
        config.set("paused", False)


def test_win32_structs_unicode_and_screen_capture() -> None:
    if system_control.IS_WINDOWS:
        # On 64-bit Windows, sizeof(INPUT) MUST be 40 bytes for SendInput to succeed
        expected_size = 40 if ctypes.sizeof(ctypes.c_void_p) == 8 else 28
        assert ctypes.sizeof(system_control.INPUT) == expected_size

        # Spanish ñ + accents + 4-byte emoji surrogate pairs
        sample = "Español ñ áéíóú 🚀"
        events = system_control._make_unicode_inputs(sample)
        # UTF-16 code units * 2 (key down + key up)
        expected_units = len(sample.encode("utf-16-le")) // 2
        assert len(events) == expected_units * 2

    # Screen streamer single-frame capture check
    frame = screen_streamer.capture_frame_sync()
    assert frame["dataUrl"].startswith("data:image/jpeg;base64,")
    assert frame["width"] > 0 and frame["height"] > 0


def test_chrome_extension_mv3_integrity() -> None:
    ext_dir = ROOT_DIR / "chrome-extension"
    manifest = json.loads((ext_dir / "manifest.json").read_text(encoding="utf-8"))

    assert manifest["manifest_version"] == 3
    assert "tabs" in manifest["permissions"]
    assert "offscreen" in manifest["permissions"]
    assert "action" in manifest

    # Verify all declared icon dimensions match actual PNG pixel sizes
    for size_str, rel_path in manifest["icons"].items():
        icon_file = ext_dir / rel_path
        assert icon_file.is_file(), f"Missing icon {rel_path}"
        with Image.open(icon_file) as img:
            expected = int(size_str)
            assert img.size == (expected, expected), f"Icon {rel_path} has wrong size {img.size}"

    # Verify no .then() chains or forbidden chrome.windows.query in extension JS
    for js_name in ("background.js", "offscreen.js", "content_media.js", "popup.js"):
        source = (ext_dir / js_name).read_text(encoding="utf-8")
        assert ".then(" not in source, f"Found .then() chain in {js_name}"
        assert "chrome.windows.query" not in source, f"Invalid chrome.windows.query in {js_name}"
