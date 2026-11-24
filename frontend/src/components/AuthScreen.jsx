import React, { useEffect, useRef, useState } from "react";
import { Lock, Smartphone, Wifi, Puzzle, ArrowRight, Delete } from "lucide-react";

function detectHostedWebMode() {
  const host = window.location.hostname || "";
  if (host.endsWith("github.io") || host.endsWith("netlify.app") || host.endsWith("vercel.app")) {
    return true;
  }
  return false;
}

export default function AuthScreen({ onAuthenticated, initialError = "", vibrate }) {
  const [connectTab, setConnectTab] = useState(() => (detectHostedWebMode() ? "webrtc" : "ws"));
  const [roomCode, setRoomCode] = useState("");
  const [pin, setPin] = useState("");
  const [deviceName, setDeviceName] = useState(() => {
    const ua = navigator.userAgent || "";
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Android";
    return "Phone";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  const roomInputRef = useRef(null);
  const pinInputRef = useRef(null);

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  // Probe /api/status once on non-GitHub hosts: if no local Python server responds, default to Extension WebRTC tab
  useEffect(() => {
    if (detectHostedWebMode()) return;
    let cancelled = false;
    fetch("./api/status")
      .then((res) => {
        if (!cancelled && !res.ok) setConnectTab("webrtc");
      })
      .catch(() => {
        if (!cancelled) setConnectTab("webrtc");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const formatRoomDisplay = (val) => {
    const digits = val.replace(/\D/g, "").slice(0, 8);
    if (digits.length > 4) {
      return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    }
    return digits;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const cleanPin = pin.replace(/\D/g, "").slice(0, 6);

    if (connectTab === "webrtc") {
      const cleanRoom = roomCode.replace(/\D/g, "").slice(0, 8);
      if (cleanRoom.length !== 8) {
        setError("Enter the 8-digit Room ID shown in your Chrome Extension popup (or scan its QR code).");
        roomInputRef.current?.focus();
        return;
      }
      if (cleanPin.length < 4) {
        setError("Enter the 4-digit PIN displayed in your Chrome Extension popup.");
        pinInputRef.current?.focus();
        return;
      }
      vibrate?.([15, 40, 20]);
      onAuthenticated({
        mode: "webrtc",
        roomCode: cleanRoom,
        pin: cleanPin,
        key: "",
        deviceName: deviceName.trim() || "Phone"
      });
      return;
    }

    // Local Wi-Fi FastAPI Server Login
    if (cleanPin.length < 4) {
      setError("Enter the 4 to 6 digit numeric PIN shown on your PC.");
      pinInputRef.current?.focus();
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("./api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: cleanPin, deviceName: deviceName.trim() || "Phone" })
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        throw new Error(data.detail || "Incorrect PIN");
      }
      vibrate?.([15, 40, 20]);
      onAuthenticated({ mode: "ws", token: data.token });
    } catch (err) {
      vibrate?.([40, 50, 40]);
      setError(err.message || "Could not reach local PC server. Switch to 'Chrome Extension' tab for serverless pairing.");
      pinInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleDigit = (digit) => {
    vibrate?.(10);
    setError("");
    if (connectTab === "webrtc" && roomCode.replace(/\D/g, "").length < 8) {
      setRoomCode((prev) => {
        const nextDigits = (prev.replace(/\D/g, "") + digit).slice(0, 8);
        return formatRoomDisplay(nextDigits);
      });
      return;
    }
    setPin((prev) => (prev.length < 6 ? prev + digit : prev));
  };

  const handleBackspace = () => {
    vibrate?.(10);
    setError("");
    if (pin.length > 0) {
      setPin((prev) => prev.slice(0, -1));
    } else if (connectTab === "webrtc") {
      setRoomCode((prev) => formatRoomDisplay(prev.replace(/\D/g, "").slice(0, -1)));
    }
  };

  return (
    <main className="min-h-dvh bg-black text-zinc-100 flex flex-col items-center justify-center px-5 py-7">
      <form
        method="post"
        action="./api/auth/login"
        onSubmit={handleSubmit}
        noValidate
        className="squircle-card w-full max-w-sm bg-[#121212] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/15 text-cyan-400 mx-auto mb-3 border border-cyan-500/30">
          <Lock className="w-6 h-6" aria-hidden="true" />
        </div>

        <h1 className="text-lg font-bold text-center tracking-tight mb-1">
          Chrome Remote Control
        </h1>
        <p className="text-xs text-zinc-400 text-center mb-4">
          Tip: Scan the QR code inside the Chrome Extension icon for instant 1-tap pairing
        </p>

        {/* Connection Mode Selector */}
        <div
          role="group"
          aria-label="Connection method"
          className="grid grid-cols-2 gap-1.5 bg-black p-1 rounded-2xl border border-zinc-800 mb-4"
        >
          <button
            type="button"
            aria-pressed={connectTab === "webrtc"}
            onClick={() => {
              vibrate?.(8);
              setError("");
              setConnectTab("webrtc");
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              connectTab === "webrtc" ? "bg-cyan-500 text-black" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Puzzle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Chrome Extension</span>
          </button>
          <button
            type="button"
            aria-pressed={connectTab === "ws"}
            onClick={() => {
              vibrate?.(8);
              setError("");
              setConnectTab("ws");
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              connectTab === "ws" ? "bg-cyan-500 text-black" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Local PC Server</span>
          </button>
        </div>

        <div className="mb-3">
          <label htmlFor="device-name" className="block text-xs text-zinc-300 font-medium mb-1">
            Phone name
          </label>
          <div className="relative flex items-center">
            <Smartphone className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" aria-hidden="true" />
            <input
              id="device-name"
              name="deviceName"
              type="text"
              maxLength={32}
              autoComplete="nickname"
              enterKeyHint="next"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100"
            />
          </div>
        </div>

        {connectTab === "webrtc" && (
          <div className="mb-3">
            <label htmlFor="room-code" className="block text-xs text-zinc-300 font-medium mb-1">
              Extension Room ID (8 digits) <span aria-hidden="true">*</span>
            </label>
            <input
              ref={roomInputRef}
              id="room-code"
              name="roomCode"
              type="text"
              inputMode="numeric"
              maxLength={9}
              required
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="e.g. 4829-7310"
              value={roomCode}
              onChange={(e) => {
                setError("");
                setRoomCode(formatRoomDisplay(e.target.value));
              }}
              className="w-full bg-black border border-zinc-800 rounded-2xl py-2.5 px-4 text-center text-lg font-mono font-bold tracking-[0.2em] text-cyan-300 placeholder:text-zinc-600 placeholder:tracking-normal placeholder:text-xs"
            />
          </div>
        )}

        <div className="mb-3.5">
          <label htmlFor="pin-code" className="block text-xs text-zinc-300 font-medium mb-1">
            {connectTab === "webrtc" ? "Extension PIN (4 digits)" : "PC Server PIN (4–6 digits)"}{" "}
            <span aria-hidden="true">*</span>
          </label>
          <input
            ref={pinInputRef}
            id="pin-code"
            name="pin"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            maxLength={6}
            required
            autoComplete="one-time-code"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="e.g. 4826"
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "pin-error" : undefined}
            value={pin}
            onChange={(e) => {
              setError("");
              setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
            }}
            className="w-full bg-black border border-zinc-800 rounded-2xl py-2.5 px-4 text-center text-lg font-mono font-bold tracking-[0.3em] text-cyan-300 placeholder:text-zinc-600 placeholder:tracking-normal placeholder:text-xs"
          />
        </div>

        {error && (
          <p
            id="pin-error"
            role="alert"
            className="text-xs text-red-300 bg-red-950/50 border border-red-800/60 rounded-xl px-3 py-2 mb-3.5 text-center"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-1.5 mb-3.5" role="group" aria-label="Numeric keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="bg-zinc-900 hover:bg-zinc-800 active:bg-cyan-500/20 border border-zinc-800/90 rounded-2xl py-2 text-base font-semibold"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              vibrate?.(10);
              setError("");
              setPin("");
              if (connectTab === "webrtc") setRoomCode("");
            }}
            className="bg-zinc-900/60 active:bg-zinc-800 border border-zinc-800/70 rounded-2xl py-2 text-xs font-medium text-zinc-400"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="bg-zinc-900 hover:bg-zinc-800 active:bg-cyan-500/20 border border-zinc-800/90 rounded-2xl py-2 text-base font-semibold"
          >
            0
          </button>
          <button
            type="button"
            aria-label="Delete last digit"
            onClick={handleBackspace}
            className="bg-zinc-900/60 active:bg-zinc-800 border border-zinc-800/70 rounded-2xl py-2 flex items-center justify-center text-zinc-300"
          >
            <Delete className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold rounded-2xl py-3 flex items-center justify-center gap-2"
        >
          <span>
            {loading
              ? "Verifying..."
              : connectTab === "webrtc"
                ? "Connect to Chrome"
                : "Connect to PC Server"}
          </span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>

        {detectHostedWebMode() && (
          <p className="text-center mt-3.5">
            <a href="../" className="text-xs text-zinc-400 hover:text-cyan-300 underline underline-offset-4">
              ← On a PC? Go to the Desktop Download Page
            </a>
          </p>
        )}
      </form>
    </main>
  );
}
