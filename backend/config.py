from __future__ import annotations

import json
import secrets
import threading
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BACKEND_DIR / "config.json"

DEFAULT_MACROS: list[dict[str, Any]] = [
    {
        "id": "cinema-mode",
        "name": "Cinema Mode",
        "icon": "film",
        "color": "#ef4444",
        "description": "Opens YouTube, sets PC volume to 80%, and toggles fullscreen",
        "steps": [
            {"type": "open_url", "value": "https://www.youtube.com"},
            {"type": "set_volume", "value": 80},
            {"type": "delay_ms", "value": 1200},
            {"type": "key", "value": "f11"},
        ],
    },
    {
        "id": "work-mode",
        "name": "Work Mode",
        "icon": "briefcase",
        "color": "#3b82f6",
        "description": "Opens Gmail, Calendar, and ChatGPT with moderate volume (30%)",
        "steps": [
            {"type": "set_volume", "value": 30},
            {"type": "open_url", "value": "https://mail.google.com"},
            {"type": "open_url", "value": "https://calendar.google.com"},
            {"type": "open_url", "value": "https://chatgpt.com"},
        ],
    },
    {
        "id": "night-mode",
        "name": "Night Mode",
        "icon": "moon",
        "color": "#8b5cf6",
        "description": "Soft 15% master volume and fullscreen video playback",
        "steps": [
            {"type": "set_volume", "value": 15},
            {"type": "media_action", "value": "fullscreen"},
        ],
    },
]


def _generate_pin() -> str:
    return f"{secrets.randbelow(9000) + 1000}"


class ConfigManager:
    """Thread-safe persistent JSON configuration manager."""

    def __init__(self, path: Path = CONFIG_PATH) -> None:
        self.path = path
        self._lock = threading.RLock()
        self.data: dict[str, Any] = {}
        self.load()

    def load(self) -> dict[str, Any]:
        with self._lock:
            defaults: dict[str, Any] = {
                "host": "0.0.0.0",
                "port": 8765,
                "pin": _generate_pin(),
                "pairing_secret": secrets.token_urlsafe(16),
                "extension_key": secrets.token_urlsafe(24),
                "authorized_tokens": {},
                "paused": False,
                "start_with_system": False,
                "mouse": {
                    "sensitivity": 1.6,
                    "acceleration": 1.25,
                    "invert_scroll": False,
                },
                "screen_stream": {
                    "fps": 8,
                    "quality": 55,
                    "scale": 0.5,
                    "format": "jpeg",
                },
                "macros": DEFAULT_MACROS,
            }
            if self.path.exists():
                try:
                    loaded = json.loads(self.path.read_text(encoding="utf-8"))
                    if isinstance(loaded, dict):
                        for k, v in loaded.items():
                            if isinstance(v, dict) and isinstance(defaults.get(k), dict) and k != "authorized_tokens":
                                defaults[k].update(v)
                            else:
                                defaults[k] = v
                except Exception:
                    pass
            self.data = defaults
            self.save()
            return self.data

    def save(self) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = self.path.with_suffix(".tmp")
            tmp_path.write_text(
                json.dumps(self.data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            tmp_path.replace(self.path)

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self.data.get(key, default)

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self.data[key] = value
            self.save()

    def set_pin(self, new_pin: str, revoke_sessions: bool = True) -> str:
        clean_pin = "".join(ch for ch in str(new_pin).strip() if ch.isdigit())
        if not (4 <= len(clean_pin) <= 6):
            raise ValueError("PIN must contain 4 to 6 numeric digits.")
        with self._lock:
            self.data["pin"] = clean_pin
            self.data["pairing_secret"] = secrets.token_urlsafe(16)
            if revoke_sessions:
                self.data["authorized_tokens"] = {}
            self.save()
        return clean_pin

    def regenerate_pin(self) -> str:
        return self.set_pin(_generate_pin(), revoke_sessions=True)


config = ConfigManager()
