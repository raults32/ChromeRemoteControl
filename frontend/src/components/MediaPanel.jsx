import React, { useEffect, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  FastForward,
  Subtitles,
  Maximize,
  PictureInPicture2,
  RectangleHorizontal,
  Volume2,
  VolumeX,
  MonitorSpeaker,
  Tv
} from "lucide-react";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatSeconds(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MediaPanel({ serverState, send, vibrate }) {
  const { media, audio } = serverState;
  const [scrubValue, setScrubValue] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  useEffect(() => {
    if (!isScrubbing) {
      setScrubValue(media.currentTime || 0);
    }
  }, [media.currentTime, isScrubbing]);

  const fireMedia = (action, payload = {}) => {
    vibrate?.(14);
    send("media", action, payload);
  };

  const commitScrub = (val) => {
    const num = Number(val);
    setIsScrubbing(false);
    setScrubValue(num);
    fireMedia("seek_to", { time: num });
  };

  const duration = media.duration > 0 ? media.duration : 0;

  return (
    <div className="space-y-4 pb-6">
      {/* Now Playing Header & Interactive Scrubber */}
      <section className="squircle-card bg-[#121212] border border-zinc-800/80 rounded-3xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-400 mb-1">
              <Tv className="w-3.5 h-3.5" aria-hidden="true" />
              {media.domain || "Reproductor Multimedia"}
            </span>
            <h2 className="text-base font-bold text-zinc-100 leading-snug line-clamp-2">
              {media.title || "Reproduce un video en YouTube, Netflix, Twitch o HTML5"}
            </h2>
            {media.artist && <p className="text-xs text-zinc-400 mt-0.5 truncate">{media.artist}</p>}
          </div>
        </div>

        {/* Skip Intro / Ad Smart Button */}
        <button
          type="button"
          onClick={() => fireMedia("skip_intro")}
          className={`w-full rounded-2xl py-2.5 px-4 font-semibold text-xs flex items-center justify-center gap-2 border transition-colors ${
            media.canSkipAd
              ? "bg-amber-400 text-black border-amber-300 shadow-lg shadow-amber-500/20"
              : "bg-black text-zinc-300 border-zinc-800 active:bg-zinc-900"
          }`}
        >
          <FastForward className="w-4 h-4" aria-hidden="true" />
          <span>{media.canSkipAd ? media.skipLabel || "Saltar Intro / Anuncio" : "Saltar Intro / Anuncio"}</span>
        </button>

        {/* Interactive Scrubber with explicit associated <label> */}
        <div className="space-y-1 pt-1">
          <label htmlFor="video-scrubber" className="visually-hidden">
            Posición de reproducción del video
          </label>
          <input
            id="video-scrubber"
            type="range"
            min={0}
            max={duration || 100}
            step={1}
            disabled={duration <= 0}
            value={Math.min(scrubValue, duration || 100)}
            onPointerDown={() => setIsScrubbing(true)}
            onChange={(e) => {
              setIsScrubbing(true);
              setScrubValue(Number(e.target.value));
            }}
            onPointerUp={(e) => commitScrub(e.currentTarget.value)}
            onKeyUp={(e) => commitScrub(e.currentTarget.value)}
            className="w-full cursor-pointer"
          />
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>{formatSeconds(isScrubbing ? scrubValue : media.currentTime)}</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>

        {/* Primary Transport Controls (fixed accessible label with aria-pressed per motion guide) */}
        <div className="flex items-center justify-center gap-4 py-1">
          <button
            type="button"
            aria-label="Video anterior"
            onClick={() => fireMedia("prev")}
            className="w-12 h-12 rounded-2xl bg-black active:bg-zinc-800 border border-zinc-800 flex items-center justify-center text-zinc-200"
          >
            <SkipBack className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="Reproducir o pausar video"
            aria-pressed={!media.paused}
            onClick={() => fireMedia("play_pause")}
            className="w-18 h-18 rounded-3xl bg-cyan-500 active:bg-cyan-400 text-black flex items-center justify-center shadow-lg shadow-cyan-500/20"
          >
            {media.paused ? (
              <Play className="w-8 h-8 fill-current ml-0.5" aria-hidden="true" />
            ) : (
              <Pause className="w-8 h-8 fill-current" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            aria-label="Siguiente video"
            onClick={() => fireMedia("next")}
            className="w-12 h-12 rounded-2xl bg-black active:bg-zinc-800 border border-zinc-800 flex items-center justify-center text-zinc-200"
          >
            <SkipForward className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Precision Seek Jumps (-30s, -10s, -5s, +5s, +10s, +30s) */}
        <div className="grid grid-cols-6 gap-1.5 pt-1" role="group" aria-label="Saltos rápidos de tiempo">
          {[-30, -10, -5, 5, 10, 30].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => fireMedia("seek_relative", { delta: sec })}
              className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 text-xs font-mono font-semibold text-zinc-200"
            >
              {sec > 0 ? `+${sec}s` : `${sec}s`}
            </button>
          ))}
        </div>
      </section>

      {/* Video View & Subtitles Options */}
      <section className="squircle-card bg-[#121212] border border-zinc-800/80 rounded-2xl p-3.5 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Opciones de Reproductor
        </h2>
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            aria-pressed={Boolean(media.captionsEnabled)}
            onClick={() => fireMedia("captions")}
            className={`rounded-xl py-2.5 px-2 border flex flex-col items-center gap-1 text-xs ${
              media.captionsEnabled
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                : "bg-black border-zinc-800 text-zinc-300"
            }`}
          >
            <Subtitles className="w-5 h-5" aria-hidden="true" />
            <span>Subtítulos</span>
          </button>

          <button
            type="button"
            onClick={() => fireMedia("fullscreen")}
            className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 px-2 flex flex-col items-center gap-1 text-xs text-zinc-300"
          >
            <Maximize className="w-5 h-5 text-emerald-400" aria-hidden="true" />
            <span>Completa</span>
          </button>

          <button
            type="button"
            onClick={() => fireMedia("theater")}
            className="bg-black active:bg-zinc-800 border border-zinc-800 rounded-xl py-2.5 px-2 flex flex-col items-center gap-1 text-xs text-zinc-300"
          >
            <RectangleHorizontal className="w-5 h-5 text-blue-400" aria-hidden="true" />
            <span>Teatro</span>
          </button>

          <button
            type="button"
            aria-pressed={Boolean(media.pipActive)}
            onClick={() => fireMedia("pip")}
            className={`rounded-xl py-2.5 px-2 border flex flex-col items-center gap-1 text-xs ${
              media.pipActive
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                : "bg-black border-zinc-800 text-zinc-300"
            }`}
          >
            <PictureInPicture2 className="w-5 h-5 text-purple-400" aria-hidden="true" />
            <span>PiP</span>
          </button>
        </div>

        {/* Playback Speed Selector */}
        <div>
          <span className="block text-[11px] text-zinc-400 mb-1.5">Velocidad de reproducción</span>
          <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Velocidad de reproducción">
            {RATES.map((r) => {
              const active = Math.abs((media.playbackRate || 1) - r) < 0.05;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={active}
                  onClick={() => fireMedia("set_rate", { rate: r })}
                  className={`rounded-xl py-2 text-xs font-semibold border ${
                    active
                      ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                      : "bg-black border-zinc-800 text-zinc-400"
                  }`}
                >
                  {r}x
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Dual Audio Controls: Video Mute vs Master PC Volume */}
      <section className="squircle-card bg-[#121212] border border-zinc-800/80 rounded-2xl p-3.5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={Boolean(media.muted)}
            onClick={() => fireMedia("mute")}
            className={`rounded-xl py-2.5 px-3 border flex items-center justify-center gap-2 text-xs font-semibold ${
              media.muted
                ? "bg-rose-500/20 border-rose-500/60 text-rose-300"
                : "bg-black border-zinc-800 text-zinc-200"
            }`}
          >
            {media.muted ? <VolumeX className="w-4 h-4" aria-hidden="true" /> : <Volume2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />}
            <span>Silenciar Video</span>
          </button>

          <button
            type="button"
            aria-pressed={Boolean(audio.muted)}
            onClick={() => {
              vibrate?.(14);
              send("system", "audio_toggle_mute", {});
            }}
            className={`rounded-xl py-2.5 px-3 border flex items-center justify-center gap-2 text-xs font-semibold ${
              audio.muted
                ? "bg-rose-500/20 border-rose-500/60 text-rose-300"
                : "bg-black border-zinc-800 text-zinc-200"
            }`}
          >
            <MonitorSpeaker className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span>Mute PC ({audio.volume}%)</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Volume2 className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
          <label htmlFor="media-pc-volume" className="visually-hidden">
            Volumen maestro de la PC
          </label>
          <input
            id="media-pc-volume"
            type="range"
            min={0}
            max={100}
            value={audio.volume ?? 50}
            onChange={(e) => send("system", "audio_set_volume", { volume: Number(e.target.value) })}
            className="flex-1 cursor-pointer"
          />
          <span className="text-xs font-mono text-zinc-300 w-9 text-right">{audio.volume}%</span>
        </div>
      </section>
    </div>
  );
}
