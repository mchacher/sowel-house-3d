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

export interface Room {
  id: string;
  name: string;
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
}
