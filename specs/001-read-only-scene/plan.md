# Spec 001 — Implementation plan

Branch: `feat/read-only-scene`. Scopes: `plan`, `mapping`, `client`, `state`,
`scene`, `hud`.

Built from the top down — data, then derivation, then I/O, then geometry — so that
by the time anything is drawn, what it draws has been tested.

## Steps

- [ ] **S1 — the plan's validator grows teeth**: overlap, openings within walls,
      sill/head against height, doors naming existing rooms, reachability from
      `away`, unique ids. A malformed plan per rule.
- [ ] **S2 — `public/plans/showroom.json`**: the demo house, sixteen rooms over four
      levels, room ids matching the simulator's.
- [ ] **S3 — `mapping/`**: the file, its types, and the derivation — zones by name,
      then lamps, shutters, sensors and occupants by type out of
      `GET /api/v1/equipments`. Pure, tested against captured fixtures.
- [ ] **S4 — `client/session.ts`**: read `localStorage`, refresh on 401, report the
      absence rather than guessing.
- [ ] **S5 — `client/rest.ts` + `client/socket.ts`**: the two startup fetches, the
      socket, reconnection with backoff, the queue that holds events arriving before
      startup finishes.
- [ ] **S6 — `state/`**: `(equipments, aggregation, mapping, plan) => SceneState`,
      and the same for one event. Tested on fixtures captured from the running
      showroom.
- [ ] **S7 — `hud/`**: the one line of FR7, the room readout, both themes.
- [ ] **S8 — `scene/`**: the prototype ported — walls from the plan, lamps,
      shutters, people, sun.
- [ ] **S9 — interpolation**: shutters slide, people walk the door graph, nothing
      teleports and nothing runs ahead of Sowel.
- [ ] **S10 — against the running showroom**: every acceptance criterion, including
      turning a lamp on in the product UI and watching the scene.

## Test plan

| Module          | Scenario                                    | Expected                                             |
| --------------- | ------------------------------------------- | ---------------------------------------------------- |
| `plan/validate` | The showroom plan                           | Valid                                                |
| `plan/validate` | Two rooms overlapping                       | Rejected, naming both                                |
| `plan/validate` | An opening past its wall's end              | Rejected, naming the wall                            |
| `plan/validate` | `head > height`                             | Rejected                                             |
| `plan/validate` | A door naming a room that does not exist    | Rejected, naming it                                  |
| `plan/validate` | A room with no door                         | Rejected: nobody could walk in                       |
| `plan/validate` | Duplicate room ids                          | Rejected                                             |
| `mapping`       | The showroom mapping against captured zones | Every room resolves                                  |
| `mapping`       | A mapping naming a zone Sowel does not have | Collected as a problem, not thrown — **AC2**         |
| `mapping`       | A zone with two lamps                       | Both derived, in listing order                       |
| `mapping`       | A zone with no lamp                         | No lamps, and a note rather than an error            |
| `mapping`       | More shutters than the plan has windows     | The extras noted                                     |
| `mapping`       | An occupant equipment                       | Recognised by its `zone` reading, not by its name    |
| `state`         | Captured startup payloads                   | A `SceneState` with every room populated — **AC3**   |
| `state`         | An `equipment.data.changed` for a lamp      | That lamp on, nothing else touched — **AC4**         |
| `state`         | A `zone.data.changed` carrying motion       | That room's sensor lit — **AC6**                     |
| `state`         | A shutter position of 0                     | `shutters[i] === 0` — **AC5**                        |
| `state`         | An occupant moving to `away`                | `room === "away"`                                    |
| `state`         | An occupant moving to an unknown room       | A problem, and the person stays put                  |
| `pathing`       | Two rooms on different levels               | A route through the doors that exist                 |
| `pathing`       | An unreachable room                         | No route, and the caller copes                       |
| `session`       | No token in `localStorage`                  | Reports absence; nothing throws — **AC8**            |
| `session`       | A 401 with a refresh token                  | Refreshes once, retries once, gives up after         |
| `socket`        | The socket closes                           | Reports reconnecting, retries with backoff — **AC7** |
| `socket`        | Events before startup resolves              | Queued, then applied                                 |

## Against the running showroom

The showroom from phase 2 is up on `localhost:8080`, so this is not a thought
experiment:

1. Open the scene. Every room resolves; the HUD is quiet.
2. Turn a lamp on in the product UI → the scene lights it, under a second.
3. Order a shutter to 0 → the panel slides, it does not jump.
4. `sim.motion` on a sensor → the room's sensor lights in the scene.
5. `docker compose restart sowel` → "Reconnexion…", the scene greys, and it comes
   back on its own.
6. Clear `localStorage` → one sentence and a link.

## Broken on purpose, once each

Phase 2 shipped a check that could not fail, and it passed on a house where nothing
worked. So every assertion here is watched going red before it is trusted: the
malformed plans, the unresolvable zone, the missing token, the killed socket.
