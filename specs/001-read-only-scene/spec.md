# Spec 001 — The house, read-only

**Status**: 📝 Draft
**Phase**: 3 of the [project map](https://github.com/mchacher/sowel-showroom/blob/main/docs/project-map.md)
**Depends on**: phase 1 (the simulator, v0.2.0) and phase 2 (the showroom stack)

## Context

Phases 1 and 2 produced a house that lives and a URL that reaches it. Both are
real; neither is the thing that makes somebody stop scrolling. A product UI is
rows of cards, and a visitor who does not already know what a zone is reads them
as a spreadsheet about someone else's house.

This phase renders the same house as a house. Same Sowel, same instant, nothing
invented: lamps glow because an equipment says so, shutters slide because a
position changed, people move because an occupant's `zone` reading changed.

**Read-only.** A visitor watches. Clicking comes in phase 4, and keeping them
apart is what makes this phase's gate honest: if the scene mirrors the product UI
with nothing a human notices as lag, the data path is right, and phase 4 is then
only about sending orders.

## Goals

- A stylised 3D house in a browser, on a phone, that **is** a Sowel instance's
  current state.
- The geometry is **data**: a plan JSON. No room in the scene code.
- The Sowel side is **derived, not listed**: one small mapping from plan rooms to
  Sowel zones, and everything else — which lamp, which shutter, which sensor —
  follows from the zone's equipments and their types.
- It fails legibly. A plan that names a room Sowel does not have says so, on the
  screen, naming it.

## Non-goals

| Not here                                                    | Where                                                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Clicks, orders, ghosts, the journal, the visitor count      | Phase 4.                                                                                                                                        |
| Furniture beyond what reads as a room, a roof, solar panels | Phase 6 polish.                                                                                                                                 |
| Authentication of its own                                   | The app is handed a session by its host. The showroom's landing page puts one in `localStorage`; without one the app says so and shows nothing. |
| A plan editor                                               | The plan is authored by hand, in a file, reviewed in a pull request.                                                                            |
| Anything invented                                           | If Sowel does not say it, the scene does not show it.                                                                                           |

## Functional requirements

### FR1 — The plan is data, and it validates

`public/plans/showroom.json` describes the demo house: rooms as axis-aligned
rectangles, walls as segments carrying openings, doors as the edges of the graph
people walk on. Metres, x east, z south, y up.

The existing `src/plan/validate.ts` is the gate, and it grows teeth: a room that
overlaps another, a wall whose opening runs past its end, a door joining rooms that
do not exist, a room with no door to anywhere. **Each of those is a mistake a human
authoring a plan by hand actually makes.**

Plan room ids match the simulator's room ids (`sejour`, `chambre-enfant-1`,
`cave`…) because the two describe the same building and a second vocabulary for
the same rooms is a translation table waiting to go stale.

### FR2 — The mapping is small because the rest is derived

`public/plans/showroom.mapping.json` carries **one line per room**: the plan's room
id, and the name of the Sowel zone it is.

Everything else is derived at startup from `GET /api/v1/equipments`:

| In the scene         | Derived from                                                                            |
| -------------------- | --------------------------------------------------------------------------------------- |
| A room's lamps       | equipments in its zone of type `light_onoff`, `light_dimmable`, `light_color`           |
| A room's shutters    | type `shutter`, one per window of that room, in plan order                              |
| A room's sensor      | type `sensor` carrying a `motion` category binding                                      |
| A room's temperature | the zone's aggregated `temperature`                                                     |
| The sky              | the house zone's `sunrise`/`sunset`/`isDaylight`, and the weather equipment's condition |
| The people           | equipments whose device is an occupant — a `zone` reading over the plan's room ids      |

This is the lesson of the fixture builder, applied again: a list of seventy-four
things somebody typed is wrong within a month; a derivation from what Sowel
actually says is right for as long as the derivation holds. And it makes the app
**generic** — pointed at a different Sowel with a different plan, it works.

### FR3 — One client, two channels

`GET /api/v1/equipments` and `/api/v1/zones/aggregation` once at startup, for the
shape of things. Then the WebSocket for every change: `equipment.data.changed`,
`zone.data.changed`, `device.status_changed`.

**Polling is not a fallback.** If the socket drops, the app says it is reconnecting
and keeps showing the last state, greyed. A scene silently three minutes behind is
worse than a scene that admits it.

### FR4 — The session comes from the host

The app reads `sowel.accessToken` from `localStorage`, which is where the
showroom's landing page leaves it. It refreshes with `sowel.refreshToken` when a
request comes back 401.

With no token it shows one sentence and a link home. It does **not** offer a login
form: this app is a view onto a Sowel somebody else authenticated, and pretending
otherwise would make it a second front door.

### FR5 — What the scene shows

Ported from `prototype/maison-temoin.html`, which is the agreed look, and driven by
data instead of its hard-coded house.

|             |                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------- |
| Rooms       | floor, skirting, procedural walls with window and door openings                                     |
| Lamps       | a warm point light and a glowing shade; off is a dark shade, on is light in the room                |
| Shutters    | a slat panel that slides over its window, at the position Sowel reports                             |
| People      | a simple figure per occupant, standing at its room's spot                                           |
| Sky         | sun position from the zone's sunlight data, colour and intensity following it; overcast flattens it |
| Temperature | on the HUD, per room, on hover                                                                      |

Stylised, not realistic: the Sowel palette, soft shadows, warm lamps at dusk, and
it must hold a frame rate on a phone.

### FR6 — Movement is interpolated, not teleported

An occupant's `zone` reading changes in one step; the figure walks there over a
second or two along the door graph. A shutter's `position` arrives as a number; the
panel slides to it.

The scene interpolates **towards what Sowel said**, and never runs ahead of it. If
a reading stops arriving the figure stops where it is.

### FR7 — It says when it cannot

One HUD line, never a silent failure:

| Situation                                  | What it says                                                 |
| ------------------------------------------ | ------------------------------------------------------------ |
| No session                                 | "Pas de session — revenez par la page d'accueil."            |
| A plan room with no Sowel zone             | "Pièce inconnue de Sowel : `cave`" — named, so it is fixable |
| A zone with no lamp where the plan has one | A note, not an error: a room may genuinely have no light     |
| The socket is down                         | "Reconnexion…" and the scene greys                           |
| Sowel is unreachable                       | "Sowel ne répond pas."                                       |

### FR8 — The pure tier is tested, the scene is seen

`plan`, `mapping`, the state derivation and the pathing are pure functions over
plain data, and they are tested. The Three.js scene is verified by eye — and the
division is deliberate: everything that can be wrong _silently_ is in the tested
tier, and everything in the untested tier is wrong _visibly_.

**Every assertion gets broken on purpose once.** Phase 2 shipped a check that could
not fail — it read a field that does not exist, so it passed on a house where
nothing worked. A check that cannot fail is also a claim.

## Acceptance criteria

- [ ] AC1 — The plan validates; each of the five malformed plans in the test plan
      is rejected, naming what is wrong.
- [ ] AC2 — Pointed at the showroom, every plan room resolves to a zone, and the
      HUD names any that does not.
- [ ] AC3 — Lamps, shutters, sensors and people are derived from the API with no
      per-equipment entry in the mapping.
- [ ] AC4 — Turning a lamp on in the product UI lights it in the scene within a
      second, without a reload.
- [ ] AC5 — Ordering a shutter to 0 in the product UI slides the panel down.
- [ ] AC6 — `sim.motion` through the API lights the room's sensor in the scene.
- [ ] AC7 — Killing the WebSocket greys the scene and says "Reconnexion…"; it
      recovers on its own.
- [ ] AC8 — With no token, one sentence and a link; no blank screen, no crash.
- [ ] AC9 — It builds, and holds a frame rate on a phone-sized viewport.
- [ ] AC10 — `npm run validate` green.

## Edge cases

| Case                                                      | Expected                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A zone with two lamps                                     | Both rendered, at the room's lamp spots; a third has nowhere to go and is noted. |
| More shutters in the zone than windows in the plan        | The extras are noted, not dropped silently.                                      |
| An occupant whose `zone` is `away`                        | The figure leaves through the entrance and stands outside.                       |
| An occupant whose `zone` is a room the plan does not have | Noted once, and the figure waits outside rather than vanishing.                  |
| The sun below the horizon                                 | Night: the sky darkens, lamps that are on are the light in the scene.            |
| A reading arrives before the startup fetch finishes       | Queued and applied after, so nothing is lost in the gap.                         |
| Two browser tabs                                          | Two sockets, two scenes, no shared state. Sowel does not care.                   |
