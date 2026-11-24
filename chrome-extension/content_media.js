// Content script injected into web pages for precise HTML5 / YouTube / Netflix / Twitch media control
// and in-page text search. Uses async/await and batches DOM reads cleanly.

(() => {
  if (globalThis.__chromeRemoteMediaInjected) {
    return;
  }
  globalThis.__chromeRemoteMediaInjected = true;

  const SKIP_SELECTORS = [
    // YouTube Ads & Intro
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-slot button",
    // Netflix Skip Intro / Recap / Next
    '[data-uia="player-skip-intro"]',
    '[data-uia="player-skip-recap"]',
    '[data-uia="player-skip-preplay"]',
    // Prime Video / Disney+ / Generic
    ".skipElement",
    ".atvwebplayersdk-skipelement-button",
    "button.skip__button",
    '[aria-label*="Skip Intro" i]',
    '[aria-label*="Saltar intro" i]',
    '[aria-label*="Omitir intro" i]',
    '[aria-label*="Saltar anuncio" i]'
  ];

  let lastPushTime = 0;
  let boundMedia = null;

  function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return (
      rect.width > 4 &&
      rect.height > 4 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0.05
    );
  }

  function findSkipButton() {
    for (const sel of SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn && isElementVisible(btn)) {
        return btn;
      }
    }
    return null;
  }

  function selectActiveMediaElement() {
    const videos = Array.from(document.querySelectorAll("video"));
    const audios = Array.from(document.querySelectorAll("audio"));
    const all = [...videos, ...audios];
    if (all.length === 0) return null;

    // Prefer currently playing element
    const playing = all.find((m) => !m.paused && !m.ended && m.readyState >= 2);
    if (playing) return playing;

    // Next prefer largest visible video with valid duration
    let bestVideo = null;
    let bestArea = -1;
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      const bonus = Number.isFinite(v.duration) && v.duration > 0 ? 10000 : 0;
      if (area + bonus > bestArea) {
        bestArea = area + bonus;
        bestVideo = v;
      }
    }
    return bestVideo || all[0];
  }

  function detectMediaTitle() {
    if (navigator.mediaSession?.metadata?.title) {
      return navigator.mediaSession.metadata.title;
    }
    const ytTitle =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent ||
      document.querySelector(".ytp-title-link")?.textContent;
    if (ytTitle && ytTitle.trim()) {
      return ytTitle.trim();
    }
    const nfTitle = document.querySelector('[data-uia="video-title"]')?.textContent;
    if (nfTitle && nfTitle.trim()) {
      return nfTitle.trim();
    }
    return document.title || "";
  }

  function areCaptionsEnabled(media) {
    const ytSubBtn = document.querySelector(".ytp-subtitles-button");
    if (ytSubBtn) {
      return ytSubBtn.getAttribute("aria-pressed") === "true";
    }
    if (media && media.textTracks && media.textTracks.length > 0) {
      return Array.from(media.textTracks).some((t) => t.mode === "showing");
    }
    return false;
  }

  function collectMediaState() {
    const media = selectActiveMediaElement();
    if (!media) {
      return {
        hasMedia: false,
        title: document.title || "",
        domain: location.hostname.replace(/^www\./, ""),
        currentTime: 0,
        duration: 0,
        paused: true,
        muted: false,
        volume: 1,
        playbackRate: 1,
        canSkipAd: false,
        skipLabel: "",
        captionsEnabled: false,
        pipActive: false
      };
    }

    bindMediaListeners(media);
    const skipBtn = findSkipButton();
    const duration = Number.isFinite(media.duration) ? media.duration : 0;

    return {
      hasMedia: true,
      title: detectMediaTitle(),
      artist: navigator.mediaSession?.metadata?.artist || "",
      domain: location.hostname.replace(/^www\./, ""),
      currentTime: Number(media.currentTime || 0),
      duration: Number(duration || 0),
      paused: Boolean(media.paused),
      muted: Boolean(media.muted),
      volume: Number(media.volume ?? 1),
      playbackRate: Number(media.playbackRate || 1),
      canSkipAd: Boolean(skipBtn),
      skipLabel: skipBtn?.textContent?.trim() || "Saltar Intro / Anuncio",
      captionsEnabled: areCaptionsEnabled(media),
      pipActive: document.pictureInPictureElement === media
    };
  }

  async function pushMediaState(force = false) {
    const now = Date.now();
    if (!force && now - lastPushTime < 750) {
      return;
    }
    lastPushTime = now;
    const state = collectMediaState();
    if (!state.hasMedia && !force) return;
    try {
      await chrome.runtime.sendMessage({
        source: "content_media",
        type: "MEDIA_STATE_PUSH",
        state
      });
    } catch (_err) {
      // Extension reloaded or idle
    }
  }

  function bindMediaListeners(media) {
    if (!media || boundMedia === media) return;
    boundMedia = media;
    const events = ["play", "pause", "ratechange", "volumechange", "loadedmetadata", "seeked", "enterpictureinpicture", "leavepictureinpicture"];
    for (const evt of events) {
      media.addEventListener(evt, () => {
        pushMediaState(true);
      });
    }
    media.addEventListener("timeupdate", () => {
      pushMediaState(false);
    });
  }

  async function executeMediaAction(action, payload = {}) {
    const media = selectActiveMediaElement();
    const act = String(action || "").toLowerCase();

    if (act === "skip_intro" || act === "skip_ad") {
      const skipBtn = findSkipButton();
      if (skipBtn) {
        skipBtn.click();
      }
      return collectMediaState();
    }

    if (!media) {
      return collectMediaState();
    }

    if (act === "play_pause") {
      if (media.paused) {
        try {
          await media.play();
        } catch (_e) {
          media.click();
        }
      } else {
        media.pause();
      }
    } else if (act === "play") {
      try {
        await media.play();
      } catch (_e) {
        // Autoplay restriction fallback
      }
    } else if (act === "pause") {
      media.pause();
    } else if (act === "seek_relative") {
      const delta = Number(payload.delta || 0);
      const maxTime = Number.isFinite(media.duration) ? media.duration : Infinity;
      media.currentTime = Math.max(0, Math.min(maxTime, (media.currentTime || 0) + delta));
    } else if (act === "seek_to") {
      const targetTime = Number(payload.time || 0);
      if (Number.isFinite(targetTime)) {
        media.currentTime = Math.max(0, targetTime);
      }
    } else if (act === "set_rate") {
      const rate = Math.max(0.25, Math.min(4.0, Number(payload.rate || 1.0)));
      media.playbackRate = rate;
    } else if (act === "mute") {
      media.muted = typeof payload.muted === "boolean" ? payload.muted : !media.muted;
    } else if (act === "set_video_volume") {
      const vol = Math.max(0, Math.min(1, Number(payload.volume ?? 1)));
      media.volume = vol;
      if (vol > 0 && media.muted) media.muted = false;
    } else if (act === "next") {
      const ytNext = document.querySelector(".ytp-next-button");
      const nfNext = document.querySelector('[data-uia="control-next"]');
      if (ytNext) ytNext.click();
      else if (nfNext) nfNext.click();
      else if (Number.isFinite(media.duration)) media.currentTime = media.duration;
    } else if (act === "prev") {
      const ytPrev = document.querySelector(".ytp-prev-button");
      if (ytPrev && isElementVisible(ytPrev)) {
        ytPrev.click();
      } else {
        media.currentTime = 0;
      }
    } else if (act === "captions") {
      const ytSubBtn = document.querySelector(".ytp-subtitles-button");
      if (ytSubBtn) {
        ytSubBtn.click();
      } else if (media.textTracks && media.textTracks.length > 0) {
        const anyShowing = Array.from(media.textTracks).some((t) => t.mode === "showing");
        const firstTrack = media.textTracks[0];
        firstTrack.mode = anyShowing ? "disabled" : "showing";
      }
    } else if (act === "pip") {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (media.tagName === "VIDEO" && document.pictureInPictureEnabled) {
          await media.requestPictureInPicture();
        }
      } catch (_e) {
        // PiP may require user gesture on some sites
      }
    } else if (act === "theater") {
      const ytTheater = document.querySelector(".ytp-size-button");
      if (ytTheater) {
        ytTheater.click();
      }
    } else if (act === "fullscreen") {
      const ytFs = document.querySelector(".ytp-fullscreen-button");
      const nfFs = document.querySelector('[data-uia="control-fullscreen-enter"], [data-uia="control-fullscreen-exit"]');
      if (ytFs) {
        ytFs.click();
      } else if (nfFs) {
        nfFs.click();
      } else {
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          } else {
            await media.requestFullscreen();
          }
        } catch (_e) {
          // Fullscreen requires user gesture if blocked
        }
      }
    }

    return collectMediaState();
  }

  function runPageFind(query, backwards = false) {
    if (!query) {
      window.getSelection()?.removeAllRanges();
      return { found: false, query: "" };
    }
    const found = Boolean(window.find(query, false, backwards, true, false, true, false));
    if (found) {
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        const anchor = sel?.anchorNode?.parentElement;
        if (anchor && typeof anchor.scrollIntoView === "function") {
          anchor.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }
    return { found, query };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return false;

    if (message.type === "MEDIA_GET_STATE") {
      sendResponse(collectMediaState());
      return false;
    }

    if (message.type === "MEDIA_COMMAND") {
      (async () => {
        const updated = await executeMediaAction(message.action, message.payload);
        sendResponse(updated);
      })();
      return true;
    }

    if (message.type === "PAGE_FIND") {
      const result = runPageFind(message.query, message.backwards);
      sendResponse(result);
      return false;
    }

    return false;
  });

  // Observe dynamic SPA video mounts (YouTube, Netflix, Twitch) using batched rAF
  let rafPending = false;
  const observer = new MutationObserver(() => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const media = selectActiveMediaElement();
      if (media && media !== boundMedia) {
        bindMediaListeners(media);
        pushMediaState(true);
      }
    });
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Initial detection
  const initial = selectActiveMediaElement();
  if (initial) {
    bindMediaListeners(initial);
    pushMediaState(true);
  }
})();
