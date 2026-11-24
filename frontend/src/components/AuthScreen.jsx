import React, { useRef, useState } from "react";
import { Lock, Smartphone, Wifi, ArrowRight, Delete } from "lucide-react";

export default function AuthScreen({ onAuthenticated, vibrate }) {
  const [pin, setPin] = useState("");
  const [deviceName, setDeviceName] = useState(() => {
    const ua = navigator.userAgent || "";
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Android";
    return "Phone";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pinInputRef = useRef(null);

  const submitPin = async (e, explicitPin) => {
    e?.preventDefault();
    const clean = (explicitPin ?? pin).replace(/\D/g, "").slice(0, 6);
    if (clean.length < 4) {
      setError("Enter the 4 to 6 digit numeric PIN shown on your PC.");
      pinInputRef.current?.focus();
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: clean, deviceName })
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        throw new Error(data.detail || "Incorrect PIN");
      }
      vibrate?.([15, 40, 20]);
      onAuthenticated(data.token);
    } catch (err) {
      vibrate?.([40, 50, 40]);
      setError(err.message || "Could not connect to the PC server.");
      pinInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleDigit = (digit) => {
    vibrate?.(10);
    setError("");
    setPin((prev) => (prev.length < 6 ? prev + digit : prev));
  };

  const handleBackspace = () => {
    vibrate?.(10);
    setError("");
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <main className="min-h-dvh bg-black text-zinc-100 flex flex-col items-center justify-center px-5 py-8">
      <form
        method="post"
        action="/api/auth/login"
        onSubmit={(e) => submitPin(e, pin)}
        noValidate
        className="squircle-card w-full max-w-sm bg-[#121212] border border-zinc-800/80 rounded-3xl p-6 shadow-2xl"
      >
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/15 text-cyan-400 mx-auto mb-4 border border-cyan-500/30">
          <Lock className="w-7 h-7" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-bold text-center tracking-tight mb-1">
          Chrome Remote Control
        </h1>
        <p id="pin-hint" className="text-xs text-zinc-400 text-center mb-5 flex items-center justify-center gap-1.5">
          <Wifi className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
          <span>Enter the 4–6 digit PIN displayed on your PC</span>
        </p>

        <div className="mb-3.5">
          <label htmlFor="device-name" className="block text-xs text-zinc-300 font-medium mb-1">
            Device name
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
              className="w-full bg-black border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-100"
            />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="pin-code" className="block text-xs text-zinc-300 font-medium mb-1">
            Authorization PIN <span aria-hidden="true">*</span>
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
            aria-describedby={error ? "pin-error" : "pin-hint"}
            value={pin}
            onChange={(e) => {
              setError("");
              setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
            }}
            className="w-full bg-black border border-zinc-800 rounded-2xl py-3 px-4 text-center text-xl font-mono font-bold tracking-[0.35em] text-cyan-300 placeholder:text-zinc-600 placeholder:tracking-normal placeholder:text-sm"
          />
        </div>

        {error && (
          <p
            id="pin-error"
            role="alert"
            className="text-xs text-red-300 bg-red-950/50 border border-red-800/60 rounded-xl px-3 py-2 mb-4 text-center"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 mb-4" role="group" aria-label="Numeric keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="bg-zinc-900 hover:bg-zinc-800 active:bg-cyan-500/20 border border-zinc-800/90 rounded-2xl py-2.5 text-lg font-semibold"
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
            }}
            className="bg-zinc-900/60 active:bg-zinc-800 border border-zinc-800/70 rounded-2xl py-2.5 text-xs font-medium text-zinc-400"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="bg-zinc-900 hover:bg-zinc-800 active:bg-cyan-500/20 border border-zinc-800/90 rounded-2xl py-2.5 text-lg font-semibold"
          >
            0
          </button>
          <button
            type="button"
            aria-label="Delete last digit"
            onClick={handleBackspace}
            className="bg-zinc-900/60 active:bg-zinc-800 border border-zinc-800/70 rounded-2xl py-2.5 flex items-center justify-center text-zinc-300"
          >
            <Delete className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold rounded-2xl py-3.5 flex items-center justify-center gap-2"
        >
          <span>{loading ? "Verifying..." : "Connect to PC"}</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </form>
    </main>
  );
}
