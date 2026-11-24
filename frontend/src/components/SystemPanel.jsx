import React, { useRef, useState } from "react";
import QRCode from "qrcode";
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
    label: "Lock",
    title: "Lock your PC screen?",
    desc: "Your desktop will lock immediately until you enter your OS password.",
    icon: Lock,
    accent: "text-cyan-400"
  },
  {
    id: "suspend",
    label: "Sleep",
    title: "Put your PC to sleep now?",
    desc: "Your computer will enter low-power sleep mode and disconnect the remote session.",
    icon: Moon,
    accent: "text-indigo-400"
  },
  {
    id: "restart",
    label: "Restart",
    title: "Restart your computer?",
    desc: "Open applications will close and the system will reboot in 5 seconds.",
    icon: RotateCcw,
    accent: "text-amber-400"
  },
  {
    id: "shutdown",
    label: "Shut Down",
    title: "Shut down your computer?",
    desc: "Your PC will power off completely in 5 seconds. Save any open work before confirming.",
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

function ToggleRow({ icon: Icon, iconClass = "", label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="flex items-center gap-2 text-xs text-zinc-200">
        {Icon && <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} aria-hidden="true" />}
        <span>{label}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          checked ? "bg-cyan-500 border-cyan-400" : "bg-zinc-800 border-zinc-700"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function SystemPanel({
  serverState,
  sessionConfig,
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
  const [copiedLocal, setCopiedLocal] = useState(false);

  const [macroName, setMacroName] = useState("");
  const [macroUrls, setMacroUrls] = useState("");
  const [macroVolume, setMacroVolume] = useState("70");
  const [macroFullscreen, setMacroFullscreen] = useState(false);

  const [pairingInfo, setPairingInfo] = useState(null);

  const powerDialogRef = useRef(null);
  const macroDialogRef = useRef(null);
  const qrDialogRef = useRef(null);

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
        description: `${urls.length} URL(s) • Vol ${macroVolume}%${macroFullscreen ? " • Fullscreen" : ""}`,
        steps
      }
    });
    setMacroName("");
    setMacroUrls("");
    macroDialogRef.current?.close();
    showToast?.("Macro saved", "success");
  };

  const openQrDialog = async () => {
    vibrate?.(12);
    if (sessionConfig?.mode === "webrtc" && sessionConfig.roomCode) {
      try {
        const base = `${window.location.origin}${window.location.pathname}`;
        const shareUrl = `${base}?room=${encodeURIComponent(sessionConfig.roomCode)}&key=${encodeURIComponent(sessionConfig.key || "")}`;
        const qrDataUrl = await QRCode.toDataURL(shareUrl, {
          width: 220,
          margin: 1,
          color: { dark: "#09090b", light: "#ffffff" }
        });
        const r = String(sessionConfig.roomCode);
        setPairingInfo({
          mode: "webrtc",
          qrDataUrl,
          roomFormatted: r.length === 8 ? `${r.slice(0, 4)}-${r.slice(4)}` : r
        });
        const dlg = qrDialogRef.current;
        if (dlg && !dlg.open) {
          dlg.returnValue = "";
          dlg.showModal();
        }
      } catch (_err) {
        showToast?.("Failed to generate QR code", "error");
      }
      return;
    }

    const token = sessionConfig?.token || localStorage.getItem("crc_session_token") || "";
    try {
      const res = await fetch(`./api/pairing-info?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const info = await res.json();
        setPairingInfo({ ...info, mode: "ws", token });
        const dlg = qrDialogRef.current;
        if (dlg && !dlg.open) {
          dlg.returnValue = "";
          dlg.showModal();
        }
      }
    } catch (_err) {
      showToast?.("Failed to load QR pairing info", "error");
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
        // Requires manual paste on non-HTTPS origins
      }
    }
    if (!textToSend) {
      showToast?.("Type or paste text into the box first", "warning");
      return;
    }
    send("system", "clipboard_set", { text: textToSend, autoPaste });
  };

  const copyPcClipboardLocally = async () => {
    if (!clipboardText) return;
    vibrate?.(12);
    try {
      await navigator.clipboard.writeText(clipboardText);
      setCopiedLocal(true);
      setTimeout(() => setCopiedLocal(false), 1800);
      showToast?.("Copied to phone clipboard", "success");
    } catch (_err) {
      showToast?.("Select the text directly to copy", "info");
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Master System Audio */}
      <section className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            System Master Audio
          </h2>
          <button
            type="button"
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
            <span>{audio.muted ? "Muted" : "Mute"}</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            aria-label="System master volume"
            value={audio.volume ?? 50}
            onChange={(e) => send("system", "audio_set_volume", { volume: Number(e.target.value) })}
            className="flex-1 cursor-pointer"
          />
          <span className="text-sm font-mono font-bold text-cyan-300 w-11 text-right">{audio.volume}%</span>
        </div>
      </section>

      {/* Two-Way Clipboard */}
      <section className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Two-Way Clipboard
        </h2>
        <textarea
          rows={2}
          value={mobileClipInput}
          onChange={(e) => setMobileClipInput(e.target.value)}
          aria-label="Text or URL to send to your PC"
          placeholder="Paste a link or snippet from your phone to send to your PC..."
          className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => sendMobileClipboardToPc(false)}
            className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 px-3 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5"
          >
            <ClipboardCopy className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Send to PC</span>
          </button>
          <button
            type="button"
            onClick={() => sendMobileClipboardToPc(true)}
            className="bg-cyan-500/20 active:bg-cyan-500/30 border border-cyan-500/40 rounded-xl py-2.5 px-3 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5"
          >
            <ClipboardPaste className="w-4 h-4" aria-hidden="true" />
            <span>Send & Paste</span>
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
            Fetch current PC clipboard
          </button>
          {clipboardText && (
            <div className="bg-black border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <code className="text-xs text-zinc-300 line-clamp-2 flex-1">{clipboardText}</code>
              <button
                type="button"
                onClick={copyPcClipboardLocally}
                className="bg-zinc-800 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-cyan-300 inline-flex items-center gap-1 shrink-0"
              >
                {copiedLocal ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <ClipboardCopy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{copiedLocal ? "Copied" : "Copy"}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Customizable Macros & Scenes */}
      <section className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            Macros & Scenes
          </h2>
          <button
            type="button"
            onClick={openMacroCreator}
            className="bg-black border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-cyan-300 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Macro</span>
          </button>
        </div>

        <div className="space-y-2">
          {(macros || []).map((macro) => (
            <div
              key={macro.id}
              className="w-full bg-black border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-2"
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
                aria-label={`Delete macro ${macro.name}`}
                onClick={() => {
                  vibrate?.(12);
                  send("system", "macro_delete", { id: macro.id });
                }}
                className="p-2 rounded-xl text-zinc-500 hover:text-rose-400 shrink-0"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Sleep Timer & Protected Power Controls */}
      <section className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            Sleep Timer
          </h2>
          <select
            aria-label="Action when timer finishes"
            value={sleepMode}
            onChange={(e) => setSleepMode(e.target.value)}
            className="bg-black border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200"
          >
            <option value="suspend">Sleep PC / Pause</option>
            <option value="shutdown">Shut Down PC</option>
            <option value="lock">Lock PC</option>
          </select>
        </div>

        {sleepTimer?.active ? (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-amber-300">
                {sleepTimer.mode === "shutdown"
                  ? "Shutting down"
                  : sleepTimer.mode === "lock"
                    ? "Locking"
                    : sleepTimer.mode === "pause_media"
                      ? "Pausing media"
                      : "Sleeping"}{" "}
                in {formatCountdown(sleepTimer.remainingSeconds)}
              </p>
              <p className="text-[11px] text-zinc-400">Running automatically in the background</p>
            </div>
            <button
              type="button"
              onClick={() => {
                vibrate?.(12);
                send("system", "sleep_timer_cancel", {});
              }}
              className="bg-black border border-amber-500/40 rounded-xl px-3 py-1.5 text-xs font-semibold text-amber-300 shrink-0"
            >
              Cancel
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
          <span className="block text-[11px] text-zinc-400 mb-2">Power actions (confirmation protected)</span>
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

      {/* Touchpad & Mobile App Preferences */}
      <section className="bg-[#121212] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
          Sensitivity & Mobile Preferences
        </h2>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="sens-range" className="text-zinc-300">Cursor sensitivity</label>
            <span className="font-mono text-cyan-300">{Number(mouse.sensitivity || 1.6).toFixed(1)}x</span>
          </div>
          <input
            id="sens-range"
            type="range"
            min={0.4}
            max={4.0}
            step={0.1}
            value={mouse.sensitivity || 1.6}
            onChange={(e) => send("system", "mouse_update_settings", { sensitivity: Number(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <ToggleRow
          label="Invert scroll direction (Natural)"
          checked={Boolean(mouse.invert_scroll)}
          onChange={(val) => {
            vibrate?.(8);
            send("system", "mouse_update_settings", { invert_scroll: val });
          }}
        />

        {wakeLockSupported && (
          <ToggleRow
            icon={Sun}
            iconClass="text-amber-400"
            label="Keep phone screen awake (Wake Lock)"
            checked={wakeLockEnabled}
            onChange={(val) => {
              vibrate?.(8);
              toggleWakeLock(val);
            }}
          />
        )}

        <ToggleRow
          icon={Vibrate}
          iconClass="text-cyan-400"
          label="Haptic vibration on button press"
          checked={hapticsEnabled}
          onChange={(val) => toggleHaptics(val)}
        />

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={openQrDialog}
            className="bg-black border border-zinc-800 rounded-xl py-2.5 px-3 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5"
          >
            <QrCode className="w-4 h-4" aria-hidden="true" />
            <span>View QR / PIN</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="bg-rose-950/40 border border-rose-900/50 rounded-xl py-2.5 px-3 text-xs font-semibold text-rose-300 flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </section>

      {/* Native Confirmation Modal Dialog for Power Actions */}
      <dialog
        ref={powerDialogRef}
        aria-labelledby="power-dialog-title"
        onClose={handlePowerDialogClose}
      >
        <h3 id="power-dialog-title" className="text-base font-bold text-zinc-100 mb-1.5">
          {pendingPower?.title || "Confirm power action?"}
        </h3>
        <p className="text-xs text-zinc-400 mb-5">
          {pendingPower?.desc}
        </p>
        <form method="dialog" className="grid grid-cols-2 gap-2.5">
          <button
            value="cancel"
            autoFocus
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl py-2.5 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            value="confirm"
            className="bg-rose-600 hover:bg-rose-500 text-white rounded-xl py-2.5 text-xs font-bold"
          >
            Confirm
          </button>
        </form>
      </dialog>

      {/* Native Modal Dialog for Creating Custom Macros */}
      <dialog ref={macroDialogRef} aria-labelledby="macro-dialog-title">
        <h3 id="macro-dialog-title" className="text-base font-bold text-zinc-100 mb-3">
          New Custom Macro
        </h3>
        <form onSubmit={handleSaveMacro} className="space-y-3">
          <div>
            <label htmlFor="macro-name" className="block text-xs text-zinc-300 mb-1">
              Scene name
            </label>
            <input
              id="macro-name"
              type="text"
              required
              value={macroName}
              onChange={(e) => setMacroName(e.target.value)}
              placeholder="e.g. Study Mode"
              className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
            />
          </div>
          <div>
            <label htmlFor="macro-urls" className="block text-xs text-zinc-300 mb-1">
              URLs to open (comma or newline separated)
            </label>
            <textarea
              id="macro-urls"
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
              Volume (0 to 100%)
            </label>
            <input
              id="macro-vol"
              type="text"
              inputMode="numeric"
              value={macroVolume}
              onChange={(e) => setMacroVolume(e.target.value.replace(/\D/g, "").slice(0, 3))}
              className="w-20 bg-black border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-center font-mono text-zinc-100"
            />
          </div>
          <ToggleRow
            label="Toggle browser fullscreen (F11)"
            checked={macroFullscreen}
            onChange={(val) => setMacroFullscreen(val)}
          />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => macroDialogRef.current?.close()}
              className="bg-zinc-800 rounded-xl py-2.5 text-xs font-semibold text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-cyan-500 text-black rounded-xl py-2.5 text-xs font-bold"
            >
              Save Macro
            </button>
          </div>
        </form>
      </dialog>

      {/* Informational QR Modal Dialog */}
      <dialog ref={qrDialogRef} aria-labelledby="qr-dialog-title">
        <h3 id="qr-dialog-title" className="text-base font-bold text-zinc-100 text-center mb-2">
          Pair Another Phone
        </h3>
        {pairingInfo && (
          <div className="space-y-3 text-center">
            {pairingInfo.mode === "webrtc" ? (
              <>
                <p className="text-xs text-cyan-400 font-mono">
                  Extension Room: {pairingInfo.roomFormatted}
                </p>
                <img
                  src={pairingInfo.qrDataUrl}
                  alt="QR code to pair another phone directly with your Chrome Extension"
                  width="192"
                  height="192"
                  className="w-48 h-48 mx-auto rounded-2xl border border-zinc-800"
                />
                <p className="text-xs text-zinc-400">
                  Scan from another phone to share this Chrome session instantly
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-cyan-400 font-mono">
                  http://{pairingInfo.ip}:{pairingInfo.port}
                </p>
                <img
                  src={`./api/qr.png?token=${encodeURIComponent(pairingInfo.token)}`}
                  alt="QR code to pair another phone on your Wi-Fi network"
                  width="192"
                  height="192"
                  className="w-48 h-48 mx-auto rounded-2xl border border-zinc-800"
                />
                <p className="text-sm font-bold bg-black border border-zinc-800 rounded-xl py-2">
                  Current PIN: <span className="text-cyan-300 font-mono">{pairingInfo.pin}</span>
                </p>
              </>
            )}
          </div>
        )}
        <form method="dialog" className="mt-4">
          <button
            value="close"
            autoFocus
            className="w-full bg-cyan-500 text-black font-bold rounded-xl py-2.5 text-xs"
          >
            Close
          </button>
        </form>
      </dialog>
    </div>
  );
}
