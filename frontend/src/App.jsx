import React, { useCallback, useEffect, useState } from "react";
import { Compass, PlayCircle, Touchpad, Layers, SlidersHorizontal, Puzzle } from "lucide-react";

import AuthScreen from "./components/AuthScreen.jsx";
import ChromePanel from "./components/ChromePanel.jsx";
import MediaPanel from "./components/MediaPanel.jsx";
import TouchpadPanel from "./components/TouchpadPanel.jsx";
import TabsPanel from "./components/TabsPanel.jsx";
import SystemPanel from "./components/SystemPanel.jsx";

import { useHaptics } from "./hooks/useHaptics.js";
import { useWakeLock } from "./hooks/useWakeLock.js";
import { useRemoteSocket } from "./hooks/useWebSocket.js";

const TOKEN_STORAGE_KEY = "crc_session_token";

const NAV_ITEMS = [
  { id: "chrome", label: "Chrome", icon: Compass },
  { id: "media", label: "Media", icon: PlayCircle },
  { id: "touchpad", label: "Touchpad", icon: Touchpad },
  { id: "tabs", label: "Pestañas", icon: Layers },
  { id: "system", label: "Sistema", icon: SlidersHorizontal }
];

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || "");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [activeNav, setActiveNav] = useState("chrome");

  const { hapticsEnabled, toggleHaptics, vibrate } = useHaptics();
  const { wakeLockSupported, wakeLockEnabled, toggleWakeLock } = useWakeLock();

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken("");
  }, []);

  const handleAuthenticated = useCallback((newToken) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
  }, []);

  // Automatic QR Pairing via /?pair=<secret> URL parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pairSecret = params.get("pair");
    if (!pairSecret) return;

    setPairingBusy(true);
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingSecret: pairSecret, deviceName: "Celular (QR)" })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.token) {
          handleAuthenticated(data.token);
          window.history.replaceState({}, "", "/");
        }
      })
      .catch(() => {
        // Fallback to manual PIN screen
      })
      .finally(() => {
        setPairingBusy(false);
      });
  }, [handleAuthenticated]);

  const { connectionState, latencyMs, serverState, toast, showToast, clearToast, send } =
    useRemoteSocket(token, handleLogout);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(clearToast, 2800);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (pairingBusy) {
    return (
      <div className="min-h-dvh bg-black text-zinc-200 flex items-center justify-center text-sm">
        Emparejando dispositivo por código QR...
      </div>
    );
  }

  if (!token) {
    return <AuthScreen onAuthenticated={handleAuthenticated} vibrate={vibrate} />;
  }

  return (
    <div className="min-h-dvh bg-black text-zinc-100 flex flex-col">
      {/* Top Status & Telemetry Header */}
      <header className="safe-top-bar sticky top-0 z-30 bg-black/90 backdrop-blur-md border-b border-zinc-900 pb-2.5">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                connectionState === "connected"
                  ? "bg-emerald-400 shadow-sm shadow-emerald-400"
                  : "bg-amber-400 animate-pulse"
              }`}
            />
            <span className="text-xs font-bold tracking-tight truncate">
              {connectionState === "connected"
                ? serverState.paused
                  ? "Pausado en PC"
                  : "Conectado"
                : "Reconectando..."}
            </span>
            {connectionState === "connected" && latencyMs !== null && (
              <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-full">
                {latencyMs} ms
              </span>
            )}
          </div>

          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              serverState.extensionConnected
                ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                : "bg-zinc-900 border-zinc-800 text-zinc-400"
            }`}
          >
            <Puzzle className="w-3 h-3" aria-hidden="true" />
            <span>{serverState.extensionConnected ? "Extensión Activa" : "Modo Atajos"}</span>
          </div>
        </div>
      </header>

      {/* Non-intrusive Toast Banner */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 max-w-xs w-[90%] bg-zinc-900/95 border border-cyan-500/40 text-zinc-100 text-xs font-medium px-4 py-2.5 rounded-2xl shadow-xl text-center"
        >
          {toast.message}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-lg mx-auto px-3.5 pt-3.5 pb-24">
        {activeNav === "chrome" && <ChromePanel serverState={serverState} send={send} vibrate={vibrate} />}
        {activeNav === "media" && <MediaPanel serverState={serverState} send={send} vibrate={vibrate} />}
        {activeNav === "touchpad" && (
          <TouchpadPanel serverState={serverState} send={send} vibrate={vibrate} showToast={showToast} />
        )}
        {activeNav === "tabs" && <TabsPanel serverState={serverState} send={send} vibrate={vibrate} />}
        {activeNav === "system" && (
          <SystemPanel
            serverState={serverState}
            send={send}
            vibrate={vibrate}
            showToast={showToast}
            wakeLockSupported={wakeLockSupported}
            wakeLockEnabled={wakeLockEnabled}
            toggleWakeLock={toggleWakeLock}
            hapticsEnabled={hapticsEnabled}
            toggleHaptics={toggleHaptics}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Ergonomic 5-Tab Bottom Navigation Bar */}
      <nav aria-label="Navegación principal" className="safe-bottom-bar bg-[#09090b]/95 backdrop-blur-md border-t border-zinc-900">
        <div className="max-w-lg mx-auto grid grid-cols-5 gap-1 pt-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  vibrate(10);
                  setActiveNav(item.id);
                }}
                className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-colors ${
                  active ? "text-cyan-400 bg-cyan-500/10" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[10px] font-semibold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
