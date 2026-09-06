# CLAUDE.md

Guidance for Claude Code (and any AI agent) working on `sowel-house-3d`. First file to read. Same method as the Sowel core: spec with gates, feature branch, tests, agent review, PR, explicit merge approval.

## What this is

A **static web app** that renders a home in stylised 3D and mirrors a Sowel instance live: lamps glow on `power`, shutters slide on `position`, occupants move on their `zone` reading, the sky follows the sun and the weather. Clicks go back to Sowel as ordinary equipment orders or `sim.*` simulation orders. **The app has no logic of its own**: what it shows is what Sowel does.

It is generic. The public showroom is one deployment; a user's own home is another, later.

## Where to find context

| You want to know...                        | Read this                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Why this exists, the decisions, the phases | [sowel-showroom/docs/project-map.md](https://github.com/mchacher/sowel-showroom/blob/main/docs/project-map.md) |
| The look to reproduce                      | `prototype/maison-temoin.html` — throwaway, self-contained, **do not grow it**                                 |
| Sowel's REST API and WebSocket events      | `mchacher/sowel`: `docs/technical/api-reference.md`                                                            |
| The plan format                            | `src/plan/types.ts`, `src/plan/validate.ts`                                                                    |
| Every feature specified here               | [docs/specs-index.md](docs/specs-index.md) — one row per spec, CI-gated                                        |
| Feature history in this repo               | `specs/NNN-name/{spec,architecture,plan}.md`                                                                   |

## Non-negotiable rules

- **No business logic.** Never decide in the app that a lamp should be on. Read Sowel's state; send Sowel orders.
- **Every write goes through Sowel's public API** with the session the app was given. The app never talks to the plugin.
- **The plan is data.** Geometry comes from a plan JSON; Sowel bindings come from a mapping JSON keyed by plan ids. No hard-coded room in the scene code.
- **Visitors never move the household.** A floor click sends `sim.ghost`; the household follows its agenda.
- **Stylised, not realistic.** Procedural walls, CC0 low-poly furniture (Kenney, Quaternius, Poly Pizza — keep the licence file next to each asset), Sowel palette: primary `#1A4F6E`, accent `#F2C035`, light `#EEF5F8`. Soft shadows, warm lamps at dusk. Must run on a phone: no expensive post-processing.
- **Both themes** for the HUD (Tailwind `dark:`), Inter for text, JetBrains Mono for values.
- Pure modules (plan, mapping, state binding, pathing) are **tested**; the Three.js scene is verified by eye.

## Tech

Vite 8, React 19, TypeScript strict, Tailwind 4 (config-less, utilities only), Zustand, Three.js. Vitest for the pure tier. ESLint + Prettier as in the core's `ui/`.

```bash
npm install
npm run dev             # Vite, proxies /api to a Sowel on localhost:3000
npm run validate        # lint, typecheck, format:check, test, build — exactly what CI runs
```

## Git workflow

- Feature branches: `feat/`, `fix/`, `refactor/`, `docs/`. Main is protected (PR required, linear history, CI green).
- Conventional commits. Scopes: `plan`, `scene`, `client`, `hud`, `ui`, `ci`.
- **Never merge a PR without explicit user approval** ("oui", "merge", "go").
- Every new `specs/NNN-name/` folder needs `spec.md`, `architecture.md`, `plan.md` **and a row in `docs/specs-index.md`** (two CI gates). A spec that starts a phase also flips that phase's status in the showroom's project map.
- A release is a PR (version bump, changelog) then a tag on main; the workflow publishes the static build the showroom deploys. See the `house3d-release` skill.

## Skills

| Skill             | When                                                        |
| ----------------- | ----------------------------------------------------------- |
| `house3d-feature` | Implementing a feature or a phase: spec, branch, tests, PR. |
| `house3d-release` | Bumping, tagging, publishing the static build.              |

## Answering the user

Short and ordered. One or two lines for the what, one bullet per finding or decision. French or English, whichever the user uses.
