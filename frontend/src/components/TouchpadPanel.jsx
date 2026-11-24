import React, { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Mic,
  MicOff,
  Eye,
  EyeOff,
  Send,
  CornerDownLeft,
  Delete,
  Copy,
  ClipboardPaste,
  Scissors,
  Undo2,
  Redo2,
  CheckSquare,
  MousePointerClick
} from "lucide-react";

const SPECIAL_KEYS = [
  { label: "Esc", key: "esc" },
  { label: "Tab", key: "tab" },
  { label: "Enter", key: "enter" },
  { label: "⌫", key: "backspace", aria: "Retroceso ⌫" },
  { label: "Supr", key: "delete" },
  { label: "←", key: "left", aria: "Flecha izquierda ←" },
  { label: "↑", key: "up", aria: "Flecha arriba ↑" },
  { label: "↓", key: "down", aria: "Flecha abajo ↓" },
  { label: "→", key: "right", aria: "Flecha derecha →" },
  { label: "Alt+Tab", shortcut: "alt_tab" },
  { label: "Win/Cmd", key: "win" },
  { label: "Inicio", key: "home" },
  { label: "Fin", key: "end" },
  { label: "RePág", key: "pageup" },
  { label: "AvPág", key: "pagedown" }
];

const QUICK_SHORTCUTS = [
  { label: "Copiar", name: "copy", icon: Copy },
  { label: "Pegar", name: "paste", icon: ClipboardPaste },
  { label: "Cortar", name: "cut", icon: Scissors },
  { label: "Deshacer", name: "undo", icon: Undo2 },
  { label: "Rehacer", name: "redo", icon: Redo2 },
  { label: "Sel. todo", name: "select_all", icon: CheckSquare }
];

const SENTINEL = " ";

export default function TouchpadPanel({ serverState, send, vibrate, showToast }) {
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [liveValue, setLiveValue] = useState(SENTINEL);
  const [composeText, setComposeText] = useState("");
  const [listening, setListening] = useState(false);
  const [screenSpy, setScreenSpy] = useState(false);
  const [screenRightClick, setScreenRightClick] = useState(false);
  const [draggingIndicator, setDraggingIndicator] = useState(false);

  const liveInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const gestureRef = useRef({
    touchCount: 0,
    maxTouches: 0,
    startTime: 0,
    lastX: 0,
    lastY: 0,
    totalMove: 0,
    lastTapTime: 0,
    isDragging: false,
    lastTwoCenter: null,
    lastPinchDist: null,
    pinchAccum: 0
  });

  useEffect(() => {
    if (screenSpy) {
      send("system", "screen_start", { fps: serverState.screen?.fps || 8 });
    } else {
      send("system", "screen_stop", {});
    }
    return () => {
      send("system", "screen_stop", {});
    };
  }, [screenSpy, send]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_e) {
          // Ignore
        }
      }
    };
  }, []);

  const handleTouchStart = (e) => {
    const g = gestureRef.current;
    const touches = e.touches;
    g.touchCount = touches.length;
    g.maxTouches = Math.max(g.maxTouches, touches.length);

    if (touches.length === 1) {
      const now = performance.now();
      const t = touches[0];
      g.startTime = now;
      g.lastX = t.clientX;
      g.lastY = t.clientY;
      g.totalMove = 0;

      if (now - g.lastTapTime < 280 && !g.isDragging) {
        g.isDragging = true;
        setDraggingIndicator(true);
        vibrate?.(18);
        send("system", "mouse_button", { button: "left", state: "down" });
      }
    } else if (touches.length === 2) {
      const [t1, t2] = [touches[0], touches[1]];
      g.lastTwoCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
      g.lastPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      g.pinchAccum = 0;
    }
  };

  const handleTouchMove = (e) => {
    const g = gestureRef.current;
    const touches = e.touches;

    if (touches.length === 1 && (g.maxTouches === 1 || g.isDragging)) {
      const t = touches[0];
      const dx = t.clientX - g.lastX;
      const dy = t.clientY - g.lastY;
      g.lastX = t.clientX;
      g.lastY = t.clientY;
      g.totalMove += Math.hypot(dx, dy);

      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        send("system", "mouse_move", { dx, dy });
      }
    } else if (touches.length === 2) {
      const [t1, t2] = [touches[0], touches[1]];
      const center = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      if (g.lastTwoCenter && g.lastPinchDist !== null) {
        const distDelta = dist - g.lastPinchDist;
        const centerDx = center.x - g.lastTwoCenter.x;
        const centerDy = center.y - g.lastTwoCenter.y;
        g.totalMove += Math.hypot(centerDx, centerDy) + Math.abs(distDelta);

        if (Math.abs(distDelta) > 6 && Math.abs(distDelta) > Math.hypot(centerDx, centerDy) * 1.35) {
          g.pinchAccum += distDelta;
          if (Math.abs(g.pinchAccum) >= 26) {
            send("system", "pinch_zoom", { delta: g.pinchAccum > 0 ? 1 : -1 });
            g.pinchAccum = 0;
          }
        } else {
          const scrollX = centerDx / 16;
          const scrollY = -centerDy / 14;
          if (Math.abs(scrollX) >= 0.06 || Math.abs(scrollY) >= 0.06) {
            send("system", "mouse_scroll", { dx: scrollX, dy: scrollY });
          }
        }
      }

      g.lastTwoCenter = center;
      g.lastPinchDist = dist;
    }
  };

  const handleTouchEnd = (e) => {
    const g = gestureRef.current;
    const remaining = e.touches.length;

    if (remaining === 0) {
      const elapsed = performance.now() - g.startTime;

      if (g.isDragging) {
        g.isDragging = false;
        setDraggingIndicator(false);
        send("system", "mouse_button", { button: "left", state: "up" });
      } else if (g.maxTouches === 1 && g.totalMove < 10 && elapsed < 260) {
        vibrate?.(10);
        send("system", "mouse_click", { button: "left", count: 1 });
        g.lastTapTime = performance.now();
      } else if (g.maxTouches === 2 && g.totalMove < 16 && elapsed < 300) {
        vibrate?.(16);
        send("system", "mouse_click", { button: "right", count: 1 });
      }

      g.touchCount = 0;
      g.maxTouches = 0;
      g.lastTwoCenter = null;
      g.lastPinchDist = null;
      g.pinchAccum = 0;
    }
  };

  const mouseDownRef = useRef(null);
  const handleMouseDownPad = (e) => {
    if ("ontouchstart" in window) return;
    mouseDownRef.current = { x: e.clientX, y: e.clientY, moved: 0 };
  };
  const handleMouseMovePad = (e) => {
    if (!mouseDownRef.current) return;
    const dx = e.clientX - mouseDownRef.current.x;
    const dy = e.clientY - mouseDownRef.current.y;
    mouseDownRef.current.x = e.clientX;
    mouseDownRef.current.y = e.clientY;
    mouseDownRef.current.moved += Math.hypot(dx, dy);
    send("system", "mouse_move", { dx, dy });
  };
  const handleMouseUpPad = () => {
    if (!mouseDownRef.current) return;
    if (mouseDownRef.current.moved < 5) {
      send("system", "mouse_click", { button: "left", count: 1 });
    }
    mouseDownRef.current = null;
  };

  // IME-safe live typing handler (checks isComposing per forms §7)
  const handleLiveInputChange = (e) => {
    if (e.nativeEvent?.isComposing) {
      setLiveValue(e.target.value);
      return;
    }
    const val = e.target.value;
    if (val === "") {
      send("system", "key_press", { key: "backspace" });
      setLiveValue(SENTINEL);
      return;
    }
    if (val.startsWith(SENTINEL)) {
      const added = val.slice(SENTINEL.length);
      if (added) {
        send("system", "key_type", { text: added });
      }
    } else {
      send("system", "key_type", { text: val });
    }
    setLiveValue(SENTINEL);
  };

  const handleLiveKeyDown = (e) => {
    if (e.nativeEvent?.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      vibrate?.(10);
      send("system", "key_press", { key: "enter" });
    } else if (e.key === "Backspace" && liveValue === SENTINEL) {
      e.preventDefault();
      vibrate?.(8);
      send("system", "key_press", { key: "backspace" });
    }
  };

  const sendComposeText = (e) => {
    e?.preventDefault();
    if (!composeText) return;
    vibrate?.(12);
    send("system", "key_type", { text: composeText });
    setComposeText("");
  };

  const toggleVoiceDictation = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast?.("Tu navegador móvil no soporta Web Speech API para dictado.", "warning");
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRec();
    rec.lang = "es-ES";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      vibrate?.(15);
      setListening(true);
    };

    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        send("system", "key_type", { text: transcript + " " });
        showToast?.(`Dictado: "${transcript}"`, "success");
      }
    };

    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
  };

  const handleScreenTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const xRatio = e.detail === 0 ? 0.5 : (e.clientX - rect.left) / rect.width;
    const yRatio = e.detail === 0 ? 0.5 : (e.clientY - rect.top) / rect.height;
    vibrate?.(14);
    send("system", "screen_tap", {
      xRatio,
      yRatio,
      button: screenRightClick ? "right" : "left",
      count: 1,
      click: true
    });
  };

  return (
    <div className="space-y-3 pb-6">
      {/* Top Toolbar: Keyboard Toggle, Voice Dictation, Screen Spy */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          aria-pressed={showKeyboard}
          onClick={() => {
            vibrate?.(10);
            const next = !showKeyboard;
            setShowKeyboard(next);
            if (next) {
              setTimeout(() => liveInputRef.current?.focus(), 60);
            }
          }}
          className={`rounded-2xl py-2.5 px-3 border flex items-center justify-center gap-2 text-xs font-semibold ${
            showKeyboard
              ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
              : "bg-[#121212] border-zinc-800 text-zinc-200"
          }`}
        >
          <Keyboard className="w-4 h-4" aria-hidden="true" />
          <span>Teclado</span>
        </button>

        <button
          type="button"
          aria-pressed={listening}
          onClick={toggleVoiceDictation}
          className={`rounded-2xl py-2.5 px-3 border flex items-center justify-center gap-2 text-xs font-semibold ${
            listening
              ? "bg-rose-500/25 border-rose-400 text-rose-300"
              : "bg-[#121212] border-zinc-800 text-zinc-200"
          }`}
        >
          {listening ? <MicOff className="w-4 h-4" aria-hidden="true" /> : <Mic className="w-4 h-4 text-cyan-400" aria-hidden="true" />}
          <span>Dictar Voz</span>
        </button>

        <button
          type="button"
          aria-pressed={screenSpy}
          onClick={() => {
            vibrate?.(12);
            setScreenSpy((s) => !s);
          }}
          className={`rounded-2xl py-2.5 px-3 border flex items-center justify-center gap-2 text-xs font-semibold ${
            screenSpy
              ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
              : "bg-[#121212] border-zinc-800 text-zinc-200"
          }`}
        >
          {screenSpy ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4 text-emerald-400" aria-hidden="true" />}
          <span>Espiar PC</span>
        </button>
      </div>

      {/* Live Screen Mirroring ("Modo Espiar Pantalla") using semantic <button> */}
      {screenSpy && (
        <section className="squircle-card bg-[#121212] border border-emerald-500/40 rounded-2xl p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1.5">
              <MousePointerClick className="w-3.5 h-3.5" aria-hidden="true" />
              Toca la imagen para hacer clic directo en tu PC
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-pressed={screenRightClick}
                onClick={() => setScreenRightClick((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                  screenRightClick
                    ? "bg-amber-500/20 border-amber-400 text-amber-300"
                    : "bg-black border-zinc-800 text-zinc-400"
                }`}
              >
                {screenRightClick ? "Clic Der." : "Clic Izq."}
              </button>
              <label htmlFor="spy-fps-select" className="visually-hidden">
                Cuadros por segundo de vista previa
              </label>
              <select
                id="spy-fps-select"
                value={serverState.screen?.fps || 8}
                onChange={(e) => send("system", "screen_config", { fps: Number(e.target.value) })}
                className="bg-black border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-300"
              >
                <option value={5}>5 FPS</option>
                <option value={8}>8 FPS</option>
                <option value={12}>12 FPS</option>
                <option value={15}>15 FPS</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            aria-label="Hacer clic en la vista previa en vivo de la pantalla del PC"
            onClick={handleScreenTap}
            className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800 cursor-crosshair flex items-center justify-center p-0"
          >
            {serverState.screenFrame?.dataUrl ? (
              <img
                src={serverState.screenFrame.dataUrl}
                alt="Vista actual del escritorio de la PC"
                width="960"
                height="540"
                draggable={false}
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : (
              <span className="text-xs text-zinc-500">Recibiendo transmisión de pantalla...</span>
            )}
          </button>
        </section>
      )}

      {/* Expandable Remote Keyboard Drawer */}
      {showKeyboard && (
        <section className="squircle-card bg-[#121212] border border-zinc-800 rounded-2xl p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <label htmlFor="live-key-input" className="visually-hidden">
              Escritura tecla por tecla en vivo
            </label>
            <input
              id="live-key-input"
              ref={liveInputRef}
              type="text"
              value={liveValue}
              onChange={handleLiveInputChange}
              onCompositionEnd={handleLiveInputChange}
              onKeyDown={handleLiveKeyDown}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Vivo..."
              className="w-24 bg-black border border-cyan-500/50 rounded-xl px-3 py-2 text-xs text-cyan-300"
            />
            <form action="/type" method="post" onSubmit={sendComposeText} className="flex-1 flex gap-1.5 min-w-0">
              <label htmlFor="compose-key-input" className="visually-hidden">
                Escribir frase completa para enviar a la PC
              </label>
              <input
                id="compose-key-input"
                name="text"
                type="text"
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                enterKeyHint="send"
                placeholder="Frase, ñ, acentos o emojis..."
                className="flex-1 min-w-0 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500"
              />
              <button
                type="submit"
                aria-label="Enviar texto a la PC"
                className="bg-cyan-500 active:bg-cyan-400 text-black rounded-xl px-3 flex items-center justify-center"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
          </div>
          <p className="text-[10px] text-zinc-400 px-0.5">
            El campo izquierdo refleja cada tecla al instante; el derecho envía frases completas con acentos o emojis.
          </p>

          {/* Special Keys Bar with scroll-driven edge-fade masks */}
          <div className="h-scroller gap-1.5 pb-1" role="group" aria-label="Teclas especiales">
            {SPECIAL_KEYS.map((item) => (
              <button
                key={item.label}
                type="button"
                aria-label={item.aria || item.label}
                onClick={() => {
                  vibrate?.(10);
                  if (item.shortcut) {
                    send("system", "shortcut", { name: item.shortcut });
                  } else {
                    send("system", "key_press", { key: item.key });
                  }
                }}
                className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-zinc-200"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Quick Shortcuts Row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {QUICK_SHORTCUTS.map((sc) => {
              const Icon = sc.icon;
              return (
                <button
                  key={sc.name}
                  type="button"
                  onClick={() => {
                    vibrate?.(12);
                    send("system", "shortcut", { name: sc.name });
                  }}
                  className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2 px-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-300"
                >
                  <Icon className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                  <span>{sc.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Low-Latency Touchpad Surface (canvas-like multi-axis input surface) */}
      <section className="space-y-2.5">
        <div
          role="application"
          aria-label="Superficie táctil del touchpad virtual"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onMouseDown={handleMouseDownPad}
          onMouseMove={handleMouseMovePad}
          onMouseUp={handleMouseUpPad}
          style={{ touchAction: "none" }}
          className={`squircle-card relative w-full h-72 sm:h-80 rounded-3xl bg-[#0b0b0e] border transition-colors flex flex-col items-center justify-center select-none overflow-clip ${
            draggingIndicator ? "border-cyan-400 shadow-inner shadow-cyan-500/20" : "border-zinc-800/90"
          }`}
        >
          <div className="pointer-events-none text-center px-6 space-y-1 opacity-55">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-zinc-300">
              {draggingIndicator ? "Arrastrando elemento..." : "Touchpad Multi-Touch"}
            </h2>
            <p className="text-[11px] text-zinc-400">
              1 dedo: Mover / Clic • 2 dedos: Clic der. / Scroll / Pellizcar Zoom • Doble toque + mover: Arrastrar
            </p>
          </div>
        </div>

        {/* Physical Virtual Mouse Buttons */}
        <div className="grid grid-cols-5 gap-2">
          <button
            type="button"
            onClick={() => {
              vibrate?.(12);
              send("system", "mouse_click", { button: "left", count: 1 });
            }}
            className="col-span-2 bg-[#121212] active:bg-zinc-800 border border-zinc-800 rounded-2xl py-3.5 text-xs font-semibold text-zinc-200"
          >
            Clic Izquierdo
          </button>

          <button
            type="button"
            aria-label="Central (abrir enlace en pestaña nueva)"
            onClick={() => {
              vibrate?.(14);
              send("system", "mouse_click", { button: "middle", count: 1 });
            }}
            className="col-span-1 bg-[#121212] active:bg-zinc-800 border border-zinc-800 rounded-2xl py-3.5 text-[11px] font-semibold text-cyan-400"
          >
            Central
          </button>

          <button
            type="button"
            onClick={() => {
              vibrate?.(14);
              send("system", "mouse_click", { button: "right", count: 1 });
            }}
            className="col-span-2 bg-[#121212] active:bg-zinc-800 border border-zinc-800 rounded-2xl py-3.5 text-xs font-semibold text-zinc-200"
          >
            Clic Derecho
          </button>
        </div>

        {/* Backspace & Enter quick triggers */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              vibrate?.(10);
              send("system", "key_press", { key: "backspace" });
            }}
            className="bg-[#121212] active:bg-zinc-800 border border-zinc-800 rounded-2xl py-2.5 flex items-center justify-center gap-2 text-xs text-zinc-300"
          >
            <Delete className="w-4 h-4 text-zinc-400" aria-hidden="true" />
            <span>Borrar (Backspace)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              vibrate?.(12);
              send("system", "key_press", { key: "enter" });
            }}
            className="bg-[#121212] active:bg-zinc-800 border border-zinc-800 rounded-2xl py-2.5 flex items-center justify-center gap-2 text-xs text-cyan-300 font-semibold"
          >
            <CornerDownLeft className="w-4 h-4" aria-hidden="true" />
            <span>Enter</span>
          </button>
        </div>
      </section>
    </div>
  );
}
