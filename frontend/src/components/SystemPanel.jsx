import React, { useEffect, useRef, useState } from "react";
import {
  Volume2,
  VolumeX,
  ClipboardCopy,
  ClipboardPaste,
  Check,
  Sparkles,
  Plus,
  Trash2,
  Timer,
  Lock,
  Moon,
  RotateCcw,
  Power,
  Sun,
  Vibrate,
  LogOut,
  Sliders,
  QrCode
} from "lucide-react";

const POWER_ACTIONS = [
  {
    id: "lock",
    label: "Bloquear",
    title: "¿Bloquear la pantalla de tu PC?",
    desc: "Se cerrará la vista del escritorio hasta que ingreses tu contraseña de Windows/macOS.",
    icon: Lock,
    accent: "text-cyan-400"
  },
  {
    id: "suspend",
    label: "Suspender",
    title: "¿Suspender la computadora ahora?",
    desc: "La PC entrará en modo de bajo consumo y se desconectará el control remoto.",
    icon: Moon,
    accent: "text-indigo-400"
  },
  {
    id: "restart",
    label: "Reiniciar",
    title: "¿Reiniciar la computadora?",
    desc: "Se cerrarán las aplicaciones abiertas y el sistema se reiniciará en 5 segundos.",
    icon: RotateCcw,
    accent: "text-amber-400"
  },
  {
    id: "shutdown",
    label: "Apagar",
    title: "¿Apagar la computadora?",
    desc: "La PC se apagará por completo en 5 segundos. Guarda tus documentos antes de continuar.",
    icon: Power,
    accent: "text-rose-400"
  }
];

function formatCountdown(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}

// Synchronous fallback for copying over non-HTTPS LAN origins (http://192.168.x.x:8765)
function legacyCopy(text) {
  const previousFocus = document.activeElement;
  const field = Object.assign(document.createElement("textarea"), { value: text });
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;inset-block-start:0;opacity:0";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } finally {
    field.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

export default function SystemPanel({
  serverState,
  send,
  vibrate,
  showToast,
  wakeLockSupported,
  wakeLockEnabled,
  toggleWakeLock,
  hapticsEnabled,
  toggleHaptics,
  onLogout
}) {
  const { audio, mouse, macros, sleepTimer, clipboardText } = serverState;

  const [mobileClipInput, setMobileClipInput] = useState("");
  const [sleepMode, setSleepMode] = useState("suspend");
  const [pendingPower, setPendingPower] = useState(null);

  // Accessible copy button state (per copy-button guide)
  const [copyStatus, setCopyStatus] = useState(null); // 'ok' | 'fail' | null
  const [copyTipText, setCopyTipText] = useState("");
  const lastCopyMsgRef = useRef("");
  const copyTimerRef = useRef(null);

  // Macro creation form state
  const [macroName, setMacroName] = useState("");
  const [macroUrls, setMacroUrls] = useState("");
  const [macroVolume, setMacroVolume] = useState("70");
  const [macroFullscreen, setMacroFullscreen] = useState(false);

  // QR & PIN info state
  const [pairingInfo, setPairingInfo] = useState(null);

  const powerDialogRef = useRef(null);
  const macroDialogRef = useRef(null);
  const qrDialogRef = useRef(null);

  // Fallback for dialog[closedby="any"] light-dismiss in browsers without closedBy (per dialog guide)
  useEffect(() => {
    const dlg = qrDialogRef.current;
    if (!dlg || "closedBy" in HTMLDialogElement.prototype) return undefined;

    let pressedOutside = false;
    const isOutside = (e) => {
      const r = dlg.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onDown = (e) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e) => {
      if (pressedOutside && isOutside(e)) dlg.close();
    };
    dlg.addEventListener("pointerdown", onDown);
    dlg.addEventListener("pointerup", onUp);
    return () => {
      dlg.removeEventListener("pointerdown", onDown);
      dlg.removeEventListener("pointerup", onUp);
    };
  }, []);

  const openPowerConfirm = (actionItem) => {
    vibrate?.(16);
    setPendingPower(actionItem);
    const dlg = powerDialogRef.current;
    if (dlg && !dlg.open) {
      dlg.returnValue = "";
      dlg.showModal();
    }
  };

  const handlePowerDialogClose = () => {
    const dlg = powerDialogRef.current;
    if (!dlg) return;
    const choice = dlg.returnValue;
    dlg.returnValue = "";
    if (choice === "confirm" && pendingPower) {
      vibrate?.([20, 40, 20]);
      send("system", "power_action", { powerAction: pendingPower.id });
    }
    setPendingPower(null);
  };

  const openMacroCreator = () => {
    vibrate?.(12);
    const dlg = macroDialogRef.current;
    if (dlg && !dlg.open) {
      dlg.returnValue = "";
      dlg.showModal();
    }
  };

  const handleSaveMacro = (e) => {
    e.preventDefault();
    if (!macroName.trim()) return;
    const steps = [];
    const volNum = Number(macroVolume);
    if (Number.isFinite(volNum) && macroVolume !== "") {
      steps.push({ type: "set_volume", value: Math.max(0, Math.min(100, volNum)) });
    }
    const urls = macroUrls
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    for (const u of urls) {
      steps.push({ type: "open_url", value: u });
    }
    if (macroFullscreen) {
      steps.push({ type: "delay_ms", value: 900 });
      steps.push({ type: "key", value: "f11" });
    }
    send("system", "macro_save", {
      macro: {
        name: macroName.trim(),
        description: `${urls.length} URL(s) • Vol ${macroVolume}%${macroFullscreen ? " • Pantalla completa" : ""}`,
        steps
      }
    });
    setMacroName("");
    setMacroUrls("");
    macroDialogRef.current?.close();
    showToast?.("Macro guardada", "success");
  };

  const openQrDialog = async () => {
    vibrate?.(12);
    const token = localStorage.getItem("crc_session_token") || "";
    try {
      const res = await fetch(`/api/pairing-info?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const info = await res.json();
        setPairingInfo({ ...info, token });
        const dlg = qrDialogRef.current;
        if (dlg && !dlg.open) {
          dlg.returnValue = "";
          dlg.showModal();
        }
      }
    } catch (_err) {
      showToast?.("No se pudo obtener información del QR", "error");
    }
  };

  const sendMobileClipboardToPc = async (autoPaste = false) => {
    vibrate?.(12);
    let textToSend = mobileClipInput;
    if (!textToSend && navigator.clipboard?.readText) {
      try {
        textToSend = await navigator.clipboard.readText();
        setMobileClipInput(textToSend);
      } catch (_err) {
        // Requires manual paste into textarea on non-HTTPS LAN origins
      }
    }
    if (!textToSend) {
      showToast?.("Escribe o pega texto en el campo para enviarlo a la PC", "warning");
      return;
    }
    send("system", "clipboard_set", { text: textToSend, autoPaste });
  };

  // Compliant copy action with external role="status" bubble, VoiceOver deduplication & LAN HTTP fallback
  const copyPcClipboardLocally = async () => {
    if (!clipboardText) return;
    vibrate?.(12);
    let ok = false;
    try {
      await navigator.clipboard.writeText(clipboardText);
      ok = true;
    } catch (_err) {
      ok = legacyCopy(clipboardText);
    }

    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    let msg = ok ? "Copiado" : "Error al copiar";
    if (msg === lastCopyMsgRef.current) {
      msg += "\u00A0";
    }
    lastCopyMsgRef.current = msg;

    setCopyStatus(ok ? "ok" : "fail");
    setCopyTipText("");
    requestAnimationFrame(() => setCopyTipText(msg));

    copyTimerRef.current = setTimeout(() => {
      setCopyStatus(null);
      setCopyTipText("");
    }, 2000);
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Master PC Audio */}
      <section className="squircle-card bg-[#121212] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Audio Maestro del Sistema
          </h2>
          <button
            type="button"
            aria-pressed={Boolean(audio.muted)}
            onClick={() => {
              vibrate?.(14);
              send("system", "audio_toggle_mute", {});
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${
              audio.muted
                ? "bg-rose-500/20 border-rose-500/60 text-rose-300"
                : "bg-black border-zinc-800 text-zinc-200"
            }`}
          >
            {audio.muted ? <VolumeX className="w-4 h-4" aria-hidden="true" /> : <Volume2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />}
            <span>Mute PC</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="sys-master-volume" className="visually-hidden">
            Volumen maestro del sistema
          </label>
          <input
            id="sys-master-volume"
            type="range"
            min={0}
            max={100}
            value={audio.volume ?? 50}
            onChange={(e) => send("system", "audio_set_volume", { volume: Number(e.target.value) })}
            className="flex-1 cursor-pointer"
          />
          <span className="text-sm font-mono font-bold text-cyan-300 w-11 text-right">{audio.volume}%</span>
        </div>
      </section>

      {/* Bidirectional Clipboard */}
      <section className="squircle-card bg-[#121212] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Portapapeles Bidireccional
        </h2>
        <label htmlFor="mobile-clip-textarea" className="block text-xs text-zinc-300 font-medium">
          Texto o URL para enviar a tu PC
        </label>
        <textarea
          id="mobile-clip-textarea"
          name="clipboardText"
          rows={2}
          value={mobileClipInput}
          onChange={(e) => setMobileClipInput(e.target.value)}
          placeholder="Pega aquí un enlace o texto de tu celular..."
          className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => sendMobileClipboardToPc(false)}
            className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 px-3 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5"
          >
            <ClipboardCopy className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Enviar a PC</span>
          </button>
          <button
            type="button"
            onClick={() => sendMobileClipboardToPc(true)}
            className="bg-cyan-500/20 active:bg-cyan-500/30 border border-cyan-500/40 rounded-xl py-2.5 px-3 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5"
          >
            <ClipboardPaste className="w-4 h-4" aria-hidden="true" />
            <span>Enviar y Pegar</span>
          </button>
        </div>

        <div className="pt-2 border-t border-zinc-800/80 space-y-2">
          <button
            type="button"
            onClick={() => {
              vibrate?.(12);
              send("system", "clipboard_get", {});
            }}
            className="w-full bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 px-3 text-xs font-semibold text-amber-300"
          >
            Traer portapapeles actual de la PC
          </button>
          {clipboardText && (
            <div className="bg-black border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <code className="text-xs text-zinc-300 line-clamp-2 flex-1">{clipboardText}</code>
              {/* Copy Button + External Live Region Bubble (per copy-button guide) */}
              <span className="copy-wrap shrink-0">
                <button
                  type="button"
                  {...(copyStatus === "ok" ? { "data-copied": "" } : copyStatus === "fail" ? { "data-failed": "" } : {})}
                  onClick={copyPcClipboardLocally}
                  className="bg-zinc-800 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-cyan-300 inline-flex items-center gap-1"
                >
                  {copyStatus === "ok" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <ClipboardCopy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>Copiar</span>
                </button>
                <span className="tip" role="status">
                  {copyTipText}
                </span>
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Customizable Macros & Scenes */}
      <section className="squircle-card bg-[#121212] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            Macros y Escenas
          </h2>
          <button
            type="button"
            onClick={openMacroCreator}
            className="bg-black border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-cyan-300 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Crear Macro</span>
          </button>
        </div>

        <ul role="list" className="space-y-2 list-none m-0 p-0">
          {(macros || []).map((macro) => (
            <li
              key={macro.id}
              className="bg-black border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-2"
            >
              <button
                type="button"
                onClick={() => {
                  vibrate?.(16);
                  send("system", "macro_run", { id: macro.id });
                }}
                className="flex-1 text-left min-w-0"
              >
                <p className="text-xs font-bold text-zinc-100">{macro.name}</p>
                {macro.description && (
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">{macro.description}</p>
                )}
              </button>
              <button
                type="button"
                aria-label={`Eliminar macro ${macro.name}`}
                onClick={() => {
                  vibrate?.(12);
                  send("system", "macro_delete", { id: macro.id });
                }}
                className="p-2 rounded-xl text-zinc-500 hover:text-rose-400"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Sleep Timer & Protected Power Controls */}
      <section className="squircle-card bg-[#121212] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            Temporizador (Sleep Timer)
          </h2>
          <label htmlFor="sleep-mode-select" className="visually-hidden">
            Acción al finalizar el temporizador
          </label>
          <select
            id="sleep-mode-select"
            value={sleepMode}
            onChange={(e) => setSleepMode(e.target.value)}
            className="bg-black border border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-zinc-200"
          >
            <option value="suspend">Suspender PC</option>
            <option value="shutdown">Apagar PC</option>
            <option value="lock">Bloquear PC</option>
          </select>
        </div>

        {sleepTimer?.active ? (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-amber-300">
                {sleepTimer.mode === "shutdown" ? "Apagado" : "Suspensión"} en {formatCountdown(sleepTimer.remainingSeconds)}
              </p>
              <p className="text-[11px] text-zinc-400">Ejecutándose en segundo plano en la PC</p>
            </div>
            <button
              type="button"
              onClick={() => {
                vibrate?.(12);
                send("system", "sleep_timer_cancel", {});
              }}
              className="bg-black border border-amber-500/40 rounded-xl px-3 py-1.5 text-xs font-semibold text-amber-300"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {[15, 30, 60, 90].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => {
                  vibrate?.(14);
                  send("system", "sleep_timer_set", { minutes: mins, mode: sleepMode });
                }}
                className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 text-xs font-semibold text-zinc-200"
              >
                {mins} min
              </button>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800/80">
          <span className="block text-[11px] text-zinc-400 mb-2">Energía (con confirmación de seguridad)</span>
          <div className="grid grid-cols-4 gap-2">
            {POWER_ACTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openPowerConfirm(item)}
                  className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 px-1.5 flex flex-col items-center gap-1 text-xs text-zinc-200"
                >
                  <Icon className={`w-4 h-4 ${item.accent}`} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Touchpad & Mobile App Preferences with Native HTML Switch Controls */}
      <section className="squircle-card bg-[#121212] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
          Sensibilidad y Ajustes Móviles
        </h2>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="sens-range" className="text-zinc-300">Sensibilidad del cursor</label>
            <span className="font-mono text-cyan-300">{Number(mouse.sensitivity || 1.6).toFixed(1)}x</span>
          </div>
          <input
            id="sens-range"
            type="range"
            min={0.4}
            max={4.0}
            step={0.1}
            value={mouse.sensitivity || 1.6}
            onChange={(e) => send("system", "mouse_settings", { sensitivity: Number(e.target.value) })}
            className="w-full"
          />
        </div>

        <label htmlFor="sw-invert-scroll" className="flex items-center justify-between text-xs text-zinc-200 cursor-pointer py-1">
          <span>Invertir dirección de scroll (Natural)</span>
          <input
            id="sw-invert-scroll"
            type="checkbox"
            {...({ switch: "" })}
            checked={Boolean(mouse.invert_scroll)}
            onChange={(e) => send("system", "mouse_settings", { invert_scroll: e.target.checked })}
          />
        </label>

        {wakeLockSupported && (
          <label htmlFor="sw-wakelock" className="flex items-center justify-between text-xs text-zinc-200 cursor-pointer py-1">
            <span className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
              Mantener pantalla encendida (Wake Lock)
            </span>
            <input
              id="sw-wakelock"
              type="checkbox"
              {...({ switch: "" })}
              checked={wakeLockEnabled}
              onChange={(e) => toggleWakeLock(e.target.checked)}
            />
          </label>
        )}

        <label htmlFor="sw-haptics" className="flex items-center justify-between text-xs text-zinc-200 cursor-pointer py-1">
          <span className="flex items-center gap-2">
            <Vibrate className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            Respuesta háptica al tocar botones
          </span>
          <input
            id="sw-haptics"
            type="checkbox"
            {...({ switch: "" })}
            checked={hapticsEnabled}
            onChange={(e) => toggleHaptics(e.target.checked)}
          />
        </label>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={openQrDialog}
            className="bg-black border border-zinc-800 rounded-xl py-2.5 px-3 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5"
          >
            <QrCode className="w-4 h-4" aria-hidden="true" />
            <span>Ver QR / PIN</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="bg-rose-950/40 border border-rose-900/50 rounded-xl py-2.5 px-3 text-xs font-semibold text-rose-300 flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </section>

      {/* Native Confirmation Modal Dialog for Destructive Power Actions */}
      <dialog
        ref={powerDialogRef}
        aria-labelledby="power-dialog-title"
        onClose={handlePowerDialogClose}
      >
        <h1 id="power-dialog-title" className="text-base font-bold text-zinc-100 mb-1.5">
          {pendingPower?.title || "¿Confirmar acción de energía?"}
        </h1>
        <p className="text-xs text-zinc-400 mb-5">
          {pendingPower?.desc}
        </p>
        <form method="dialog" className="grid grid-cols-2 gap-2.5">
          <button
            value="cancel"
            autoFocus
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl py-2.5 text-xs font-semibold"
          >
            Cancelar
          </button>
          <button
            value="confirm"
            className="bg-rose-600 hover:bg-rose-500 text-white rounded-xl py-2.5 text-xs font-bold"
          >
            Confirmar
          </button>
        </form>
      </dialog>

      {/* Native Modal Dialog for Creating Custom Macros */}
      <dialog ref={macroDialogRef} aria-labelledby="macro-dialog-title">
        <h1 id="macro-dialog-title" className="text-base font-bold text-zinc-100 mb-3">
          Nueva Macro Personalizada
        </h1>
        <form method="post" action="/macro" onSubmit={handleSaveMacro} className="space-y-3">
          <div>
            <label htmlFor="macro-name" className="block text-xs text-zinc-300 mb-1">
              Nombre de la escena <span aria-hidden="true">*</span>
            </label>
            <input
              id="macro-name"
              name="macroName"
              type="text"
              required
              value={macroName}
              onChange={(e) => setMacroName(e.target.value)}
              placeholder="Ej. Modo Estudio"
              className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
            />
          </div>
          <div>
            <label htmlFor="macro-urls" className="block text-xs text-zinc-300 mb-1">
              URLs a abrir (separadas por coma o salto de línea)
            </label>
            <textarea
              id="macro-urls"
              name="macroUrls"
              rows={2}
              value={macroUrls}
              onChange={(e) => setMacroUrls(e.target.value)}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://youtube.com, https://notion.so"
              className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="macro-vol" className="text-xs text-zinc-300">
              Volumen PC (0 a 100%)
            </label>
            <input
              id="macro-vol"
              name="macroVol"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{1,3}"
              value={macroVolume}
              onChange={(e) => setMacroVolume(e.target.value.replace(/\D/g, "").slice(0, 3))}
              className="w-20 bg-black border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-center font-mono text-zinc-100"
            />
          </div>
          <label htmlFor="macro-fs" className="flex items-center justify-between gap-2 text-xs text-zinc-300 cursor-pointer">
            <span>Activar pantalla completa (F11)</span>
            <input
              id="macro-fs"
              name="macroFullscreen"
              type="checkbox"
              {...({ switch: "" })}
              checked={macroFullscreen}
              onChange={(e) => setMacroFullscreen(e.target.checked)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => macroDialogRef.current?.close()}
              className="bg-zinc-800 rounded-xl py-2.5 text-xs font-semibold text-zinc-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-cyan-500 text-black rounded-xl py-2.5 text-xs font-bold"
            >
              Guardar Macro
            </button>
          </div>
        </form>
      </dialog>

      {/* Light-Dismissible Informational QR Modal Dialog (closedby="any") */}
      <dialog
        ref={qrDialogRef}
        {...({ closedby: "any" })}
        aria-labelledby="qr-dialog-title"
      >
        <h1 id="qr-dialog-title" className="text-base font-bold text-zinc-100 text-center mb-1">
          Emparejar otro celular
        </h1>
        {pairingInfo && (
          <div className="space-y-3 text-center">
            <p className="text-xs text-cyan-400 font-mono">
              http://{pairingInfo.ip}:{pairingInfo.port}
            </p>
            <img
              src={`/api/qr.png?token=${encodeURIComponent(pairingInfo.token)}`}
              alt="Código QR para emparejar otro teléfono en la red Wi-Fi"
              width="192"
              height="192"
              className="w-48 h-48 mx-auto rounded-2xl border border-zinc-800"
            />
            <p className="text-sm font-bold bg-black border border-zinc-800 rounded-xl py-2">
              PIN actual: <span className="text-cyan-300 font-mono">{pairingInfo.pin}</span>
            </p>
          </div>
        )}
        <form method="dialog" className="mt-4">
          <button
            value="close"
            autoFocus
            className="w-full bg-cyan-500 text-black font-bold rounded-xl py-2.5 text-xs"
          >
            Cerrar
          </button>
        </form>
      </dialog>
    </div>
  );
}
