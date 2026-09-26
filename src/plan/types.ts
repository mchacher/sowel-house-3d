/**
 * The house plan: what the scene is built from.
 *
 * Metres, x to the east, z to the south, y up (Three.js convention). Rooms are
 * axis-aligned rectangles; walls are axis-aligned segments carrying openings;
 * doors are also the edges of the pathing graph occupants and ghosts walk on.
 * The plan describes geometry only — what a lamp or a shutter is bound to in
 * Sowel is the mapping's job, keyed by the ids declared here.
 *
 * `public/plans/showroom.json` is **generated** by `scripts/plan/showroom.ts` from
 * a description of the rooms and their openings; the walls are derived from the
 * rooms' edges. Editing the JSON by hand is how a wall ends up running through a
 * doorway.
 */

/** A wall's side of a room, or which way a wall-mounted thing faces. */
export type Side = "N" | "S" | "E" | "W";

/**
 * What a light is, which is what it looks like and where its light falls.
 *
 * - `ceiling` — one fitting under the ceiling: a plafonnier. What a room gets when
 *   the plan says nothing.
 * - `spots` — recessed spots, one pool of light under each.
 * - `sconce` — an applique on a wall, facing into the room.
 * - `wall` — a lantern on an outside wall, lighting the ground in front of it.
 * - `uplight` — a spot in the ground aimed up at a tree or a bed, with its beam.
 * - `bollard` — a short post along a path.
 * - `underwater` — the pool's light.
 */
export type LightKind =
  "ceiling" | "spots" | "sconce" | "wall" | "uplight" | "bollard" | "underwater";

/**
 * One light equipment, placed. A room's fixtures pair in order with its lamps, and
 * the mapping's `placement` says which lamp comes first — so the terrace light is
 * on the terrace because the mapping names it, not because Sowel happened to list
 * it first.
 */
export interface Fixture {
  kind: LightKind;
  /** Where its bulbs are, x and z. A sconce or a wall light sits on the wall line. */
  points: [number, number][];
  /** For a sconce or a wall light: the way it faces — into the room, or outwards. */
  face?: Side;
}

/**
 * The colour a room's textiles take — bedding, rug, a chair's seat. From a short
 * list rather than any colour at all, so the house stays one drawing.
 */
export type Accent = "slate" | "sage" | "amber" | "rose" | "terracotta";

export type ItemKind =
  | "double-bed"
  | "single-bed"
  | "bunk-bed"
  | "bedside"
  | "wardrobe"
  | "desk"
  | "dresser"
  | "armchair"
  | "shelf"
  | "toy-box"
  | "pouf"
  | "rug"
  | "round-rug";

/**
 * A piece of furniture a room is given by name, where it stands.
 *
 * Placed against a wall because furniture is: a bed's head, a desk's back, a
 * wardrobe's. The kind decides what it is made of; the wall turns it to face the
 * room.
 */
export interface Item {
  kind: ItemKind;
  /** The wall its back is against. */
  wall: Side;
  /** Along that wall, from its west or north end, to the item's middle, metres. */
  at: number;
  /** Out from the wall, metres. Clear of the wall's half-thickness when absent. */
  off?: number;
  /** Across and deep, metres, for what comes in sizes: a wardrobe, a rug, a shelf. */
  w?: number;
  d?: number;
}

/** What a room is for, which is what it is furnished as. */
export type RoomKind =
  | "bedroom"
  | "bathroom"
  | "wc"
  | "kitchen"
  | "living"
  | "office"
  | "hall"
  | "stair"
  | "garage"
  | "terrace"
  | "pool"
  | "garden";

export interface Room {
  id: string;
  /** French, as the showroom's zones are named. */
  name: string;
  /** The English name, for a visitor whose Sowel speaks it. */
  nameEn?: string;
  /** Furnished by kind; a room without one is left bare. */
  kind?: RoomKind;
  /**
   * Its light fittings, in the order the mapping's `placement` lists the room's
   * lamps. A lamp with no fixture gets a ceiling light (`lampSpots`); a fixture
   * with no lamp is not drawn.
   */
  fixtures?: Fixture[];
  /**
   * Its furniture, piece by piece, in place of what its kind would give it. Four
   * bedrooms furnished by kind are four identical bedrooms.
   */
  furniture?: Item[];
  /** The colour of its textiles; `slate` when absent. */
  accent?: Accent;
  /**
   * 0 ground, 1 upstairs, `null` outdoors.
   *
   * Every storey is built and stood on the one below at its real height. The one
   * in focus is solid; the others are glass, so the house reads as a house and
   * what is upstairs is visible from downstairs without leaving the room being
   * looked at. Rooms on different levels share x/z footprints — which is exactly
   * what a house is — so the overlap check stays per level.
   */
  level: number | null;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Where an occupant stands when "in" the room. */
  spot: [number, number];
  /**
   * The ground everything outdoors sits on.
   *
   * Outdoors is not a floor plan: a garden *contains* a terrace and a pool rather
   * than sitting beside them, so the overlap check — which exists to catch two
   * rooms given the same corner on a storey — would flag the correct arrangement.
   * Exactly one room should carry this, and nothing else overlaps it by right.
   */
  ground?: true;
}

/**
 * What a hole in a wall is.
 *
 * A `door` with an id (`door:entree-1`) pairs with a contact sensor in its room and
 * swings when Sowel says it is open; without an id it is a plain doorway. A `gate`
 * is a door that lifts rather than swings — the garage's — and pairs the same way.
 */
export type OpeningKind = "door" | "window" | "gate";

export interface Opening {
  /**
   * Stable id for the mapping: `window:salon-1`, `door:entree-1`, `gate:garage-1`.
   * Optional for a plain doorway.
   */
  id?: string;
  kind: OpeningKind;
  /** A door that is mostly glass: the French window onto a terrace. */
  glazed?: boolean;
  /** Centre along the wall, in metres from the wall's `from`. */
  at: number;
  w: number;
  sill: number;
  head: number;
}

export interface Wall {
  /** The level this wall belongs to, matching `Room.level`. */
  level: number | null;
  axis: "x" | "z";
  /** The constant coordinate (z for an x-axis wall, x for a z-axis wall). */
  at: number;
  from: number;
  to: number;
  outside?: boolean;
  openings: Opening[];
}

export interface Door {
  a: string;
  b: string;
  x: number;
  z: number;
}

/** An axis-aligned rectangle on the ground, in metres. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * A level's floor slab.
 *
 * The rooms of a level do not tile it: what is left between them is circulation —
 * a landing, a hall, the foot of the stairs. Declaring the slab once and letting
 * rooms sit inside it means those gaps are floor rather than holes, and it keeps
 * the plan from inventing a "hallway" room that Sowel has no zone for.
 */
export interface Level extends Rect {
  level: number;
  name: string;
  nameEn?: string;
  /** Further slabs of the same storey: a wing attached to the body. */
  parts?: Rect[];
  /** The stairwell: where the slab is cut so the stairs can come up through it. */
  hole?: Rect;
}

/** One straight run of steps, climbing from `y0` at its start to `y1` at its end. */
export interface StairRun extends Rect {
  /** Which way it climbs: along z towards +z (south) or −z (north), or along x. */
  axis: "x" | "z";
  direction: 1 | -1;
  y0: number;
  y1: number;
}

export interface Stair {
  /** The storey the stairs start on. */
  level: number;
  runs: StairRun[];
  /** Level platforms between runs, at height `y`. */
  landings: (Rect & { y: number })[];
}

export interface Roof extends Rect {
  /** The storey whose ceiling this roof is. */
  over: number;
  /** A gable has two slopes meeting at a ridge; a flat roof is a slab with a lip. */
  kind: "gable" | "flat";
  /** Axis the ridge runs along, for a gable. */
  ridge?: "x" | "z";
  /** Height of the ridge above the eaves, or of the slab's lip for a flat roof. */
  rise: number;
  /** How far the eaves stick out past the walls. */
  overhang: number;
  /** Solar panels on the sunward slope, in rows along the ridge. */
  solar?: { rows: number; perRow: number };
}

/** A run of hedge, on the plot boundary or inside it. */
export interface FenceSegment {
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
}

/**
 * A gate in the fence, sliding along it. `from`…`to` is the gap it closes; open, it
 * has slid its own length towards `slide`. Its id pairs it with a Sowel equipment
 * through the mapping (`gates`), since the plot is no room's.
 */
export interface FenceGate {
  id: string;
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
  slide: 1 | -1;
}

export interface Fence {
  height: number;
  thickness: number;
  segments: FenceSegment[];
  gates: FenceGate[];
}

/** A flower bed or a lawn, watered by the valve its `watering` group names. */
export interface Bed extends Rect {
  id: string;
  kind: "flowers" | "lawn";
  watering?: string;
}

export interface Tree {
  x: number;
  z: number;
  kind: "tree" | "olive" | "bush";
  /** Roughly its height in metres. */
  size: number;
}

/**
 * A machine outside that Sowel knows as an equipment and that has no room of its
 * own to be furnished in: the heat pump's outdoor unit, the pool's pump and heat
 * pump. Decoration, placed where it stands.
 */
export interface Machine {
  kind: "heat-pump" | "pool-heat-pump" | "pool-pump";
  x: number;
  z: number;
  /** The side its fan or its face looks out of. */
  face: Side;
}

/** A patch of ground that is not a room: a driveway, a path. Decoration only. */
export interface Patch extends Rect {
  kind: "drive" | "path";
}

export interface Plan {
  /** Wall height and thickness, metres. */
  height: number;
  thickness: number;
  levels: Level[];
  rooms: Room[];
  walls: Wall[];
  /** Pathing graph. `away` is the outside node. */
  doors: Door[];
  awaySpot: [number, number];
  stairs?: Stair[];
  roofs?: Roof[];
  patches?: Patch[];
  fence?: Fence;
  beds?: Bed[];
  trees?: Tree[];
  machines?: Machine[];
}
