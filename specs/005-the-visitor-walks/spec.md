# Spec 005 — The visitor walks

**Status**: ✅ Implemented. Serves showroom spec 004 (_the thirty-second
visitor_).

## Context

The showroom's guided journeys have the visitor walk into a room so that a recipe
sees them (showroom spec 004). The owner, 2026-09-27: _a character that moves, to
make it visual — something like a toy figure, but not so much that the brand would
object._ The halo of a sensor and a lamp coming on say what happened; a figure
walking in says why.

## Goals

- The visitor is a figure in the house, their own, recognisable at a glance.
- It walks the plan: in through the front door, through doors, up the stairs.
- As it enters each room, the visitor's ghost is moved there in the simulator, so the
  recipes react when the figure arrives, not when the visitor clicked.

## Non-goals

- Other visitors' figures. Each visitor sees their own (a next increment of showroom
  spec 004: the simulator would publish ghosts as "visitor" devices).
- Clicking a room to walk there. Phase 4; the walk is started by the anchor.
- Walking animation fidelity: a toy, not a character rig.

## Functional requirements

### FR1 — The figure

A toy-like figurine, generic: a large round head (about a third of its height), a
cylindrical body, short legs, arms as rounded sticks, a face of two dots. Amber top
(Sowel's accent), ocean trousers, so the visitor is told apart from the household's
figures at a glance. None of a known toy's signatures: no helmet of hair, no C-shaped
hands, no printed face. About 1.5 m tall in the scene (it was 1.1 m and vanished in the vignette), with an
amber ring at its feet. (A "Toi" label over its head was tried and dropped: the
owner saw no use in it.)

### FR2 — The walk

`walk=<room>` in the frame's anchor (spec 003, amended) starts a walk to that room: the
figure appears at the plan's `awaySpot` if it is not in the house yet, and follows
the shortest path through the plan's door graph (`plan.doors`), door by door. Between
storeys it takes the stairs, step by step up the stair runs. Legs and arms swing while
it walks; it faces where it goes; it stops at the room's spot. About 1.4 m/s; about
twenty seconds from the street to the bathroom.

`walk=away` walks it back out of the front door, where it disappears.

### FR3 — The ghost follows the figure

On entering each room, the app orders `sim.ghost` on the house's "Simulation"
equipment with `<visitor id>:<room>`, through the public API with its own session.
The visitor id is random, kept in `localStorage` (`showroom_visitor`), shared with the
host page on the same origin. The simulator's ghost expires two minutes after its last
order (simulator spec 002, FR4); a figure standing in a room renews it every minute
so the light stays on while the figure is there.

### FR4 — What the visitor sees on the way

The view follows the figure, and so does what is ghosted (amended 2026-09-27, on the
owner's review): outside — the street, the garden — it is the house from outside,
solid and roofed; on the ground floor, the ground floor with the storey above as
glass; upstairs, the upper storey. The storey changes halfway up the stairs, where
the figure is, not at the next door. It follows for the whole walk; a visitor who
picks a storey themselves stops the following until the next walk.

## Acceptance criteria

- `#level=1&walk=salle-de-bain`: the figure appears in front of the house, walks
  through the hall and up the stairs into the bathroom; the hall, stair and bathroom
  lights come on as it enters each.
- `#walk=away`: it walks out; each light goes off a minute after it left the room.
- The path finder's route from `away` to every room of the showroom plan exists and
  goes through doors only.
- The figure reads as a figure in the 440 × 300 vignette.

## Edge cases

- A new walk while walking: it turns round and walks from where it is.
- The order fails (session expired): the figure still walks; the HUD's trouble line
  says Sowel did not hear it.
- A room the plan has no path to: the walk is refused, nothing moves.
