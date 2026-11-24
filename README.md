# Chrome Remote Control — Control Remoto Total desde el Celular

Sistema híbrido de **baja latencia (`< 20ms` en Wi-Fi local)** para controlar **Google Chrome** y tu computadora desde cualquier teléfono **Android o iPhone** funcionando como una **PWA instalable** (sin tiendas de aplicaciones).

---

## Arquitectura de 3 Componentes

```text
[ Celular (PWA AMOLED) ] <--- WebSocket / HTTP (Wi-Fi Local) ---> [ Servidor Local PC (FastAPI + Tray) ]
                                                                           |             |
                                                      (Control OS) <-------+             +------> [ Extensión Chrome (MV3) ]
                                            (Mouse, Teclado, Audio, Pantalla, Energía)             (Pestañas, Media, Marcadores)
```

1. **Backend Local en PC (`backend/`):** Servidor **FastAPI + WebSockets**, control nativo de mouse/teclado Unicode (`SendInput` en Windows / `pynput` en macOS y Linux), volumen maestro (`pycaw` / `osascript` / `pactl`), portapapeles bidireccional, transmisión ligera de pantalla (`mss` + `Pillow`), temporizador de suspensión/apagado e icono en la bandeja del sistema (`pystray`).
2. **Extensión de Google Chrome (`chrome-extension/`):** Extensión **Manifest V3** con documento `offscreen` para mantener el WebSocket local siempre activo, sincronización de pestañas/ventanas en tiempo real, marcadores, historial, descargas y control preciso de video HTML5 (YouTube, Netflix, Twitch, Disney+, Prime Video) incluso con Chrome en segundo plano.
3. **Interfaz Móvil PWA (`frontend/`):** Aplicación táctil en **React + Vite + Tailwind CSS** con modo oscuro AMOLED (`#000000` / `#121212`), vibración háptica, *Wake Lock* (pantalla encendida) y emparejamiento instantáneo por código QR o PIN.

---

## Inicio Rápido

### 1. Iniciar el Servidor en tu PC

#### En Windows
Haz doble clic en **`start.bat`** o ejecútalo desde PowerShell/CMD:
```bat
.\start.bat
```

#### En macOS / Linux
```bash
chmod +x start.sh
./start.sh
```

Al iniciar:
- Se mostrará un **código QR** y el **PIN de 4 a 6 dígitos** en la consola.
- Aparecerá un icono en la **Bandeja del Sistema (System Tray)** desde donde puedes ver el código QR en ventana emergente, cambiar el PIN, pausar el control remoto o activar *"Iniciar con el sistema"*.

Opciones por línea de comandos (`backend/main.py`):
```bash
python backend/main.py --port 8765 --pin 2580
```

---

### 2. Instalar la Extensión en Google Chrome (Opcional pero Recomendado)

> **Resiliencia integrada:** Si aún no instalas la extensión, el servidor utiliza automáticamente atajos del sistema operativo para que la navegación y controles básicos sigan funcionando. Al cargar la extensión obtienes lista de pestañas en vivo, marcadores y barra de progreso exacta en videos.

1. Abre Google Chrome en tu PC y entra en `chrome://extensions/`.
2. Activa el interruptor **Modo de desarrollador** (arriba a la derecha).
3. Haz clic en **Cargar descomprimida** (*Load unpacked*).
4. Selecciona la carpeta **`chrome-extension`** dentro de este proyecto.
5. Verás el indicador **`ON`** en el icono de la extensión en cuanto el servidor local esté encendido.

---

### 3. Conectar tu Celular (Android / iOS)

1. Asegúrate de que tu celular y tu PC estén conectados a la **misma red Wi-Fi**.
2. **Opción A (QR Instantáneo):** Escanea con la cámara de tu celular el código QR de la consola o de la bandeja del sistema. Se autorizará automáticamente y guardará un token de sesión persistente.
3. **Opción B (PIN Manual):** Abre en el navegador de tu celular `http://<IP_DE_TU_PC>:8765` e introduce el PIN numérico mostrado en la PC.
4. **Instalar como App (PWA):**
   - **Android (Chrome):** Menú `⋮` → *Instalar aplicación* / *Añadir a pantalla de inicio*.
   - **iPhone (Safari):** Botón *Compartir* → *Agregar a inicio*.

---

## Catálogo de Controles Incluidos

| Pestaña Móvil | Funcionalidades |
| :--- | :--- |
| **1. Chrome** | Omnibox inteligente con selector de motor (Google, YouTube, Wikipedia, ChatGPT, DuckDuckGo, GitHub), Atrás/Adelante/Recargar/Sin caché/Detener/Inicio, Nueva pestaña/Ventana/Incógnito, Zoom (`-`/`100%`/`+`), `F11`, buscar en página (`Ctrl+F`) y cajones rápidos de **Marcadores**, **Historial** y **Descargas**. |
| **2. Media** | Play/Pausa, Anterior/Siguiente, saltos precisos (`-30s`, `-10s`, `-5s`, `+5s`, `+10s`, `+30s`), **barra de progreso interactiva (Scrubber)** en vivo, botón inteligente **Saltar Intro / Anuncio** (YouTube/Netflix), velocidad (`0.5x`–`2x`), subtítulos (`CC`), Pantalla Completa, Modo Teatro, **PiP**, y silencio independiente de video vs. PC. |
| **3. Touchpad** | Touchpad de baja latencia (`1 dedo`: mover/clic, `doble toque + mover`: arrastrar, `2 dedos`: clic derecho / scroll vertical y horizontal / pellizcar zoom), botones físicos Izq/Central/Der, **Teclado en vivo** con soporte completo para español (`ñ`, acentos, símbolos y emojis), **Dictado por Voz**, teclas especiales (`Esc`, `Tab`, flechas, `Alt+Tab`, `Win/Cmd`), atajos rápidos y modo **Espiar PC** (vista en vivo interactiva con toque directo). |
| **4. Pestañas** | Lista en tiempo real con favicon, título, dominio e indicador de audio; cambiar de pestaña con un toque, silenciar pestaña individual, fijar (Pin), duplicar, cerrar, reabrir última cerrada (`Ctrl+Shift+T`), cambiar entre ventanas y vista rápida de marcadores. |
| **5. Sistema** | Volumen maestro (`0–100%` + Mute), **Portapapeles bidireccional** (*Enviar/Pegar en PC* y *Traer de PC*), **Macros y Escenas** personalizables (*Modo Cine*, *Modo Trabajo*, *Modo Noche* + creador propio), **Sleep Timer** (`15/30/60/90 min`), **Energía protegida con confirmación** (*Bloquear*, *Suspender*, *Reiniciar*, *Apagar*), sensibilidad, *Wake Lock* y respuesta háptica. |

---

## Solución de Problemas Frecuentes

- **El celular no carga la página al escanear el QR:**
  Verifica que ambos equipos estén en la misma red Wi-Fi (no en una red de "Invitados" con aislamiento AP) y permite el acceso a Python en el **Firewall de Windows** para redes privadas (puerto TCP `8765`).
- **Quiero ejecutar las pruebas automatizadas del backend:**
  ```bash
  backend/.venv/Scripts/pytest backend/tests
  ```
