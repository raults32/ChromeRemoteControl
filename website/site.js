// Chrome Remote Control v1.0 — Modern Web Landing Script
// (ES/EN + Interactive PC/PWA Stage + Measured Popover Navbar + Declarative Copy & FAQ Fallbacks)

if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  import('https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js').catch(() => {});
}

const SITE_I18N = {
  es: {
    nav_menu: 'Menú',
    nav_features: 'Funciones',
    nav_setups: 'Tu Setup',
    nav_arch: 'Modos',
    nav_install: 'Instalación',
    hero_eyebrow: 'WINDOWS 10/11 · EXTENSIÓN MV3 · PWA MÓVIL AMOLED',
    hero_title_1: 'Tu Chrome y tu PC,',
    hero_title_2: 'bajo ',
    hero_title_em: 'tu pulgar.',
    hero_desc: 'Controla pestañas abiertas en vivo, adelanta o salta intros en YouTube y Netflix, mueve el cursor a menos de 20 ms, dicta con tu voz y espía tu pantalla desde Android o iPhone escaneando un código QR.',
    hero_cta: 'Descargar para Windows',
    hero_secondary: 'Cómo instalar',
    badge_lat: '✓ Latencia < 20 ms en Wi-Fi',
    badge_pwa: '✓ Sin instalar apps de tiendas',
    badge_priv: '✓ 100% red local con PIN',
    scene_cinema: 'Cine · YouTube 4K',
    scene_tabs: '12 Pestañas MV3',
    scene_spy: 'Touchpad + Espiar PC',
    view_tabs: 'Pestañas',
    demo_skip_pill: '⏭ Saltar Intro',
    phone_badge: 'PWA Móvil · AMOLED #000000',
    phone_sub: 'Chrome · Media · Touchpad · Pestañas · Sistema',
    hero_caption: '✨ Toca las escenas de arriba o «⏭ Saltar Intro» para probar la respuesta instantánea',
    feat_eyebrow: 'ARQUITECTURA HÍBRIDA DE 3 COMPONENTES',
    tag_mv3: 'EXTENSIÓN MV3',
    tag_media: 'MULTIMEDIA',
    tag_voice: 'TECLADO + VOZ',
    tag_spy: 'INTERACTIVO',
    tag_sys: 'SISTEMA',
    f1_title: 'Gestor de Pestañas en Tiempo Real',
    f1_desc: 'Mira todas tus pestañas abiertas con su favicon, título y dominio aunque Chrome esté minimizado. Cambia, cierra, fija (Pin), duplica, silencia por pestaña o reabre cerradas con un toque.',
    f2_title: 'Scrubber Preciso y Saltar Intro',
    f2_desc: 'Controla YouTube, Netflix, Twitch, Disney+ y cualquier video HTML5 con barra deslizable en tiempo real, saltos de ±5s/10s/30s, velocidades, subtítulos, PiP y botón automático para omitir anuncios o intros.',
    f3_title: 'Touchpad Multi-Touch Nativo',
    f3_desc: 'Motor directo sobre SendInput en Windows sin pausas artificiales: mueve el cursor con aceleración suave, arrastra elementos con doble toque, haz scroll a dos dedos y pellizca para hacer zoom.',
    f4_title: 'Escritura en Vivo, Dictado y Portapapeles',
    f4_desc: 'Escribe desde el teclado de tu teléfono con soporte completo para español (ñ, acentos y emojis), dicta búsquedas por micrófono y envía o trae el portapapeles de tu PC al instante.',
    f5_title: 'Modo «Espiar Pantalla» en Vivo',
    f5_desc: '¿Estás lejos del monitor y no ves el cursor? Activa la vista previa ligera (5 a 15 FPS) directamente en tu celular y toca cualquier punto de la imagen transmitida para hacer clic exacto ahí.',
    f6_title: 'Macros, Sleep Timer y System Tray',
    f6_desc: 'Ejecuta escenas personalizadas (como «Modo Cine»), programa la suspensión o apagado en 30/60 minutos antes de dormir y administra el código QR y el PIN desde la bandeja de Windows.',
    setups_eyebrow: 'DISEÑADO PARA UNA SOLA MANO',
    setups_title: 'Control total desde cualquier rincón.',
    s1_title: 'Desde tu cama o sillón',
    s1_desc: 'Lanza «Modo Cine» en 1 toque: abre YouTube, sube el volumen maestro al 80%, salta el anuncio cuando aparezca y programa el Sleep Timer para que la PC se suspenda sola al terminar la película.',
    s2_title: 'Multitarea con Segundo Monitor',
    s2_desc: 'Cambia de canción, pausa un stream o silencia una pestaña ruidosa de Chrome desde tu celular sin hacer Alt+Tab ni salir de tu programa o partida a pantalla completa.',
    s3_title: 'Presentaciones y Estudio',
    s3_desc: 'Avanza diapositivas web, haz zoom en páginas, busca texto con Ctrl+F o abre tus marcadores favoritos caminando por el salón con la pantalla encendida gracias a Wake Lock.',
    s4_title: 'Habitaciones Oscuras (AMOLED)',
    s4_desc: 'Su interfaz negro puro (#000000) con vibración háptica sutil cuida tu vista de noche y ahorra batería en pantallas OLED de Android y iPhone.',
    ed_eyebrow: 'RESILIENCIA Y PROFUNDIDAD',
    ed_title: 'Funciona al instante, brilla con la extensión.',
    ed_sub: 'Ambos modos vienen incluidos gratis en la misma descarga y cambian automáticamente sin configurar nada.',
    ed_base_name: 'Modo Directo OS',
    ed_auto: 'Inmediato',
    ed_b1: 'Touchpad de baja latencia (<20 ms), scroll a 2 dedos, arrastrar y zoom',
    ed_b2: 'Teclado en vivo en español (ñ, acentos, emojis) y dictado por voz',
    ed_b3: 'Volumen maestro de Windows/macOS/Linux y portapapeles bidireccional',
    ed_b4: 'Modo «Espiar Pantalla» interactivo, Macros y Sleep Timer',
    ed_b5: 'Fallback automático de atajos para navegar y controlar videos sin extensión',
    pro_pill: 'INCLUIDO EN LA CARPETA',
    ed_pro_name: '+ Puente Extensión Chrome MV3',
    ed_p1: 'Lista en vivo de todas tus pestañas y ventanas con favicon, audio y Pin',
    ed_p2: 'Controla Chrome aunque esté minimizado o detrás de otra aplicación',
    ed_p3: 'Barra de progreso (Scrubber) exacta al segundo, PiP, modo Teatro y velocidades',
    ed_p4: 'Detección automática de botón «Saltar Intro / Anuncio» en YouTube y Netflix',
    ed_p5: 'Explorador directo de Marcadores, Historial reciente y Descargas en tu celular',
    inst_eyebrow: 'PUESTA EN MARCHA · 60 SEGUNDOS',
    inst_title_1: 'De la descarga',
    inst_title_2: 'al código QR en tu pantalla.',
    inst_sub: 'No necesitas cuentas en la nube ni instalar nada desde Google Play o App Store.',
    step1_title: 'Extrae y abre start.bat',
    step1_desc: 'Descarga el paquete oficial para Windows, descomprímelo y ejecuta start.bat (o ./start.sh en macOS/Linux). El script prepara el entorno automáticamente e inicia el icono en la bandeja del sistema junto al reloj.',
    step2_title: 'Carga el puente en Google Chrome',
    step2_desc: 'Abre chrome://extensions, activa el «Modo de desarrollador» arriba a la derecha, haz clic en «Cargar descomprimida» y selecciona la carpeta chrome-extension incluida. Verás el indicador ON al instante.',
    step3_title: 'Escanea el código QR desde tu celular',
    step3_desc: 'Con tu teléfono en la misma red Wi-Fi, escanea el código QR mostrado en consola o desde el menú «Ver Código QR y PIN» en la bandeja del sistema. Tu sesión quedará autorizada de forma persistente.',
    step4_title: 'Añádelo a tu pantalla de inicio (PWA)',
    step4_desc: 'En Chrome (Android) toca «Instalar aplicación» y en Safari (iPhone) toca «Compartir → Agregar a inicio» para abrir tu control remoto a pantalla completa como app independiente.',
    faq_eyebrow: 'PREGUNTAS FRECUENTES',
    faq_title: 'Todo claro antes de descargar.',
    faq_expand_all: 'Expandir todo',
    faq_collapse_all: 'Contraer todo',
    q1: '¿Mis datos o mi pantalla pasan por servidores en internet?',
    a1: 'Nunca. Toda la comunicación WebSocket viaja exclusivamente dentro de tu propia red Wi-Fi local entre tu celular y tu computadora, protegida por PIN dinámico y tokens de sesión locales.',
    q2: '¿Qué pasa si uso otro navegador o aún no instalo la extensión?',
    a2: 'El backend detecta automáticamente si la extensión no está conectada y activa el modo resiliente por atajos de sistema operativo, manteniendo operativos el touchpad, teclado, audio, pantalla, navegación y controles básicos de reproducción.',
    q3: '¿Consume CPU la función «Espiar Pantalla» cuando no la estoy viendo?',
    a3: 'Cero por ciento. El capturador de pantalla permanece completamente dormido y solo captura cuadros comprimidos mientras tienes abierto el visor «Espiar PC» en tu teléfono.',
    q4: '¿Qué requisitos necesito en mi PC y celular?',
    a4: 'En tu PC solo necesitas Python 3.11+ (la interfaz PWA ya viene compilada lista para servir en el paquete de descarga). En tu celular funciona cualquier navegador moderno en Android o iOS conectado al mismo Wi-Fi.',
    dl_title: 'Chrome Remote Control v1.0',
    dl_desc: 'Paquete completo listo para iniciar con servidor FastAPI, interfaz PWA AMOLED precompilada, extensión Manifest V3 e icono de bandeja del sistema.',
    dl_btn: 'Descargar paquete (v1.0.0)',
    dl_versions: 'Ver notas de versión en GitHub',
    footer_right: 'Código abierto para Windows, macOS y Linux · Español & English',
    copied_ok: 'Copiado',
    copied_fail: 'Error al copiar'
  },
  en: {
    nav_menu: 'Menu',
    nav_features: 'Features',
    nav_setups: 'Use Cases',
    nav_arch: 'Modes',
    nav_install: 'Setup',
    hero_eyebrow: 'WINDOWS 10/11 · MV3 EXTENSION · MOBILE AMOLED PWA',
    hero_title_1: 'Your Chrome & PC,',
    hero_title_2: 'under ',
    hero_title_em: 'your thumb.',
    hero_desc: 'Manage live open tabs, scrub or skip intros on YouTube & Netflix, move the cursor under 20 ms, dictate via voice, and peek at your PC screen from Android or iPhone by scanning one QR code.',
    hero_cta: 'Download for Windows',
    hero_secondary: 'Setup guide',
    badge_lat: '✓ < 20 ms Wi-Fi latency',
    badge_pwa: '✓ Zero App Store installs',
    badge_priv: '✓ 100% local LAN + PIN auth',
    scene_cinema: 'Cinema · YouTube 4K',
    scene_tabs: '12 Live MV3 Tabs',
    scene_spy: 'Touchpad + Screen Spy',
    view_tabs: 'Tabs',
    demo_skip_pill: '⏭ Skip Intro',
    phone_badge: 'Mobile PWA · AMOLED #000000',
    phone_sub: 'Chrome · Media · Touchpad · Tabs · System',
    hero_caption: '✨ Tap the scenes above or «⏭ Skip Intro» to preview instant WebSocket response',
    feat_eyebrow: 'HYBRID 3-COMPONENT ARCHITECTURE',
    tag_mv3: 'MV3 EXTENSION',
    tag_media: 'MULTIMEDIA',
    tag_voice: 'KEYBOARD + VOICE',
    tag_spy: 'INTERACTIVE',
    tag_sys: 'SYSTEM',
    f1_title: 'Real-Time Tab & Window Manager',
    f1_desc: 'View every open Chrome tab with its live favicon, title, and domain even while Chrome is minimized. Switch, close, pin, duplicate, mute individual tabs, or reopen closed tabs in one tap.',
    f2_title: 'Precision Scrubber & Skip Intro',
    f2_desc: 'Control YouTube, Netflix, Twitch, Disney+, and any HTML5 video with a live timeline scrubber, ±5s/10s/30s jumps, playback speeds, captions, PiP, and smart Ad/Intro skipping.',
    f3_title: 'Native Multi-Touch Trackpad',
    f3_desc: 'Direct Win32 SendInput engine with sub-pixel accumulation: smooth cursor acceleration, double-tap drag & drop, two-finger scrolling, and pinch-to-zoom.',
    f4_title: 'Live Typing, Voice & Clipboard',
    f4_desc: 'Type straight from your phone keyboard with full Unicode support (accents, ñ, symbols, and emojis), dictate searches by voice, and sync clipboard text both ways.',
    f5_title: 'Interactive «Screen Spy» Mode',
    f5_desc: 'Sitting across the room? Stream lightweight compressed frames (5–15 FPS) to your phone and tap anywhere on the live preview to click that exact spot on your PC.',
    f6_title: 'Macros, Sleep Timer & System Tray',
    f6_desc: 'Trigger custom scenes (like «Cinema Mode»), schedule PC suspend or shutdown in 30/60 minutes before falling asleep, and manage QR & PIN from the system tray.',
    setups_eyebrow: 'ERGONOMIC ONE-HANDED UX',
    setups_title: 'Total control from anywhere in the room.',
    s1_title: 'From Your Couch or Bed',
    s1_desc: 'Tap «Cinema Mode»: launch YouTube, set master volume to 80%, skip ads when detected, and set a 60-minute Sleep Timer so your PC suspends automatically.',
    s2_title: 'Second Monitor Multitasking',
    s2_desc: 'Switch tabs, pause a stream, or mute a noisy Chrome tab from your phone without pressing Alt+Tab or leaving your fullscreen game or editor.',
    s3_title: 'Presentations & Study Sessions',
    s3_desc: 'Navigate slides, zoom pages, run Ctrl+F searches, or open favorite bookmarks while walking around the room with Screen Wake Lock active.',
    s4_title: 'Dark Rooms (True AMOLED)',
    s4_desc: 'Pure black (#000000) surfaces and subtle haptic feedback protect your eyes in dark rooms while saving battery on OLED phones.',
    ed_eyebrow: 'RESILIENCE & DEPTH',
    ed_title: 'Works immediately, shines with the extension.',
    ed_sub: 'Both modes are included free in the download and switch seamlessly with zero configuration.',
    ed_base_name: 'Direct OS Mode',
    ed_auto: 'Instant',
    ed_b1: 'Low-latency touchpad (<20 ms), 2-finger scroll, drag & drop, and zoom',
    ed_b2: 'Live Unicode keyboard (accents, ñ, emojis) and Web Speech voice dictation',
    ed_b3: 'Master volume slider (Windows/macOS/Linux) & bidirectional clipboard',
    ed_b4: 'Interactive «Screen Spy» preview, custom Macros, and Sleep Timer',
    ed_b5: 'Automatic OS keyboard shortcut fallback when Chrome extension is offline',
    pro_pill: 'INCLUDED IN DOWNLOAD',
    ed_pro_name: '+ Chrome MV3 Extension Bridge',
    ed_p1: 'Live list of all open tabs and windows with favicons, audio state, and Pin',
    ed_p2: 'Controls Chrome cleanly even when minimized or unfocused in the background',
    ed_p3: 'Exact second-by-second video Scrubber bar, PiP, Theater mode & speeds',
    ed_p4: 'Automatic «Skip Intro / Ad» button detection on YouTube and Netflix',
    ed_p5: 'Direct mobile browser for Bookmarks, recent History, and Downloads',
    inst_eyebrow: 'QUICK START · 60 SECONDS',
    inst_title_1: 'From download',
    inst_title_2: 'to scanning the QR code.',
    inst_sub: 'Zero cloud accounts required and nothing to install from mobile app stores.',
    step1_title: 'Extract and run start.bat',
    step1_desc: 'Download the release ZIP, extract it, and double-click start.bat (or ./start.sh on macOS/Linux). It prepares the environment automatically and starts the system tray icon.',
    step2_title: 'Load the Chrome MV3 Bridge',
    step2_desc: 'Open chrome://extensions, enable «Developer mode» at the top right, click «Load unpacked», and select the chrome-extension folder. The ON badge lights up right away.',
    step3_title: 'Scan the QR code from your phone',
    step3_desc: 'On the same Wi-Fi network, scan the QR code shown in the console or via «View QR & PIN» in the system tray to pair with a persistent session token.',
    step4_title: 'Add to Home Screen (PWA)',
    step4_desc: 'In Android Chrome tap «Install app» and in iPhone Safari tap «Share → Add to Home Screen» for a borderless fullscreen remote.',
    faq_eyebrow: 'FREQUENTLY ASKED QUESTIONS',
    faq_title: 'Everything clear before downloading.',
    faq_expand_all: 'Expand all',
    faq_collapse_all: 'Collapse all',
    q1: 'Does my data or screen ever leave my home network?',
    a1: 'Never. All WebSocket traffic stays strictly inside your local Wi-Fi network between your phone and PC, guarded by PIN verification and session tokens.',
    q2: 'What if I use another browser or have not loaded the extension yet?',
    a2: 'The backend automatically falls back to native OS shortcuts so the touchpad, keyboard, audio, screen spy, navigation, and basic media keys keep working.',
    q3: 'Does «Screen Spy» use CPU when closed?',
    a3: 'Zero percent. Screen capture stays completely idle until you actively open the «Screen Spy» view on your phone.',
    q4: 'What are the system requirements?',
    a4: 'Python 3.11+ on your PC (the mobile PWA is already prebuilt inside the release package) and any modern browser on Android or iOS on the same Wi-Fi.',
    dl_title: 'Chrome Remote Control v1.0',
    dl_desc: 'Complete ready-to-run package with FastAPI server, prebuilt AMOLED PWA, Manifest V3 Chrome extension, and system tray controller.',
    dl_btn: 'Download package (v1.0.0)',
    dl_versions: 'View release notes on GitHub',
    footer_right: 'Open source for Windows, macOS & Linux · Español & English',
    copied_ok: 'Copied',
    copied_fail: 'Copy failed'
  }
};

const DEMO_SCENES = [
  {
    icon: '▶',
    c1: '34 211 238',
    c2: '59 130 246',
    c3: '52 211 153',
    ping: '3 ms · Wi-Fi Local',
    dur: '24:10',
    titleEs: 'Cyberpunk Edgerunners · 4K HDR',
    titleEn: 'Cyberpunk Edgerunners · 4K HDR',
    subEs: 'youtube.com · Velocidad 1.0x · Subtítulos CC',
    subEn: 'youtube.com · Speed 1.0x · Captions CC',
    phoneEs: 'Scrubber en vivo · -10s / +10s · PiP',
    phoneEn: 'Live Scrubber · -10s / +10s · PiP',
    states: [
      {
        mainEs: 'Reproduciendo en pantalla completa · Volumen PC 80%',
        mainEn: 'Playing in fullscreen · PC Master Volume 80%',
        subEs: 'Intro detectada automáticamente lista para omitir desde el celular',
        subEn: 'Intro automatically detected and ready to skip from your phone',
        cur: '02:14',
        pct: 18
      },
      {
        mainEs: 'Intro omitida con 1 toque · Salto directo al minuto exacto',
        mainEn: 'Intro skipped in 1 tap · Instant seek to exact timestamp',
        subEs: 'Sincronización WebSocket continua con content_media.js',
        subEn: 'Continuous WebSocket sync via content_media.js',
        cur: '14:20',
        pct: 59
      },
      {
        mainEs: 'Sleep Timer activo · Suspender PC en 45m 00s',
        mainEn: 'Sleep Timer active · Suspend PC in 45m 00s',
        subEs: 'Pantalla del celular en negro AMOLED sin brillo molesto',
        subEn: 'True black AMOLED phone UI with zero eye strain',
        cur: '19:45',
        pct: 82
      }
    ]
  },
  {
    icon: '⧉',
    c1: '129 140 248',
    c2: '192 132 252',
    c3: '34 211 238',
    ping: '4 ms · Puente MV3',
    dur: '12 tabs',
    titleEs: 'Gestor de Pestañas · 2 Ventanas Abiertas',
    titleEn: 'Live Tab Manager · 2 Open Windows',
    subEs: 'Chrome en segundo plano · Control sin Alt+Tab',
    subEn: 'Chrome in background · Control without Alt+Tab',
    phoneEs: 'Cambiar · Silenciar pestaña · Pin · Reabrir cerrada',
    phoneEn: 'Switch · Mute tab · Pin · Reopen closed',
    states: [
      {
        mainEs: '🔊 YouTube Music silenciada individualmente con 1 toque',
        mainEn: '🔊 YouTube Music tab muted individually in 1 tap',
        subEs: 'El audio de tu juego o llamada continúa sin interrupción',
        subEn: 'Your game or call audio continues uninterrupted',
        cur: 'Tab 3/12',
        pct: 36
      },
      {
        mainEs: '📌 Notion, GitHub y Docs fijadas y filtradas al instante',
        mainEn: '📌 Notion, GitHub & Docs pinned and filtered instantly',
        subEs: 'Acceso directo a Marcadores, Historial y Descargas',
        subEn: 'Instant access to Bookmarks, History & Downloads',
        cur: 'Tab 7/12',
        pct: 64
      },
      {
        mainEs: '↺ Última pestaña cerrada restaurada remotamente',
        mainEn: '↺ Recently closed tab restored remotely',
        subEs: 'vía chrome.sessions.restore() en Manifest V3',
        subEn: 'via chrome.sessions.restore() in Manifest V3',
        cur: 'Tab 12/12',
        pct: 90
      }
    ]
  },
  {
    icon: '⌖',
    c1: '52 211 153',
    c2: '34 211 238',
    c3: '56 189 248',
    ping: '2 ms · SendInput',
    dur: '12 FPS',
    titleEs: 'Touchpad Multi-Touch + Espiar Pantalla',
    titleEn: 'Multi-Touch Trackpad + Screen Spy',
    subEs: 'SendInput 64-bit · Español ñ / Emojis · Voz Web Speech',
    subEn: '64-bit SendInput · Unicode / Emojis · Voice Dictation',
    phoneEs: '1 dedo: Cursor · 2 dedos: Scroll/Zoom · Toque en pantalla',
    phoneEn: '1 finger: Cursor · 2 fingers: Scroll/Zoom · Tap screen',
    states: [
      {
        mainEs: 'Cursor nativo con precisión sub-píxel (< 1 ms en PC)',
        mainEn: 'Native cursor with sub-pixel precision (< 1 ms on PC)',
        subEs: 'Doble toque + deslizar para arrastrar ventanas y archivos',
        subEn: 'Double-tap + drag to move windows and files effortlessly',
        cur: 'X:960',
        pct: 48
      },
      {
        mainEs: '🎤 Dictado por voz: «Buscar tutorial de FastAPI en YouTube»',
        mainEn: '🎤 Voice dictation: «Search FastAPI tutorial on YouTube»',
        subEs: 'Portapapeles bidireccional entre celular y computadora',
        subEn: 'Two-way clipboard sync between phone and computer',
        cur: 'Voz ES',
        pct: 72
      },
      {
        mainEs: '👁️ Vista previa de pantalla activa con indicador de cursor',
        mainEn: '👁️ Live screen preview active with cursor indicator',
        subEs: 'Toca la miniatura en tu teléfono para hacer clic exacto',
        subEn: 'Tap the live preview on your phone to click right there',
        cur: '1080p',
        pct: 88
      }
    ]
  }
];

const VIEW_LABELS = {
  es: {
    media: 'PC · Puente Extensión Activo',
    tabs: 'PC · Gestor Chrome MV3',
    touch: 'PC · Control Nativo SendInput'
  },
  en: {
    media: 'PC · Active Extension Bridge',
    tabs: 'PC · Chrome MV3 Manager',
    touch: 'PC · Native SendInput Control'
  }
};

let siteLang = localStorage.getItem('crc_site_lang') || 'es';
let sceneIdx = 0;
let stepIdx = 0;
let demoView = 'media';
let demoPlaying = true;
let demoHeroVisible = true;
let skipActive = true;

function runWithViewTransition(updateFn) {
  const allowMotion = matchMedia('(prefers-reduced-motion: no-preference)').matches;
  if (!allowMotion || typeof document.startViewTransition !== 'function') {
    updateFn();
    return;
  }
  document.startViewTransition(() => updateFn());
}

function setSiteLang(lang) {
  siteLang = lang === 'en' ? 'en' : 'es';
  localStorage.setItem('crc_site_lang', siteLang);
  document.documentElement.lang = siteLang;
  const dict = SITE_I18N[siteLang];
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
  const btn = document.getElementById('lang-switch');
  if (btn) btn.textContent = siteLang === 'es' ? 'ES · EN' : 'EN · ES';
  renderDemo();
  scheduleNavbarMeasure(true);
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

  setTxt('demo-mode-label', VIEW_LABELS[siteLang][demoView] || VIEW_LABELS.es.media);
  setTxt('demo-cover', scene.icon);
  setTxt('demo-ping', scene.ping);
  setTxt('demo-title', siteLang === 'en' ? scene.titleEn : scene.titleEs);
  setTxt('demo-sub', siteLang === 'en' ? scene.subEn : scene.subEs);
  setTxt('demo-status-main', siteLang === 'en' ? st.mainEn : st.mainEs);
  setTxt('phone-main', siteLang === 'en' ? scene.phoneEn : scene.phoneEs);
  setTxt('demo-time-cur', st.cur);
  setTxt('demo-time-dur', scene.dur);

  const subEl = document.getElementById('demo-status-sub');
  if (subEl) {
    subEl.textContent = siteLang === 'en' ? st.subEn : st.subEs;
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

document.getElementById('demo-play')?.addEventListener('click', (e) => {
  demoPlaying = !demoPlaying;
  e.currentTarget.setAttribute('aria-pressed', String(demoPlaying));
  const icon = document.getElementById('demo-play-icon');
  if (icon) icon.textContent = demoPlaying ? '⏸' : '▶';
});

document.getElementById('demo-next')?.addEventListener('click', () => {
  stepIdx = (stepIdx + 1) % 3;
  renderDemo();
});

document.getElementById('demo-prev')?.addEventListener('click', () => {
  stepIdx = (stepIdx + 2) % 3;
  renderDemo();
});

document.getElementById('lang-switch')?.addEventListener('click', () => {
  runWithViewTransition(() => {
    setSiteLang(siteLang === 'es' ? 'en' : 'es');
  });
});

// ============================================================================
// Responsive Width-Measured Navbar (per modern-web-guidance navbar spec)
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
        // Ignore if not yet ready
      }
    }
  } else {
    lastCollapsedWidth = 0;
  }

  requestAnimationFrame(() => {
    siteHeader.classList.remove('is-measuring');
  });
}

function scheduleNavbarMeasure(force = false) {
  requestAnimationFrame(() => syncNavbarLayout(force));
}

if (siteHeader && 'ResizeObserver' in window) {
  const navRo = new ResizeObserver(() => syncNavbarLayout(false));
  navRo.observe(siteHeader);
  if (siteMenu) navRo.observe(siteMenu);
}

// Close mobile popover menu cleanly when tapping an anchor link
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
// Declarative Copy Button + Async Clipboard + VoiceOver & Legacy Fallbacks
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

  const dict = SITE_I18N[siteLang] || SITE_I18N.es;
  let message = ok ? dict.copied_ok : dict.copied_fail;
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

if (!CSS.supports('animation-timeline', 'scroll()') && matchMedia('(prefers-reduced-motion: no-preference)').matches) {
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
  if (!demoPlaying || !demoHeroVisible || document.hidden) return;
  stepIdx = (stepIdx + 1) % 3;
  renderDemo();
}, 3400);

setSiteLang(siteLang);
syncNavbarLayout(true);
