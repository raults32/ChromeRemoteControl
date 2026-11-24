import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "crc_wakelock_enabled";

export function useWakeLock() {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const sentinelRef = useRef(null);
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const [active, setActive] = useState(false);

  const requestLock = useCallback(async () => {
    if (!supported || sentinelRef.current) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      sentinelRef.current = lock;
      setActive(true);
      lock.addEventListener("release", () => {
        sentinelRef.current = null;
        setActive(false);
      });
    } catch (_err) {
      setActive(false);
    }
  }, [supported]);

  const releaseLock = useCallback(async () => {
    if (sentinelRef.current) {
      try {
        await sentinelRef.current.release();
      } catch (_err) {
        // Ignore release error
      }
      sentinelRef.current = null;
    }
    setActive(false);
  }, []);

  const toggleWakeLock = useCallback((next) => {
    setEnabled((prev) => {
      const target = typeof next === "boolean" ? next : !prev;
      localStorage.setItem(STORAGE_KEY, target ? "1" : "0");
      return target;
    });
  }, []);

  useEffect(() => {
    if (!supported) return undefined;
    if (enabled) {
      requestLock();
    } else {
      releaseLock();
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && enabled) {
        requestLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      releaseLock();
    };
  }, [enabled, supported, requestLock, releaseLock]);

  return { wakeLockSupported: supported, wakeLockEnabled: enabled, wakeLockActive: active, toggleWakeLock };
}
