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
  x: number;
  z: number;
  w: number;
  d: number;
  /** Where an occupant stands when "in" the room. */
  spot: [number, number];
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

export interface Plan {
  /** Wall height and thickness, metres. */
  height: number;
  thickness: number;
  rooms: Room[];
  walls: Wall[];
  /** Pathing graph. `away` is the outside node. */
  doors: Door[];
  awaySpot: [number, number];
}
