/**
 * The way from one room to another, through doors and up stairs (spec 005, FR2).
 *
 * The plan's door graph (`plan.doors`) says which rooms open onto which, and where:
 * `away` (the street) onto the hall, the hall onto the stairwell, the stairwell onto
 * every room upstairs. A route is a breadth-first walk of that graph, laid out as
 * waypoints: a step before each door, the door, a step after it, and the room's spot
 * at the end. Where a room's two doors are on different storeys — the stairwell —
 * the stairs' runs are climbed, or come down, in between.
 */

import { levelElevation } from "../scene/geometry.ts";
import type { Plan, Room } from "./types.ts";

export interface Waypoint {
  x: number;
  y: number;
  z: number;
  /** The room entered on reaching this point. */
  enter?: string;
}

const AWAY = "away";
/** How far either side of a door the figure lines up, metres. */
const APPROACH = 0.45;

function levelOf(plan: Plan, id: string): number {
  if (id === AWAY) return 0;
  return plan.rooms.find((r) => r.id === id)?.level ?? 0;
}

function spotOf(plan: Plan, id: string): Waypoint {
  if (id === AWAY) return { x: plan.awaySpot[0], y: 0, z: plan.awaySpot[1] };
  const room = plan.rooms.find((r) => r.id === id) as Room;
  return { x: room.spot[0], y: levelElevation(plan, room.level ?? 0), z: room.spot[1] };
}

/** Rooms and doors: who opens onto whom, and at which point. */
function neighbours(plan: Plan): Map<string, { to: string; x: number; z: number }[]> {
  const graph = new Map<string, { to: string; x: number; z: number }[]>();
  const add = (a: string, b: string, x: number, z: number) => {
    const list = graph.get(a) ?? [];
    list.push({ to: b, x, z });
    graph.set(a, list);
  };
  for (const door of plan.doors) {
    add(door.a, door.b, door.x, door.z);
    add(door.b, door.a, door.x, door.z);
  }
  return graph;
}

/** The rooms in order, `from` to `to`, by the fewest doors. */
export function roomsBetween(plan: Plan, from: string, to: string): string[] | null {
  const graph = neighbours(plan);
  const previous = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const here = queue.shift() as string;
    if (here === to) break;
    for (const { to: next } of graph.get(here) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, here);
      queue.push(next);
    }
  }
  if (!previous.has(to)) return null;
  const rooms: string[] = [];
  for (let at: string | null = to; at !== null; at = previous.get(at) ?? null) rooms.unshift(at);
  return rooms;
}

/** The unit vector across a door's wall, pointing into `room`. */
function into(plan: Plan, x: number, z: number, room: string, other: string): [number, number] {
  const box = plan.rooms.find((r) => r.id === room) ?? plan.rooms.find((r) => r.id === other);
  if (!box) return [0, 1];
  const onX = Math.min(Math.abs(x - box.x), Math.abs(x - (box.x + box.w)));
  const onZ = Math.min(Math.abs(z - box.z), Math.abs(z - (box.z + box.d)));
  const cx = box.x + box.w / 2;
  const cz = box.z + box.d / 2;
  const inside = box.id === room ? 1 : -1;
  return onX < onZ
    ? [Math.sign(cx - x) * inside || inside, 0]
    : [0, Math.sign(cz - z) * inside || inside];
}

/** The stairs climbed from their foot, as points, at the plan's elevations. */
function climb(plan: Plan): Waypoint[] {
  const stair = plan.stairs?.[0];
  if (!stair) return [];
  const base = levelElevation(plan, stair.level);
  const points: Waypoint[] = [];
  for (const run of stair.runs) {
    const alongX = run.axis === "x";
    const length = alongX ? run.w : run.d;
    const low = run.direction === 1 ? 0 : length;
    const high = run.direction === 1 ? length : 0;
    const at = (along: number, y: number): Waypoint =>
      alongX
        ? { x: run.x + along, y: base + y, z: run.z + run.d / 2 }
        : { x: run.x + run.w / 2, y: base + y, z: run.z + along };
    points.push(at(low, run.y0), at(high, run.y1));
  }
  return points;
}

export function route(plan: Plan, from: string, to: string): Waypoint[] | null {
  const rooms = roomsBetween(plan, from, to);
  if (!rooms) return null;
  const graph = neighbours(plan);
  const points: Waypoint[] = [spotOf(plan, from)];
  let level = levelOf(plan, from);

  for (let i = 0; i + 1 < rooms.length; i++) {
    const here = rooms[i];
    const next = rooms[i + 1];
    const door = (graph.get(here) ?? []).find((d) => d.to === next) as {
      x: number;
      z: number;
    };
    const doorLevel = Math.max(levelOf(plan, here), levelOf(plan, next));
    if (doorLevel !== level) {
      const stairs = climb(plan);
      points.push(...(doorLevel > level ? stairs : [...stairs].reverse()));
      level = doorLevel;
    }
    const y = levelElevation(plan, level);
    const [ax, az] = into(plan, door.x, door.z, here, next);
    const [bx, bz] = into(plan, door.x, door.z, next, here);
    points.push(
      { x: door.x + ax * APPROACH, y, z: door.z + az * APPROACH },
      { x: door.x, y, z: door.z, enter: next },
      { x: door.x + bx * APPROACH, y, z: door.z + bz * APPROACH },
    );
  }
  const end = spotOf(plan, to);
  if (end.y !== levelElevation(plan, level)) {
    const stairs = climb(plan);
    points.push(...(end.y > levelElevation(plan, level) ? stairs : [...stairs].reverse()));
  }
  points.push(end);
  return points;
}
