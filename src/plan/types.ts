/**
 * The house plan: what the scene is built from.
 *
 * Metres, x to the east, z to the south, y up (Three.js convention). Rooms are
 * axis-aligned rectangles; walls are axis-aligned segments carrying openings;
 * doors are also the edges of the pathing graph occupants and ghosts walk on.
 * The plan describes geometry only — what a lamp or a shutter is bound to in
 * Sowel is the mapping's job, keyed by the ids declared here.
 */

export interface Room {
  id: string;
  name: string;
  /**
   * −1 basement, 0 ground, 1 and 2 upstairs, `null` outdoors.
   *
   * All four are built and stood on each other at their real heights. The one in
   * focus is solid; the others are glass, so the house reads as a house and what is
   * upstairs is visible from downstairs without leaving the room being looked at.
   *
   * Showing one storey at a time came first, and it was a way of not solving the
   * occlusion rather than a decision: the floor above hides the interior below
   * unless something is done about it, and ghosting the materials is that
   * something. Rooms on different levels share x/z footprints — which is exactly
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

export type OpeningKind = "door" | "window";

export interface Opening {
  /** Stable id for the mapping (`window:salon-1`), optional for plain doors. */
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

/**
 * A level's floor slab.
 *
 * The rooms of a level do not tile it: what is left between them is circulation —
 * a landing, a hall, the foot of the stairs. Declaring the slab once and letting
 * rooms sit inside it means those gaps are floor rather than holes, and it keeps
 * the plan from inventing a "hallway" room that Sowel has no zone for.
 */
export interface Level {
  level: number;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
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
}
