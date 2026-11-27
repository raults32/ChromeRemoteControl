# Chrome Remote Control — Brand & Visual Identity Guidelines

## 1. Brand Essence & Positioning
- **Brand Name:** Chrome Remote Control
- **Tagline:** *Your Chrome & PC, under your thumb.*
- **Category:** Open-source Developer & Home-Theater Utility (Chrome MV3 Extension + AMOLED Mobile PWA + Silent Windows Agent)
- **Voice & Tone:** Crisp, technical yet approachable, zero-friction, privacy-first. Lead with concrete outcomes (`< 15 ms` WebRTC P2P latency, `0` terminal windows, 1-scan QR pairing) rather than vague marketing superlatives.

## 2. Color System (OLED Dark-First)
Designed around low-emission OLED surfaces paired with high-visibility electric cyan, sky blue, and live emerald telemetry accents:

| Role | Token | Value | Contrast on `#080b12` |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `--color-background` | `#080b12` | — |
| **True AMOLED Surface** | `--color-amoled` | `#000000` | — |
| **Card Surface** | `--color-surface` | `#0e131f` | — |
| **Elevated Bento Surface** | `--color-surface-elevated` | `#121929` | — |
| **Primary Foreground** | `--color-foreground` | `#f1f6ff` | `17.8 : 1` (AAA) |
| **Secondary Foreground** | `--color-muted-foreground` | `#a8b5cc` | `9.2 : 1` (AAA) |
| **Brand Primary (Cyan)** | `--color-primary` | `#22d3ee` | `11.4 : 1` (AAA) |
| **Live Telemetry (Emerald)** | `--color-success` | `#34d399` | `10.6 : 1` (AAA) |
| **Media Accent (Amber)** | `--color-warning` | `#fbbf24` | `11.9 : 1` (AAA) |

## 3. Typography
- **Display & Body (`--font-sans`):** `Plus Jakarta Sans` (variable `400–800`, self-hosted WOFF2 with `font-display: swap`), geometric clarity with tight display tracking (`-0.045em`).
- **Telemetry & Code (`--font-mono`):** `JetBrains Mono` / `SFMono-Regular` / `Consolas` system monospace stack for latency badges, Room IDs, CLI commands, and version tags.

## 4. Iconography & Visual Rules
- **Vector-Only Policy:** Never use platform emojis (`🍿`, `⚡`, `🖥️`) as structural UI icons. Use uniform `24×24` stroke SVGs (`stroke-width: 1.85`, `stroke-linecap: round`, `stroke-linejoin: round`).
- **Accessibility:** Hide decorative icons adjacent to visible labels with `aria-hidden="true"`. Ensure interactive controls maintain `>= 44×44px` hit targets on touch devices (`pointer: coarse`) and `2px` high-contrast `:focus-visible` outlines.
