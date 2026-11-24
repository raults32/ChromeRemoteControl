import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
  Pin,
  Copy,
  X,
  Globe,
  Bookmark,
  Search,
  Layers,
  EyeOff
} from "lucide-react";

export default function TabsPanel({ serverState, send, vibrate }) {
  const [subView, setSubView] = useState("tabs");
  const [selectedWindowId, setSelectedWindowId] = useState("all");
  const [filterText, setFilterText] = useState("");

  const fireChrome = (action, payload = {}) => {
    vibrate?.(12);
    send("chrome", action, payload);
  };

  useEffect(() => {
    if (serverState.extensionConnected && serverState.bookmarks.length === 0) {
      send("chrome", "get_bookmarks", {});
    }
  }, [serverState.extensionConnected, serverState.bookmarks.length, send]);

  const filteredTabs = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return (serverState.tabs || []).filter((t) => {
      if (selectedWindowId !== "all" && String(t.windowId) !== String(selectedWindowId)) {
        return false;
      }
      if (!q) return true;
      return (
        (t.title || "").toLowerCase().includes(q) ||
        (t.domain || "").toLowerCase().includes(q) ||
        (t.url || "").toLowerCase().includes(q)
      );
    });
  }, [serverState.tabs, selectedWindowId, filterText]);

  const filteredBookmarks = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return (serverState.bookmarks || []).filter((bm) => {
      if (!q) return true;
      return (
        (bm.title || "").toLowerCase().includes(q) ||
        (bm.domain || "").toLowerCase().includes(q)
      );
    });
  }, [serverState.bookmarks, filterText]);

  return (
    <div className="space-y-3.5 pb-6">
      {/* Top Switcher & Quick Reopen / New Tab */}
      <div className="flex items-center justify-between gap-2">
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              vibrate?.(10);
              setSubView("tabs");
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              subView === "tabs" ? "bg-cyan-500 text-black" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tabs ({serverState.tabs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              vibrate?.(10);
              setSubView("bookmarks");
              send("chrome", "get_bookmarks", {});
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              subView === "bookmarks" ? "bg-cyan-500 text-black" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Bookmarks</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Reopen last closed tab"
            onClick={() => fireChrome("tab_reopen")}
            className="bg-[#121212] active:bg-zinc-800 border border-zinc-800 rounded-xl p-2.5 text-zinc-200"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Open new tab"
            onClick={() => fireChrome("tab_new", {})}
            className="bg-cyan-500 active:bg-cyan-400 text-black rounded-xl p-2.5 font-bold"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Filter Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Filter tabs or bookmarks"
          placeholder={subView === "tabs" ? "Filter tabs by title or domain..." : "Filter bookmarks..."}
          className="w-full bg-[#121212] border border-zinc-800 rounded-2xl pl-10 pr-3 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
        />
      </div>

      {subView === "tabs" ? (
        <div className="space-y-3">
          {serverState.windows.length > 1 && (
            <div className="h-scroller gap-1.5 pb-1" role="group" aria-label="Chrome windows">
              <button
                type="button"
                onClick={() => setSelectedWindowId("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${
                  selectedWindowId === "all"
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                    : "bg-[#121212] border-zinc-800 text-zinc-400"
                }`}
              >
                All windows
              </button>
              {serverState.windows.map((win, idx) => {
                const activeWin = String(selectedWindowId) === String(win.id);
                return (
                  <button
                    key={win.id}
                    type="button"
                    onClick={() => {
                      setSelectedWindowId(String(win.id));
                      fireChrome("window_focus", { windowId: win.id });
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 ${
                      activeWin
                        ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                        : "bg-[#121212] border-zinc-800 text-zinc-400"
                    }`}
                  >
                    {win.incognito && <EyeOff className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />}
                    <span>Window {idx + 1} ({win.tabsCount})</span>
                  </button>
                );
              })}
            </div>
          )}

          {!serverState.extensionConnected && (
            <div className="bg-[#121212] border border-amber-500/30 rounded-2xl p-4 space-y-2.5">
              <h2 className="text-xs font-semibold text-amber-300">
                Chrome Extension not detected right now
              </h2>
              <p className="text-xs text-zinc-400">
                Load the <code>chrome-extension</code> folder in <code>chrome://extensions</code> to view live open tabs, or use quick shortcuts below:
              </p>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => fireChrome("tab_prev")}
                  className="bg-black border border-zinc-800 rounded-xl py-2.5 text-xs font-semibold text-zinc-200"
                >
                  Prev Tab
                </button>
                <button
                  type="button"
                  onClick={() => fireChrome("tab_next")}
                  className="bg-black border border-zinc-800 rounded-xl py-2.5 text-xs font-semibold text-zinc-200"
                >
                  Next Tab
                </button>
                <button
                  type="button"
                  onClick={() => fireChrome("tab_close")}
                  className="bg-rose-950/50 border border-rose-800/60 rounded-xl py-2.5 text-xs font-semibold text-rose-300"
                >
                  Close Tab
                </button>
              </div>
            </div>
          )}

          {/* Uniform Vertical Tab Cards Stack */}
          <div className="space-y-2">
            {filteredTabs.map((tab) => {
              const isActive = tab.active && tab.windowFocused;
              return (
                <div
                  key={tab.id}
                  className={`w-full rounded-2xl border p-3 transition-colors ${
                    isActive
                      ? "bg-cyan-950/25 border-cyan-500/60"
                      : "bg-[#121212] border-zinc-800/80"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fireChrome("tab_activate", { tabId: tab.id })}
                      className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                    >
                      {tab.favIconUrl ? (
                        <img
                          src={tab.favIconUrl}
                          alt=""
                          width="20"
                          height="20"
                          loading="lazy"
                          decoding="async"
                          className="w-5 h-5 rounded shrink-0"
                        />
                      ) : (
                        <Globe className="w-5 h-5 text-zinc-500 shrink-0" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {tab.pinned && <Pin className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />}
                          {tab.audible && !tab.muted && (
                            <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-pulse" aria-hidden="true" />
                          )}
                          <p className="text-xs font-semibold text-zinc-100 truncate">{tab.title}</p>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate">{tab.domain || "chrome"}</p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={tab.muted ? "Unmute tab" : "Mute tab"}
                        onClick={() => fireChrome("tab_mute", { tabId: tab.id, muted: !tab.muted })}
                        className={`p-2 rounded-xl border ${
                          tab.muted
                            ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
                            : "bg-black border-zinc-800 text-zinc-400"
                        }`}
                      >
                        {tab.muted ? <VolumeX className="w-3.5 h-3.5" aria-hidden="true" /> : <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>

                      <button
                        type="button"
                        aria-label={tab.pinned ? "Unpin tab" : "Pin tab"}
                        onClick={() => fireChrome("tab_pin", { tabId: tab.id, pinned: !tab.pinned })}
                        className={`p-2 rounded-xl border ${
                          tab.pinned
                            ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                            : "bg-black border-zinc-800 text-zinc-400"
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        aria-label="Duplicate tab"
                        onClick={() => fireChrome("tab_duplicate", { tabId: tab.id })}
                        className="p-2 rounded-xl bg-black border border-zinc-800 text-zinc-400"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        aria-label="Close tab"
                        onClick={() => fireChrome("tab_close", { tabId: tab.id })}
                        className="p-2 rounded-xl bg-black active:bg-rose-950 border border-zinc-800 text-rose-400"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredBookmarks.map((bm) => (
            <button
              key={bm.id}
              type="button"
              onClick={() => fireChrome("omnibox", { url: bm.url, newTab: true })}
              className="w-full bg-[#121212] active:bg-zinc-900 border border-zinc-800/80 rounded-2xl p-3 text-left flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-100 truncate">{bm.title}</p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {bm.folder ? `${bm.folder} • ${bm.domain}` : bm.domain}
                </p>
              </div>
              <Bookmark className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
