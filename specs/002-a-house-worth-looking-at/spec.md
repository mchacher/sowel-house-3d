# Spec 002 — A house worth looking at

**Phase 3, second pass.** Spec 001 proved the data path and admitted the look was a
first draft. This is the second draft: a house that reads as a house.

## Context

The first scene drew one storey at a time, as boxes, on a plan traced from the real
house's zone tree — sixteen rooms over four levels. Three things were wrong with
it, in the user's words: _très cubique, pas de toit, pas d'escalier; les pièces ne
semblent pas agencées comme une réelle maison_. And a fourth underneath: four
storeys is a tower, and a tower cannot be read from outside whichever way it is
drawn.

The decision, taken 2026-09-11: **a simple house**. A ground floor and one storey,
the garage attached at the side with a door worth showing, the rooms laid out the
way a French pavilion is. The simulator follows the drawing rather than the other
way round — fewer equipments, and that is fine.

## Goals

- The house reads as a house from outside: a roof, a garage, a drive, a terrace.
- Every storey is built and stands on the one below; the one being read is solid
  and the rest is glass, so nothing is hidden and nothing has to be peeled off.
- The stairs exist, and the upper slab is cut for them.
- The doors the house reports on — the front door, the terrace door, the garage —
  move when Sowel says they have.
- The plan is composed, not drawn: rooms and openings in, walls out.
- The simulator's house and this one are the same house: same rooms, same areas,
  same window orientations.

## Non-goals

- Furniture, textures, trees. A drawing of a house, not a rendering of one.
- Interaction. Phase 4.
- The exploded stack. Stacking with ghosting answers the same question.

## Functional requirements

### FR1 — The plan is composed

`scripts/plan/showroom.ts` describes rooms, windows and doors by room and side;
`src/plan/compose.ts` derives the walls: every line a room edge lies on, cut at
every corner on it, a wall wherever the two sides differ, an outside wall wherever
one side is not under the slab. Openings hang on the wall they lie on and fail
loudly when no single wall carries them. The output is `public/plans/showroom.json`,
which stays the contract everything else reads.

### FR2 — Two storeys, stacked, one solid

Every level is built at `level × (height + 0.3)`. Focus is a level or `outside`.
A storey out of focus is ghosted through its own copy of the structural materials —
opacity, `transparent`, `depthWrite` off — and stops casting shadows and lighting
its rooms. Lamp shades and lit panes keep their colour: seeing a light on upstairs
is most of the reason to show upstairs.

### FR3 — From outside, the postcard

`outside` makes every storey solid and puts the roof on. From inside any storey the
roof is glass, because a roof over the floor being read is a lid. The gable roof is
two tilted slabs and two triangular ends on the wall line; the garage wears a flat
slab.

### FR4 — Stairs

A stair is runs and landings in the plan; each run becomes blocks from the floor to
each tread. The upper slab is built as strips around its `hole`.

### FR5 — Doors that report

A `door:` or `gate:` opening with an id pairs, in plan order, with the contact
sensors of its room — the way shutters pair with windows. Open is the complement
of Zigbee's `contact`. A door swings on a pivot at its jamb; a gate lifts from its
lintel. Both are eased by the renderer like a shutter.

### FR6 — Lit windows

A room with a lamp on lights its panes. At night, from outside, that is the house.

### FR7 — One house

`sowel-plugin-simulator`'s `layout.ts` carries the plan's areas (within 6 %) and
window orientations; its fixture is reshaped to the same fourteen rooms
(`scripts/fixture/reshape.ts` there). A test here holds the areas; the simulator's
builder holds the rooms.

## Acceptance criteria

- `npx tsx scripts/plan/showroom.ts` regenerates the plan and it validates.
- From `outside`, a screenshot shows a gabled house with an attached garage, a drive
  to the street, the terrace and the pool.
- From `RDC`, the storey above and the roof are glass; the stairs climb to a hole in
  the upper slab.
- Ordering `sim.open` on the garage contact rolls the garage door up in the scene.
- At night, a lit room shows through its windows from outside.
- The simulator's `layout.ts` and this plan list the same rooms; the house-3d test
  on areas passes against the simulator's numbers.

## Edge cases

- A plan with no roofs or stairs builds as before: both are optional.
- A door with no contact bound stays shut rather than guessing.
- A contact on a window would take a door's place in the pairing; the showroom has
  none, and the pairing says so in `derive.ts`.
