# Sowel house 3D

A stylised 3D view of a home, driven live by a Sowel instance.

The app reads a **plan** (rooms, walls, doors, windows, furniture) and a **mapping** to Sowel IDs, then mirrors the instance over its REST API and WebSocket: lamps glow, shutters slide, occupants move from room to room, the sky follows the sun and the weather. Clicks go back to Sowel as ordinary equipment orders or simulation triggers. The app has no logic of its own: what it shows is what Sowel does.

It is generic. The public showroom ([`sowel-showroom`](https://github.com/mchacher/sowel-showroom)) is one deployment; a user's own home is another, later.

## Visual reference

[`prototype/maison-temoin.html`](prototype/maison-temoin.html) is the throwaway Three.js prototype that validated the direction: a seven-room doll-house view, day cycle, weather, three occupants on an agenda, clickable lamps, shutters and floors, and a fake motion-light for narration. It is self-contained (one file, Three.js from a CDN) and has no link to Sowel. Keep it as the reference; do not grow it.

Direction: procedural walls from a plan JSON, CC0 low-poly furniture, Sowel palette (ocean blue, amber, warm off-whites), soft shadows, lamps that glow warm at dusk.

## Status

Scaffold: Vite + React + Tailwind + Three.js, the plan types and their validation, CI. The scene arrives with phase 3 of the [project map](https://github.com/mchacher/sowel-showroom/blob/main/docs/project-map.md).

## Looking at it

The app reads its session from `localStorage` on its **own origin** — the showroom's
landing page puts one there, and in production the proxy serves this app beside Sowel
so they share it. In development the origins differ, so a dev server needs one
handed to it:

```bash
# The showroom stack from sowel-showroom, already reset and running.
SOWEL_TARGET=http://localhost:8080 npm run dev
```

Then, once, in the browser console on the dev origin:

```js
const { username, password } = await (
  await fetch("http://localhost:8080/showroom/config.json")
).json();
const r = await fetch("/api/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
}).then((r) => r.json());
localStorage.setItem("sowel.accessToken", r.accessToken);
localStorage.setItem("sowel.refreshToken", r.refreshToken);
location.reload();
```

There is deliberately no login form and no token-in-the-URL shortcut: this app is a
view onto a Sowel somebody else authenticated, and the one place a visitor types a
password should stay the one place.

## Development

```bash
npm install
npm run dev             # proxies /api to a Sowel instance on localhost:3000
npm run validate        # lint, typecheck, format, tests, build — what CI runs
```

Releases: tag `vX.Y.Z` on main; the workflow publishes `sowel-house-3d-X.Y.Z.tar.gz`, the static build the showroom serves.

## License

AGPL-3.0, like Sowel.
