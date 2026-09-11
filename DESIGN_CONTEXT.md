# KineticText — Design & Architecture Context

> **Project Name:** KineticText (`kinetic-text`)  
> **Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), Matter.js (2D Physics), Lucide React  
> **Core Concept:** An interactive thermodynamic typography engine where typing and acoustic energy (blowing into a microphone) generate heat against constant thermal decay, triggering dynamic visual states from overheating amber jitter to frozen cyan frost and physical shatter collapse.

---

## 1. Product & Aesthetic Overview

KineticText combines a distraction-free writing environment with a high-tech laboratory telemetry console and physics sandbox.

- **Theme / Aesthetic:** Dark sci-fi / cyberpunk laboratory instrument console, high-contrast digital readout, sleek glassmorphism, glowing telemetry badges, and monospace typography.
- **Atmosphere:** Tense, kinetic, and responsive. The user must keep typing or blow into their microphone to stave off the freezing decay of the system.
- **Key Metaphor:** Words hold thermal mass. Without energy, language freezes, crystallizes, and shatters under gravitational physics.

---

## 2. Dynamic State Engine (The Thermal Spectrum)

The entire design is governed by a single continuous thermal variable: `displayTemp` (°C), bounded between **0.0°C** and **120.0°C** (default **75.0°C**).

| Thermal State | Range (°C) | Text Visuals | HUD Status Badge | Accent & Glow | Special Effects |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Critical Detonation (Meltdown)** | `120.0°C` | `text-amber-200` + `.animate-blast-glitch` | Rose badge: `💥 CORE DETONATION // RUNAWAY` | Hot Crimson & Incandescent Amber | **Text Destruction & Incineration**: Words are wiped from textarea and blasted into flaming physical debris shards on the explosion canvas; **Procedural Web Audio explosion boom**, full-screen blinding radial flash, traumatic terminal camera shake (`animate-explosion-shake`), 190-particle canvas blast with expanding shockwave ring, entropy loss tally, emergency venting purge back to 65.0°C. |
| **Overheating** | `60.1°C` – `119.9°C` | `text-amber-400` + amber text shadow | Amber badge: `HYPERTHERMIA ACTIVE` | Amber (`#f59e0b`, `#d97706`) | Thermal CSS jitter micro-animation (`@keyframes jitter`), active flame icon |
| **Equilibrium (Nominal)** | `20.1°C` – `60.0°C` | Clean `text-slate-100` | Emerald badge: `THERMAL EQUILIBRIUM NOMINAL` | Emerald (`#10b981`, `#059669`) | Crisp minimal monospace, subtle glows |
| **Rapid Cooling** | `0.1°C` – `20.0°C` | `text-cyan-300` + cyan text shadow | Cyan badge: `RAPID COOLING` | Cyan (`#22d3ee`, `#06b6d4`) | Radial frost vignette overlay fades in (`0.0` to `1.0` opacity) with progressive backdrop blur (up to `5px`) |
| **Critical Collapse (0 Kelvin)** | `0.0°C` | Textarea hides (`opacity: 0`) | Rose badge: `CRITICAL COLLAPSE` + ping dot | Rose (`#f43f5e`, `#e11d48`) | **Matter.js Physics Shatter**: Characters/words turn into rigid bodies that fall and bounce off the viewport floor. Collapse alert banner pulses. |

---

## 3. UI Layout & Component Architecture

The visual layout consists of three primary vertical zones anchored inside a fixed, full-viewport shell:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [TOP HUD HEADER]                                                       │
│ [Brand Indicator] [Digital Core Temp Gauge] ── [Status Pill] ── [Bellows Mic] [Reignite] │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [ALERT BANNER (Shown only on Collapse)]                               │
│                                                                        │
│  [MAIN TYPOGRAPHY ZONE]                                                │
│  Large centered monospace text canvas (2xl / 4xl)                      │
│  Dynamic color, jitter, and glow transitions                           │
│                                                                        │
│  [FULL-SCREEN FROST OVERLAY (Vignette + Backdrop Blur)]                │
│  [PHYSICS CANVAS (Matter.js 2D simulation active on collapse)]         │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ [BOTTOM TELEMETRY FOOTER]                                              │
│ [Decay & Energy Rates]                      [Global Shortcuts: Shift+F/H/R] │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Top Telemetry HUD (`<header>`)
- **Brand Identity:** Amber geometric pill with `KineticText` tracking (`tracking-[0.25em]`).
- **Digital Core Temperature Gauge:**
  - Dynamic `Flame` (ignites > 60°C) and `Snowflake` (crystallizes ≤ 20°C) icons with drop-shadow glows.
  - Tabular monospace temperature numbers (`75.0°C`).
- **Status Indicator Pill:** Rounded badge with an animated pulsing indicator dot (`bg-emerald-500`, `bg-cyan-400`, or `bg-rose-500 animate-ping`).
- **Acoustic Bellows Toggle:**
  - Microphone access button utilizing the Web Audio API.
  - Live audio energy progress bar showing mic RMS volume level.
  - Transforms into an amber turbulence indicator (`TURBULENCE (+10°C)`) when the user blows into the mic.
- **Reignite Action:**
  - Radiant orange-to-amber gradient button with glow and reset icon (`Shift + R`).
  - Pulses aggressively with red alert glow when system is collapsed.

### 3.2 Typography & Simulation Viewport (`<main>`)
- **Central Textarea:**
  - Borderless, unstyled transparent canvas (`resize-none font-mono`).
  - Fluid sizing (`text-2xl md:text-4xl`), optimized for distraction-free typing.
  - Transitions into hidden opacity during physics collapse so the 2D physics canvas seamlessly takes its place.
- **Frost Overlay Vignette:**
  - Fixed viewport overlay with radial cyan gradient (`frost-overlay`).
  - Dynamic inline style controlling `opacity` and `backdropFilter: blur(...)` proportional to temperature drop below 20°C.
- **Matter.js Canvas Layer:**
  - Mounted full-viewport on z-index 30 when `displayTemp <= 0.0`.
  - Renders physical word blocks with neon cyan borders (`rgba(34, 211, 238, 0.65)`), slate fills, and cyan text shadows.
  - Viewport bounds (floor, walls) prevent bodies from falling offscreen.

### 3.3 Telemetry & Control Footer (`<footer>`)
- **Real-Time Energy Specs:** Displays the thermal loop parameters:
  - Decay rate: `-6.0°C / 400ms` (high-stakes decay)
  - Keystroke energy: `+3.5°C`
  - Bellows blast: `+10.0°C`
- **Global Keyboard Shortcut Matrix:**
  - `<kbd>Shift+F</kbd>`: Force freeze (0°C)
  - `<kbd>Shift+H</kbd>`: Detonate / Overheat breach (120°C)
  - `<kbd>Shift+R</kbd>`: Reset & flush core (75°C)

---

## 4. Design System Tokens & Styles

### Colors
- **Background Base:** `var(--color-slate-950)` (`#020617`)
- **Panel & Surfaces:** `rgba(15, 23, 42, 0.9)` (`slate-900/90`)
- **Borders & Dividers:** `slate-800/80`, `slate-700/80`
- **Thermal Accents:**
  - Amber / Fire: `#f59e0b` (`amber-500`), `#ea580c` (`orange-600`), `#d97706` (`amber-600`)
  - Cyan / Ice: `#22d3ee` (`cyan-400`), `#67e8f9` (`cyan-300`), `#0e7490` (`cyan-700`)
  - Emerald / Nominal: `#10b981` (`emerald-500`), `#34d399` (`emerald-400`)
  - Rose / Collapse: `#f43f5e` (`rose-500`), `#be123c` (`rose-700`)

### Typography
- **Font Family:** Monospace (`font-mono`, `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`)
- **Numbers:** Tabular figures (`tabular-nums`) for jitter-free digital readouts.

### Key CSS Utilities (`src/index.css`)
- `.animate-jitter`: Rapid 0.14s linear translation loop simulating thermal Brownian motion.
- `.text-glow-amber`: Multi-layered amber text shadow.
- `.text-glow-cyan`: Multi-layered cyan text shadow.
- `.frost-overlay`: Radial vignette gradient creating corner icing effects.

---

## 5. Potential Design Enhancement Vectors

When redesigning or elevating the visual look, consider these directions:
1. **Analog / Sci-Fi Thermometer Gauge:** Replace the numeric box with a curved circular SVG dial, mercury bar, or segmented LED bar graph.
2. **Atmospheric Particle Engine:**
   - Floating ember particles rising when temperature exceeds 70°C.
   - Condensation frost crystals crawling inwards from screen edges as temperature approaches 0°C.
3. **Sound FX & Haptics:** Audio synthesis via Web Audio oscillator nodes (steam hiss on typing, low-frequency hum, ice cracking on shatter).
4. **Shatter Physics Aesthetics:** Enhanced block styling with shattered ice shard polygons instead of rounded rectangles.
5. **Theme Presets / Colorways:** High-contrast retro phosphor green (CRT terminal), synthwave neon violet/magenta, or molten magma orange.

---

## 6. Key Source Files
- [App.tsx](file:///c:/Useless%20Project/src/App.tsx): Contains all application state, thermal decay loop, Web Audio bellows, Matter.js simulation, and UI components.
- [index.css](file:///c:/Useless%20Project/src/index.css): Theme tokens, custom animations (`jitter`), text glow effects, and radial frost vignette.
- [package.json](file:///c:/Useless%20Project/package.json): Project dependencies and build scripts.
- [index.html](file:///c:/Useless%20Project/index.html): HTML root and viewport metadata.
