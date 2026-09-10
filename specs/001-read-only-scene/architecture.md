# Spec 001 — Architecture

## The four tiers, and why they are separate

```
src/
  plan/          data          the plan and its validator — pure, tested
  mapping/       data          plan room → Sowel zone, and the derivation — pure, tested
  client/        I/O           REST + WebSocket, session, reconnection
  state/         glue          Sowel's shape → the scene's shape — pure, tested
  scene/         Three.js      geometry and materials, driven by state/
  hud/           React         the overlay: what it cannot do, and what it is showing
```

The line that matters is between `state/` and `scene/`. Everything above it is
plain data and is tested; everything below it is geometry and is judged by eye.
That is not a convenience: **everything that can be wrong silently lives in the
tested tier, and everything in the untested tier is wrong visibly.** A lamp bound
to the wrong equipment is a silent bug; a lamp in the wrong corner is not.

## The plan

Already typed in `src/plan/types.ts`. The validator grows the checks a hand-authored
plan actually needs:

| Check                               | The mistake it catches          |
| ----------------------------------- | ------------------------------- |
| Rooms do not overlap                | two rooms given the same corner |
| An opening lies within its wall     | `at + w/2` past the wall's end  |
| `sill < head <= height`             | a window taller than the house  |
| Every door names two existing nodes | a room renamed, a door not      |
| Every room is reachable from `away` | a room nobody can walk into     |
| Ids are unique                      | copy-paste                      |

Each gets a malformed plan in the tests. A validator whose failure path is untested
is a validator that passes everything.

## The mapping, and what is derived from it

```json
{
  "zones": {
    "sejour": "Séjour",
    "cuisine": "Cuisine",
    "cave": "Cave"
  },
  "weatherEquipment": "Station Météo"
}
```

One line per room. At startup:

1. `GET /api/v1/zones` → resolve each name to a zone id. Unresolved names are
   collected and shown; the scene still builds, with those rooms inert.
2. `GET /api/v1/equipments` → bucket by `zoneId`, then by `type`.
3. Each plan room takes its lamps, shutters and sensor from its bucket, by type,
   and its shutters pair with the plan's windows **in plan order** — the plan
   declares them left to right, and so does the zone listing, which is a convention
   worth stating because it is the only thing that makes a shutter land on the right
   window.
4. An occupant is an equipment whose data carries a `zone` reading over the plan's
   room ids — the simulator publishes exactly that, and no other equipment does.

Nothing in the mapping names an equipment. That is the point: this is the fixture
builder's lesson applied again. A list of seventy-four things somebody typed goes
stale; a derivation from what Sowel says does not. And it makes the app generic —
a different Sowel with a different plan needs a different mapping file and no code.

## The client

```
client/
  session.ts     read localStorage, refresh on 401, report "no session"
  rest.ts        the two startup fetches, typed
  socket.ts      connect, subscribe, reconnect with backoff, report state
```

The socket carries `equipment.data.changed`, `zone.data.changed` and
`device.status_changed`. **There is no polling fallback.** A scene silently three
minutes behind is worse than one that says "Reconnexion…" and greys — the visitor
can tell the difference between a house that is quiet and an app that is lying, and
only one of those is survivable.

Events that arrive before the startup fetch resolves are queued and replayed, so
the gap loses nothing.

## State, the only place Sowel's shape is translated

```ts
interface SceneState {
  rooms: Record<
    string,
    {
      lamps: { on: boolean; brightness: number }[];
      shutters: number[]; // 0 closed … 100 open, one per plan window
      motion: boolean;
      temperatureC: number | null;
    }
  >;
  people: { id: string; room: string | "away"; label: string }[];
  sun: { elevationDeg: number; azimuthDeg: number; isDaylight: boolean };
  weather: { condition: string; cloudFactor: number };
  problems: string[]; // what FR7 shows
}
```

Pure: `(equipments, zoneAggregation, mapping, plan) => SceneState`, and the same
function applied to an event. Tested against fixtures captured from the real
showroom, so the test data is what Sowel actually sends rather than what I think it
sends.

## The scene

Ported from `prototype/maison-temoin.html` — the agreed look — with its hard-coded
house replaced by the plan. The prototype's primitives (`box`, `cyl`, `sphere`,
`wallPiece`, the furniture helpers, `buildPerson`) carry over nearly unchanged;
what changes is that they are called in a loop over plan data.

|          |                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Walls    | `wallPiece` per segment between openings, as the prototype already does                                                                 |
| Lamps    | one `PointLight` per lamp, intensity from `on × brightness`; a shade mesh whose emissive follows                                        |
| Shutters | a slat panel per window, y-offset interpolated towards `position`                                                                       |
| People   | `buildPerson`, positioned at the room's `spot`, walking the door graph                                                                  |
| Sun      | a `DirectionalLight` placed from elevation and azimuth; sky colour from elevation; `cloudFactor` flattens intensity and softens shadows |

One `PointLight` per lamp is the thing to watch on a phone — seventeen lamps is
seventeen shadow-casting lights if nothing says otherwise. Only lamps in the room
the camera is looking at cast shadows; the rest light without casting. That is a
visual compromise taken for a frame rate, and it is written down here so it is not
rediscovered as a bug.

## Pathing

The prototype already has `routeBetween` over the door graph. It carries over. A
person whose room changes walks the shortest path; one whose room is unknown waits
outside. Pure, and tested: a graph is exactly the kind of thing that is wrong
silently.

## What is deliberately not abstracted

There is no "renderer interface", no dependency injection into the scene, no
plug-in geometry. It is one house, rendered one way, and the seam that matters —
data in, geometry out — is the tier boundary above. An abstraction for the second
implementation nobody has asked for is how a 900-line prototype becomes 9,000 lines
that look the same.
