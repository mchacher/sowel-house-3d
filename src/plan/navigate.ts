/**
 * Walking the plot without walking through anything (spec 005, FR2, amended).
 *
 * The first walk went door to door in straight lines: through the bathroom's wall to
 * a graph point that was not a door, across sofas and flower beds. Now each storey is
 * a grid of the plot, every obstacle marked on it — walls (their doors left open),
 * furniture, the fence and hedges, flower beds, bushes and trunks, the pool, the
 * machines, the stairwell's hole — grown by the figure's half-width, and the figure
 * takes the shortest way through what is left (A*), smoothed into straight lines
 * wherever the way between two points is clear. The stairs are the one way between
 * storeys.
 */

import { furnitureFor, levelElevation, pieceBox, wallPieces } from "../scene/geometry.ts";
import type { Plan, Rect, Room } from "./types.ts";

/** Metres per cell: fine enough for a seventy-centimetre door next to a wall's end. */
const CELL = 0.1;
/**
 * Half the figure's width: how far it keeps from a wall. Narrower than a person's,
 * because the WC's door is seventy centimetres and the figure has to get through it.
 */
const BODY = 0.18;
/** Furniture is walked closer to: rooms are furnished tight. */
const FURNITURE_MARGIN = 0.12;

export interface Point {
  x: number;
  z: number;
}

export interface NavGrid {
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

function bounds(plan: Plan): Rect {
  const ground = plan.rooms.find((r) => r.ground);
  if (ground) return { x: ground.x, z: ground.z, w: ground.w, d: ground.d };
  const xs = plan.levels.flatMap((l) => [l.x, l.x + l.w]);
  const zs = plan.levels.flatMap((l) => [l.z, l.z + l.d]);
  return {
    x: Math.min(...xs) - 3,
    z: Math.min(...zs) - 3,
    w: Math.max(...xs) - Math.min(...xs) + 6,
    d: Math.max(...zs) - Math.min(...zs) + 6,
  };
}

/** Block the cells whose centre lies in `rect` grown by `margin`. */
function block(grid: NavGrid, rect: Rect, margin: number): void {
  const x0 = rect.x - margin;
  const x1 = rect.x + rect.w + margin;
  const z0 = rect.z - margin;
  const z1 = rect.z + rect.d + margin;
  const c0 = Math.max(0, Math.ceil((x0 - grid.x0) / CELL - 0.5));
  const c1 = Math.min(grid.cols - 1, Math.floor((x1 - grid.x0) / CELL - 0.5));
  const r0 = Math.max(0, Math.ceil((z0 - grid.z0) / CELL - 0.5));
  const r1 = Math.min(grid.rows - 1, Math.floor((z1 - grid.z0) / CELL - 0.5));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid.blocked[r * grid.cols + c] = 1;
}

function blockCircle(grid: NavGrid, x: number, z: number, radius: number): void {
  const reach = radius + BODY;
  const c0 = Math.max(0, Math.floor((x - reach - grid.x0) / CELL));
  const c1 = Math.min(grid.cols - 1, Math.floor((x + reach - grid.x0) / CELL));
  const r0 = Math.max(0, Math.floor((z - reach - grid.z0) / CELL));
  const r1 = Math.min(grid.rows - 1, Math.floor((z + reach - grid.z0) / CELL));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cx = grid.x0 + (c + 0.5) * CELL;
      const cz = grid.z0 + (r + 0.5) * CELL;
      if (Math.hypot(cx - x, cz - z) <= reach) grid.blocked[r * grid.cols + c] = 1;
    }
  }
}

/** The obstacles a figure standing on `level` meets, as a grid of the plot. */
export function navGrid(plan: Plan, level: number): NavGrid {
  const area = bounds(plan);
  const cols = Math.ceil(area.w / CELL);
  const rows = Math.ceil(area.d / CELL);
  const grid: NavGrid = {
    x0: area.x,
    z0: area.z,
    cols,
    rows,
    blocked: new Uint8Array(cols * rows),
  };

  // Walls, as solid as they are at the floor: a door leaves a gap, a window does not.
  for (const wall of plan.walls.filter((w) => w.level === level)) {
    for (const piece of wallPieces(wall, plan.height)) {
      if (piece.y0 > 0.1) continue;
      const b = pieceBox(wall, piece, plan.thickness);
      block(grid, { x: b.x - b.w / 2, z: b.z - b.d / 2, w: b.w, d: b.d }, BODY);
    }
  }
  // Furniture, what stands on the floor (a rug is walked on).
  for (const room of plan.rooms.filter((r) => r.level === level)) {
    for (const piece of furnitureFor(room)) {
      if (piece.h < 0.05) continue;
      block(grid, piece, FURNITURE_MARGIN);
    }
  }

  if (level === 0) {
    // The plot's edge: the fence and its hedges, gates included.
    const fence = plan.fence;
    if (fence) {
      for (const s of [...fence.segments, ...fence.gates]) {
        const t = fence.thickness;
        block(
          grid,
          s.axis === "x"
            ? { x: s.from, z: s.at - t / 2, w: s.to - s.from, d: t }
            : { x: s.at - t / 2, z: s.from, w: t, d: s.to - s.from },
          BODY,
        );
      }
    }
    for (const bed of plan.beds ?? []) if (bed.kind === "flowers") block(grid, bed, BODY);
    for (const tree of plan.trees ?? []) {
      blockCircle(
        grid,
        tree.x,
        tree.z,
        tree.kind === "bush" ? tree.size * 0.55 : Math.max(0.15, tree.size * 0.05),
      );
    }
    for (const room of plan.rooms.filter((r) => r.kind === "pool")) block(grid, room, BODY);
    for (const machine of plan.machines ?? []) blockCircle(grid, machine.x, machine.z, 0.55);
    // The stairs: climbed from their foot only, never walked across.
    for (const stair of plan.stairs ?? []) {
      for (const run of stair.runs) block(grid, run, BODY * 0.5);
      for (const landing of stair.landings) block(grid, landing, BODY * 0.5);
    }
  } else {
    const slab = plan.levels.find((l) => l.level === level);
    if (slab?.hole) block(grid, slab.hole, BODY * 0.6);
  }
  return grid;
}

/** A binary heap of cell indices by cost: the open list of the search. */
class MinHeap {
  private readonly items: number[] = [];
  private readonly costs: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, cost: number): void {
    this.items.push(item);
    this.costs.push(cost);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= this.costs[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop() as number;
    const lastCost = this.costs.pop() as number;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.costs[0] = lastCost;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.costs[l] < this.costs[m]) m = l;
        if (r < this.items.length && this.costs[r] < this.costs[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
  }
}

function cellOf(grid: NavGrid, p: Point): [number, number] {
  return [
    Math.min(grid.cols - 1, Math.max(0, Math.floor((p.x - grid.x0) / CELL))),
    Math.min(grid.rows - 1, Math.max(0, Math.floor((p.z - grid.z0) / CELL))),
  ];
}

function free(grid: NavGrid, c: number, r: number): boolean {
  return (
    c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && grid.blocked[r * grid.cols + c] === 0
  );
}

/** The free cell nearest to a point, searching outwards. */
function nearestFree(grid: NavGrid, p: Point): [number, number] | null {
  const [c, r] = cellOf(grid, p);
  for (let ring = 0; ring < 40; ring++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        if (!free(grid, c + dc, r + dr)) continue;
        const d = dc * dc + dr * dr;
        if (d < bestD) {
          bestD = d;
          best = [c + dc, r + dr];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function centre(grid: NavGrid, c: number, r: number): Point {
  return { x: grid.x0 + (c + 0.5) * CELL, z: grid.z0 + (r + 0.5) * CELL };
}

/** The free point nearest to `p`: where the figure can actually stand. */
export function freePoint(grid: NavGrid, p: Point): Point {
  const cell = nearestFree(grid, p);
  if (!cell) return p;
  const [c, r] = cellOf(grid, p);
  return cell[0] === c && cell[1] === r ? p : centre(grid, cell[0], cell[1]);
}

/** Whether a straight line between two points crosses no blocked cell. */
export function clear(grid: NavGrid, a: Point, b: Point): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL * 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const [c, r] = cellOf(grid, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (!free(grid, c, r)) return false;
  }
  return true;
}

/** The shortest way between two points on a storey, around everything; null when there is none. */
export function findPath(grid: NavGrid, from: Point, to: Point): Point[] | null {
  const start = nearestFree(grid, from);
  const goal = nearestFree(grid, to);
  if (!start || !goal) return null;
  const index = (c: number, r: number) => r * grid.cols + c;
  const goalIndex = index(goal[0], goal[1]);
  const g = new Float32Array(grid.cols * grid.rows).fill(Infinity);
  const came = new Int32Array(grid.cols * grid.rows).fill(-1);
  const closed = new Uint8Array(grid.cols * grid.rows);
  const heap = new MinHeap();
  const h = (c: number, r: number) => Math.hypot(c - goal[0], r - goal[1]);
  const startIndex = index(start[0], start[1]);
  g[startIndex] = 0;
  heap.push(startIndex, h(start[0], start[1]));
  const steps = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  while (heap.size > 0) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === goalIndex) break;
    const c = i % grid.cols;
    const r = Math.floor(i / grid.cols);
    for (const [dc, dr, cost] of steps) {
      const nc = c + dc;
      const nr = r + dr;
      if (!free(grid, nc, nr)) continue;
      // No cutting a corner between two blocked cells.
      if (dc !== 0 && dr !== 0 && (!free(grid, c + dc, r) || !free(grid, c, r + dr))) continue;
      const n = index(nc, nr);
      const cand = g[i] + cost;
      if (cand < g[n]) {
        g[n] = cand;
        came[n] = i;
        heap.push(n, cand + h(nc, nr));
      }
    }
  }
  if (!closed[goalIndex]) return null;
  const cells: Point[] = [];
  for (let at = goalIndex; at !== -1; at = came[at]) {
    cells.unshift(centre(grid, at % grid.cols, Math.floor(at / grid.cols)));
  }
  // String-pulling: keep a point only where the straight line past it is blocked.
  const smooth: Point[] = [cells[0]];
  let anchor = 0;
  for (let k = 2; k < cells.length; k++) {
    if (!clear(grid, cells[anchor], cells[k])) {
      smooth.push(cells[k - 1]);
      anchor = k - 1;
    }
  }
  smooth.push(cells[cells.length - 1]);
  return smooth;
}

/** The indoor room a point is in on a storey, if any. */
export function roomAt(plan: Plan, level: number, p: Point): Room | undefined {
  return plan.rooms.find(
    (r) => r.level === level && p.x > r.x && p.x < r.x + r.w && p.z > r.z && p.z < r.z + r.d,
  );
}

export { levelElevation };
