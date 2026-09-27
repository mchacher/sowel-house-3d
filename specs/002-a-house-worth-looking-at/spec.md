# Spec 002 — A house worth looking at

**Status**: ✅ Implemented, amended twice.

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

## Amendment — 2026-09-11: the grounds and the rooms

The pavilion alone was a house on a green sheet. Built the same week, on the
owner's review of the first screenshots:

- **The grounds.** The plan gains a `fence` with a sliding gate, `beds` (flowers,
  lawn), `trees` (tree, olive, bush), `patches` (drive, path), `machines` (outdoor
  units) and `Roof.solar` (the eight panels the simulator's 4 kWc array is). The
  mapping gains `gates` (a fence gate → its equipment, open from its contact) and
  `watering` (a bed's group → its valve; jets over the bed while it is open).
- **The pool.** Water that reads as water, a coping, and the cover from Sowel's
  `pool_cover` position.
- **The rooms.** Furniture by room kind — enough that a room reads as what it is.
  Radiators (`heater`) on a wall and a stove for a room's thermostat, warm while
  they heat. The non-goal "furniture, trees" was lifted this far on the owner's ask.

## Amendment — 2026-09-26: every equipment where its name says

The owner, going through the demo: outdoor lights drawn anywhere, spots meant for
the terrace in the lawn, the tree uplights not under trees, a lamp in the middle of
the pool. What changed:

- **Typed fixtures.** `Room.fixtures` places each light as what it is — `ceiling`,
  `spots`, `sconce`, `wall`, `uplight`, `bollard`, `underwater` — at the points the
  plan gives; a room's fixtures pair in order with its lamps.
- **Placement by name.** The mapping's `placement` lists, per room, the equipment
  names in the plan's order: lamps pair with fixtures, shutters with windows, by
  name rather than by whatever order Sowel returns them in. An equipment sitting on
  a parent zone (the garden's lamps on `Extérieur`) is claimed by the room that
  names it.
- **Nothing drawn where the plan does not say.** An outdoor lamp with no fixture is
  not drawn, and the derivation reports it on screen. Indoors a lamp without a
  fixture still gets a ceiling light.
- **Motors at motor speed.** The garage door takes 12 s and the gate 16 s, at
  constant speed; eased, they covered their travel in a second.
- **A WC** off the hall, and a bathroom furnished as one; every room named in both
  languages (spec 003).

## Amendment — 2026-09-26: the design pass

The owner, reviewing the demo: shutters like planks, doors like metal plates, four
identical bedrooms, a dark line between the roof and the storey, a sofa standing in
the stove, heat pumps nobody recognised. What changed:

- **FR3, the roof sits on the walls.** The slopes' underside meets the top of the
  walls on the wall line and rises `rise` to the ridge; the gables fill exactly that,
  as wide as the walls are thick; a ridge cap closes the notch. The old slopes and
  gables started 5 cm up, the gables steeper than the roof.
- **FR8 — Joinery.** A roller shutter is slats leaving a housing between two rails
  (an instanced mesh whose `count` is the slats showing); the pool cover is the same
  shutter lying on the water. Windows get an anthracite frame, a mullion from 0.9 m
  wide, and a stone sill outside. The front door is ocean blue with a glass slit, a
  pull bar, a step and a canopy; the terrace door is glazed (`Opening.glazed`); the
  garage door is sectional; doorways between rooms get an oak door standing open into
  the room rather than the hall or stair; every doorway gets a casing.
- **FR9 — Furniture by piece.** `Room.furniture` lists items against a wall (`wall`,
  `at`, `off`) and `Room.accent` colours the textiles; a room without keeps what its
  kind gives it. The plan's tests hold every piece inside its room clear of the walls,
  out of every door's swing, blocking no window past a third of its height, off the
  stove's corner (`stoveSpot`), and no two bedrooms alike. Floors follow the kind:
  parquet, tiles, concrete. The non-goal "furniture" is lifted this far; textures
  stay out.
- **FR10 — The pool's water.** The pool zone's `pool_pump` and `pool_heat_pump`
  become `RoomState.pump` and `poolHeating` — the heat pump's run state, which the
  simulator interlocks on the pump. While the pump runs, small waves ring out from
  the end away from the roller and travel down the pool, growing and fading; while
  the heat pump heats, they leave orange and cool as they go, over a faint warm glow
  at the jets. One plane exactly the water's size, drawn by a shader, so nothing
  reaches past the edge; it fades in and out, and a closed cover hides it. (A first
  cut hung rings, streaks, fans and steam over the water: they spilled onto the
  lawn and looked like an arcade game.) The pool's machines are not drawn — boxes
  on its edge were ugly, and the water says what they do. The house's heat pump is,
  against the west wall.

## Amendment — 2026-09-26: twelve panels

The simulator goes back to 6 kWc (its spec 001, amended the same day): the owner
found 4 kWc weak on the running demo. The roof carries what the simulator produces
from, so `Roof.solar` becomes **two rows of six**, twelve 500 W panels on the south
slope — 6.6 m along an 11.4 m slope, 3.6 m down a 5.8 m one. The plan's test holds
the panel count times 500 W against the simulator's peak, as it holds the room areas
against its thermal model.

## Amendment — 2026-09-27: a stair that leaves a landing

Walking a figure through the house (spec 005) found that the upper floor had no
landing: the stairwell's opening took its whole middle, and the three children's
rooms opened onto the void, with no way from the stairs to them. The stairs become a
U in the north half of the stairwell — east along the hall's wall, a half landing
against the east wall, back west to arrive by the bathroom — and the opening shrinks
to that U. The band south of it is the upstairs landing, joining the two wings, and
free floor downstairs. The hall's door to the stairs moves to the foot of the first
flight; the passage by the WC opens onto the free band.

## Amendment — 2026-09-27: the heat pump’s fan turns; a radiator is warm when it heats

For the showroom's second guided journeys (showroom spec 004), where a visitor
lets the cold into the office and the heat pump starts:

- The mapping may name the house's heat pump (`heatPump: "PAC"`). Its outdoor
  unit's fan turns while the pump's run state (`state`) is true, spinning up and
  running down rather than jumping. No name, no binding: the fan stays still and
  nothing is reported.
- A radiator is drawn warm on its `heating` binding when it has one, its `state`
  otherwise. On a pilot wire the relay signals eco or comfort, not warmth
  (simulator spec 001, amended the same day); read as warmth, a child's room
  glowed in eco and went cold in comfort.

## Amendment — 2026-09-27: a stair whose foot is on the way

The owner, walking the figure from the living room to child's room 2: it went out
by the terrace, round the garden and in by the front door. The U of the previous
amendment filled the north half of the stairwell wall to wall, its first flight
against the hall: the hall's door opened onto the first step, and from the band by
the living room the foot could not be reached — the upper flight stood in the way,
1.3 m off the floor.

- The flights are **1.75 m** (seven steps of 25 cm), leaving an **aisle on the
  west** of the stairwell from the hall's door (now 0.7 m) to the band.
- The **first flight is the south one**: its foot is on that aisle, reached from the
  hall and from the living room alike. The second flight comes back along the north
  and arrives upstairs above the hall; the opening upstairs shrinks to the flights.
- The stairwell's spot moves onto the band, out from under the flights.
