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
   * The house has four levels, and stacking them all at once would hide every
   * interior behind the floor above. So the scene shows **one level at a time**,
   * with the outdoor rooms always present because they surround the house rather
   * than sit on a storey. Rooms on different levels may therefore share the same
   * x/z footprint — which is exactly what a house is — and the overlap check is
   * per level.
   *
   * An exploded stack, all four levels floated apart, would show the whole house
   * at a glance and is the better answer eventually. It is also the harder one to
   * get right, and it belongs in phase 6 with the rest of the polish.
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
