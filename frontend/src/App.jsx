import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Compass, PlayCircle, Touchpad, Layers, SlidersHorizontal, Puzzle, MonitorCheck, X } from "lucide-react";

import AuthScreen from "./components/AuthScreen.jsx";
import ChromePanel from "./components/ChromePanel.jsx";
import MediaPanel from "./components/MediaPanel.jsx";
import TouchpadPanel from "./components/TouchpadPanel.jsx";
import TabsPanel from "./components/TabsPanel.jsx";
import SystemPanel from "./components/SystemPanel.jsx";

import { useHaptics } from "./hooks/useHaptics.js";
import { useWakeLock } from "./hooks/useWakeLock.js";
import { useRemoteSocket } from "./hooks/useWebSocket.js";

const SESSION_STORAGE_KEY = "crc_session_v2";
const LEGACY_TOKEN_KEY = "crc_session_token";

function loadInitialSession() {
  // Check URL first for instant 1-scan WebRTC QR (?room=...&key=...)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    const key = params.get("key");
    if (room && key) {
      const ua = navigator.userAgent || "";
      const deviceName = /iPhone/i.test(ua)
        ? "iPhone"
        : /iPad/i.test(ua)
          ? "iPad"
          : /Android/i.test(ua)
            ? "Android"
            : "Phone";
      const rtcSession = {
        mode: "webrtc",
        roomCode: room.replace(/\D/g, ""),
        key,
        pin: "",
        deviceName
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(rtcSession));
      window.history.replaceState({}, "", window.location.pathname);
      return rtcSession;
    }
  }

  try {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && (parsed.mode === "webrtc" || parsed.mode === "ws")) {
        return parsed;
      }
    }
  } catch (_e) {
    // Ignore corrupt localStorage
  }

  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacyToken) {
    return { mode: "ws", token: legacyToken };
  }
  return null;
}

const NAV_ITEMS = [
  { id: "chrome", label: "Chrome", title: "Navigation & Omnibox", icon: Compass },
  { id: "media", label: "Media", title: "Multimedia Control", icon: PlayCircle },
  { id: "touchpad", label: "Touchpad", title: "Touchpad & Keyboard", icon: Touchpad },
  { id: "tabs", label: "Tabs", title: "Open Tabs & Bookmarks", icon: Layers },
  { id: "system", label: "System", title: "Audio, Macros & Power", icon: SlidersHorizontal }
];

export default function App() {
  const [sessionConfig, setSessionConfig] = useState(loadInitialSession);
  const [authError, setAuthError] = useState("");
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

  const handleLogout = useCallback((reason = "") => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    setSessionConfig(null);
    setAuthError(typeof reason === "string" ? reason : "");
  }, []);

  const handleAuthenticated = useCallback((nextSession) => {
    setAuthError("");
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    if (nextSession?.mode === "ws" && nextSession.token) {
      localStorage.setItem(LEGACY_TOKEN_KEY, nextSession.token);
    }
    setSessionConfig(nextSession);
  }, []);

  // Automatic Local Server QR Pairing via /?pair=<secret>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pairSecret = params.get("pair");
    if (!pairSecret) return;

    setPairingBusy(true);
    (async () => {
      try {
        const res = await fetch("./api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairingSecret: pairSecret, deviceName: "Mobile (QR)" })
        });
        const data = await res.json();
        if (data?.token) {
          handleAuthenticated({ mode: "ws", token: data.token });
          window.history.replaceState({}, "", window.location.pathname);
        }
      } catch (_err) {
        // Fallback to manual AuthScreen
      } finally {
        setPairingBusy(false);
      }
    })();
  }, [handleAuthenticated]);

  const { connectionState, latencyMs, serverState, toast, showToast, clearToast, send } =
    useRemoteSocket(sessionConfig, handleLogout, handleAuthenticated);

  useEffect(() => {
    const currentItem = NAV_ITEMS.find((i) => i.id === activeNav) || NAV_ITEMS[0];
    const tabSuffix = activeNav === "tabs" ? ` (${serverState.tabs.length})` : "";
    document.title = `${currentItem.label}${tabSuffix} | Chrome Remote Control`;
  }, [activeNav, serverState.tabs.length]);

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
          // Ignore
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

    if (document.querySelector("dialog:modal")) {
      return undefined;
    }

    lastFocusBeforeToastRef.current = document.activeElement;
    const pop = toastPopoverRef.current;
    if (pop && typeof pop.showPopover === "function") {
      try {
        pop.showPopover();
      } catch (_e) {
        // Ignore
      }
    }

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
        <progress aria-label="Pairing device via QR code" className="w-48 mb-2 mx-auto" />
        <p className="text-sm text-center">Pairing device via QR code...</p>
      </main>
    );
  }

  if (!sessionConfig) {
    return <AuthScreen onAuthenticated={handleAuthenticated} initialError={authError} vibrate={vibrate} />;
  }

  const currentViewMeta = NAV_ITEMS.find((i) => i.id === activeNav) || NAV_ITEMS[0];
  const isWebRtc = sessionConfig.mode === "webrtc";
  const badgeActive = isWebRtc ? true : serverState.extensionConnected;
  const badgeText = isWebRtc
    ? serverState.pcAgentConnected
      ? "Full PC + Chrome"
      : "Chrome Direct"
    : serverState.extensionConnected
      ? "Extension Active"
      : "Shortcut Mode";

  return (
    <div className="min-h-dvh bg-black text-zinc-100 flex flex-col">
      <p className="visually-hidden">Remote control status announcements</p>
      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {liveAnnouncement}
      </div>

      {/* Persistent Top-Layer Toast Region */}
      <div role="region" aria-label="Notifications">
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
            aria-label="Dismiss notification"
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
                  ? "Paused on PC"
                  : "Connected"
                : "Connecting..."}
            </span>
            {connectionState === "connected" && latencyMs !== null && (
              <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-full">
                {latencyMs} ms
              </span>
            )}
          </div>

          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              serverState.pcAgentConnected && isWebRtc
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                : badgeActive
                  ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400"
            }`}
          >
            {serverState.pcAgentConnected && isWebRtc ? (
              <MonitorCheck className="w-3 h-3" aria-hidden="true" />
            ) : (
              <Puzzle className="w-3 h-3" aria-hidden="true" />
            )}
            <span>{badgeText}</span>
          </div>
        </div>
      </header>

      {/* Main Content Landmark */}
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
            sessionConfig={sessionConfig}
            send={send}
            vibrate={vibrate}
            showToast={showToast}
            wakeLockSupported={wakeLockSupported}
            wakeLockEnabled={wakeLockEnabled}
            toggleWakeLock={toggleWakeLock}
            hapticsEnabled={hapticsEnabled}
            toggleHaptics={toggleHaptics}
            onLogout={() => handleLogout("")}
          />
        )}
      </main>

      {/* Ergonomic 5-Item Bottom Navigation Landmark */}
      <nav aria-label="Primary" className="safe-bottom-bar bg-[#09090b]/95 backdrop-blur-md border-t border-zinc-900">
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
