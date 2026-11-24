import { useCallback, useState } from "react";

const STORAGE_KEY = "crc_haptics_enabled";

export function useHaptics() {
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === null ? true : saved === "1";
  });

  const toggleHaptics = useCallback((nextValue) => {
    setEnabled((prev) => {
      const val = typeof nextValue === "boolean" ? nextValue : !prev;
      localStorage.setItem(STORAGE_KEY, val ? "1" : "0");
      return val;
    });
  }, []);

  const vibrate = useCallback(
    (pattern = 12) => {
      if (!enabled) return;
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(pattern);
        } catch (_err) {
          // Ignore unsupported browser errors
        }
      }
    },
    [enabled]
  );

  return { hapticsEnabled: enabled, toggleHaptics, vibrate };
}
