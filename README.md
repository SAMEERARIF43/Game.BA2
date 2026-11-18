Project Badges & Overview: Babylon.js 9.36, React 19, TypeScript ES2022, Colyseus 0.18, Vite 8, and Tailwind CSS v4.

**The Gameplay Stuff:**
*   **Movement:** Feels smooth—got jump buffering (0.16s), coyote time (0.12s), high air accel (9.0 m/s²), and sliding that you can jump-cancel.
*   **Guns:** M4A1 Tactical, MP5-SD, Intervention .50 (comes with 4X/6X/8X mil-dot scopes and a rangefinder), and the M1911 sidearm.
*   **Bots:** The offline AI is fair. No wall-hacking; they use actual line-of-sight, their aim gets worse at a distance, they have human-like reaction times, and they don't get stuck on walls.
*   **Multiplayer:** Powered by Colyseus WebSockets. Server-authoritative with client-side prediction. Just use a 6-character code to join a room.
*   **Audio:** All procedurally synthesized. Includes kill-streaks chimes, gear clicking sounds, "out of ammo" clicks, and a heartbeat when you're low on health.
*   **Killstreaks & Leveling:** UAV (F1), Precision Barrage (F2), and Overdrive (F3). Your rank and XP save permanently.

**The Technical Side:**
*   **Controls:** A simple table showing all the keybinds for moving, fighting, swapping weapons, and menus.
*   **Getting it running:** Basic setup—just `npm install`, then `npm run dev` (or build, start, and lint).
*   **Project Map:** A folder tree showing where the backend, bots, game controller, maps, multiplayer, and UI live.
*   **Settings:** Adjust your FOV, mouse sensitivity, screen shake/flinch, and volume sliders.
