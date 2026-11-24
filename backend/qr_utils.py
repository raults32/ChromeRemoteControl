from __future__ import annotations

import io
import socket
import urllib.parse

import qrcode
from PIL import Image


def get_primary_lan_ip() -> str:
    """Detect primary outbound LAN IPv4 address without sending network traffic."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
    except Exception:
        pass

    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            candidate = str(info[4][0])
            if not candidate.startswith(("127.", "169.254.")):
                return candidate
    except Exception:
        pass
    return "127.0.0.1"


def get_all_lan_ips() -> list[str]:
    ips: list[str] = []
    primary = get_primary_lan_ip()
    if primary:
        ips.append(primary)
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = str(info[4][0])
            if ip not in ips and not ip.startswith(("127.", "169.254.")):
                ips.append(ip)
    except Exception:
        pass
    return ips or ["127.0.0.1"]


def build_pairing_url(ip: str, port: int, pairing_secret: str | None = None) -> str:
    base = f"http://{ip}:{port}"
    if pairing_secret:
        return f"{base}/?pair={urllib.parse.quote(pairing_secret)}"
    return base


def generate_qr_pil(data: str, box_size: int = 8, border: int = 2) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#00e5ff", back_color="#0a0a0f")
    return img.convert("RGB")


def generate_qr_png_bytes(data: str) -> bytes:
    img = generate_qr_pil(data, box_size=9, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def render_ascii_qr(data: str) -> str:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=1,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    lines: list[str] = []
    rows = len(matrix)
    for y in range(0, rows, 2):
        top_row = matrix[y]
        bot_row = matrix[y + 1] if y + 1 < rows else [False] * len(top_row)
        chars: list[str] = []
        for top, bot in zip(top_row, bot_row):
            if top and bot:
                chars.append("█")
            elif top and not bot:
                chars.append("▀")
            elif not top and bot:
                chars.append("▄")
            else:
                chars.append(" ")
        lines.append("  " + "".join(chars))
    return "\n".join(lines)


def print_startup_banner(ip: str, port: int, pin: str, pairing_url: str, all_ips: list[str]) -> None:
    sep = "=" * 66
    print(f"\n{sep}")
    print("  CHROME REMOTE CONTROL - SERVIDOR LOCAL ACTIVO")
    print(sep)
    print(f"  URL Móvil (Wi-Fi):   http://{ip}:{port}")
    if len(all_ips) > 1:
        others = ", ".join(f"http://{x}:{port}" for x in all_ips if x != ip)
        print(f"  Otras IPs locales:   {others}")
    print(f"  PIN de Acceso:       {pin}")
    print("  Extensión Chrome:    ws://127.0.0.1:{}/ws/extension".format(port))
    print("-" * 66)
    print("  Escanea este código QR con la cámara de tu celular:")
    try:
        print(render_ascii_qr(pairing_url))
    except Exception:
        print(f"  Enlace directo QR: {pairing_url}")
    print(sep + "\n")
