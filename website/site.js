// Chrome Remote Control v1.1 — Landing Experience Script
// Built with ui-ux-pro-max, design-system, and modern-web-guidance (SVG-only icons, accessible motion controls)

if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  import('https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js').catch(() => {});
}

const SVG_ICONS = {
  play: '<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14Z"/></svg>',
  pause: '<svg class="svg-icon-sm" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  playSmall: '<svg class="svg-icon-sm" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14Z"/></svg>',
  layers: '<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>',
  crosshair: '<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>'
};

const DEMO_SCENES = [
  {
    iconKey: 'play',
    c1: '34 211 238',
    c2: '59 130 246',
    c3: '52 211 153',
    ping: '3 ms · WebRTC P2P',
    dur: '24:10',
    title: 'Cyberpunk Edgerunners · 4K HDR',
    sub: 'youtube.com · Speed 1.0x · Captions CC',
    phone: 'Live Scrubber · -10s / +10s · PiP',
    states: [
      {
        main: 'Playing in fullscreen · Master Volume 80%',
        sub: 'Intro automatically detected and ready to skip from your phone',
        cur: '02:14',
        pct: 18
      },
      {
        main: 'Intro skipped in 1 tap · Exact timestamp sync',
        sub: 'Continuous telemetry via MV3 content_media.js',
        cur: '14:20',
        pct: 59
      },
      {
        main: 'Sleep Timer active · Auto-pause in 45m 00s',
        sub: 'True black AMOLED phone UI with zero eye strain',
        cur: '19:45',
        pct: 82
      }
    ]
  },
  {
    iconKey: 'layers',
    c1: '129 140 248',
    c2: '167 139 250',
    c3: '34 211 238',
    ping: '4 ms · MV3 Bridge',
    dur: '12 tabs',
    title: 'Live Tab Manager · 2 Open Windows',
    sub: 'Chrome in background · Control without Alt+Tab',
    phone: 'Switch · Mute tab · Pin · Reopen closed',
    states: [
      {
        main: 'YouTube Music tab muted individually in 1 tap',
        sub: 'Your fullscreen game or call audio continues uninterrupted',
        cur: 'Tab 3/12',
        pct: 36
      },
      {
        main: 'Notion, GitHub & Docs pinned and filtered live',
        sub: 'Instant mobile access to Bookmarks, History & Downloads',
        cur: 'Tab 7/12',
        pct: 64
      },
      {
        main: 'Recently closed tab restored remotely',
        sub: 'Powered by chrome.sessions.restore() in Manifest V3',
        cur: 'Tab 12/12',
        pct: 90
      }
    ]
  },
  {
    iconKey: 'crosshair',
    c1: '52 211 153',
    c2: '34 211 238',
    c3: '56 189 248',
    ping: '2 ms · Dual Trackpad',
    dur: 'Live Spy',
    title: 'Multi-Touch Trackpad + Screen Spy',
    sub: 'In-Page Cursor & 64-bit Win32 SendInput · Voice Dictation',
    phone: '1 finger: Cursor · 2 fingers: Scroll/Zoom · Tap preview',
    states: [
      {
        main: 'Sub-pixel cursor precision (< 2 ms on Windows)',
        sub: 'Double-tap + slide to drag windows and elements effortlessly',
        cur: 'X:960',
        pct: 48
      },
      {
        main: 'Voice dictation: "Search FastAPI tutorial on YouTube"',
        sub: 'Two-way clipboard sync between phone and browser',
        cur: 'Voice',
        pct: 72
      },
      {
        main: 'Live Screen Spy preview with tap-to-click',
        sub: 'Tap anywhere on your phone preview to click that exact spot',
        cur: '1080p',
        pct: 88
      }
    ]
  }
];

const VIEW_LABELS = {
  media: 'Chrome · Active Extension Bridge',
  tabs: 'Chrome · MV3 Tab Manager',
  touch: 'Dual · Trackpad & Screen Spy'
};

const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let sceneIdx = 0;
let stepIdx = 0;
let demoView = 'media';
let demoPlaying = !reducedMotionQuery.matches;
let demoHeroVisible = true;
let demoStageInteracting = false;
let skipActive = true;

function syncPlayButtonUi() {
  const playBtn = document.getElementById('demo-play');
  const iconWrap = document.getElementById('demo-play-icon');
  if (!playBtn || !iconWrap) return;
  // Per modern-web-guidance motion §Accessibility: update accessible label between Pause/Play without aria-pressed
  playBtn.setAttribute('aria-label', demoPlaying ? 'Pause live demo auto-cycle' : 'Play live demo auto-cycle');
  iconWrap.innerHTML = demoPlaying ? SVG_ICONS.pause : SVG_ICONS.playSmall;
}

reducedMotionQuery.addEventListener('change', (e) => {
  if (e.matches) {
    demoPlaying = false;
    syncPlayButtonUi();
  }
});

function runWithViewTransition(updateFn) {
  if (reducedMotionQuery.matches || typeof document.startViewTransition !== 'function') {
    updateFn();
    return;
  }
  document.startViewTransition(() => updateFn());
}

function renderDemo() {
  const scene = DEMO_SCENES[sceneIdx];
  const st = scene.states[stepIdx % scene.states.length];
  const root = document.documentElement.style;
  root.setProperty('--demo-c1', scene.c1);
  root.setProperty('--demo-c2', scene.c2);
  root.setProperty('--demo-c3', scene.c3);

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt('demo-mode-label', VIEW_LABELS[demoView] || VIEW_LABELS.media);
  setTxt('demo-ping', scene.ping);
  setTxt('demo-title', scene.title);
  setTxt('demo-sub', scene.sub);
  setTxt('demo-status-main', st.main);
  setTxt('phone-main', scene.phone);
  setTxt('demo-time-cur', st.cur);
  setTxt('demo-time-dur', scene.dur);

  const coverEl = document.getElementById('demo-cover');
  if (coverEl) {
    coverEl.innerHTML = SVG_ICONS[scene.iconKey] || SVG_ICONS.play;
  }

  const subEl = document.getElementById('demo-status-sub');
  if (subEl) {
    subEl.textContent = st.sub;
    subEl.hidden = !skipActive;
  }

  const fill = document.getElementById('demo-bar-fill');
  if (fill) fill.style.inlineSize = `${st.pct}%`;
}

document.querySelectorAll('[data-demo-scene]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const nextIdx = Number(btn.dataset.demoScene) || 0;
    if (nextIdx === sceneIdx) return;
    runWithViewTransition(() => {
      sceneIdx = nextIdx;
      stepIdx = 0;
      document.querySelectorAll('[data-demo-scene]').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderDemo();
    });
  });
});

document.querySelectorAll('[data-demo-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.demoView || 'media';
    const viewToScene = { media: 0, tabs: 1, touch: 2 };
    runWithViewTransition(() => {
      demoView = view;
      if (viewToScene[view] !== undefined) {
        sceneIdx = viewToScene[view];
        stepIdx = 0;
        document.querySelectorAll('[data-demo-scene]').forEach((b, idx) => {
          const active = idx === sceneIdx;
          b.classList.toggle('active', active);
          b.setAttribute('aria-pressed', String(active));
        });
      }
      document.querySelectorAll('[data-demo-view]').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderDemo();
    });
  });
});

document.getElementById('demo-skip-btn')?.addEventListener('click', (e) => {
  skipActive = !skipActive;
  e.currentTarget.classList.toggle('active', skipActive);
  e.currentTarget.setAttribute('aria-pressed', String(skipActive));
  stepIdx = (stepIdx + 1) % 3;
  renderDemo();
});

document.getElementById('demo-play')?.addEventListener('click', () => {
  demoPlaying = !demoPlaying;
  syncPlayButtonUi();
});

document.getElementById('demo-next')?.addEventListener('click', () => {
  stepIdx = (stepIdx + 1) % 3;
  renderDemo();
});

document.getElementById('demo-prev')?.addEventListener('click', () => {
  stepIdx = (stepIdx + 2) % 3;
  renderDemo();
});

// Pause auto-rotation while user hovers or focuses inside the interactive demo stage
const demoFigure = document.querySelector('.screen');
if (demoFigure) {
  demoFigure.addEventListener('pointerenter', () => {
    demoStageInteracting = true;
  });
  demoFigure.addEventListener('pointerleave', () => {
    demoStageInteracting = false;
  });
  demoFigure.addEventListener('focusin', () => {
    demoStageInteracting = true;
  });
  demoFigure.addEventListener('focusout', (e) => {
    if (!demoFigure.contains(e.relatedTarget)) {
      demoStageInteracting = false;
    }
  });
}

// ============================================================================
// Responsive Width-Measured Navbar
// ============================================================================
const siteHeader = document.querySelector('.site-header');
const headerInner = document.querySelector('.header-inner');
const siteMenu = document.getElementById('site-menu');
let lastCollapsedWidth = 0;

function syncNavbarLayout(force = false) {
  if (!siteHeader || !headerInner || !siteMenu) return;
  const currentlyWide = siteHeader.classList.contains('is-wide');
  const currentWidth = headerInner.clientWidth;

  if (!currentlyWide && !force && currentWidth <= lastCollapsedWidth) {
    return;
  }

  const wasPopoverOpen = siteMenu.matches(':popover-open, .\\:popover-open');
  siteHeader.classList.add('is-measuring', 'is-wide');
  siteMenu.removeAttribute('popover');

  const fitsInline = headerInner.scrollWidth <= headerInner.clientWidth;

  if (!fitsInline) {
    siteHeader.classList.remove('is-wide');
    siteMenu.setAttribute('popover', 'auto');
    lastCollapsedWidth = currentWidth;
    if (wasPopoverOpen && typeof siteMenu.showPopover === 'function') {
      try {
        siteMenu.showPopover();
      } catch (_e) {
        // Ignore
      }
    }
  } else {
    lastCollapsedWidth = 0;
  }

  requestAnimationFrame(() => {
    siteHeader.classList.remove('is-measuring');
  });
}

if (siteHeader && 'ResizeObserver' in window) {
  const navRo = new ResizeObserver(() => syncNavbarLayout(false));
  navRo.observe(siteHeader);
  if (siteMenu) navRo.observe(siteMenu);
}

siteMenu?.addEventListener('click', (e) => {
  if (e.target.closest('a') && siteMenu.hasAttribute('popover') && typeof siteMenu.hidePopover === 'function') {
    try {
      siteMenu.hidePopover();
    } catch (_err) {
      // Ignore
    }
  }
});

// ============================================================================
// Declarative Copy Button + Async Clipboard + Legacy Fallback
// ============================================================================
const copyTimers = new WeakMap();
let lastAnnouncedCopyMessage = '';

function legacyCopy(text) {
  const previousFocus = document.activeElement;
  const field = Object.assign(document.createElement('textarea'), { value: text });
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

function reportCopyResult(button, ok) {
  const tip = button.nextElementSibling;
  if (!tip) return;
  clearTimeout(copyTimers.get(button));
  button.removeAttribute('data-copied');
  button.removeAttribute('data-failed');

  let message = ok ? 'Copied' : 'Copy failed';
  if (message === lastAnnouncedCopyMessage) {
    message += '\u00A0';
  }
  lastAnnouncedCopyMessage = message;

  tip.textContent = '';
  void button.offsetWidth;
  button.setAttribute(ok ? 'data-copied' : 'data-failed', '');
  requestAnimationFrame(() => {
    tip.textContent = message;
  });

  copyTimers.set(
    button,
    setTimeout(() => {
      button.removeAttribute('data-copied');
      button.removeAttribute('data-failed');
      tip.textContent = '';
    }, 2000)
  );
}

async function copyFromTarget(button, target) {
  if (!button || !target) return;
  const text = target.matches('input, textarea') ? target.value : target.innerText.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    reportCopyResult(button, true);
  } catch (_err) {
    const ok = legacyCopy(text);
    reportCopyResult(button, ok);
  }
}

if ('CommandEvent' in window) {
  document.addEventListener(
    'command',
    (event) => {
      if (event.command === '--copy') {
        copyFromTarget(event.source, event.target);
      }
    },
    true
  );
} else {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    const button = event.target.closest('button[command="--copy"]');
    if (!button) return;
    const targetId = button.getAttribute('commandfor');
    const target = targetId ? document.getElementById(targetId) : null;
    if (target) copyFromTarget(button, target);
  });
}

// ============================================================================
// Progressive Fallbacks: Sticky Header, Scroll Progress & FAQ Expand/Collapse
// ============================================================================
const heroSection = document.getElementById('hero-section');
if (heroSection && 'IntersectionObserver' in window) {
  const heroObserver = new IntersectionObserver(
    ([entry]) => {
      demoHeroVisible = entry.isIntersecting;
    },
    { rootMargin: '120px' }
  );
  heroObserver.observe(heroSection);
}

if (!CSS.supports('container-type', 'scroll-state') && 'IntersectionObserver' in window) {
  document.querySelectorAll('.sticky-header-container').forEach((container) => {
    const topOffset = parseFloat(getComputedStyle(container).insetBlockStart || '0') || 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        entry.target.classList.toggle('is-stuck', entry.intersectionRatio < 1);
      },
      { threshold: [1], rootMargin: `-${topOffset + 1}px 0px 0px 0px` }
    );
    observer.observe(container);
  });
}

if (!CSS.supports('animation-timeline', 'scroll()') && !reducedMotionQuery.matches) {
  const progress = document.getElementById('scroll-progress');
  if (progress) {
    window.addEventListener(
      'scroll',
      () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
        progress.style.transform = `scaleX(${ratio})`;
      },
      { passive: true }
    );
  }
}

function toggleAllFaq(accordion, button) {
  if (!accordion || !button) return;
  const expand = button.getAttribute('aria-expanded') !== 'true';
  for (const details of accordion.querySelectorAll(':scope > details')) {
    details.open = expand;
  }
  button.setAttribute('aria-expanded', String(expand));
}

document.addEventListener(
  'command',
  (event) => {
    if (event.command !== '--toggle-all') return;
    toggleAllFaq(event.target, event.source);
  },
  { capture: true }
);

if (!Object.hasOwn(HTMLButtonElement.prototype, 'commandForElement')) {
  document.querySelector('[command="--toggle-all"]')?.addEventListener('click', (event) => {
    const btn = event.currentTarget;
    const targetId = btn.getAttribute('commandfor');
    toggleAllFaq(targetId ? document.getElementById(targetId) : null, btn);
  });
}

document.addEventListener(
  'toggle',
  (event) => {
    if (!(event.target instanceof HTMLDetailsElement) || !event.target.matches('#faq-accordion > details')) return;
    const accordion = event.target.parentElement;
    const button = document.querySelector('[commandfor="faq-accordion"][command="--toggle-all"]');
    if (!accordion || !button) return;
    const items = accordion.querySelectorAll(':scope > details');
    const allOpen = Array.prototype.every.call(items, (d) => d.open);
    button.setAttribute('aria-expanded', String(allOpen));
  },
  { capture: true }
);

setInterval(() => {
  if (!demoPlaying || !demoHeroVisible || demoStageInteracting || document.hidden) return;
  stepIdx = (stepIdx + 1) % 3;
  renderDemo();
}, 3600);

syncPlayButtonUi();
renderDemo();
syncNavbarLayout(true);
