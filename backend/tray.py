from __future__ import annotations

import os
import threading
import webbrowser
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw

from config import config
from qr_utils import build_pairing_url, generate_qr_pil, get_primary_lan_ip
from system_control import system_controller

try:
    import pystray
except Exception:
    pystray = None  # type: ignore[assignment]


def create_tray_icon_image(paused: bool = False) -> Image.Image:
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    bg = "#475569" if paused else "#0891b2"
    accent = "#f59e0b" if paused else "#22d3ee"
    draw.rounded_rectangle((4, 4, size - 4, size - 4), radius=16, fill="#09090b", outline=accent, width=3)
    draw.ellipse((16, 16, size - 16, size - 16), fill=bg)
    draw.ellipse((26, 26, size - 26, size - 26), fill="#ffffff")
    return img


class SystemTrayApp:
    """Background system tray icon with QR popup window, PIN management, pause, and autostart."""

    def __init__(self, on_exit_callback: Callable[[], None], main_script_path: Path) -> None:
        self._on_exit = on_exit_callback
        self._main_script = str(main_script_path)
        self._icon: object | None = None
        self._tk_lock = threading.Lock()

    def start(self) -> None:
        if pystray is None:
            return
        thread = threading.Thread(target=self._run_tray, daemon=True, name="SystemTrayThread")
        thread.start()

    def stop(self) -> None:
        if self._icon is not None:
            try:
                self._icon.stop()  # type: ignore[attr-defined]
            except Exception:
                pass

    def _refresh_icon(self) -> None:
        if self._icon is not None:
            try:
                paused = bool(config.get("paused", False))
                self._icon.icon = create_tray_icon_image(paused=paused)  # type: ignore[attr-defined]
                self._icon.update_menu()  # type: ignore[attr-defined]
            except Exception:
                pass

    def _show_qr_window_async(self) -> None:
        threading.Thread(target=self._open_qr_tkinter, daemon=True).start()

    def _change_pin_async(self) -> None:
        threading.Thread(target=self._open_pin_dialog_tkinter, daemon=True).start()

    def _open_qr_tkinter(self) -> None:
        if not self._tk_lock.acquire(blocking=False):
            return
        try:
            import tkinter as tk
            from PIL import ImageTk

            ip = get_primary_lan_ip()
            port = int(config.get("port", 8765))
            pin = str(config.get("pin", ""))
            secret = str(config.get("pairing_secret", ""))
            url = build_pairing_url(ip, port, secret)

            root = tk.Tk()
            root.title("Chrome Remote Control — Pair Phone")
            root.configure(bg="#09090b")
            root.resizable(False, False)
            root.attributes("-topmost", True)

            container = tk.Frame(root, bg="#09090b", padx=24, pady=20)
            container.pack(fill="both", expand=True)

            tk.Label(
                container,
                text="Scan to connect your phone",
                fg="#f8fafc",
                bg="#09090b",
                font=("Segoe UI", 13, "bold"),
            ).pack(pady=(0, 4))

            tk.Label(
                container,
                text=f"http://{ip}:{port}",
                fg="#22d3ee",
                bg="#09090b",
                font=("Consolas", 11),
            ).pack(pady=(0, 12))

            qr_pil = generate_qr_pil(url, box_size=7, border=2)
            qr_tk = ImageTk.PhotoImage(qr_pil)
            qr_lbl = tk.Label(container, image=qr_tk, bg="#09090b", bd=0)
            qr_lbl.image = qr_tk  # type: ignore[attr-defined]
            qr_lbl.pack(pady=(0, 14))

            pin_var = tk.StringVar(value=f"Current PIN:  {pin}")
            tk.Label(
                container,
                textvariable=pin_var,
                fg="#e2e8f0",
                bg="#18181b",
                padx=16,
                pady=8,
                font=("Segoe UI", 12, "bold"),
            ).pack(fill="x", pady=(0, 12))

            btn_frame = tk.Frame(container, bg="#09090b")
            btn_frame.pack(fill="x")

            def regenerate() -> None:
                new_pin = config.regenerate_pin()
                pin_var.set(f"Current PIN:  {new_pin}")
                new_url = build_pairing_url(ip, port, str(config.get("pairing_secret", "")))
                new_pil = generate_qr_pil(new_url, box_size=7, border=2)
                new_tk = ImageTk.PhotoImage(new_pil)
                qr_lbl.configure(image=new_tk)
                qr_lbl.image = new_tk  # type: ignore[attr-defined]

            tk.Button(
                btn_frame,
                text="New PIN / QR",
                command=regenerate,
                bg="#27272a",
                fg="#f8fafc",
                activebackground="#3f3f46",
                activeforeground="#ffffff",
                relief="flat",
                padx=12,
                pady=6,
            ).pack(side="left", expand=True, fill="x", padx=(0, 6))

            tk.Button(
                btn_frame,
                text="Close",
                command=root.destroy,
                bg="#0891b2",
                fg="#ffffff",
                activebackground="#06b6d4",
                activeforeground="#ffffff",
                relief="flat",
                padx=12,
                pady=6,
            ).pack(side="right", expand=True, fill="x", padx=(6, 0))

            root.mainloop()
        except Exception:
            pass
        finally:
            self._tk_lock.release()

    def _open_pin_dialog_tkinter(self) -> None:
        if not self._tk_lock.acquire(blocking=False):
            return
        try:
            import tkinter as tk
            from tkinter import messagebox, simpledialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            current_pin = str(config.get("pin", ""))
            new_pin = simpledialog.askstring(
                "Change Access PIN",
                f"Current PIN: {current_pin}\nEnter a new numeric PIN (4 to 6 digits):",
                parent=root,
            )
            if new_pin is not None:
                try:
                    saved = config.set_pin(new_pin, revoke_sessions=True)
                    messagebox.showinfo(
                        "PIN Updated",
                        f"Your new PIN is: {saved}\nPrevious sessions were signed out for security.",
                        parent=root,
                    )
                except ValueError as exc:
                    messagebox.showerror("Invalid PIN", str(exc), parent=root)
            root.destroy()
        except Exception:
            pass
        finally:
            self._tk_lock.release()

    def _toggle_pause(self, icon: object, item: object) -> None:
        current = bool(config.get("paused", False))
        config.set("paused", not current)
        self._refresh_icon()

    def _toggle_autostart(self, icon: object, item: object) -> None:
        current = bool(config.get("start_with_system", False))
        target = not current
        if system_controller.set_autostart(target, self._main_script):
            config.set("start_with_system", target)
        self._refresh_icon()

    def _open_local_ui(self, icon: object, item: object) -> None:
        port = int(config.get("port", 8765))
        webbrowser.open(f"http://127.0.0.1:{port}")

    def _quit_app(self, icon: object, item: object) -> None:
        self.stop()
        self._on_exit()
        os._exit(0)

    def _run_tray(self) -> None:
        if pystray is None:
            return
        menu = pystray.Menu(
            pystray.MenuItem(
                "View QR Code & PIN",
                lambda icon, item: self._show_qr_window_async(),
                default=True,
            ),
            pystray.MenuItem(
                "Change PIN...",
                lambda icon, item: self._change_pin_async(),
            ),
            pystray.MenuItem(
                "Open Panel on PC",
                self._open_local_ui,
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "Pause remote control",
                self._toggle_pause,
                checked=lambda item: bool(config.get("paused", False)),
            ),
            pystray.MenuItem(
                "Launch on startup",
                self._toggle_autostart,
                checked=lambda item: bool(config.get("start_with_system", False)),
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", self._quit_app),
        )
        paused = bool(config.get("paused", False))
        self._icon = pystray.Icon(
            "chrome_remote_control",
            create_tray_icon_image(paused=paused),
            "Chrome Remote Control",
            menu,
        )
        try:
            self._icon.run()  # type: ignore[attr-defined]
        except Exception:
            pass
