from __future__ import annotations

import ctypes
import math
import os
import platform
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from typing import Any

try:
    import pyperclip
except Exception:
    pyperclip = None  # type: ignore[assignment]

try:
    from pynput.keyboard import Controller as PynputKeyboard, Key as PynputKey
    from pynput.mouse import Button as PynputButton, Controller as PynputMouse
except Exception:
    PynputKeyboard = None  # type: ignore[assignment]
    PynputKey = None  # type: ignore[assignment]
    PynputButton = None  # type: ignore[assignment]
    PynputMouse = None  # type: ignore[assignment]

OS_NAME = platform.system().lower()  # 'windows', 'darwin', 'linux'
IS_WINDOWS = OS_NAME == "windows"
IS_MAC = OS_NAME == "darwin"
IS_LINUX = OS_NAME == "linux"
MOD_KEY = "cmd" if IS_MAC else "ctrl"

SEARCH_ENGINES: dict[str, str] = {
    "google": "https://www.google.com/search?q={q}",
    "youtube": "https://www.youtube.com/results?search_query={q}",
    "wikipedia": "https://es.wikipedia.org/w/index.php?search={q}",
    "chatgpt": "https://chatgpt.com/?q={q}",
    "duckduckgo": "https://duckduckgo.com/?q={q}",
    "github": "https://github.com/search?q={q}",
}


# ============================================================================
# Native Win32 SendInput implementation (< 1ms latency on Windows)
# ============================================================================
if IS_WINDOWS:
    ULONG_PTR = ctypes.c_uint64 if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_uint32

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [
            ("dx", ctypes.c_long),
            ("dy", ctypes.c_long),
            ("mouseData", ctypes.c_ulong),
            ("dwFlags", ctypes.c_ulong),
            ("time", ctypes.c_ulong),
            ("dwExtraInfo", ULONG_PTR),
        ]

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [
            ("wVk", ctypes.c_ushort),
            ("wScan", ctypes.c_ushort),
            ("dwFlags", ctypes.c_ulong),
            ("time", ctypes.c_ulong),
            ("dwExtraInfo", ULONG_PTR),
        ]

    class HARDWAREINPUT(ctypes.Structure):
        _fields_ = [
            ("uMsg", ctypes.c_ulong),
            ("wParamL", ctypes.c_ushort),
            ("wParamH", ctypes.c_ushort),
        ]

    class _INPUT_UNION(ctypes.Union):
        _fields_ = [
            ("mi", MOUSEINPUT),
            ("ki", KEYBDINPUT),
            ("hi", HARDWAREINPUT),
        ]

    class INPUT(ctypes.Structure):
        _fields_ = [
            ("type", ctypes.c_ulong),
            ("union", _INPUT_UNION),
        ]

    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

    INPUT_MOUSE = 0
    INPUT_KEYBOARD = 1

    MOUSEEVENTF_MOVE = 0x0001
    MOUSEEVENTF_LEFTDOWN = 0x0002
    MOUSEEVENTF_LEFTUP = 0x0004
    MOUSEEVENTF_RIGHTDOWN = 0x0008
    MOUSEEVENTF_RIGHTUP = 0x0010
    MOUSEEVENTF_MIDDLEDOWN = 0x0020
    MOUSEEVENTF_MIDDLEUP = 0x0040
    MOUSEEVENTF_WHEEL = 0x0800
    MOUSEEVENTF_HWHEEL = 0x01000

    KEYEVENTF_EXTENDEDKEY = 0x0001
    KEYEVENTF_KEYUP = 0x0002
    KEYEVENTF_UNICODE = 0x0004

    VK_MAP: dict[str, int] = {
        "backspace": 0x08,
        "tab": 0x09,
        "enter": 0x0D,
        "return": 0x0D,
        "shift": 0x10,
        "ctrl": 0x11,
        "control": 0x11,
        "alt": 0x12,
        "esc": 0x1B,
        "escape": 0x1B,
        "space": 0x20,
        "pageup": 0x21,
        "pagedown": 0x22,
        "end": 0x23,
        "home": 0x24,
        "left": 0x25,
        "up": 0x26,
        "right": 0x27,
        "down": 0x28,
        "delete": 0x2E,
        "supr": 0x2E,
        "win": 0x5B,
        "cmd": 0x5B,
        "meta": 0x5B,
        "f1": 0x70,
        "f2": 0x71,
        "f3": 0x72,
        "f4": 0x73,
        "f5": 0x74,
        "f6": 0x75,
        "f7": 0x76,
        "f8": 0x77,
        "f9": 0x78,
        "f10": 0x79,
        "f11": 0x7A,
        "f12": 0x7B,
        "vol_mute": 0xAD,
        "vol_down": 0xAE,
        "vol_up": 0xAF,
        "next_track": 0xB0,
        "prev_track": 0xB1,
        "stop_media": 0xB2,
        "play_pause": 0xB3,
        "plus": 0xBB,
        "=": 0xBB,
        "+": 0xBB,
        "minus": 0xBD,
        "-": 0xBD,
    }
    for ch_code in range(ord("0"), ord("9") + 1):
        VK_MAP[chr(ch_code)] = ch_code
    for ch_code in range(ord("a"), ord("z") + 1):
        VK_MAP[chr(ch_code)] = ch_code - 32  # VK_A..VK_Z are 0x41..0x5A

    EXTENDED_VKS = {0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2E, 0x5B}

    user32 = ctypes.windll.user32

    def _win_send_inputs(inputs: list[INPUT]) -> int:
        if not inputs:
            return 0
        arr = (INPUT * len(inputs))(*inputs)
        return int(user32.SendInput(len(inputs), arr, ctypes.sizeof(INPUT)))

    def _make_mouse_input(flags: int, dx: int = 0, dy: int = 0, data: int = 0) -> INPUT:
        inp = INPUT(type=INPUT_MOUSE)
        inp.union.mi = MOUSEINPUT(
            dx=dx,
            dy=dy,
            mouseData=ctypes.c_ulong(data & 0xFFFFFFFF).value,
            dwFlags=flags,
            time=0,
            dwExtraInfo=0,
        )
        return inp

    def _make_vk_input(vk: int, key_up: bool = False) -> INPUT:
        flags = KEYEVENTF_KEYUP if key_up else 0
        if vk in EXTENDED_VKS:
            flags |= KEYEVENTF_EXTENDEDKEY
        inp = INPUT(type=INPUT_KEYBOARD)
        inp.union.ki = KEYBDINPUT(wVk=vk, wScan=0, dwFlags=flags, time=0, dwExtraInfo=0)
        return inp

    def _make_unicode_inputs(text: str) -> list[INPUT]:
        # UTF-16LE handles Spanish accents, ñ, ¿, ¡, and 4-byte Emoji surrogate pairs natively
        utf16_bytes = text.encode("utf-16-le")
        code_units = [
            int.from_bytes(utf16_bytes[i : i + 2], "little")
            for i in range(0, len(utf16_bytes), 2)
        ]
        events: list[INPUT] = []
        for unit in code_units:
            down = INPUT(type=INPUT_KEYBOARD)
            down.union.ki = KEYBDINPUT(wVk=0, wScan=unit, dwFlags=KEYEVENTF_UNICODE, time=0, dwExtraInfo=0)
            up = INPUT(type=INPUT_KEYBOARD)
            up.union.ki = KEYBDINPUT(
                wVk=0, wScan=unit, dwFlags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time=0, dwExtraInfo=0
            )
            events.extend([down, up])
        return events


class SystemController:
    """Cross-platform OS controller for mouse, keyboard, audio, clipboard, and power."""

    def __init__(self) -> None:
        self._mouse_rem_x: float = 0.0
        self._mouse_rem_y: float = 0.0
        self._audio_lock = threading.Lock()
        self._pynput_mouse = PynputMouse() if PynputMouse else None
        self._pynput_kb = PynputKeyboard() if PynputKeyboard else None
        self._cached_volume: int = 50
        self._cached_muted: bool = False

    # ------------------------------------------------------------------
    # Mouse & Touchpad
    # ------------------------------------------------------------------
    def get_cursor_position(self) -> tuple[int, int]:
        if IS_WINDOWS:
            pt = POINT()
            user32.GetCursorPos(ctypes.byref(pt))
            return int(pt.x), int(pt.y)
        if self._pynput_mouse is not None:
            pos = self._pynput_mouse.position
            return int(pos[0]), int(pos[1])
        return 0, 0

    def move_mouse(self, dx: float, dy: float, sensitivity: float = 1.0, acceleration: float = 1.0) -> None:
        speed = math.hypot(dx, dy)
        accel_factor = 1.0
        if acceleration > 1.0 and speed > 1.5:
            accel_factor = min(3.2, 1.0 + (speed / 18.0) * (acceleration - 1.0))

        scaled_x = dx * sensitivity * accel_factor + self._mouse_rem_x
        scaled_y = dy * sensitivity * accel_factor + self._mouse_rem_y
        ix = int(math.trunc(scaled_x))
        iy = int(math.trunc(scaled_y))
        self._mouse_rem_x = scaled_x - ix
        self._mouse_rem_y = scaled_y - iy

        if ix == 0 and iy == 0:
            return

        if IS_WINDOWS:
            _win_send_inputs([_make_mouse_input(MOUSEEVENTF_MOVE, dx=ix, dy=iy)])
        elif self._pynput_mouse is not None:
            self._pynput_mouse.move(ix, iy)

    def set_cursor_position(self, x: int, y: int) -> None:
        if IS_WINDOWS:
            user32.SetCursorPos(int(x), int(y))
        elif self._pynput_mouse is not None:
            self._pynput_mouse.position = (int(x), int(y))

    def mouse_click(self, button: str = "left", count: int = 1) -> None:
        btn = button.lower()
        count = max(1, min(3, int(count)))
        if IS_WINDOWS:
            flag_map = {
                "left": (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
                "right": (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
                "middle": (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            }
            down_f, up_f = flag_map.get(btn, flag_map["left"])
            events: list[INPUT] = []
            for _ in range(count):
                events.append(_make_mouse_input(down_f))
                events.append(_make_mouse_input(up_f))
            _win_send_inputs(events)
        elif self._pynput_mouse is not None and PynputButton is not None:
            pbtn = {
                "left": PynputButton.left,
                "right": PynputButton.right,
                "middle": PynputButton.middle,
            }.get(btn, PynputButton.left)
            self._pynput_mouse.click(pbtn, count)

    def mouse_button(self, button: str = "left", state: str = "down") -> None:
        btn = button.lower()
        is_down = state.lower() == "down"
        if IS_WINDOWS:
            flag_map = {
                ("left", True): MOUSEEVENTF_LEFTDOWN,
                ("left", False): MOUSEEVENTF_LEFTUP,
                ("right", True): MOUSEEVENTF_RIGHTDOWN,
                ("right", False): MOUSEEVENTF_RIGHTUP,
                ("middle", True): MOUSEEVENTF_MIDDLEDOWN,
                ("middle", False): MOUSEEVENTF_MIDDLEUP,
            }
            flag = flag_map.get((btn, is_down), MOUSEEVENTF_LEFTUP)
            _win_send_inputs([_make_mouse_input(flag)])
        elif self._pynput_mouse is not None and PynputButton is not None:
            pbtn = {
                "left": PynputButton.left,
                "right": PynputButton.right,
                "middle": PynputButton.middle,
            }.get(btn, PynputButton.left)
            if is_down:
                self._pynput_mouse.press(pbtn)
            else:
                self._pynput_mouse.release(pbtn)

    def mouse_scroll(self, dx: float = 0.0, dy: float = 0.0, invert: bool = False) -> None:
        mul = -1.0 if invert else 1.0
        sx = dx * mul
        sy = dy * mul
        if IS_WINDOWS:
            events: list[INPUT] = []
            if abs(sy) >= 0.05:
                wheel_y = int(round(sy * 120))
                if wheel_y != 0:
                    events.append(_make_mouse_input(MOUSEEVENTF_WHEEL, data=wheel_y))
            if abs(sx) >= 0.05:
                wheel_x = int(round(sx * 120))
                if wheel_x != 0:
                    events.append(_make_mouse_input(MOUSEEVENTF_HWHEEL, data=wheel_x))
            if events:
                _win_send_inputs(events)
        elif self._pynput_mouse is not None:
            self._pynput_mouse.scroll(int(round(sx)), int(round(sy)))

    def pinch_zoom(self, delta: float) -> None:
        if abs(delta) < 0.01:
            return
        if IS_WINDOWS:
            wheel = int(round(delta * 120))
            if wheel == 0:
                wheel = 120 if delta > 0 else -120
            _win_send_inputs(
                [
                    _make_vk_input(VK_MAP["ctrl"], key_up=False),
                    _make_mouse_input(MOUSEEVENTF_WHEEL, data=wheel),
                    _make_vk_input(VK_MAP["ctrl"], key_up=True),
                ]
            )
        else:
            self.hotkey(MOD_KEY, "+" if delta > 0 else "-")

    # ------------------------------------------------------------------
    # Keyboard & Text
    # ------------------------------------------------------------------
    def type_text(self, text: str) -> None:
        if not text:
            return
        if IS_WINDOWS:
            events: list[INPUT] = []
            # Split around '\n' so Enter triggers real form submissions / line breaks
            parts = text.replace("\r\n", "\n").split("\n")
            for idx, part in enumerate(parts):
                if part:
                    events.extend(_make_unicode_inputs(part))
                if idx < len(parts) - 1:
                    events.append(_make_vk_input(VK_MAP["enter"], key_up=False))
                    events.append(_make_vk_input(VK_MAP["enter"], key_up=True))
            _win_send_inputs(events)
        elif self._pynput_kb is not None:
            self._pynput_kb.type(text)

    def press_key(self, key: str) -> None:
        k = key.strip().lower()
        if "+" in k and len(k) > 1:
            parts = [p.strip() for p in k.split("+") if p.strip()]
            self.hotkey(*parts)
            return

        if IS_WINDOWS:
            vk = VK_MAP.get(k)
            if vk is not None:
                _win_send_inputs([_make_vk_input(vk, key_up=False), _make_vk_input(vk, key_up=True)])
            elif len(key) == 1:
                self.type_text(key)
            return

        if self._pynput_kb is not None and PynputKey is not None:
            key_map = {
                "esc": PynputKey.esc,
                "escape": PynputKey.esc,
                "tab": PynputKey.tab,
                "enter": PynputKey.enter,
                "return": PynputKey.enter,
                "backspace": PynputKey.backspace,
                "delete": PynputKey.delete,
                "supr": PynputKey.delete,
                "space": PynputKey.space,
                "up": PynputKey.up,
                "down": PynputKey.down,
                "left": PynputKey.left,
                "right": PynputKey.right,
                "home": PynputKey.home,
                "end": PynputKey.end,
                "pageup": PynputKey.page_up,
                "pagedown": PynputKey.page_down,
                "f5": PynputKey.f5,
                "f11": PynputKey.f11,
                "win": PynputKey.cmd,
                "cmd": PynputKey.cmd,
                "play_pause": getattr(PynputKey, "media_play_pause", PynputKey.space),
                "vol_up": getattr(PynputKey, "media_volume_up", None),
                "vol_down": getattr(PynputKey, "media_volume_down", None),
                "vol_mute": getattr(PynputKey, "media_volume_mute", None),
                "next_track": getattr(PynputKey, "media_next", None),
                "prev_track": getattr(PynputKey, "media_previous", None),
            }
            mapped = key_map.get(k)
            if mapped is not None:
                self._pynput_kb.press(mapped)
                self._pynput_kb.release(mapped)
            elif len(key) == 1:
                self._pynput_kb.type(key)

    def hotkey(self, *keys: str) -> None:
        normalized = []
        for k in keys:
            kl = k.strip().lower()
            if kl == "mod":
                kl = MOD_KEY
            normalized.append(kl)

        if not normalized:
            return

        if IS_WINDOWS:
            vks = [VK_MAP[k] for k in normalized if k in VK_MAP]
            if not vks:
                return
            downs = [_make_vk_input(vk, key_up=False) for vk in vks]
            ups = [_make_vk_input(vk, key_up=True) for vk in reversed(vks)]
            _win_send_inputs(downs + ups)
            return

        if self._pynput_kb is not None and PynputKey is not None:
            mod_lookup = {
                "ctrl": PynputKey.ctrl,
                "control": PynputKey.ctrl,
                "shift": PynputKey.shift,
                "alt": PynputKey.alt,
                "cmd": PynputKey.cmd,
                "win": PynputKey.cmd,
                "meta": PynputKey.cmd,
                "tab": PynputKey.tab,
                "left": PynputKey.left,
                "right": PynputKey.right,
                "up": PynputKey.up,
                "down": PynputKey.down,
                "esc": PynputKey.esc,
                "f11": PynputKey.f11,
            }
            resolved = [mod_lookup.get(k, k) for k in normalized]
            for rk in resolved:
                self._pynput_kb.press(rk)
            for rk in reversed(resolved):
                self._pynput_kb.release(rk)

    def shortcut_action(self, name: str) -> None:
        action_map: dict[str, tuple[str, ...]] = {
            "copy": ("mod", "c"),
            "paste": ("mod", "v"),
            "cut": ("mod", "x"),
            "undo": ("mod", "z"),
            "redo": ("mod", "shift", "z") if IS_MAC else ("mod", "y"),
            "select_all": ("mod", "a"),
            "alt_tab": ("cmd", "tab") if IS_MAC else ("alt", "tab"),
            "save": ("mod", "s"),
            "find": ("mod", "f"),
        }
        combo = action_map.get(name.lower())
        if combo:
            self.hotkey(*combo)

    # ------------------------------------------------------------------
    # System Audio (0 - 100% + Mute)
    # ------------------------------------------------------------------
    def _get_win_endpoint_volume(self) -> Any:
        import comtypes
        from pycaw.pycaw import AudioUtilities

        comtypes.CoInitialize()
        speakers = AudioUtilities.GetSpeakers()
        if hasattr(speakers, "EndpointVolume"):
            return speakers.EndpointVolume
        from ctypes import POINTER, cast
        from comtypes import CLSCTX_ALL
        from pycaw.pycaw import IAudioEndpointVolume

        interface = speakers.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        return cast(interface, POINTER(IAudioEndpointVolume))

    def get_audio_state(self) -> dict[str, Any]:
        with self._audio_lock:
            if IS_WINDOWS:
                try:
                    vol_iface = self._get_win_endpoint_volume()
                    level = int(round(float(vol_iface.GetMasterVolumeLevelScalar()) * 100))
                    muted = bool(vol_iface.GetMute())
                    self._cached_volume = max(0, min(100, level))
                    self._cached_muted = muted
                except Exception:
                    pass
            elif IS_MAC:
                try:
                    out = subprocess.check_output(
                        ["osascript", "-e", "get volume settings"], text=True, timeout=1.5
                    )
                    # Example: output volume:50, input volume:50, alert volume:100, output muted:false
                    for item in out.strip().split(","):
                        k, _, v = item.partition(":")
                        if "output volume" in k:
                            self._cached_volume = int(v.strip())
                        elif "output muted" in k:
                            self._cached_muted = v.strip().lower() == "true"
                except Exception:
                    pass
            elif IS_LINUX:
                try:
                    out = subprocess.check_output(
                        ["pactl", "get-sink-volume", "@DEFAULT_SINK@"], text=True, timeout=1.5
                    )
                    for token in out.split():
                        if token.endswith("%"):
                            self._cached_volume = max(0, min(100, int(token[:-1])))
                            break
                    mute_out = subprocess.check_output(
                        ["pactl", "get-sink-mute", "@DEFAULT_SINK@"], text=True, timeout=1.5
                    )
                    self._cached_muted = "yes" in mute_out.lower()
                except Exception:
                    pass
            return {"volume": self._cached_volume, "muted": self._cached_muted}

    def set_volume(self, level: int) -> dict[str, Any]:
        clamped = max(0, min(100, int(level)))
        with self._audio_lock:
            if IS_WINDOWS:
                try:
                    vol_iface = self._get_win_endpoint_volume()
                    vol_iface.SetMasterVolumeLevelScalar(clamped / 100.0, None)
                    if clamped > 0 and bool(vol_iface.GetMute()):
                        vol_iface.SetMute(0, None)
                        self._cached_muted = False
                    self._cached_volume = clamped
                    return {"volume": self._cached_volume, "muted": self._cached_muted}
                except Exception:
                    if clamped > self._cached_volume:
                        self.press_key("vol_up")
                    else:
                        self.press_key("vol_down")
                    self._cached_volume = clamped
            elif IS_MAC:
                try:
                    subprocess.run(
                        ["osascript", "-e", f"set volume output volume {clamped}"],
                        check=False,
                        timeout=1.5,
                    )
                    self._cached_volume = clamped
                except Exception:
                    pass
            elif IS_LINUX:
                try:
                    subprocess.run(
                        ["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{clamped}%"],
                        check=False,
                        timeout=1.5,
                    )
                    self._cached_volume = clamped
                except Exception:
                    pass
            return {"volume": self._cached_volume, "muted": self._cached_muted}

    def toggle_mute(self, mute: bool | None = None) -> dict[str, Any]:
        with self._audio_lock:
            if IS_WINDOWS:
                try:
                    vol_iface = self._get_win_endpoint_volume()
                    current = bool(vol_iface.GetMute())
                    target = (not current) if mute is None else bool(mute)
                    vol_iface.SetMute(1 if target else 0, None)
                    self._cached_muted = target
                    self._cached_volume = int(round(float(vol_iface.GetMasterVolumeLevelScalar()) * 100))
                    return {"volume": self._cached_volume, "muted": self._cached_muted}
                except Exception:
                    self.press_key("vol_mute")
                    self._cached_muted = not self._cached_muted
            elif IS_MAC:
                target = (not self._cached_muted) if mute is None else bool(mute)
                try:
                    subprocess.run(
                        ["osascript", "-e", f"set volume {'with' if target else 'without'} output muted"],
                        check=False,
                        timeout=1.5,
                    )
                    self._cached_muted = target
                except Exception:
                    pass
            elif IS_LINUX:
                arg = "toggle" if mute is None else ("1" if mute else "0")
                try:
                    subprocess.run(
                        ["pactl", "set-sink-mute", "@DEFAULT_SINK@", arg],
                        check=False,
                        timeout=1.5,
                    )
                    self._cached_muted = (not self._cached_muted) if mute is None else bool(mute)
                except Exception:
                    pass
            return {"volume": self._cached_volume, "muted": self._cached_muted}

    # ------------------------------------------------------------------
    # Bidirectional Clipboard
    # ------------------------------------------------------------------
    def get_clipboard(self) -> str:
        if pyperclip is not None:
            try:
                return str(pyperclip.paste() or "")
            except Exception:
                pass
        if IS_WINDOWS:
            try:
                res = subprocess.run(
                    ["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"],
                    capture_output=True,
                    text=True,
                    timeout=2.0,
                )
                return res.stdout.rstrip("\r\n")
            except Exception:
                pass
        return ""

    def set_clipboard(self, text: str, auto_paste: bool = False) -> bool:
        ok = False
        if pyperclip is not None:
            try:
                pyperclip.copy(text)
                ok = True
            except Exception:
                ok = False
        if not ok and IS_WINDOWS:
            try:
                subprocess.run(
                    ["powershell", "-NoProfile", "-Command", "Set-Clipboard -Value $input"],
                    input=text,
                    text=True,
                    timeout=2.0,
                    check=True,
                )
                ok = True
            except Exception:
                ok = False
        if ok and auto_paste:
            time.sleep(0.05)
            self.shortcut_action("paste")
        return ok

    # ------------------------------------------------------------------
    # Browser Launch & Fallback Shortcuts (when Extension is offline)
    # ------------------------------------------------------------------
    @staticmethod
    def resolve_omnibox_input(query: str, engine: str = "google") -> str:
        raw = (query or "").strip()
        if not raw:
            return "https://www.google.com"
        if raw.startswith(("http://", "https://", "chrome://", "file://")):
            return raw
        if " " not in raw and "." in raw and not raw.startswith("."):
            return f"https://{raw}"
        template = SEARCH_ENGINES.get(engine.lower(), SEARCH_ENGINES["google"])
        return template.format(q=urllib.parse.quote_plus(raw))

    def _find_chrome_binary(self) -> str | None:
        if IS_WINDOWS:
            candidates = [
                os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
            ]
            for c in candidates:
                if os.path.isfile(c):
                    return c
        elif IS_MAC:
            mac_chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            if os.path.isfile(mac_chrome):
                return mac_chrome
        else:
            for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
                found = shutil.which(name)
                if found:
                    return found
        return None

    def open_url_in_chrome(self, url: str, incognito: bool = False, new_window: bool = False) -> None:
        chrome_bin = self._find_chrome_binary()
        if chrome_bin:
            args = [chrome_bin]
            if incognito:
                args.append("--incognito")
            if new_window:
                args.append("--new-window")
            if url:
                args.append(url)
            subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            webbrowser.open(url or "https://www.google.com", new=1 if new_window else 2)

    def chrome_fallback(self, action: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Keyboard/OS fallback when the Chrome Extension is not connected."""
        act = action.lower()
        if act in ("navigate", "open_url", "omnibox"):
            url = self.resolve_omnibox_input(
                str(payload.get("url") or payload.get("query") or ""),
                str(payload.get("engine") or "google"),
            )
            self.open_url_in_chrome(
                url,
                incognito=bool(payload.get("incognito", False)),
                new_window=bool(payload.get("newWindow", False)),
            )
            return {"ok": True, "fallback": True, "url": url}
        if act == "tab_new":
            if payload.get("incognito"):
                self.open_url_in_chrome(str(payload.get("url") or ""), incognito=True)
            elif payload.get("newWindow"):
                self.open_url_in_chrome(str(payload.get("url") or ""), new_window=True)
            elif payload.get("url"):
                self.open_url_in_chrome(str(payload["url"]))
            else:
                self.hotkey("mod", "t")
        elif act == "window_new":
            self.open_url_in_chrome(
                str(payload.get("url") or ""),
                incognito=bool(payload.get("incognito", False)),
                new_window=True,
            )
        elif act == "tab_close":
            self.hotkey("mod", "w")
        elif act == "tab_reopen":
            self.hotkey("mod", "shift", "t")
        elif act == "tab_next":
            self.hotkey("ctrl", "tab")
        elif act == "tab_prev":
            self.hotkey("ctrl", "shift", "tab")
        elif act == "nav_back":
            self.hotkey("cmd", "[") if IS_MAC else self.hotkey("alt", "left")
        elif act == "nav_forward":
            self.hotkey("cmd", "]") if IS_MAC else self.hotkey("alt", "right")
        elif act == "nav_reload":
            self.hotkey("mod", "r")
        elif act == "nav_hard_reload":
            self.hotkey("mod", "shift", "r")
        elif act == "nav_stop":
            self.press_key("esc")
        elif act == "nav_home":
            self.hotkey("cmd", "shift", "h") if IS_MAC else self.hotkey("alt", "home")
        elif act == "zoom_in":
            self.hotkey("mod", "+")
        elif act == "zoom_out":
            self.hotkey("mod", "-")
        elif act == "zoom_reset":
            self.hotkey("mod", "0")
        elif act == "fullscreen":
            self.press_key("f11")
        elif act == "open_history":
            self.hotkey("mod", "y") if IS_MAC else self.hotkey("mod", "h")
        elif act == "open_downloads":
            self.hotkey("mod", "shift", "j") if IS_MAC else self.hotkey("mod", "j")
        elif act == "open_bookmarks_manager":
            self.hotkey("mod", "alt", "b") if IS_MAC else self.hotkey("mod", "shift", "o")
        elif act == "find_in_page":
            query = str(payload.get("query") or "")
            self.hotkey("mod", "f")
            if query:
                time.sleep(0.08)
                self.type_text(query)
                time.sleep(0.03)
                self.press_key("enter")
        elif act == "find_next":
            self.press_key("enter")
        return {"ok": True, "fallback": True}

    def media_fallback(self, action: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Keyboard fallback for HTML5/YouTube/Netflix players when extension is offline."""
        act = action.lower()
        if act == "play_pause":
            self.press_key("k")
        elif act == "next":
            self.hotkey("shift", "n")
        elif act == "prev":
            self.hotkey("shift", "p")
        elif act == "seek_relative":
            delta = float(payload.get("delta", 10))
            if abs(delta) >= 10:
                steps = max(1, int(round(abs(delta) / 10)))
                key = "l" if delta > 0 else "j"
            else:
                steps = max(1, int(round(abs(delta) / 5)))
                key = "right" if delta > 0 else "left"
            for _ in range(min(steps, 6)):
                self.press_key(key)
        elif act == "mute":
            self.press_key("m")
        elif act == "fullscreen":
            self.press_key("f")
        elif act == "theater":
            self.press_key("t")
        elif act == "captions":
            self.press_key("c")
        return {"ok": True, "fallback": True}

    # ------------------------------------------------------------------
    # Power Management & Autostart
    # ------------------------------------------------------------------
    def execute_power_action(self, action: str) -> dict[str, Any]:
        act = action.lower()
        if act == "lock":
            if IS_WINDOWS:
                user32.LockWorkStation()
            elif IS_MAC:
                subprocess.Popen(["pmset", "displaysleepnow"])
            elif IS_LINUX:
                subprocess.Popen(["loginctl", "lock-session"])
            return {"ok": True, "action": "lock"}

        if act == "suspend":
            if IS_WINDOWS:
                # SetSuspendState(Hibernate=0, ForceCritical=0, DisableWakeEvent=0)
                subprocess.Popen(
                    ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            elif IS_MAC:
                subprocess.Popen(["pmset", "sleepnow"])
            elif IS_LINUX:
                subprocess.Popen(["systemctl", "suspend"])
            return {"ok": True, "action": "suspend"}

        if act == "restart":
            if IS_WINDOWS:
                subprocess.Popen(["shutdown", "/r", "/t", "5", "/c", "Reinicio solicitado por Chrome Remote Control"])
            elif IS_MAC:
                subprocess.Popen(["osascript", "-e", 'tell app "System Events" to restart'])
            elif IS_LINUX:
                subprocess.Popen(["systemctl", "reboot"])
            return {"ok": True, "action": "restart"}

        if act == "shutdown":
            if IS_WINDOWS:
                subprocess.Popen(["shutdown", "/s", "/t", "5", "/c", "Apagado solicitado por Chrome Remote Control"])
            elif IS_MAC:
                subprocess.Popen(["osascript", "-e", 'tell app "System Events" to shut down'])
            elif IS_LINUX:
                subprocess.Popen(["systemctl", "poweroff"])
            return {"ok": True, "action": "shutdown"}

        if act == "cancel_shutdown":
            if IS_WINDOWS:
                subprocess.Popen(["shutdown", "/a"])
            return {"ok": True, "action": "cancel_shutdown"}

        return {"ok": False, "error": f"Acción de energía desconocida: {action}"}

    @staticmethod
    def set_autostart(enabled: bool, script_path: str) -> bool:
        if not IS_WINDOWS:
            return False
        try:
            import winreg

            key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
            app_name = "ChromeRemoteControlPC"
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as reg_key:
                if enabled:
                    pythonw = Path_pythonw(sys.executable)
                    cmd = f'"{pythonw}" "{script_path}"'
                    winreg.SetValueEx(reg_key, app_name, 0, winreg.REG_SZ, cmd)
                else:
                    try:
                        winreg.DeleteValue(reg_key, app_name)
                    except FileNotFoundError:
                        pass
            return True
        except Exception:
            return False


def Path_pythonw(executable: str) -> str:
    if executable.lower().endswith("python.exe"):
        candidate = executable[:-10] + "pythonw.exe"
        if os.path.isfile(candidate):
            return candidate
    return executable


system_controller = SystemController()
