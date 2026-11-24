import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Compass, PlayCircle, Touchpad, Layers, SlidersHorizontal, Puzzle, X } from "lucide-react";

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
  { id: "chrome", label: "Chrome", title: "Navegación y Omnibox", icon: Compass },
  { id: "media", label: "Media", title: "Control Multimedia", icon: PlayCircle },
  { id: "touchpad", label: "Touchpad", title: "Touchpad y Teclado", icon: Touchpad },
  { id: "tabs", label: "Pestañas", title: "Pestañas y Marcadores", icon: Layers },
  { id: "system", label: "Sistema", title: "Audio, Macros y Energía", icon: SlidersHorizontal }
];

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || "");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [activeNav, setActiveNav] = useState("chrome");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const viewHeadingRef = useRef(null);
  const toastPopoverRef = useRef(null);
  const toastFocusInsideRef = useRef(false);
  const toastTimerRef = useRef(null);
  const lastFocusBeforeToastRef = useRef(null);

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
    (async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairingSecret: pairSecret, deviceName: "Celular (QR)" })
        });
        const data = await res.json();
        if (data?.token) {
          handleAuthenticated(data.token);
          window.history.replaceState({}, "", "/");
        }
      } catch (_err) {
        // Fallback to manual PIN screen
      } finally {
        setPairingBusy(false);
      }
    })();
  }, [handleAuthenticated]);

  const { connectionState, latencyMs, serverState, toast, showToast, clearToast, send } =
    useRemoteSocket(token, handleLogout);

  // Dynamic SPA document.title updates (per accessibility §4)
  useEffect(() => {
    const currentItem = NAV_ITEMS.find((i) => i.id === activeNav) || NAV_ITEMS[0];
    const tabSuffix = activeNav === "tabs" ? ` (${serverState.tabs.length})` : "";
    document.title = `${currentItem.label}${tabSuffix} | Chrome Remote Control`;
  }, [activeNav, serverState.tabs.length]);

  // Top-Layer Popover Toast lifecycle (per persistent-toast-notifications guide)
  const dismissToast = useCallback(
    (restoreFocus = false) => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      const pop = toastPopoverRef.current;
      if (pop && typeof pop.hidePopover === "function") {
        try {
          pop.hidePopover();
        } catch (_e) {
          // Ignore if already closed
        }
      }
      clearToast();
      if (restoreFocus && lastFocusBeforeToastRef.current?.focus) {
        lastFocusBeforeToastRef.current.focus();
      }
    },
    [clearToast]
  );

  useEffect(() => {
    if (!toast) return undefined;

    // Suppress background toasts while a modal <dialog> is open
    if (document.querySelector("dialog:modal")) {
      return undefined;
    }

    lastFocusBeforeToastRef.current = document.activeElement;
    const pop = toastPopoverRef.current;
    if (pop && typeof pop.showPopover === "function") {
      try {
        pop.showPopover();
      } catch (_e) {
        // Ignore if already open
      }
    }

    // Announce via ariaNotify() when available, else centralized polite live region
    if (typeof document.ariaNotify === "function") {
      document.ariaNotify(toast.message);
    } else {
      setLiveAnnouncement((prev) => (prev === toast.message ? `${toast.message}\u00A0` : toast.message));
    }

    const scheduleAutoDismiss = () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        if (!toastFocusInsideRef.current) {
          dismissToast(false);
        }
      }, 3000);
    };

    scheduleAutoDismiss();
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [toast, dismissToast]);

  // View Transition + Accessibility Focus Routing on primary view switch
  const switchView = (nextId, viaKeyboard = false) => {
    if (nextId === activeNav) return;
    vibrate(10);

    const allowMotion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    const routeFocusIfNeeded = () => {
      if (viaKeyboard) {
        viewHeadingRef.current?.focus();
      }
    };

    if (!allowMotion || typeof document.startViewTransition !== "function") {
      setActiveNav(nextId);
      requestAnimationFrame(routeFocusIfNeeded);
      return;
    }

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setActiveNav(nextId);
      });
    });
    transition.finished.finally(routeFocusIfNeeded);
  };

  if (pairingBusy) {
    return (
      <main className="min-h-dvh bg-black text-zinc-200 grid place-content-center px-4">
        <progress aria-label="Emparejando dispositivo por código QR" className="w-48 mb-2 mx-auto" />
        <p className="text-sm text-center">Emparejando dispositivo por código QR...</p>
      </main>
    );
  }

  if (!token) {
    return <AuthScreen onAuthenticated={handleAuthenticated} vibrate={vibrate} />;
  }

  const currentViewMeta = NAV_ITEMS.find((i) => i.id === activeNav) || NAV_ITEMS[0];

  return (
    <div className="min-h-dvh bg-black text-zinc-100 flex flex-col">
      {/* Centralized screen-reader live region fallback when ariaNotify() is unavailable */}
      <p className="visually-hidden">Avisos del control remoto</p>
      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {liveAnnouncement}
      </div>

      {/* Persistent Top-Layer Toast Region (popover="manual") */}
      <div role="region" aria-label="Notificaciones">
        <div
          id="remote-toast"
          ref={toastPopoverRef}
          popover="manual"
          className="toast-popover"
          onFocus={() => {
            toastFocusInsideRef.current = true;
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              toastFocusInsideRef.current = false;
              toastTimerRef.current = setTimeout(() => dismissToast(false), 1800);
            }
          }}
        >
          <span className="text-xs font-medium text-zinc-100 flex-1">
            {toast?.message || ""}
          </span>
          <button
            type="button"
            popovertarget="remote-toast"
            popovertargetaction="hide"
            aria-label="Cerrar notificación"
            onClick={() => dismissToast(true)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Top Status & Telemetry Header */}
      <header className="safe-top-bar sticky top-0 z-30 bg-black/90 backdrop-blur-md border-b border-zinc-900 pb-2.5">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
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

      {/* Main Content Landmark with Single Page <h1> Focus Anchor */}
      <main className="flex-1 w-full max-w-lg mx-auto px-3.5 pt-3 pb-24">
        <h1
          id="view-heading"
          ref={viewHeadingRef}
          tabIndex={-1}
          className="visually-hidden"
        >
          {currentViewMeta.title}
        </h1>

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

      {/* Ergonomic 5-Item Bottom Navigation Landmark */}
      <nav aria-label="Principal" className="safe-bottom-bar bg-[#09090b]/95 backdrop-blur-md border-t border-zinc-900">
        <div className="max-w-lg mx-auto grid grid-cols-5 gap-1 pt-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={(e) => switchView(item.id, e.detail === 0)}
                className={`nav-tab-btn flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-colors ${
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
