/**
 * The way from where the figure is to a room (spec 005, FR2, amended).
 *
 * On each storey, the shortest way around everything (`navigate.ts`); between
 * storeys, the stairs, from their foot to their top. The rooms the figure enters are
 * read off where it walks: each time it steps into a room it was not in, that point
 * carries `enter`, which is when the app tells Sowel. A corridor that is no room —
 * the landing upstairs, the passage by the WC — counts as the stairwell, which is
 * what the house's circulation is.
 */

import { levelElevation, storeyPitch } from "../scene/geometry.ts";
import type { Focus } from "../scene/house.ts";
import { findPath, freePoint, navGrid, roomAt, type NavGrid, type Point } from "./navigate.ts";
import type { Plan, StairRun } from "./types.ts";

export interface Waypoint {
  x: number;
  y: number;
  z: number;
  /** The room entered on reaching this point, or `away` on leaving the house. */
  enter?: string;
}

const AWAY = "away";
/** Points along the way, metres apart, so a room entered is caught where it is. */
const SAMPLE = 0.2;
/** Beside a room's spot, not on it: a household member stands there. */
const BESIDE = { x: 0.8, z: 0.5 };

const grids = new WeakMap<Plan, Map<number, NavGrid>>();
function gridFor(plan: Plan, level: number): NavGrid {
  let byLevel = grids.get(plan);
  if (!byLevel) {
    byLevel = new Map();
    grids.set(plan, byLevel);
  }
  let grid = byLevel.get(level);
  if (!grid) {
    grid = navGrid(plan, level);
    byLevel.set(level, grid);
  }
  return grid;
}

function levelOfRoom(plan: Plan, id: string): number {
  if (id === AWAY) return 0;
  return plan.rooms.find((r) => r.id === id)?.level ?? 0;
}

/**
 * Where the household stand in a room: their own place around its spot, so five
 * people in the living room are five figures, not one with its heads stacked
 * (spec 005, amended 2026-09-27). A first ring, then a wider one; the visitor's
 * side of the spot (`BESIDE`, south-east) is left to the visitor.
 */
const SLOTS: [number, number][] = [
  ...[90, 150, 210, 270, 330].map((deg) => [0.7, deg] as [number, number]),
  ...[120, 180, 240, 300].map((deg) => [1.2, deg] as [number, number]),
];
export const SLOT_COUNT = SLOTS.length;

/** A household member's place in a room, on the floor it can stand on. */
export function placeInRoom(plan: Plan, id: string, slot: number): Waypoint {
  const room = plan.rooms.find((r) => r.id === id);
  const level = levelOfRoom(plan, id);
  const base = standingPoint(plan, id === AWAY || !room ? AWAY : id, false);
  const [radius, deg] = SLOTS[slot % SLOTS.length];
  const wanted =
    id === AWAY || !room
      ? base
      : {
          x: Math.min(
            room.x + room.w - 0.4,
            Math.max(room.x + 0.4, room.spot[0] + radius * Math.cos((deg * Math.PI) / 180)),
          ),
          z: Math.min(
            room.z + room.d - 0.4,
            Math.max(room.z + 0.4, room.spot[1] + radius * Math.sin((deg * Math.PI) / 180)),
          ),
        };
  const free = freePoint(gridFor(plan, level), wanted);
  return { x: free.x, y: levelElevation(plan, level), z: free.z };
}

/** Where the figure stands in a room: beside its spot, or on it. */
function standingPoint(plan: Plan, id: string, beside = true): Point {
  const room = plan.rooms.find((r) => r.id === id);
  if (id === AWAY || !room) return { x: plan.awaySpot[0], z: plan.awaySpot[1] };
  if (!beside) return { x: room.spot[0], z: room.spot[1] };
  return {
    x: Math.min(room.x + room.w - 0.4, Math.max(room.x + 0.4, room.spot[0] + BESIDE.x)),
    z: Math.min(room.z + room.d - 0.4, Math.max(room.z + 0.4, room.spot[1] + BESIDE.z)),
  };
}

/** A run's two ends, and the way it climbs. */
function ends(run: StairRun): { low: Point; high: Point; dir: Point } {
  const alongX = run.axis === "x";
  const length = alongX ? run.w : run.d;
  const at = (along: number): Point =>
    alongX
      ? { x: run.x + along, z: run.z + run.d / 2 }
      : { x: run.x + run.w / 2, z: run.z + along };
  const low = at(run.direction === 1 ? 0 : length);
  const high = at(run.direction === 1 ? length : 0);
  const dir = alongX ? { x: run.direction, z: 0 } : { x: 0, z: run.direction };
  return { low, high, dir };
}

/**
 * Climbing the stairs: the foot on the lower storey, the steps, the top upstairs.
 *
 * The foot is where the stairs can be stepped onto from the stairwell: a run that
 * starts against a wall is taken from its side, not through the wall behind it.
 */
function stairClimb(plan: Plan): { foot: Point; top: Point; steps: Waypoint[] } | null {
  const stair = plan.stairs?.[0];
  if (!stair || stair.runs.length === 0) return null;
  const base = levelElevation(plan, stair.level);
  const first = ends(stair.runs[0]);
  const last = ends(stair.runs[stair.runs.length - 1]);
  const steps: Waypoint[] = [];
  for (const run of stair.runs) {
    const { low, high, dir } = ends(run);
    // A hand's width in from each end, so the figure is on the treads, not the walls.
    steps.push(
      { x: low.x + dir.x * 0.15, y: base + run.y0, z: low.z + dir.z * 0.15 },
      { x: high.x - dir.x * 0.15, y: base + run.y1, z: high.z - dir.z * 0.15 },
    );
  }
  const stairRoom = plan.rooms.find((r) => r.kind === "stair" && r.level === stair.level);
  const grid = gridFor(plan, stair.level);
  const onFirstStep = { x: first.low.x + first.dir.x * 0.3, z: first.low.z + first.dir.z * 0.3 };
  const side = { x: first.dir.z, z: first.dir.x };
  const candidates: Point[] = [
    { x: first.low.x - first.dir.x * 0.5, z: first.low.z - first.dir.z * 0.5 },
    { x: onFirstStep.x - side.x * 0.8, z: onFirstStep.z - side.z * 0.8 },
    { x: onFirstStep.x + side.x * 0.8, z: onFirstStep.z + side.z * 0.8 },
  ];
  const inStairwell = (p: Point) =>
    !stairRoom ||
    (p.x > stairRoom.x &&
      p.x < stairRoom.x + stairRoom.w &&
      p.z > stairRoom.z &&
      p.z < stairRoom.z + stairRoom.d);
  const foot =
    candidates.find((c) => inStairwell(c) && freePoint(grid, c) === c) ??
    candidates.find((c) => freePoint(grid, c) === c) ??
    candidates[0];
  return {
    foot,
    top: { x: last.high.x + last.dir.x * 0.5, z: last.high.z + last.dir.z * 0.5 },
    steps,
  };
}

/** A flat stretch on a storey, around everything, as waypoints at its height. */
function flat(plan: Plan, level: number, from: Point, to: Point): Waypoint[] | null {
  // Where it can actually stand: the street's spot is in a bush, a room's spot may
  // be in a chair.
  const grid = gridFor(plan, level);
  const a = freePoint(grid, from);
  const b = freePoint(grid, to);
  const path = findPath(grid, a, b);
  if (!path) return null;
  const y = levelElevation(plan, level);
  return [
    { x: a.x, y, z: a.z },
    ...path.map((p) => ({ x: p.x, y, z: p.z })),
    { x: b.x, y, z: b.z },
  ];
}

/** Whether a point is under a storey's slab — inside the house on that storey. */
function indoors(plan: Plan, level: number, p: Point): boolean {
  const slab = plan.levels.find((l) => l.level === level);
  if (!slab) return false;
  return [slab, ...(slab.parts ?? [])].some(
    (r) => p.x > r.x && p.x < r.x + r.w && p.z > r.z && p.z < r.z + r.d,
  );
}

/** Which room a point is in, for the ghost: a room, the stairwell for a corridor, or `away`. */
export function presence(plan: Plan, p: { x: number; y: number; z: number }): string {
  const level = Math.round(p.y / storeyPitch(plan));
  const room = roomAt(plan, level, p);
  if (room) return room.id;
  if (!indoors(plan, level, p)) return AWAY;
  return plan.rooms.find((r) => r.kind === "stair")?.id ?? AWAY;
}

/** Sample a polyline every `SAMPLE` metres and mark each room entered. */
function markEntries(plan: Plan, points: Waypoint[], startRoom: string): Waypoint[] {
  const out: Waypoint[] = [{ x: points[0].x, y: points[0].y, z: points[0].z }];
  let current = startRoom;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.max(1, Math.ceil(length / SAMPLE));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const p: Waypoint = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      };
      const here = presence(plan, p);
      if (here !== current) {
        p.enter = here;
        current = here;
      }
      out.push(p);
    }
  }
  return out;
}

/**
 * The way to `to`, from a room (or `away`) or from where the figure stands. Null
 * when there is none.
 */
export function route(
  plan: Plan,
  from: string | { x: number; y: number; z: number },
  to: string,
  /** Where in `to` to stop, when not beside its spot: a household member's place. */
  at?: Point,
): Waypoint[] | null {
  if (to !== AWAY && !plan.rooms.some((r) => r.id === to)) return null;
  const start: Waypoint =
    typeof from === "string"
      ? { ...standingPoint(plan, from), y: levelElevation(plan, levelOfRoom(plan, from)) }
      : { x: from.x, y: from.y, z: from.z };
  const startLevel = Math.round(start.y / storeyPitch(plan));
  const startRoom = typeof from === "string" ? from : presence(plan, start);
  const target = at ?? standingPoint(plan, to);
  const targetLevel = levelOfRoom(plan, to);

  let points: Waypoint[] | null;
  if (startLevel === targetLevel) {
    points = flat(plan, startLevel, start, target);
  } else {
    const stair = stairClimb(plan);
    if (!stair) return null;
    const up = targetLevel > startLevel;
    const toStairs = flat(plan, startLevel, start, up ? stair.foot : stair.top);
    const fromStairs = flat(plan, targetLevel, up ? stair.top : stair.foot, target);
    if (!toStairs || !fromStairs) return null;
    const steps = up ? stair.steps : [...stair.steps].reverse();
    points = [...toStairs, ...steps, ...fromStairs];
  }
  if (!points) return null;
  return markEntries(plan, points, startRoom);
}

/**
 * What to show for a figure in `room` at height `y` (spec 005, FR4, amended): the
 * house from outside when it is outside, otherwise the storey it stands on — by its
 * height, so the view changes halfway up the stairs rather than at the next door.
 */
export function focusAt(plan: Plan, room: string | null, y: number): Focus {
  const here = room ? plan.rooms.find((r) => r.id === room) : undefined;
  if (!here || here.level === null) return "outside";
  const levels = plan.levels.map((l) => l.level);
  const level = Math.round(y / storeyPitch(plan));
  return Math.min(Math.max(...levels), Math.max(Math.min(...levels), level));
}
