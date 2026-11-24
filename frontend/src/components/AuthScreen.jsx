import React, { useState } from "react";
import { Lock, Smartphone, Wifi, ArrowRight, Delete } from "lucide-react";

export default function AuthScreen({ onAuthenticated, vibrate }) {
  const [pin, setPin] = useState("");
  const [deviceName, setDeviceName] = useState(() => {
    const ua = navigator.userAgent || "";
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Android";
    return "Celular";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submitPin = async (pinToVerify) => {
    const clean = (pinToVerify ?? pin).trim();
    if (clean.length < 4) {
      setError("Ingresa el PIN de 4 a 6 dígitos que aparece en la PC.");
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
        throw new Error(data.detail || "PIN incorrecto");
      }
      vibrate?.([15, 40, 20]);
      onAuthenticated(data.token);
    } catch (err) {
      vibrate?.([40, 50, 40]);
      setError(err.message || "No se pudo conectar con el servidor en la PC.");
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
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <main className="min-h-dvh bg-black text-zinc-100 flex flex-col items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm bg-[#121212] border border-zinc-800/80 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/15 text-cyan-400 mx-auto mb-4 border border-cyan-500/30">
          <Lock className="w-7 h-7" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-bold text-center tracking-tight mb-1">
          Chrome Remote Control
        </h1>
        <p className="text-xs text-zinc-400 text-center mb-5 flex items-center justify-center gap-1.5">
          <Wifi className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
          Ingresa el PIN mostrado en la consola o bandeja de tu PC
        </p>

        <div className="mb-4">
          <label htmlFor="device-name" className="block text-xs text-zinc-400 mb-1.5">
            Nombre de este dispositivo
          </label>
          <div className="relative flex items-center">
            <Smartphone className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" aria-hidden="true" />
            <input
              id="device-name"
              type="text"
              maxLength={32}
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* PIN Display */}
        <div
          aria-live="polite"
          className="bg-black border border-zinc-800 rounded-2xl py-3.5 px-4 mb-4 flex items-center justify-center gap-2.5 min-h-14"
        >
          {pin.length === 0 ? (
            <span className="text-zinc-600 text-sm tracking-widest">• • • •</span>
          ) : (
            pin.split("").map((ch, idx) => (
              <span
                key={idx}
                className="w-8 h-9 rounded-lg bg-zinc-900 border border-cyan-500/40 flex items-center justify-center text-lg font-mono font-bold text-cyan-300"
              >
                {ch}
              </span>
            ))
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-xl px-3 py-2 mb-4 text-center">
            {error}
          </p>
        )}

        {/* Tactile Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="bg-zinc-900 hover:bg-zinc-800 active:bg-cyan-500/20 border border-zinc-800/90 rounded-2xl py-3 text-lg font-semibold transition-colors"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              vibrate?.(10);
              setPin("");
            }}
            className="bg-zinc-900/60 active:bg-zinc-800 border border-zinc-800/70 rounded-2xl py-3 text-xs font-medium text-zinc-400"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="bg-zinc-900 hover:bg-zinc-800 active:bg-cyan-500/20 border border-zinc-800/90 rounded-2xl py-3 text-lg font-semibold transition-colors"
          >
            0
          </button>
          <button
            type="button"
            aria-label="Borrar último dígito"
            onClick={handleBackspace}
            className="bg-zinc-900/60 active:bg-zinc-800 border border-zinc-800/70 rounded-2xl py-3 flex items-center justify-center text-zinc-300"
          >
            <Delete className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          disabled={loading || pin.length < 4}
          onClick={() => submitPin(pin)}
          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold rounded-2xl py-3.5 flex items-center justify-center gap-2 transition-colors"
        >
          <span>{loading ? "Verificando..." : "Conectar al PC"}</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </main>
  );
}
