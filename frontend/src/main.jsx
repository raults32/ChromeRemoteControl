import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Feature-detected modern web polyfills (loaded ONLY when native browser support is missing)
if (typeof window !== "undefined") {
  if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
    import("@oddbird/popover-polyfill").catch(() => {});
  }
  if (!Object.hasOwn(HTMLElement.prototype, "focusGroup")) {
    import("@microsoft/focusgroup-polyfill")
      .then((mod) => mod.polyfill?.())
      .catch(() => {});
  }
  if (!("switch" in HTMLInputElement.prototype)) {
    import("input-switch-polyfill").catch(() => {});
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // Ignore SW registration errors in non-HTTPS LAN dev contexts
      });
    });
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
