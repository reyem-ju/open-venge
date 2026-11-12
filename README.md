# open-venge

An open-source, browser-based multiplayer arena FPS in the spirit of fast, pick-up-and-play web shooters. Original code, original map, original procedural audio — no assets or code taken from any existing game.

**Stack:** TypeScript · Three.js (WebGL) client · authoritative Node.js server · WebSocket netcode.

## Features

- **Authoritative dedicated server** simulating at 60 Hz, snapshots at 20 Hz
- **Client-side prediction** with server reconciliation (input sequence acks) — movement feels instant at any ping
- **Lag-compensated hitscan combat** — the server rewinds player positions to what the shooter saw
- **Entity interpolation** for remote players (100 ms buffer)
- **Free-for-all deathmatch** with score/time limits, continuous join, automatic match rotation
- **4 weapons** — auto rifle, shotgun, sniper (with scope), pistol — each with spread, recoil, damage falloff, reloads
- **Server-side bots** so the arena is never empty (configurable count)
- **Quake-style movement** — ground friction, air control, step-up stairs, bunny-hop friendly jump
- **Full HUD** — health, ammo, dynamic crosshair, hitmarkers, directional damage indicators, killfeed, scoreboard, respawn/match-end overlays
- **Procedural audio** — every sound is synthesized at runtime with WebAudio; zero binary assets
- **Hand-crafted 3D assets** — animated blocky characters, weapon models, and prototype textures (CC0, see Assets)
- **Anti-cheat basics** — server-side validation of all inputs, rate limiting, clamped movement, authoritative ammo/health
- **One-command deploy** — Docker image with the client served by the game server

## Quick start

Requirements: Node.js 20+.

```bash
npm install
npm run build
npm start            # serves game + WebSocket on http://localhost:8080
```

Open http://localhost:8080 in two browser windows, pick a name and a weapon, and play.

### Development

```bash
npm install
npm run build        # once, to put index.html/style.css into client/dist
npm run dev          # watches client bundle + restarts server on change
```

### Docker

```bash
docker compose up --build
```

Environment variables:

| Variable  | Default | Meaning                        |
| --------- | ------- | ------------------------------ |
| `PORT`    | `8080`  | HTTP + WebSocket port          |
| `HOST`    | `0.0.0.0` | Bind address                 |
| `BOTS`    | `2`     | Number of server-side bots (0–12) |

## Controls

| Input        | Action                     |
| ------------ | -------------------------- |
| `W A S D`    | Move                       |
| `Space`      | Jump (hold to bunny-hop)   |
| `Mouse`      | Look                       |
| `LMB`        | Shoot                      |
| `RMB`        | Aim (scope on the sniper)  |
| `R`          | Reload                     |
| `1` / `2`    | Primary / secondary weapon |
| `Tab`        | Scoreboard                 |

## Architecture

```
packages/
  shared/    Code shared by client and server:
             physics (movement + AABB collision + step-up),
             raycasting (world, character hitboxes, head sphere),
             weapon configs, wire protocol with validation, map data
  server/    Authoritative game server:
             60 Hz tick loop, input queues, firing with lag
             compensation via position history, respawn/match flow,
             bot AI, snapshot broadcast, static file hosting
  client/    Three.js browser client:
             renderer + map builder, fixed-tick prediction with
             reconciliation, snapshot interpolation, viewmodels,
             tracers/impacts/muzzle flash, procedural Sfx, HUD, menu
```

### Netcode model

1. The client samples input at a fixed 60 Hz, applies it to a local prediction state immediately, and tags it with a sequence number.
2. The server queues inputs per player, steps the same shared `stepMove` physics, and broadcasts snapshots containing the last acked sequence per player.
3. On each snapshot the client rewinds its prediction state to the server position and replays unacked inputs — corrections are invisible unless the server truly disagrees.
4. Shots are resolved on the server. Each player keeps a position history ring buffer (~3 s); when someone fires, targets are rewound by `ping/2 + interpolation delay` before the ray test, so shooting at what you see is shooting at what is there.

## Testing & CI

```bash
npm run typecheck   # strict TypeScript across all packages
npm test            # physics, raycasting, protocol, and server integration tests
npm run build       # esbuild bundles for all packages
```

GitHub Actions runs all three on every push and pull request.

## Contributing

PRs are welcome. Keep changes focused, run `npm run typecheck && npm test` before pushing, and match the existing TypeScript style. Good first areas: additional maps (pure data in `packages/shared/src/maps/`), new weapons (one entry in `WEAPONS` + a viewmodel), and game modes (extend `Room` phase logic).

## Assets

The assets bundled in `packages/client/public/assets/`:

- **Weapons** ([Blaster Kit](https://kenney.nl/assets/blaster-kit)) and **textures** ([Prototype Textures](https://kenney.nl/assets/prototype-textures), resized to 256px) — **CC0** (public domain) by [Kenney](https://kenney.nl); `assets/License.txt` is Kenney's license file
- **Characters** (`Soldier.glb`, `Xbot.glb`) — from the [three.js examples](https://github.com/mrdoob/three.js/tree/master/examples/models/gltf) (MIT-licensed repository)

All code remains MIT.

## License

[MIT](LICENSE)
