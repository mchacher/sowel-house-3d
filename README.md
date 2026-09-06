# Sowel house 3D

A stylised 3D view of a home, driven live by a Sowel instance.

The app reads a **plan** (rooms, walls, doors, windows, furniture) and a **mapping** to Sowel IDs, then mirrors the instance over its REST API and WebSocket: lamps glow, shutters slide, occupants move from room to room, the sky follows the sun and the weather. Clicks go back to Sowel as ordinary equipment orders or simulation triggers. The app has no logic of its own: what it shows is what Sowel does.

It is generic. The public showroom ([`sowel-showroom`](https://github.com/mchacher/sowel-showroom)) is one deployment; a user's own home is another, later.

## Visual reference

[`prototype/maison-temoin.html`](prototype/maison-temoin.html) is the throwaway Three.js prototype that validated the direction: a seven-room doll-house view, day cycle, weather, three occupants on an agenda, clickable lamps, shutters and floors, and a fake motion-light for narration. It is self-contained (one file, Three.js from a CDN) and has no link to Sowel. Keep it as the reference; do not grow it.

Direction: procedural walls from a plan JSON, CC0 low-poly furniture, Sowel palette (ocean blue, amber, warm off-whites), soft shadows, lamps that glow warm at dusk.

## Status

Scaffold: Vite + React + Tailwind + Three.js, the plan types and their validation, CI. The scene arrives with phase 3 of the [project map](https://github.com/mchacher/sowel-showroom/blob/main/docs/project-map.md).

## Development

```bash
npm install
npm run dev             # proxies /api to a Sowel instance on localhost:3000
npm run validate        # lint, typecheck, format, tests, build — what CI runs
```

Releases: tag `vX.Y.Z` on main; the workflow publishes `sowel-house-3d-X.Y.Z.tar.gz`, the static build the showroom serves.

## License

AGPL-3.0, like Sowel.
