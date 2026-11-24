from __future__ import annotations

import hmac
import secrets
import time
from typing import Any

from config import config


class AuthManager:
    """Handles PIN verification, QR pairing tokens, and persistent device sessions."""

    def __init__(self) -> None:
        self._failed_attempts: dict[str, list[float]] = {}
        self._max_attempts = 8
        self._window_seconds = 60.0

    def _is_rate_limited(self, client_ip: str) -> bool:
        now = time.time()
        attempts = [t for t in self._failed_attempts.get(client_ip, []) if now - t < self._window_seconds]
        self._failed_attempts[client_ip] = attempts
        return len(attempts) >= self._max_attempts

    def _record_failure(self, client_ip: str) -> None:
        now = time.time()
        attempts = [t for t in self._failed_attempts.get(client_ip, []) if now - t < self._window_seconds]
        attempts.append(now)
        self._failed_attempts[client_ip] = attempts

    def clear_failures(self, client_ip: str) -> None:
        self._failed_attempts.pop(client_ip, None)

    def verify_pin(self, pin: str, client_ip: str = "unknown", device_name: str = "Móvil") -> str | None:
        if self._is_rate_limited(client_ip):
            raise PermissionError("Demasiados intentos fallidos. Espera un minuto e inténtalo de nuevo.")

        expected_pin = str(config.get("pin", ""))
        provided_pin = str(pin or "").strip()
        if not expected_pin or not hmac.compare_digest(provided_pin, expected_pin):
            self._record_failure(client_ip)
            return None

        self.clear_failures(client_ip)
        return self.issue_token(device_name=device_name, client_ip=client_ip)

    def verify_pairing_secret(self, secret: str, client_ip: str = "unknown", device_name: str = "Móvil (QR)") -> str | None:
        expected = str(config.get("pairing_secret", ""))
        provided = str(secret or "").strip()
        if not expected or not provided or not hmac.compare_digest(provided, expected):
            return None
        return self.issue_token(device_name=device_name, client_ip=client_ip)

    def issue_token(self, device_name: str = "Móvil", client_ip: str = "unknown") -> str:
        token = secrets.token_urlsafe(32)
        tokens: dict[str, Any] = dict(config.get("authorized_tokens", {}))
        # Cap stored tokens to 25 recent devices
        if len(tokens) >= 25:
            oldest_key = sorted(tokens.keys(), key=lambda k: tokens[k].get("created_at", 0))[0]
            tokens.pop(oldest_key, None)
        tokens[token] = {
            "device_name": device_name[:64],
            "ip": client_ip,
            "created_at": int(time.time()),
        }
        config.set("authorized_tokens", tokens)
        return token

    def validate_token(self, token: str | None) -> bool:
        if not token:
            return False
        tokens: dict[str, Any] = config.get("authorized_tokens", {})
        return token in tokens

    def revoke_token(self, token: str) -> None:
        tokens: dict[str, Any] = dict(config.get("authorized_tokens", {}))
        if token in tokens:
            tokens.pop(token, None)
            config.set("authorized_tokens", tokens)

    def revoke_all_tokens(self) -> None:
        config.set("authorized_tokens", {})

    @staticmethod
    def is_loopback(host: str | None) -> bool:
        if not host:
            return False
        return (
            host in ("127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1", "testclient")
            or host.startswith("127.")
            or host.startswith("::ffff:127.")
        )


auth_manager = AuthManager()
