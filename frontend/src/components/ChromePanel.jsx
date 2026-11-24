import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  RefreshCwOff,
  Square,
  Home,
  Search,
  Plus,
  AppWindow,
  EyeOff,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Bookmark,
  History,
  Download,
  FileSearch,
  ExternalLink,
  ChevronRight
} from "lucide-react";

const ENGINES = [
  { id: "google", label: "Google" },
  { id: "youtube", label: "YouTube" },
  { id: "wikipedia", label: "Wikipedia" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "duckduckgo", label: "DuckDuckGo" },
  { id: "github", label: "GitHub" }
];

export default function ChromePanel({ serverState, send, vibrate }) {
  const [omniboxText, setOmniboxText] = useState("");
  const [engine, setEngine] = useState("google");
  const [openInNewTab, setOpenInNewTab] = useState(true);
  const [findQuery, setFindQuery] = useState("");
  const [drawerTab, setDrawerTab] = useState(null); // 'bookmarks' | 'history' | 'downloads' | null

  const fireChrome = (action, payload = {}) => {
    vibrate?.(12);
    send("chrome", action, payload);
  };

  const handleOmniboxSubmit = (e) => {
    e.preventDefault();
    const q = omniboxText.trim();
    if (!q) return;
    fireChrome("omnibox", { query: q, engine, newTab: openInNewTab });
    setOmniboxText("");
  };

  const handleFindSubmit = (e, backwards = false) => {
    e?.preventDefault();
    if (!findQuery.trim()) return;
    fireChrome("find_in_page", { query: findQuery.trim(), backwards });
  };

  const openDrawer = (type) => {
    vibrate?.(12);
    if (drawerTab === type) {
      setDrawerTab(null);
      return;
    }
    setDrawerTab(type);
    if (type === "bookmarks") send("chrome", "get_bookmarks", {});
    if (type === "history") send("chrome", "get_history", { query: "" });
    if (type === "downloads") send("chrome", "get_downloads", {});
  };

  const activeTab = serverState.tabs.find((t) => t.active && t.windowFocused) || serverState.tabs.find((t) => t.active);

  return (
    <div className="space-y-4 pb-6">
      {/* Active Tab Banner */}
      <section className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-3.5">
        <div className="flex items-center gap-2.5">
          {activeTab?.favIconUrl ? (
            <img src={activeTab.favIconUrl} alt="" className="w-5 h-5 rounded shrink-0" />
          ) : (
            <div className="w-5 h-5 rounded bg-zinc-800 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-zinc-100 truncate">
              {activeTab ? activeTab.title : serverState.extensionConnected ? "Sin pestaña activa" : "Modo Atajos de Teclado (sin extensión)"}
            </p>
            <p className="text-[11px] text-zinc-400 truncate">
              {activeTab?.domain || "Usa la barra inferior para abrir cualquier sitio o búsqueda"}
            </p>
          </div>
        </div>
      </section>

      {/* Smart Omnibox & Search Engine Selector */}
      <section className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-3.5 space-y-3">
        <form onSubmit={handleOmniboxSubmit} className="space-y-2.5">
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                value={omniboxText}
                onChange={(e) => setOmniboxText(e.target.value)}
                placeholder="URL o búsqueda rápida..."
                aria-label="Barra de dirección o búsqueda remota"
                className="w-full bg-black border border-zinc-800 rounded-xl pl-10 pr-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <button
              type="submit"
              className="bg-cyan-500 active:bg-cyan-400 text-black font-bold px-4 rounded-xl text-sm shrink-0"
            >
              Ir
            </button>
          </div>

          {/* Engine Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {ENGINES.map((eng) => (
              <button
                key={eng.id}
                type="button"
                onClick={() => {
                  vibrate?.(8);
                  setEngine(eng.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 border transition-colors ${
                  engine === eng.id
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                    : "bg-black border-zinc-800 text-zinc-400"
                }`}
              >
                {eng.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={openInNewTab}
              onChange={(e) => setOpenInNewTab(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span>Abrir búsquedas en una pestaña nueva</span>
          </label>
        </form>
      </section>

      {/* Navigation Controls */}
      <section className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
          Navegación
        </h2>
        <div className="grid grid-cols-6 gap-2">
          <button
            type="button"
            aria-label="Atrás"
            onClick={() => fireChrome("nav_back")}
            className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-3 flex flex-col items-center justify-center gap-1"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-200" aria-hidden="true" />
            <span className="text-[10px] text-zinc-400">Atrás</span>
          </button>
          <button
            type="button"
            aria-label="Adelante"
            onClick={() => fireChrome("nav_forward")}
            className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-3 flex flex-col items-center justify-center gap-1"
          >
            <ArrowRight className="w-5 h-5 text-zinc-200" aria-hidden="true" />
            <span className="text-[10px] text-zinc-400">Adelante</span>
          </button>
          <button
            type="button"
            aria-label="Recargar página"
            onClick={() => fireChrome("nav_reload")}
            className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-3 flex flex-col items-center justify-center gap-1"
          >
            <RotateCw className="w-5 h-5 text-cyan-400" aria-hidden="true" />
            <span className="text-[10px] text-zinc-400">Recargar</span>
          </button>
          <button
            type="button"
            aria-label="Recargar sin caché"
            onClick={() => fireChrome("nav_hard_reload")}
            className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-3 flex flex-col items-center justify-center gap-1"
          >
            <RefreshCwOff className="w-5 h-5 text-amber-400" aria-hidden="true" />
            <span className="text-[10px] text-zinc-400">Sin caché</span>
          </button>
          <button
            type="button"
            aria-label="Detener carga"
            onClick={() => fireChrome("nav_stop")}
            className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-3 flex flex-col items-center justify-center gap-1"
          >
            <Square className="w-4 h-4 text-rose-400" aria-hidden="true" />
            <span className="text-[10px] text-zinc-400">Detener</span>
          </button>
          <button
            type="button"
            aria-label="Página de inicio"
            onClick={() => fireChrome("nav_home")}
            className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-3 flex flex-col items-center justify-center gap-1"
          >
            <Home className="w-5 h-5 text-zinc-200" aria-hidden="true" />
            <span className="text-[10px] text-zinc-400">Inicio</span>
          </button>
        </div>
      </section>

      {/* Quick Tab / Window Actions & Zoom / Fullscreen */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
            Pestañas y Ventanas
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => fireChrome("tab_new", {})}
              className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 px-2 flex flex-col items-center gap-1 text-xs"
            >
              <Plus className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span>Nueva</span>
            </button>
            <button
              type="button"
              onClick={() => fireChrome("window_new", {})}
              className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 px-2 flex flex-col items-center gap-1 text-xs"
            >
              <AppWindow className="w-4 h-4 text-blue-400" aria-hidden="true" />
              <span>Ventana</span>
            </button>
            <button
              type="button"
              onClick={() => fireChrome("window_new", { incognito: true })}
              className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 px-2 flex flex-col items-center gap-1 text-xs"
            >
              <EyeOff className="w-4 h-4 text-purple-400" aria-hidden="true" />
              <span>Incógnito</span>
            </button>
          </div>
        </div>

        <div className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
            Zoom y Vista
          </h2>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              aria-label="Alejar zoom"
              onClick={() => fireChrome("zoom_out")}
              className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 flex flex-col items-center gap-1 text-xs"
            >
              <ZoomOut className="w-4 h-4 text-zinc-200" aria-hidden="true" />
              <span>-</span>
            </button>
            <button
              type="button"
              aria-label="Restablecer zoom a 100%"
              onClick={() => fireChrome("zoom_reset")}
              className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 flex flex-col items-center justify-center text-xs font-semibold text-cyan-300"
            >
              100%
            </button>
            <button
              type="button"
              aria-label="Acercar zoom"
              onClick={() => fireChrome("zoom_in")}
              className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 flex flex-col items-center gap-1 text-xs"
            >
              <ZoomIn className="w-4 h-4 text-zinc-200" aria-hidden="true" />
              <span>+</span>
            </button>
            <button
              type="button"
              aria-label="Pantalla completa F11"
              onClick={() => fireChrome("fullscreen")}
              className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 flex flex-col items-center gap-1 text-xs"
            >
              <Maximize2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              <span>F11</span>
            </button>
          </div>
        </div>
      </section>

      {/* Find in Page (Ctrl+F) */}
      <section className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-3.5">
        <form onSubmit={(e) => handleFindSubmit(e, false)} className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <FileSearch className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              placeholder="Buscar texto en la página (Ctrl+F)..."
              aria-label="Buscar texto dentro de la página"
              className="w-full bg-black border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <button
            type="button"
            aria-label="Coincidencia anterior"
            onClick={(e) => handleFindSubmit(e, true)}
            className="bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-300"
          >
            Ant.
          </button>
          <button
            type="submit"
            className="bg-zinc-800 active:bg-zinc-700 rounded-xl px-3.5 py-2 text-xs font-semibold text-cyan-300"
          >
            Sig.
          </button>
        </form>
      </section>

      {/* Bookmarks, History & Downloads Quick Access */}
      <section className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-3.5 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Acceso Rápido del Navegador
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => openDrawer("bookmarks")}
            className={`rounded-xl py-2.5 px-2 border flex items-center justify-center gap-1.5 text-xs font-medium ${
              drawerTab === "bookmarks"
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                : "bg-black border-zinc-800 text-zinc-200"
            }`}
          >
            <Bookmark className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span>Marcadores</span>
          </button>
          <button
            type="button"
            onClick={() => openDrawer("history")}
            className={`rounded-xl py-2.5 px-2 border flex items-center justify-center gap-1.5 text-xs font-medium ${
              drawerTab === "history"
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                : "bg-black border-zinc-800 text-zinc-200"
            }`}
          >
            <History className="w-4 h-4 text-blue-400" aria-hidden="true" />
            <span>Historial</span>
          </button>
          <button
            type="button"
            onClick={() => openDrawer("downloads")}
            className={`rounded-xl py-2.5 px-2 border flex items-center justify-center gap-1.5 text-xs font-medium ${
              drawerTab === "downloads"
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                : "bg-black border-zinc-800 text-zinc-200"
            }`}
          >
            <Download className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>Descargas</span>
          </button>
        </div>

        {/* Dynamic Drawer Content */}
        {drawerTab === "bookmarks" && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pt-1">
            {!serverState.extensionConnected ? (
              <button
                type="button"
                onClick={() => fireChrome("open_bookmarks_manager")}
                className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-xs text-cyan-300 flex items-center justify-between"
              >
                <span>Abrir administrador de marcadores en PC (Ctrl+Shift+O)</span>
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : serverState.bookmarks.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-3">No se encontraron marcadores guardados.</p>
            ) : (
              serverState.bookmarks.map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => fireChrome("omnibox", { url: bm.url, newTab: true })}
                  className="w-full bg-black hover:bg-zinc-900 border border-zinc-800/80 rounded-xl px-3 py-2.5 text-left flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-100 truncate">{bm.title}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{bm.domain}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
                </button>
              ))
            )}
          </div>
        )}

        {drawerTab === "history" && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pt-1">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => fireChrome("open_history")}
                className="text-[11px] text-cyan-400 underline px-1 py-0.5"
              >
                Abrir chrome://history en PC
              </button>
            </div>
            {serverState.history.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => fireChrome("omnibox", { url: item.url, newTab: true })}
                className="w-full bg-black hover:bg-zinc-900 border border-zinc-800/80 rounded-xl px-3 py-2.5 text-left flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-100 truncate">{item.title}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{item.domain}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {drawerTab === "downloads" && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pt-1">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => fireChrome("open_downloads")}
                className="text-[11px] text-cyan-400 underline px-1 py-0.5"
              >
                Abrir chrome://downloads en PC
              </button>
            </div>
            {serverState.downloads.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-3">Sin descargas recientes.</p>
            ) : (
              serverState.downloads.map((dl) => (
                <div
                  key={dl.id}
                  className="bg-black border border-zinc-800/80 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-100 truncate">{dl.filename}</p>
                    <p className="text-[11px] text-zinc-500">{dl.state}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
