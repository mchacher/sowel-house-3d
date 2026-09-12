/**
 * A plan from a description of rooms and openings — the walls derived, never drawn.
 *
 * A house is rooms; the walls are what is left between them. Listing forty walls
 * by hand is how one ends up running through a doorway, and moving a room then
 * means finding every wall it touched. So the plan is composed: rooms are given,
 * each opening is named by the room and the side it is on, and the walls fall out
 * of the arithmetic below. Pure, and tested, like the rest of `src/plan`.
 */

import type { Door, Level, Opening, OpeningKind, Plan, Rect, Room, Wall } from "./types.ts";

export type Side = "N" | "S" | "E" | "W";

export interface WindowSpec {
  room: string;
  side: Side;
  /** Centre, in metres from the room's corner along that side (west or north end). */
  at: number;
  w: number;
  sill: number;
  head: number;
}

export interface DoorSpec extends Omit<WindowSpec, "sill" | "head"> {
  kind?: OpeningKind;
  sill?: number;
  head?: number;
  /**
   * Given to a door a contact sensor reports on (`door:entree-1`); a plain
   * doorway has none.
   */
  id?: string;
  /** The room on the other side, or `away`. Absent when it opens onto circulation. */
  to?: string;
}

export interface LevelSpec extends Rect {
  level: number;
  name: string;
  /** Further slabs of the same storey — a wing attached to the body. */
  parts?: Rect[];
  hole?: Rect;
}

export interface HouseSpec extends Omit<Plan, "levels" | "walls" | "doors"> {
  levels: LevelSpec[];
  windows: WindowSpec[];
  doors: DoorSpec[];
  /**
   * Edges of the pathing graph that go through circulation — a corridor, a landing
   * — rather than through one door between two rooms. Named by the rooms only;
   * the waypoint is the midpoint between their spots.
   */
  links: [string, string][];
}

const EPSILON = 1e-9;

function inside(rect: Rect, x: number, z: number): boolean {
  return (
    x > rect.x + EPSILON &&
    x < rect.x + rect.w - EPSILON &&
    z > rect.z + EPSILON &&
    z < rect.z + rect.d - EPSILON
  );
}

function slabsOf(level: LevelSpec): Rect[] {
  return [{ x: level.x, z: level.z, w: level.w, d: level.d }, ...(level.parts ?? [])];
}

/** The line an opening sits on, and where along it. */
function locate(rooms: Room[], spec: { room: string; side: Side; at: number }) {
  const room = rooms.find((r) => r.id === spec.room);
  if (!room) throw new Error(`opening on unknown room "${spec.room}"`);
  switch (spec.side) {
    case "N":
      return { level: room.level, axis: "x" as const, at: room.z, along: room.x + spec.at };
    case "S":
      return {
        level: room.level,
        axis: "x" as const,
        at: room.z + room.d,
        along: room.x + spec.at,
      };
    case "W":
      return { level: room.level, axis: "z" as const, at: room.x, along: room.z + spec.at };
    case "E":
      return {
        level: room.level,
        axis: "z" as const,
        at: room.x + room.w,
        along: room.z + spec.at,
      };
  }
}

/**
 * The walls of one storey.
 *
 * Every line a room edge lies on is cut at every room corner on it; each piece is
 * a wall if what lies on its two sides differs, and an **outside** wall if one of
 * those sides is not under the storey's slab at all. Adjacent pieces of the same kind
 * merge back into one run, so a façade is one wall carrying all its windows.
 */
export function wallsOf(level: LevelSpec, rooms: Room[]): Wall[] {
  const own = rooms.filter((r) => r.level === level.level);
  const slabs = slabsOf(level);
  const walls: Wall[] = [];

  for (const axis of ["x", "z"] as const) {
    // The constant coordinate of an edge: z for an x-axis wall, x for a z-axis one.
    // Rooms and slabs alike: the envelope closes along a corridor that no room
    // touches, because the slab's edge is there even when no room's is.
    const edges: Rect[] = [...own, ...slabs];
    const lines = new Set<number>();
    for (const r of edges) {
      const [lo, hi] = axis === "x" ? [r.z, r.z + r.d] : [r.x, r.x + r.w];
      lines.add(lo);
      lines.add(hi);
    }
    for (const at of lines) {
      const cuts = new Set<number>();
      for (const r of edges) {
        const touches =
          axis === "x" ? r.z === at || r.z + r.d === at : r.x === at || r.x + r.w === at;
        if (!touches) continue;
        const [lo, hi] = axis === "x" ? [r.x, r.x + r.w] : [r.z, r.z + r.d];
        cuts.add(lo);
        cuts.add(hi);
      }
      const points = [...cuts].sort((a, b) => a - b);
      let run: Wall | null = null;
      for (let i = 0; i + 1 < points.length; i++) {
        const from = points[i];
        const to = points[i + 1];
        const mid = (from + to) / 2;
        // A hair either side of the line: which room, and which slab, is there.
        const probe = (offset: number) =>
          axis === "x" ? { x: mid, z: at + offset } : { x: at + offset, z: mid };
        const near = probe(-0.001);
        const far = probe(0.001);
        const roomNear = own.find((r) => inside(r, near.x, near.z))?.id ?? null;
        const roomFar = own.find((r) => inside(r, far.x, far.z))?.id ?? null;
        const slabNear = slabs.some((s) => inside(s, near.x, near.z));
        const slabFar = slabs.some((s) => inside(s, far.x, far.z));
        // A wall stands where what is on one side is not what is on the other: two
        // rooms, or a room and the corridor, or a room and the outdoors. A line
        // that crosses the middle of a room — another room's edge, extended — is
        // not one, which the first version of this got wrong.
        const isWall = roomNear !== roomFar || slabNear !== slabFar;
        const outside = isWall && (!slabNear || !slabFar);
        if (!isWall) {
          run = null;
          continue;
        }
        if (run && run.to === from && Boolean(run.outside) === outside) {
          run.to = to;
        } else {
          run = { level: level.level, axis, at, from, to, openings: [] };
          if (outside) run.outside = true;
          walls.push(run);
        }
      }
    }
  }
  return walls;
}

function attach(walls: Wall[], where: ReturnType<typeof locate>, opening: Opening, what: string) {
  const wall = walls.find(
    (w) =>
      w.level === where.level &&
      w.axis === where.axis &&
      Math.abs(w.at - where.at) < EPSILON &&
      where.along - opening.w / 2 >= w.from - EPSILON &&
      where.along + opening.w / 2 <= w.to + EPSILON,
  );
  if (!wall) {
    throw new Error(
      `${what} at ${where.axis}=${where.at}, ${where.along} ± ${opening.w / 2} lies on no single wall`,
    );
  }
  wall.openings.push({ ...opening, at: where.along });
}

export function composePlan(spec: HouseSpec): Plan {
  const { windows, doors, links, levels: levelSpecs, ...rest } = spec;
  const rooms = spec.rooms;

  const walls = levelSpecs.flatMap((level) => wallsOf(level, rooms));

  const counters = new Map<string, number>();
  for (const w of windows) {
    const n = (counters.get(w.room) ?? 0) + 1;
    counters.set(w.room, n);
    attach(
      walls,
      locate(rooms, w),
      { id: `window:${w.room}-${n}`, kind: "window", at: 0, w: w.w, sill: w.sill, head: w.head },
      `window ${w.room}-${n}`,
    );
  }

  const graph: Door[] = [];
  const spotOf = (id: string): [number, number] => {
    if (id === "away") return spec.awaySpot;
    const room = rooms.find((r) => r.id === id);
    if (!room) throw new Error(`link to unknown room "${id}"`);
    return room.spot;
  };
  for (const d of doors) {
    const where = locate(rooms, d);
    const kind = d.kind ?? "door";
    attach(
      walls,
      where,
      {
        ...(d.id ? { id: d.id } : {}),
        kind,
        at: 0,
        w: d.w,
        sill: d.sill ?? 0,
        head: d.head ?? (kind === "gate" ? 2.2 : 2.1),
      },
      `${kind} on ${d.room}`,
    );
    if (d.to) {
      const [x, z] = where.axis === "x" ? [where.along, where.at] : [where.at, where.along];
      graph.push({ a: d.to, b: d.room, x, z });
    }
  }
  for (const [a, b] of links) {
    const [ax, az] = spotOf(a);
    const [bx, bz] = spotOf(b);
    graph.push({ a, b, x: (ax + bx) / 2, z: (az + bz) / 2 });
  }

  // Walls sorted so the JSON is stable between runs and a diff reads as a change.
  walls.sort(
    (p, q) => p.level! - q.level! || p.axis.localeCompare(q.axis) || p.at - q.at || p.from - q.from,
  );
  for (const wall of walls) wall.openings.sort((p, q) => p.at - q.at);

  const levels: Level[] = levelSpecs.map(({ parts, ...level }) => ({
    ...level,
    ...(parts ? { parts } : {}),
  }));

  return { ...rest, levels, rooms, walls, doors: graph };
}
