# ⚡ STRIKE FORCE — Tactical Browser FPS

[![TypeScript](https://img.shields.io/badge/TypeScript-ES2022-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Babylon.js](https://img.shields.io/badge/Babylon.js-9.36.0-BB464B?logo=babylon.js&logoColor=white)](https://www.babylonjs.com/)
[![React](https://img.shields.io/badge/React-19.0.1-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Colyseus](https://img.shields.io/badge/Colyseus-0.18-FF6B6B?logo=colyseus&logoColor=white)](https://colyseus.io/)
[![Vite](https://img.shields.io/badge/Vite-8.3.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.3-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

**Strike Force** is a high-octane, low-latency tactical first-person shooter engineered natively for modern web browsers. Built on **Babylon.js 9.36** and **React 19**, it delivers fluid FPS movement mechanics, visceral combat feedback, distinct ballistic weapon roles, fair AI bots, and real-time multiplayer over WebSockets via **Colyseus**.

---

## 🎮 Key Features

### 🏃 Fluid Tactical Movement & Traversal
- **Jump Buffering (`0.16s` window):** Queues jump input right before touching the ground, eliminating dropped inputs.
- **Coyote Time (`0.12s` grace period):** Allows jumping for a split second after leaving rooftops or ledges.
- **Responsive Air Control:** Doubled air acceleration (`9.0 m/s²`) enables agile mid-air strafe adjustments without losing forward momentum.
- **Tactical Sliding & Jump-Canceling:** Initiate high-speed slides with `[C]` or `[Ctrl]`, or cancel mid-slide into a forward jump hop.
- **Dynamic Camera Flinch & Recoil:** Physics-based camera recoil pitch/yaw recovery with independent directional damage flinch.

### 🔫 Arsenal & Ballistics
Every weapon fulfills an unmistakable tactical niche:
- **M4A1 Tactical** *(Assault Rifle)*: 720 RPM, 28 Damage, tight ADS spread, 30-round mag. The gold standard for mid-range skirmishes.
- **MP5-SD Subgun** *(Submachine Gun)*: 900 RPM, 24 Damage (5-shot body kill / 4-shot with 1 headshot against 100 HP targets), integrally suppressed with fast reload and high hipfire mobility for CQC.
- **Intervention .50** *(Heavy Sniper)*: 72 RPM, 110 Damage (guaranteed 1-shot torso/head kill). Features full-screen mil-dot optic with 4X / 6X / 8X toggleable magnification, stadiametric rangefinder, and camera sway.
- **M1911 Sidearm** *(Pistol)*: 340 RPM, 36 Damage, 2.2x headshot multiplier, fast 1.15s reload. A dependable emergency finisher.
- **Quick Weapon Cycling:** Seamless switching via mouse wheel (`Scroll Up / Down`) or numeric hotkeys `[1]`–`[4]`.

### 🤖 Intelligent & Fair Bot AI (Offline Play)
- **Zero Wall-Hacking:** Line-of-sight (LOS) raycasts check world geometry. When sight is broken, bots track only the last known position during a brief randomized grace window (`0.4s`–`0.6s`) before returning to patrol.
- **Distance-Scaled Spread & Humanized Latency:** Bot spread dynamically scales from `0.035` at close range ($\le 5\text{m}$) to `0.085` at distance ($\ge 35\text{m}$), paired with realistic reaction times.
- **Unstuck Navigation:** Geometry collision detection automatically frees and redirects bots if blocked against terrain.

### 🌐 Real-Time Multiplayer (Colyseus)
- Authoritative room state synchronization with client-side prediction.
- 6-character room codes for instant private or public lobby matchmaking.
- Synchronized kill feeds, headshot indicators, hit registration, and scoreboards.

### 🔊 Procedural Web Audio Engine
Synthesizes zero-asset audio directly in the browser via Web Audio API:
- Ascending 3-tone crystalline kill confirmation chime.
- Tactical weapon equip clicks and distinct caliber-specific gunshots.
- Edge-triggered low-ammo audio warning click when reaching 20% magazine capacity.
- Sub-bass heartbeat pulse (~1.0 Hz) synchronized with a red screen vignette when critically wounded ($\le 25\text{ HP}$).

### 🎯 Killstreaks & Local Progression
- **3 Kills — UAV Sweep `[F1]`:** Activates full-spectrum radar sweep revealing enemy positions.
- **5 Kills — Precision Barrage `[F2]`:** Rains down artillery shells targeting living enemy locations.
- **7 Kills — Overdrive `[F3]`:** Grants temporary sprint speed surge and rapid health regeneration.
- **Ranks & XP:** Persistent local storage tracks XP, match milestones, and military ranks (Private to General).

---

## 🕹️ Controls Reference

| Action | Key / Input |
|---|---|
| **Move** | `W`, `A`, `S`, `D` |
| **Look / Aim** | `Mouse` |
| **Fire** | `Left Click` |
| **Aim Down Sights (ADS)** | `Right Click` |
| **Jump / Hop** | `Space` |
| **Sprint** | `Shift` |
| **Crouch / Slide** | `C` (toggle) or `Ctrl` (hold) |
| **Reload** | `R` |
| **Cycle Weapon** | `Mouse Wheel` or `1`, `2`, `3`, `4` |
| **Sniper Magnification** | `B` (toggles 4X / 6X / 8X when ADS) |
| **Killstreaks** | `F1` (UAV), `F2` (Barrage), `F3` (Overdrive) |
| **Scoreboard** | `Tab` (hold) |
| **Pause / Settings** | `Escape` |

---

## 🛠️ Tech Stack

- **3D Engine:** [Babylon.js 9.36](https://www.babylonjs.com/) (PBR & Standard Materials, Shadows, Post-Processing, Hardware Collisions)
- **Frontend:** [React 19](https://react.dev/), [TypeScript ES2022](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/), [Motion](https://motion.dev/)
- **Build Tool:** [Vite 8](https://vitejs.dev/)
- **Multiplayer Backend:** [Colyseus 0.18](https://colyseus.io/), [Express](https://expressjs.com/), [ws](https://github.com/websockets/ws), [tsx](https://github.com/privatenumber/tsx)
- **Audio:** Native Web Audio API procedural synthesis (zero external audio file dependencies)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 20.19.0 or newer, or 22.12.0 or newer
- `npm` or `pnpm`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SAMEERARIF43/Game.BA2.git
   cd Game.BA2
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The game and Colyseus server run together at `http://localhost:3000`. Local CORS defaults allow common Vite development and preview origins.

Solo/Bot mode does not require a separate multiplayer service. `npm run preview` serves only the built client; multiplayer requires the Colyseus server.

---

## 📦 Build & Production

Build the client bundle:

```bash
npm run build
```

Start the production server (serves `dist/` and Colyseus from the same origin). `npm start` defaults `NODE_ENV` to `production` and runs the TypeScript entry point with the existing `tsx` runtime:

```bash
npm start
```

Set `CLIENT_ORIGIN` to the exact browser origin(s) for production. Multiple origins are comma-separated; do not include paths or trailing slashes. The production server refuses to start without at least one configured origin.

Linux/macOS:

```bash
PORT=3000 CLIENT_ORIGIN="https://game.example.com" npm start
```

Windows PowerShell:

```powershell
$env:PORT = "3000"
$env:CLIENT_ORIGIN = "https://game.example.com"
npm start
```

To preview the static client bundle locally:

```bash
npm run preview
```

The preview server does not host Colyseus or the `/api` endpoints. Solo/Bot mode remains available; multiplayer needs a running server and a matching client endpoint.

To run typecheck analysis without emitting files:

```bash
npm run lint
```

---

## 📂 Project Architecture

```text
Strike Force/
├── server/                    # Colyseus multiplayer game server
│   ├── index.ts               # Server entry point & Express HTTP routes
│   └── rooms/
│       ├── MatchRoom.ts       # Authoritative match room state & hit validation
│       └── schema/            # Colyseus schema definitions (Player, RoomState)
├── src/
│   ├── bots/
│   │   └── BotManager.ts      # Bot AI, waypoint roaming, LOS perception & ballistics
│   ├── game/
│   │   ├── AudioEngine.ts     # Procedural Web Audio API sound generator
│   │   ├── EngineManager.ts   # Core loop orchestrator & scene lifecycle
│   │   ├── PlayerController.ts# First-person character controller, jump buffer, sliding
│   │   ├── WeaponSystem.ts    # Ballistics, recoil, pooled decals & tracers
│   │   └── types.ts           # Weapon configs, HUD state, settings models
│   ├── maps/
│   │   ├── MapManager.ts      # Procedural map builder & collision mesh generator
│   │   └── types.ts           # Map boundaries, spawn definitions
│   ├── multiplayer/
│   │   ├── MultiplayerClient.ts # Colyseus client connection manager
│   │   └── RemotePlayerRenderer.ts # Remote opponent interpolation & cosmetics
│   ├── settings/
│   │   └── progressionStorage.ts# LocalStorage persistence for rank, XP, stats
│   ├── ui/                    # React HUD overlays, Mil-Dot scope, Main & Pause menus
│   └── App.tsx                # Top-level React container & state router
├── public/                    # Static assets & favicon
└── vite.config.ts             # Vite bundler configuration
```

---

## ⚙️ Accessibility & Game Settings

Strike Force includes customizable settings accessible from the Pause menu:
- **Mouse Sensitivity & ADS Sensitivity Multiplier:** Custom sensitivity scaling.
- **Field of View (FOV):** Adjustable from 70° to 110°.
- **Screen Shake & Flinch Scale:** Adjustable from `0%` to `100%` for motion sensitivity.
- **Audio Channels:** Master, SFX, and Ambient/Music volume sliders.
- **Graphics Quality:** Low, Medium, and High presets adjusting shadow maps, decal counts, and particle density.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
