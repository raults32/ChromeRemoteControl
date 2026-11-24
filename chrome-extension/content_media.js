// Content script injected into web pages for:
// 1) Precision HTML5 / YouTube / Netflix / Twitch media control & Skip Intro/Ad
// 2) In-page text search
// 3) Browser-Only Mode Virtual Touchpad Cursor, Click, Scroll & Keyboard Input

(() => {
  if (globalThis.__chromeRemoteMediaInjected) {
    return;
  }
  globalThis.__chromeRemoteMediaInjected = true;

  const SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-slot button",
    '[data-uia="player-skip-intro"]',
    '[data-uia="player-skip-recap"]',
    '[data-uia="player-skip-preplay"]',
    ".skipElement",
    ".atvwebplayersdk-skipelement-button",
    "button.skip__button",
    '[aria-label*="Skip Intro" i]',
    '[aria-label*="Skip Ad" i]'
  ];

  let lastPushTime = 0;
  let boundMedia = null;

  // Virtual In-Page Touchpad state (used when controlling Chrome without the PC Agent)
  let cursorEl = null;
  let cursorHideTimer = null;
  let cursorX = Math.round((window.innerWidth || 1280) * 0.5);
  let cursorY = Math.round((window.innerHeight || 720) * 0.5);

  function ensureCursorElement() {
    if (cursorEl && cursorEl.isConnected) return cursorEl;
    const el = document.createElement("div");
    el.id = "__crc_virtual_cursor";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:22px",
      "height:22px",
      "margin-left:-11px",
      "margin-top:-11px",
      "border-radius:999px",
      "background:rgba(6,182,212,0.32)",
      "border:2px solid #22d3ee",
      "box-shadow:0 0 0 2px rgba(0,0,0,0.65),0 0 16px rgba(34,211,238,0.75)",
      "pointer-events:none",
      "z-index:2147483647",
      "transition:opacity 0.22s ease, transform 0.08s ease",
      "opacity:0",
      `transform:translate3d(${cursorX}px, ${cursorY}px, 0)`
    ].join(";");
    (document.documentElement || document.body).appendChild(el);
    cursorEl = el;
    return el;
  }

  function showVirtualCursor(pulse = false) {
    const el = ensureCursorElement();
    cursorX = Math.max(2, Math.min((window.innerWidth || 1280) - 2, cursorX));
    cursorY = Math.max(2, Math.min((window.innerHeight || 720) - 2, cursorY));
    el.style.opacity = "1";
    el.style.transform = `translate3d(${Math.round(cursorX)}px, ${Math.round(cursorY)}px, 0) scale(${pulse ? 0.78 : 1})`;
    if (pulse) {
      setTimeout(() => {
        if (cursorEl) {
          cursorEl.style.transform = `translate3d(${Math.round(cursorX)}px, ${Math.round(cursorY)}px, 0) scale(1)`;
        }
      }, 95);
    }
    if (cursorHideTimer) clearTimeout(cursorHideTimer);
    cursorHideTimer = setTimeout(() => {
      if (cursorEl) cursorEl.style.opacity = "0";
    }, 3500);
  }

  function clickAtPoint(x, y, button = "left") {
    const target = document.elementFromPoint(x, y);
    if (!target) return false;

    if (
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select, button, a, summary, [tabindex], [contenteditable='true']") ||
        target.isContentEditable)
    ) {
      try {
        target.focus({ preventScroll: true });
      } catch (_e) {
        // Ignore
      }
    }

    const opts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      button: button === "right" ? 2 : 0,
      buttons: button === "right" ? 2 : 1
    };

    target.dispatchEvent(new PointerEvent("pointerdown", opts));
    target.dispatchEvent(new MouseEvent("mousedown", opts));
    target.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
    target.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));

    if (button === "right") {
      target.dispatchEvent(new MouseEvent("contextmenu", opts));
    } else if (typeof target.click === "function") {
      target.click();
    } else {
      target.dispatchEvent(new MouseEvent("click", opts));
    }
    return true;
  }

  function scrollAtCursor(dx, dy) {
    const stepX = -Number(dx || 0) * 52;
    const stepY = -Number(dy || 0) * 52;
    let node = document.elementFromPoint(cursorX, cursorY);
    while (node && node !== document.body && node !== document.documentElement) {
      if (node instanceof HTMLElement) {
        const style = window.getComputedStyle(node);
        const canY =
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight + 4;
        const canX =
          (style.overflowX === "auto" || style.overflowX === "scroll") &&
          node.scrollWidth > node.clientWidth + 4;
        if ((canY && Math.abs(stepY) > 0.5) || (canX && Math.abs(stepX) > 0.5)) {
          node.scrollBy({ left: stepX, top: stepY, behavior: "auto" });
          return;
        }
      }
      node = node.parentElement;
    }
    window.scrollBy({ left: stepX, top: stepY, behavior: "auto" });
  }

  function isEditableElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return !el.readOnly && !el.disabled;
    if (tag === "INPUT") {
      const nonText = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);
      return !nonText.has((el.type || "text").toLowerCase()) && !el.readOnly && !el.disabled;
    }
    return Boolean(el.isContentEditable);
  }

  function insertTextIntoActiveElement(text) {
    if (!text) return false;
    const el = document.activeElement;
    if (!isEditableElement(el)) return false;

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const nextValue = el.value.slice(0, start) + text + el.value.slice(end);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) {
        setter.call(el, nextValue);
      } else {
        el.value = nextValue;
      }
      const caret = start + text.length;
      try {
        el.setSelectionRange(caret, caret);
      } catch (_e) {
        // Ignore input types without selection range
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (el.isContentEditable) {
      document.execCommand("insertText", false, text);
      return true;
    }
    return false;
  }

  function handlePageKeyPress(rawKey) {
    const key = String(rawKey || "").toLowerCase();
    const el = document.activeElement;
    const editable = isEditableElement(el);

    if (key === "backspace") {
      if (editable && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        if (start !== end) {
          const next = el.value.slice(0, start) + el.value.slice(end);
          el.value = next;
          el.setSelectionRange(start, start);
        } else if (start > 0) {
          const next = el.value.slice(0, start - 1) + el.value.slice(end);
          el.value = next;
          el.setSelectionRange(start - 1, start - 1);
        }
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
        return true;
      }
      if (editable && el.isContentEditable) {
        document.execCommand("delete", false);
        return true;
      }
      return false;
    }

    if (key === "delete") {
      if (editable && el.isContentEditable) {
        document.execCommand("forwardDelete", false);
        return true;
      }
      return false;
    }

    if (key === "enter") {
      if (el instanceof HTMLTextAreaElement) {
        return insertTextIntoActiveElement("\n");
      }
      if (el instanceof HTMLInputElement) {
        const keyEvt = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
        el.dispatchEvent(new KeyboardEvent("keydown", keyEvt));
        el.dispatchEvent(new KeyboardEvent("keyup", keyEvt));
        if (el.form) {
          if (typeof el.form.requestSubmit === "function") {
            el.form.requestSubmit();
          } else {
            el.form.submit();
          }
        }
        return true;
      }
      if (el instanceof HTMLElement && typeof el.click === "function" && el !== document.body) {
        el.click();
        return true;
      }
      return false;
    }

    if (key === "esc" || key === "escape") {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        return true;
      }
      if (el instanceof HTMLElement) {
        el.blur();
      }
      return true;
    }

    if (key === "space" && !editable) {
      executeMediaAction("play_pause", {});
      return true;
    }

    if (key === "up" && !editable) {
      window.scrollBy({ top: -140, behavior: "smooth" });
      return true;
    }
    if (key === "down" && !editable) {
      window.scrollBy({ top: 140, behavior: "smooth" });
      return true;
    }
    if (key === "left" && !editable) {
      executeMediaAction("seek_relative", { delta: -5 });
      return true;
    }
    if (key === "right" && !editable) {
      executeMediaAction("seek_relative", { delta: 5 });
      return true;
    }
    if (key === "pageup") {
      window.scrollBy({ top: -Math.round(window.innerHeight * 0.82), behavior: "smooth" });
      return true;
    }
    if (key === "pagedown") {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.82), behavior: "smooth" });
      return true;
    }
    if (key === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    }
    if (key === "end") {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      return true;
    }
    return false;
  }

  function handlePageInputCommand(action, payload = {}) {
    if (action === "mouse_move") {
      const sens = Number(payload.sensitivity || 1.7);
      const dx = Number(payload.dx || 0) * sens;
      const dy = Number(payload.dy || 0) * sens;
      cursorX = Math.max(2, Math.min((window.innerWidth || 1280) - 2, cursorX + dx));
      cursorY = Math.max(2, Math.min((window.innerHeight || 720) - 2, cursorY + dy));
      showVirtualCursor(false);
      return { ok: true };
    }

    if (action === "mouse_click") {
      showVirtualCursor(true);
      const count = Math.max(1, Number(payload.count || 1));
      for (let i = 0; i < count; i += 1) {
        clickAtPoint(cursorX, cursorY, payload.button || "left");
      }
      return { ok: true };
    }

    if (action === "screen_tap") {
      const nx = Math.max(0, Math.min(1, Number(payload.normX ?? 0.5)));
      const ny = Math.max(0, Math.min(1, Number(payload.normY ?? 0.5)));
      cursorX = Math.round(nx * (window.innerWidth || 1280));
      cursorY = Math.round(ny * (window.innerHeight || 720));
      showVirtualCursor(true);
      clickAtPoint(cursorX, cursorY, payload.button || "left");
      return { ok: true };
    }

    if (action === "mouse_scroll") {
      scrollAtCursor(payload.dx || 0, payload.dy || 0);
      return { ok: true };
    }

    if (action === "key_type") {
      const inserted = insertTextIntoActiveElement(String(payload.text || ""));
      return { ok: inserted };
    }

    if (action === "key_press") {
      return { ok: handlePageKeyPress(payload.key) };
    }

    if (action === "shortcut") {
      const sc = String(payload.shortcut || payload.name || "").toLowerCase();
      if (sc === "select_all") {
        const el = document.activeElement;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.select();
        } else {
          document.execCommand("selectAll", false);
        }
      } else if (sc === "copy") {
        document.execCommand("copy", false);
      } else if (sc === "cut") {
        document.execCommand("cut", false);
      } else if (sc === "undo") {
        document.execCommand("undo", false);
      } else if (sc === "redo") {
        document.execCommand("redo", false);
      }
      return { ok: true, selectedText: String(window.getSelection?.() || "") };
    }

    return { ok: false };
  }

  // ============================================================================
  // HTML5 / Streaming Media Engine
  // ============================================================================
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

    const playing = all.find((m) => !m.paused && !m.ended && m.readyState >= 2);
    if (playing) return playing;

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
      skipLabel: skipBtn?.textContent?.trim() || "Skip Intro / Ad",
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

    if (message.type === "PAGE_INPUT") {
      const res = handlePageInputCommand(message.action, message.payload);
      sendResponse(res);
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

  const initial = selectActiveMediaElement();
  if (initial) {
    bindMediaListeners(initial);
    pushMediaState(true);
  }
})();
