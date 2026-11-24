import { useCallback, useEffect, useRef, useState } from "react";
import { Peer } from "peerjs";

const CHUNK_LIMIT = 12000;

export function useRemoteSocket(sessionConfig, onUnauthorized, onSessionUpgraded) {
  const wsRef = useRef(null);
  const peerRef = useRef(null);
  const rtcConnRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const backoffRef = useRef(900);
  const chunksRef = useRef(new Map());

  const [connectionState, setConnectionState] = useState("disconnected"); // 'connected' | 'reconnecting' | 'disconnected'
  const [latencyMs, setLatencyMs] = useState(null);
  const [serverState, setServerState] = useState({
    os: "windows",
    paused: false,
    extensionConnected: false,
    pcAgentConnected: false,
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

  const handleIncomingPacket = useCallback(
    (msg) => {
      if (!msg || typeof msg !== "object") return;
      const { action, payload = {} } = msg;

      if (action === "pong") {
        if (typeof payload.ts === "number") {
          const rtt = Math.max(1, Math.round(performance.now() - payload.ts));
          setLatencyMs(rtt);
        }
        setServerState((prev) => ({
          ...prev,
          paused: Boolean(payload.paused),
          extensionConnected: Boolean(payload.extensionConnected),
          pcAgentConnected:
            payload.pcAgentConnected !== undefined ? Boolean(payload.pcAgentConnected) : prev.pcAgentConnected
        }));
        return;
      }

      if (action === "pc_agent_status") {
        const connected = Boolean(payload.pcAgentConnected);
        setServerState((prev) => {
          if (prev.pcAgentConnected !== connected && connected) {
            showToast("Full Windows PC Agent connected", "success");
          }
          return { ...prev, pcAgentConnected: connected };
        });
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
    },
    [showToast]
  );

  const sendOverRtc = useCallback((obj) => {
    const conn = rtcConnRef.current;
    if (!conn || !conn.open) return false;
    try {
      const raw = JSON.stringify(obj);
      if (raw.length <= CHUNK_LIMIT) {
        conn.send(raw);
        return true;
      }
      const chunkId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const total = Math.ceil(raw.length / CHUNK_LIMIT);
      for (let i = 0; i < total; i += 1) {
        conn.send(
          JSON.stringify({
            __crcChunk: chunkId,
            idx: i,
            total,
            data: raw.slice(i * CHUNK_LIMIT, (i + 1) * CHUNK_LIMIT)
          })
        );
      }
      return true;
    } catch (_e) {
      return false;
    }
  }, []);

  const send = useCallback(
    (target, action, payload = {}) => {
      if (sessionConfig?.mode === "webrtc") {
        return sendOverRtc({ target, action, payload });
      }
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ target, action, payload }));
        return true;
      }
      return false;
    },
    [sessionConfig?.mode, sendOverRtc]
  );

  useEffect(() => {
    if (!sessionConfig) {
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

    // ========================================================================
    // MODE A: Direct WebRTC P2P to Chrome Extension (Zero laptop setup!)
    // ========================================================================
    if (sessionConfig.mode === "webrtc") {
      const cleanRoom = String(sessionConfig.roomCode || "").replace(/\D/g, "");
      if (!cleanRoom) {
        onUnauthorized?.("Invalid Room ID.");
        return undefined;
      }

      const connectWebRtc = () => {
        if (unmounted) return;
        clearTimers();
        setConnectionState((prev) => (prev === "connected" ? "connected" : "reconnecting"));

        if (peerRef.current) {
          try {
            peerRef.current.destroy();
          } catch (_e) {
            // Ignore
          }
          peerRef.current = null;
        }

        const peer = new Peer({
          debug: 0,
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" }
            ]
          }
        });
        peerRef.current = peer;

        const scheduleRetry = () => {
          clearTimers();
          if (unmounted) return;
          setConnectionState("reconnecting");
          const delay = backoffRef.current;
          backoffRef.current = Math.min(6000, Math.round(delay * 1.45));
          reconnectTimerRef.current = setTimeout(connectWebRtc, delay);
        };

        peer.on("open", () => {
          if (unmounted) return;
          const conn = peer.connect(`crc-v1-${cleanRoom}`, { reliable: true });
          rtcConnRef.current = conn;

          let authVerified = false;
          const handshakeTimeout = setTimeout(() => {
            if (!authVerified && !unmounted) {
              try {
                conn.close();
              } catch (_e) {
                // Ignore
              }
              scheduleRetry();
            }
          }, 9000);

          conn.on("open", () => {
            if (unmounted) return;
            conn.send(
              JSON.stringify({
                target: "auth",
                action: "hello",
                payload: {
                  key: sessionConfig.key || "",
                  pin: sessionConfig.pin || "",
                  deviceName: sessionConfig.deviceName || "Phone"
                }
              })
            );
          });

          conn.on("data", (raw) => {
            if (unmounted) return;
            let parsed = raw;
            if (typeof raw === "string") {
              try {
                parsed = JSON.parse(raw);
              } catch (_e) {
                return;
              }
            }
            if (!parsed || typeof parsed !== "object") return;

            if (parsed.__crcChunk) {
              const { __crcChunk: id, idx, total, data } = parsed;
              const map = chunksRef.current;
              if (!map.has(id)) {
                map.set(id, { parts: new Array(total), count: 0, total, ts: Date.now() });
              }
              const entry = map.get(id);
              if (!entry.parts[idx]) {
                entry.parts[idx] = data;
                entry.count += 1;
              }
              if (entry.count < entry.total) return;
              map.delete(id);
              try {
                parsed = JSON.parse(entry.parts.join(""));
              } catch (_e) {
                return;
              }
            }

            if (parsed.action === "auth_error") {
              clearTimeout(handshakeTimeout);
              setConnectionState("disconnected");
              onUnauthorized?.(parsed.payload?.message || "Incorrect PIN or Room ID.");
              return;
            }

            if (parsed.action === "auth_ok") {
              authVerified = true;
              clearTimeout(handshakeTimeout);
              backoffRef.current = 900;
              setConnectionState("connected");
              setServerState((prev) => ({
                ...prev,
                extensionConnected: true,
                pcAgentConnected: Boolean(parsed.payload?.pcAgentConnected)
              }));

              if (parsed.payload?.key && parsed.payload.key !== sessionConfig.key) {
                onSessionUpgraded?.({
                  ...sessionConfig,
                  key: parsed.payload.key,
                  pin: ""
                });
              }

              const sendPing = () => {
                if (conn.open) {
                  conn.send(JSON.stringify({ target: "system", action: "ping", payload: { ts: performance.now() } }));
                }
              };
              sendPing();
              pingIntervalRef.current = setInterval(sendPing, 3500);
              return;
            }

            handleIncomingPacket(parsed);
          });

          conn.on("close", () => {
            clearTimeout(handshakeTimeout);
            if (!unmounted) scheduleRetry();
          });

          conn.on("error", () => {
            clearTimeout(handshakeTimeout);
            if (!unmounted) scheduleRetry();
          });
        });

        peer.on("error", (err) => {
          if (unmounted) return;
          if (err?.type === "peer-unavailable" && !sessionConfig.key) {
            setConnectionState("disconnected");
            onUnauthorized?.("Chrome Extension Room ID not found. Make sure Chrome is open and check the Room ID.");
            return;
          }
          scheduleRetry();
        });
      };

      connectWebRtc();

      return () => {
        unmounted = true;
        clearTimers();
        if (rtcConnRef.current) {
          try {
            rtcConnRef.current.close();
          } catch (_e) {
            // Ignore
          }
        }
        if (peerRef.current) {
          try {
            peerRef.current.destroy();
          } catch (_e) {
            // Ignore
          }
        }
      };
    }

    // ========================================================================
    // MODE B: Local Wi-Fi FastAPI WebSocket Server (/ws/client?token=...)
    // ========================================================================
    const token = sessionConfig.token;
    if (!token) {
      setConnectionState("disconnected");
      return undefined;
    }

    const connectWs = () => {
      if (unmounted) return;
      clearTimers();
      setConnectionState((prev) => (prev === "connected" ? "connected" : "reconnecting"));

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/ws/client?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (unmounted) return;
        backoffRef.current = 900;
        setConnectionState("connected");
        setServerState((prev) => ({ ...prev, pcAgentConnected: true }));

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
          handleIncomingPacket(msg);
        } catch (_err) {
          // Ignore malformed packet
        }
      });

      ws.addEventListener("close", (event) => {
        clearTimers();
        if (unmounted) return;
        if (event.code === 4401) {
          setConnectionState("disconnected");
          onUnauthorized?.("Session expired. Please scan the QR code or enter your PIN again.");
          return;
        }
        setConnectionState("reconnecting");
        const delay = backoffRef.current;
        backoffRef.current = Math.min(5000, Math.round(delay * 1.5));
        reconnectTimerRef.current = setTimeout(connectWs, delay);
      });

      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch (_e) {
          // Ignore
        }
      });
    };

    connectWs();

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
  }, [
    sessionConfig?.mode,
    sessionConfig?.token,
    sessionConfig?.roomCode,
    sessionConfig?.key,
    sessionConfig?.pin,
    sessionConfig?.deviceName,
    handleIncomingPacket,
    onUnauthorized,
    onSessionUpgraded
  ]);

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
