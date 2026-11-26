# Strike Force — Tactical Browser FPS

**Strike Force** is a 3D tactical first-person shooter built with **Babylon.js 9.36**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **Express**, and **Colyseus 0.18** WebSockets. Play solo against bots across three game modes or host private authoritative multiplayer rooms with integrated lobby and in-match chat.

---

## Features

### Game Modes
- **Team Deathmatch (`tdm`)**: Blue Task Force vs. Red Opposition, race to the kill limit (default 30) or highest score before time expires.
- **Free-For-All (`ffa`)**: Every operator hostile, live rank & leader scoreboard, first to 20 eliminations wins.
- **Secure Bomb (`bomb`)**: Attackers vs. Defenders round-based demolition with Bomb Sites A/B, carrier tracking, `[E]` hold plant/defuse, and detonation countdowns.

### Operators, Weapons & Equipment
- **4 Operator Archetypes**:
  - **Assault** *(AK-47 signature)* — balanced mid-range rifle with red-dot optics
  - **Vanguard** *(Vector-9 SMG signature)* — rapid CQC submachine gun with fast handling
  - **Breacher** *(M870 Combat Shotgun signature)* — high-impact close-quarters scattergun
  - **Marksman** *(AWP-50 Precision Sniper signature)* — full-screen mil-dot scope with 4X / 6X / 8X zoom (`[B]`)
- **Sidearm & Melee**: **USP Tactical Pistol**, **K-Bar Combat Knife** (equipped at all times via `[2]` or quick-melee), and 5 customizable 3D knife charms.
- **Tactical Equipment (`[G]` / `[3]`)**: Smoke Grenade, Flashbang, Frag Grenade, and Stun Grenade.
- **Visual Weapon Switching**: Queue primary weapon and tactical gear changes before deployment or during the Death Screen for seamless respawn swaps.

### Movement & Combat Mechanics
- **Jump Buffering & Coyote Time**: Forgiving ledge jumps and responsive mid-air strafing.
- **Tactical Sliding**: Sprint-slide momentum (`[C]` / `[Ctrl]`) with jump-cancel hops and configurable trigger/post-slide stance.
- **Tactical Pings (`[Z]`)**: World-space and 2D minimap ally/hostile callouts synced across teammates.
- **Killstreaks**: `F1` UAV Sweep (3 kills), `F2` Precision Barrage (5 kills), `F3` Overdrive (7 kills).
- **MVP Highlight Reel**: 5-second slow-motion 3D Babylon.js replay of the MVP final elimination at match end.
- **Procedural Web Audio**: Synthesized gunfire, hit/kill chimes, spatial audio cues, low-ammo click, and critical-HP heartbeat with zero external audio files.

### Multiplayer & Custom Matches
- **Authoritative Colyseus Rooms**: 6-character room codes, optional room password, configurable map/mode/limits/bots/friendly fire, host team balance & kick controls.
- **Solo Custom Lobbies**: Test custom rules, modes, maps, and bot counts locally without starting a remote session.
- **Team & All Chat**: Lobby comms and in-match `[Enter / T]` All chat and `[Y]` Team chat.

### Maps
- **Urban Sector** (`urban`)
- **Industrial Foundry** (`industrial`)
- **Arid Outpost** (`desert`)
- **Forest Watchpost** (`forest`)

---

## Controls

| Action | Default Input |
|---|---|
| Move | `W`, `A`, `S`, `D` |
| Aim / Fire / ADS | `Mouse`, `Left Click`, `Right Click` |
| Jump / Sprint | `Space`, `Shift` |
| Crouch / Tactical Slide | `C` or `Ctrl` |
| Reload / Bomb Interact | `R` / Hold `E` |
| Primary / Knife / Tactical | `1`, `2`, `3` (or `G`) |
| Quick Melee | `V` or `F` |
| Sniper Magnification | `B` (while ADS) |
| Tactical Ping | `Z` |
| Killstreaks | `F1` (UAV), `F2` (Barrage), `F3` (Overdrive) |
| In-Match Chat | `Enter` / `T` (All), `Y` (Team) |
| Scoreboard / Pause | `Tab` / `Esc` |

All combat bindings, crosshair geometry per weapon, team color palettes, mouse/ADS sensitivity, FOV, graphics quality, and audio mixes are customizable in **Settings**.

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 20.19+ or 22.12+

### Commands

```bash
# Install dependencies
npm install

# Run Express + Colyseus + Vite dev server on http://localhost:3000
npm run dev

# Run the test suite
npm test

# Typecheck
npm run lint

# Build production client bundle
npm run build

# Start production server (serves dist/ and Colyseus on same origin)
PORT=3000 CLIENT_ORIGIN="https://game.example.com" npm start
```

> **Production `CLIENT_ORIGIN`**: Set `CLIENT_ORIGIN` to a comma-separated list of allowed browser origins (without paths or trailing slashes). Development defaults allow local Vite/localhost origins automatically.

---

## Project Architecture

```text
├── server/
│   ├── index.ts                 # Express HTTP API (/api/health, /api/rooms) + Colyseus server + Vite integration
│   ├── hitValidation.ts         # Authoritative ray/capsule hit validation & damage calculation
│   ├── mapCollision.ts          # Server-side obstacle collision boxes per map
│   ├── mapSpawns.ts             # Team, FFA, and Bomb Site A/B spawn definitions
│   ├── rooms/MatchRoom.ts       # Colyseus room lifecycle, mode rules, chat & public room directory
│   ├── schema/MatchState.ts     # Colyseus MatchState, PlayerSchema, and BombStateSchema
│   └── validation/ammoValidation.ts
├── src/
│   ├── bots/BotManager.ts       # Offline bot AI, LOS perception, unstuck steering & combat
│   ├── game/
│   │   ├── EngineManager.ts     # Babylon.js engine, render loop, adaptive GPU/SwiftShader quality, HUD snapshots
│   │   ├── PlayerController.ts  # FPS movement, jump buffer, coyote time, tactical slide & focus hygiene
│   │   ├── WeaponSystem.ts      # Hitscan ballistics, recoil, viewmodels, charms & pooled tracers/decals
│   │   ├── tacticalEffects.ts   # Pooled barrage shells, explosion rings, smoke clouds & ordnance projectiles
│   │   ├── OperatorMeshBuilder.ts
│   │   ├── AudioEngine.ts       # Procedural Web Audio synthesizer
│   │   ├── highlightReel.ts     # 5s slow-motion MVP kill replay math
│   │   ├── gameModeRules.ts     # TDM, FFA, and Bomb rulesets
│   │   └── types.ts
│   ├── hooks/useMatchMachine.ts # React integration connecting EngineManager & NetworkManager
│   ├── maps/                    # Map definitions (urban, industrial, desert, forest) & MapManager
│   ├── match/                   # MatchManager & deterministic state reducer (matchMachine.ts)
│   ├── multiplayer/             # Colyseus client (NetworkManager), RemotePlayerRenderer & chat
│   ├── settings/                # Crosshair, keybindings, team colors, progression & settings persistence
│   └── ui/                      # MainMenu, GameHUD, PauseMenu, DeathScreen, EndMatchScreen, LobbyScreen, SettingsPanel
└── tests/                       # Unit & integration tests (node:test via tsx)
```
