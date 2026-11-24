import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function copyPolyfillCssPlugin() {
  return {
    name: "copy-input-switch-polyfill-css",
    closeBundle() {
      const src = path.resolve("node_modules/input-switch-polyfill/input-switch-polyfill.css");
      const destDir = path.resolve("dist/assets");
      if (fs.existsSync(src) && fs.existsSync(destDir)) {
        fs.copyFileSync(src, path.join(destDir, "input-switch-polyfill.css"));
      }
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), copyPolyfillCssPlugin()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true
      },
      "/ws": {
        target: "ws://127.0.0.1:8765",
        ws: true
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022"
  }
});
