import { useCallback, useEffect, useRef, useState } from "react";

export function useRemoteSocket(token, onUnauthorized) {
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const backoffRef = useRef(800);

  const [connectionState, setConnectionState] = useState("disconnected"); // 'connected' | 'reconnecting' | 'disconnected'
  const [latencyMs, setLatencyMs] = useState(null);
  const [serverState, setServerState] = useState({
    os: "windows",
    paused: false,
    extensionConnected: false,
    audio: { volume: 50, muted: false },
    mouse: { sensitivity: 1.6, acceleration: 1.25, invert_scroll: false },
    screen: { fps: 8, quality: 55, scale: 0.5, format: "jpeg", active: false },
    macros: [],
    sleepTimer: { active: false, remainingSeconds: 0, mode: "suspend" },
    tabs: [],
    windows: [],
    media: {
      hasMedia: false,
      title: "",
      domain: "",
      currentTime: 0,
      duration: 0,
      paused: true,
      muted: false,
      volume: 1,
      playbackRate: 1,
      canSkipAd: false,
      skipLabel: "Skip Intro / Ad",
      captionsEnabled: false,
      pipActive: false
    },
    bookmarks: [],
    history: [],
    downloads: [],
    clipboardText: "",
    screenFrame: null,
    findResult: null
  });
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "info") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const send = useCallback((target, action, payload = {}) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ target, action, payload }));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!token) {
      setConnectionState("disconnected");
      return undefined;
    }

    let unmounted = false;

    const clearTimers = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    const connect = () => {
      if (unmounted) return;
      clearTimers();
      setConnectionState((prev) => (prev === "connected" ? "connected" : "reconnecting"));

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/ws/client?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (unmounted) return;
        backoffRef.current = 800;
        setConnectionState("connected");

        const sendPing = () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ target: "system", action: "ping", payload: { ts: performance.now() } }));
          }
        };
        sendPing();
        pingIntervalRef.current = setInterval(sendPing, 3500);
      });

      ws.addEventListener("message", (event) => {
        if (unmounted) return;
        try {
          const msg = JSON.parse(event.data);
          const { action, payload = {} } = msg;

          if (action === "pong") {
            if (typeof payload.ts === "number") {
              const rtt = Math.max(1, Math.round(performance.now() - payload.ts));
              setLatencyMs(rtt);
            }
            setServerState((prev) => ({
              ...prev,
              paused: Boolean(payload.paused),
              extensionConnected: Boolean(payload.extensionConnected)
            }));
            return;
          }

          if (action === "init_state") {
            setServerState((prev) => ({
              ...prev,
              ...payload,
              media: { ...prev.media, ...(payload.media || {}) }
            }));
            return;
          }

          if (action === "extension_status") {
            setServerState((prev) => ({ ...prev, extensionConnected: Boolean(payload.connected) }));
            return;
          }

          if (action === "tabs_list") {
            setServerState((prev) => ({
              ...prev,
              tabs: payload.tabs || [],
              windows: payload.windows || prev.windows
            }));
            return;
          }

          if (action === "media_state") {
            setServerState((prev) => ({
              ...prev,
              media: { ...prev.media, ...payload }
            }));
            return;
          }

          if (action === "audio_state") {
            setServerState((prev) => ({ ...prev, audio: payload }));
            return;
          }

          if (action === "mouse_settings") {
            setServerState((prev) => ({ ...prev, mouse: payload }));
            return;
          }

          if (action === "screen_settings") {
            setServerState((prev) => ({ ...prev, screen: payload }));
            return;
          }

          if (action === "screen_frame") {
            setServerState((prev) => ({ ...prev, screenFrame: payload }));
            return;
          }

          if (action === "macros_list") {
            setServerState((prev) => ({ ...prev, macros: payload.macros || [] }));
            return;
          }

          if (action === "sleep_timer_state") {
            setServerState((prev) => ({ ...prev, sleepTimer: payload }));
            return;
          }

          if (action === "bookmarks_list") {
            setServerState((prev) => ({ ...prev, bookmarks: payload.bookmarks || [] }));
            return;
          }

          if (action === "history_list") {
            setServerState((prev) => ({ ...prev, history: payload.history || [] }));
            return;
          }

          if (action === "downloads_list") {
            setServerState((prev) => ({ ...prev, downloads: payload.downloads || [] }));
            return;
          }

          if (action === "clipboard_content") {
            setServerState((prev) => ({ ...prev, clipboardText: payload.text || "" }));
            showToast("Clipboard fetched from PC", "success");
            return;
          }

          if (action === "find_result") {
            setServerState((prev) => ({ ...prev, findResult: payload }));
            if (!payload.found && payload.query) {
              showToast(`No matches for "${payload.query}"`, "warning");
            }
            return;
          }

          if (action === "toast" && payload.message) {
            showToast(payload.message, payload.type || "info");
          }
        } catch (_err) {
          // Ignore malformed packet
        }
      });

      ws.addEventListener("close", (event) => {
        clearTimers();
        if (unmounted) return;
        if (event.code === 4401) {
          setConnectionState("disconnected");
          onUnauthorized?.();
          return;
        }
        setConnectionState("reconnecting");
        const delay = backoffRef.current;
        backoffRef.current = Math.min(5000, Math.round(delay * 1.5));
        reconnectTimerRef.current = setTimeout(connect, delay);
      });

      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch (_e) {
          // Ignore
        }
      });
    };

    connect();

    return () => {
      unmounted = true;
      clearTimers();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (_e) {
          // Ignore
        }
      }
    };
  }, [token, onUnauthorized, showToast]);

  return {
    connectionState,
    latencyMs,
    serverState,
    toast,
    showToast,
    clearToast: () => setToast(null),
    send
  };
}
