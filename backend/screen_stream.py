from __future__ import annotations

import asyncio
import base64
import io
import time
from typing import Any, Awaitable, Callable

import mss
from PIL import Image, ImageDraw

from system_control import system_controller


class ScreenStreamer:
    """Lightweight interactive screen preview streamer (JPEG/WebP over WebSocket)."""

    def __init__(self) -> None:
        self._subscribers: set[str] = set()
        self._task: asyncio.Task[None] | None = None
        self.fps: int = 8
        self.quality: int = 55
        self.scale: float = 0.5
        self.img_format: str = "jpeg"  # 'jpeg' or 'webp'
        self.monitor_index: int = 1
        self._last_monitor_bounds: dict[str, int] = {"left": 0, "top": 0, "width": 1920, "height": 1080}
        self._broadcast_cb: Callable[[dict[str, Any], set[str]], Awaitable[None]] | None = None

    def configure(
        self,
        fps: int | None = None,
        quality: int | None = None,
        scale: float | None = None,
        img_format: str | None = None,
        monitor_index: int | None = None,
    ) -> dict[str, Any]:
        if fps is not None:
            self.fps = max(1, min(15, int(fps)))
        if quality is not None:
            self.quality = max(20, min(85, int(quality)))
        if scale is not None:
            self.scale = max(0.25, min(1.0, float(scale)))
        if img_format is not None and img_format.lower() in ("jpeg", "webp"):
            self.img_format = img_format.lower()
        if monitor_index is not None:
            self.monitor_index = max(1, int(monitor_index))
        return self.get_settings()

    def get_settings(self) -> dict[str, Any]:
        return {
            "fps": self.fps,
            "quality": self.quality,
            "scale": self.scale,
            "format": self.img_format,
            "monitor": self.monitor_index,
            "active": len(self._subscribers) > 0,
        }

    def set_broadcast_callback(self, cb: Callable[[dict[str, Any], set[str]], Awaitable[None]]) -> None:
        self._broadcast_cb = cb

    def subscribe(self, client_id: str) -> None:
        self._subscribers.add(client_id)
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._stream_loop())

    def unsubscribe(self, client_id: str) -> None:
        self._subscribers.discard(client_id)

    def capture_frame_sync(self) -> dict[str, Any]:
        mss_cls = getattr(mss, "MSS", mss.mss)
        monitor_count = 1
        idx = 1
        try:
            with mss_cls() as sct:
                monitors = sct.monitors
                monitor_count = max(1, len(monitors) - 1)
                idx = self.monitor_index if self.monitor_index < len(monitors) else 1
                mon = monitors[idx]
                self._last_monitor_bounds = {
                    "left": int(mon["left"]),
                    "top": int(mon["top"]),
                    "width": int(mon["width"]),
                    "height": int(mon["height"]),
                }
                raw = sct.grab(mon)
                img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
        except Exception:
            b = self._last_monitor_bounds
            mon = b
            try:
                from PIL import ImageGrab

                img = ImageGrab.grab().convert("RGB")
                mon = {"left": 0, "top": 0, "width": img.width, "height": img.height}
                self._last_monitor_bounds = dict(mon)
            except Exception:
                # Fallback when Windows session is locked (Winlogon) or running in a headless session
                img = Image.new("RGB", (b["width"], b["height"]), (9, 9, 11))
                d_fallback = ImageDraw.Draw(img)
                d_fallback.text(
                    (40, b["height"] // 2 - 10),
                    "Screen locked or no active desktop session",
                    fill=(161, 161, 170),
                )

        # Draw high-contrast cursor indicator so mobile user sees where cursor is
        cx, cy = system_controller.get_cursor_position()
        rel_x = cx - mon["left"]
        rel_y = cy - mon["top"]
        if 0 <= rel_x <= mon["width"] and 0 <= rel_y <= mon["height"]:
            draw = ImageDraw.Draw(img)
            r = max(8, int(mon["width"] / 150))
            draw.ellipse((rel_x - r, rel_y - r, rel_x + r, rel_y + r), outline="#00e5ff", width=3)
            draw.ellipse((rel_x - 3, rel_y - 3, rel_x + 3, rel_y + 3), fill="#ef4444")

        if self.scale < 0.99:
            target_w = max(320, int(img.width * self.scale))
            target_h = max(180, int(img.height * self.scale))
            img = img.resize((target_w, target_h), Image.Resampling.BILINEAR)

        buf = io.BytesIO()
        fmt = "WEBP" if self.img_format == "webp" else "JPEG"
        mime = "image/webp" if fmt == "WEBP" else "image/jpeg"
        img.save(buf, format=fmt, quality=self.quality, optimize=False)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        return {
            "dataUrl": f"data:{mime};base64,{b64}",
            "width": mon["width"],
            "height": mon["height"],
            "monitorCount": monitor_count,
            "monitor": idx,
            "ts": int(time.time() * 1000),
        }

    def map_ratio_to_screen(self, x_ratio: float, y_ratio: float) -> tuple[int, int]:
        xr = max(0.0, min(1.0, float(x_ratio)))
        yr = max(0.0, min(1.0, float(y_ratio)))
        b = self._last_monitor_bounds
        x = int(b["left"] + xr * b["width"])
        y = int(b["top"] + yr * b["height"])
        return x, y

    async def _stream_loop(self) -> None:
        while self._subscribers:
            start = time.perf_counter()
            try:
                frame = await asyncio.to_thread(self.capture_frame_sync)
                if self._broadcast_cb and self._subscribers:
                    await self._broadcast_cb(
                        {"target": "client", "action": "screen_frame", "payload": frame},
                        set(self._subscribers),
                    )
            except Exception:
                await asyncio.sleep(0.5)
            elapsed = time.perf_counter() - start
            interval = 1.0 / max(1, self.fps)
            await asyncio.sleep(max(0.02, interval - elapsed))


screen_streamer = ScreenStreamer()
