/**
 * The arithmetic of the scene, without the scene (spec 001, FR8).
 *
 * A surprising amount of "3D" is plain numbers: where a wall's solid pieces are
 * once its openings are cut out, how far a shutter has slid, which way the sun
 * points, where a camera has to sit to frame a level. All of that is here, pure and
 * tested — so what is left in `build.ts` is materials, colour and composition,
 * which is the part a person has to look at and the part no test could judge
 * anyway.
 *
 * The division is the point. Everything that can be wrong while looking plausible
 * is in this file.
 */

import type { Bed, Level, Plan, Rect, Roof, Room, StairRun, Tree, Wall } from "../plan/types.ts";

/** A solid rectangle of wall: along the wall from `from` to `to`, from `y0` to `y1`. */
export interface WallPiece {
  from: number;
  to: number;
  y0: number;
  y1: number;
}

/** Anything shorter than this is a seam, not a piece. */
const MIN_PIECE = 0.001;

/**
 * A wall cut into the solid pieces its openings leave behind: the runs between
 * them, plus the sill below each and the lintel above.
 *
 * Openings are sorted first, because a plan author lists them in the order they
 * think of them and an unsorted pass leaves the wall full of holes.
 */
export function wallPieces(wall: Wall, height: number): WallPiece[] {
  const pieces: WallPiece[] = [];
  const push = (from: number, to: number, y0: number, y1: number): void => {
    if (to - from > MIN_PIECE && y1 - y0 > MIN_PIECE) pieces.push({ from, to, y0, y1 });
  };

  const openings = [...wall.openings].sort((a, b) => a.at - b.at);
  let cursor = wall.from;
  for (const opening of openings) {
    const a = opening.at - opening.w / 2;
    const b = opening.at + opening.w / 2;
    push(cursor, a, 0, height); // the full-height run before it
    push(a, b, 0, opening.sill); // under the sill
    push(a, b, opening.head, height); // over the lintel
    cursor = Math.max(cursor, b);
  }
  push(cursor, wall.to, 0, height);
  return pieces;
}

/** The centre and size of a piece, in world coordinates. */
export function pieceBox(
  wall: Wall,
  piece: WallPiece,
  thickness: number,
): { x: number; y: number; z: number; w: number; h: number; d: number } {
  const along = piece.to - piece.from;
  const mid = (piece.from + piece.to) / 2;
  const y = (piece.y0 + piece.y1) / 2;
  const h = piece.y1 - piece.y0;
  return wall.axis === "x"
    ? { x: mid, y, z: wall.at, w: along, h, d: thickness }
    : { x: wall.at, y, z: mid, w: thickness, h, d: along };
}

/**
 * How far down a shutter hangs, as a fraction of its window's height.
 *
 * Sowel reports 0 closed and 100 open, and the panel is anchored at the lintel and
 * scaled downwards — so the fraction is the complement. Anything outside 0…100 is
 * clamped rather than trusted: a plugin is free to be wrong, and the scene is not
 * the place to find out.
 */
export function shutterDrop(position: number | null): number {
  if (position === null) return 0;
  return 1 - Math.max(0, Math.min(100, position)) / 100;
}

/**
 * Where the sun is, as a unit vector from the house **towards** it — which is what
 * a `DirectionalLight` is positioned along.
 *
 * Azimuth is degrees clockwise from north, and the plan has x to the east and z to
 * the south, so east is +x and south is +z. Writing the first version of this
 * comment the other way round is how a scene ends up lit from the wrong side all
 * day, so the test asserts the bearing rather than the formula.
 */
export function sunDirection(
  elevationDeg: number,
  azimuthDeg: number,
): { x: number; y: number; z: number } {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  const horizontal = Math.cos(el);
  return {
    x: horizontal * Math.sin(az),
    y: Math.sin(el),
    z: -horizontal * Math.cos(az),
  };
}

/** How thick a floor slab is. The storey above starts on top of it. */
export const SLAB = 0.08;

/**
 * The gap between one storey's floor and the next: the wall height plus the slab.
 *
 * Exactly that, and not a hand's width more. The first version added thirty
 * centimetres "for the slab", the slab was eight, and the difference was a slot of
 * daylight running round the house between the top of the ground-floor walls and
 * the underside of the floor above — the kind of thing that reads as a bug at a
 * glance and takes a while to name.
 */
export function storeyPitch(plan: Plan): number {
  return plan.height + SLAB;
}

/** How high a storey's floor sits. The ground floor is the origin; the cellar is under it. */
export function levelElevation(plan: Plan, level: number | null): number {
  return level === null ? 0 : level * storeyPitch(plan);
}

/** Floor of the lowest storey to ceiling of the highest — what the camera must clear. */
export function stackHeight(plan: Plan): number {
  const levels = plan.levels.map((l) => l.level);
  if (levels.length === 0) return plan.height;
  return (Math.max(...levels) - Math.min(...levels)) * storeyPitch(plan) + plan.height;
}

/** What the camera has to fit, and which part of it the visitor is reading. */
export interface Framing {
  /** The slab being read. Its footprint sets how far back the camera goes. */
  level: Level;
  /** Wall height. */
  height: number;
  aspect?: number;
  /** How high the read storey's floor sits. */
  elevation?: number;
  /** Floor of the lowest storey to ceiling of the highest. */
  stack?: number;
  /** How high the lowest storey's floor sits, so the stack's middle is known. */
  lowest?: number;
}

/**
 * Where to put the camera so the house fits and the chosen storey is what you read.
 *
 * Three quarters from the south-east, far enough back for the **whole stack** —
 * framing the chosen storey alone cropped the three others off the top of the
 * screen, which is a strange way to show a house. The distance comes from the
 * bounding sphere and the field of view rather than from a multiplier that happened
 * to look right for one plan.
 *
 * The target is a blend: mostly the storey being read, partly the middle of the
 * stack, so the cellar is not framed with the sky above it nor the top floor with
 * the lawn below.
 */
export function cameraFor(framing: Framing): {
  position: [number, number, number];
  target: [number, number, number];
} {
  const { level, height, aspect = 16 / 9, elevation = 0, stack = 0, lowest = 0 } = framing;
  const cx = level.x + level.w / 2;
  const cz = level.z + level.d / 2;

  const span = Math.max(stack, height);
  // Half the diagonal of the box the house occupies — the sphere that contains it.
  const radius = 0.5 * Math.hypot(level.w, level.d, span);
  // The renderer's vertical field of view. A narrow viewport sees less across, so it
  // needs the extra distance a portrait phone always needs.
  const halfFov = (42 / 2) * (Math.PI / 180);
  const distance = (radius / Math.sin(halfFov)) * (aspect < 1 ? 1.35 : 1);

  const focusY = elevation + height * 0.35;
  const middleY = lowest + span / 2;
  const targetY = focusY * 0.55 + middleY * 0.45;

  // A fixed three-quarter direction, normalised so the distance means what it says.
  const d = [0.62, 0.75, 0.62];
  const length = Math.hypot(d[0], d[1], d[2]);
  return {
    position: [
      cx + (d[0] / length) * distance,
      targetY + (d[1] / length) * distance,
      cz + (d[2] / length) * distance,
    ],
    target: [cx, targetY, cz],
  };
}

/** Where a room's lamps hang: spread along the room's long axis, under the ceiling. */
export function lampSpots(room: Room, count: number, height: number): [number, number, number][] {
  if (count <= 0) return [];
  const y = height - 0.35;
  const alongX = room.w >= room.d;
  const spots: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    // Evenly spaced at the midpoints of `count` equal slices, so two lamps sit a
    // quarter and three-quarters along rather than both in the middle.
    const t = (i + 0.5) / count;
    spots.push(
      alongX
        ? [room.x + room.w * t, y, room.z + room.d / 2]
        : [room.x + room.w / 2, y, room.z + room.d * t],
    );
  }
  return spots;
}

/**
 * The rooms and walls of one storey — that storey's only.
 *
 * The outdoors used to come back with every level, because only one storey was ever
 * built and the garden had to be in it. Now that all four are built at once, the
 * garden is built once too, beside them rather than in each.
 */
export function levelContents(plan: Plan, level: number | null): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: plan.rooms.filter((r) => r.level === level),
    walls: plan.walls.filter((w) => w.level === level),
  };
}

/** Everything that is not on a storey: the ground, the terrace, the pool. */
export function outdoorRooms(plan: Plan): Room[] {
  return plan.rooms.filter((r) => r.level === null);
}

/** The levels a viewer can switch between, lowest first. Outdoors is not one. */
export function selectableLevels(plan: Plan): Level[] {
  return [...plan.levels].sort((a, b) => a.level - b.level);
}

/**
 * The rectangles a storey's slab is made of: its body and its wings, the body cut
 * around the stairwell. Four strips around a hole rather than a slab with a hole in
 * it, because a box with a hole is not a box.
 */
export function slabPieces(level: Level): Rect[] {
  const body: Rect = { x: level.x, z: level.z, w: level.w, d: level.d };
  const parts = level.parts ?? [];
  const hole = level.hole;
  if (!hole) return [body, ...parts];
  const pieces: Rect[] = [];
  const push = (x: number, z: number, w: number, d: number): void => {
    if (w > 1e-9 && d > 1e-9) pieces.push({ x, z, w, d });
  };
  // North and south strips run the full width; east and west fill beside the hole.
  push(body.x, body.z, body.w, hole.z - body.z);
  push(body.x, hole.z + hole.d, body.w, body.z + body.d - (hole.z + hole.d));
  push(body.x, hole.z, hole.x - body.x, hole.d);
  push(hole.x + hole.w, hole.z, body.x + body.w - (hole.x + hole.w), hole.d);
  return [...pieces, ...parts];
}

/** One step: a solid block from the run's floor up to its tread. */
export interface Step extends Rect {
  y0: number;
  y1: number;
}

/**
 * A run of stairs as blocks. Solid from the floor, not floating treads: it reads
 * as a staircase from every angle and it is the cheapest thing that does.
 *
 * `riser` is what a riser should be; the count is rounded so the rise divides
 * evenly, which is what a builder does too.
 */
export function stairSteps(run: StairRun, riser = 0.19): Step[] {
  const rise = run.y1 - run.y0;
  const count = Math.max(1, Math.round(rise / riser));
  const length = run.axis === "x" ? run.w : run.d;
  const tread = length / count;
  const steps: Step[] = [];
  for (let i = 0; i < count; i++) {
    // Climbing towards +axis the first step is at the start; towards −axis it is
    // at the far end, so the run is walked from its low end either way.
    const along = run.direction === 1 ? i * tread : length - (i + 1) * tread;
    const y1 = run.y0 + ((i + 1) * rise) / count;
    steps.push(
      run.axis === "x"
        ? { x: run.x + along, z: run.z, w: tread, d: run.d, y0: run.y0, y1 }
        : { x: run.x, z: run.z + along, w: run.w, d: tread, y0: run.y0, y1 },
    );
  }
  return steps;
}

/** A slope of a gable roof: a slab to place and tilt. Position is the slab's centre. */
export interface RoofSlope {
  position: [number, number, number];
  /** Rotation about the ridge axis, radians. */
  tilt: number;
  /** Extent along the ridge, and down the slope. */
  along: number;
  down: number;
}

/** A gable end: a triangle standing on the wall line, with its points as [across, y]. */
export interface GableEnd {
  /** The constant coordinate of the wall it stands on. */
  at: number;
  points: [number, number][];
}

/**
 * The geometry of a gable roof, relative to the storey it sits on.
 *
 * Two slopes meeting at a ridge, overhanging the walls by `overhang`, and two
 * gable triangles closing the ends on the wall line. `y` is measured from the
 * storey's floor; the caller adds the storey's elevation by placing it in the
 * storey's group.
 */
export function gableRoof(
  roof: Roof,
  wallHeight: number,
): { eavesY: number; ridgeY: number; slopes: RoofSlope[]; gables: GableEnd[] } {
  const o = roof.overhang;
  const eavesY = wallHeight + 0.05;
  const ridgeY = eavesY + roof.rise;
  const ridgeX = roof.ridge !== "z";
  // Half the span across the ridge, and the slope's length down it.
  const half = (ridgeX ? roof.d : roof.w) / 2 + o;
  const down = Math.hypot(half, roof.rise);
  const tilt = Math.atan2(roof.rise, half);
  const along = (ridgeX ? roof.w : roof.d) + 2 * o;
  const cx = roof.x + roof.w / 2;
  const cz = roof.z + roof.d / 2;
  const my = eavesY + roof.rise / 2;

  const slopes: RoofSlope[] = ridgeX
    ? [
        { position: [cx, my, cz - half / 2], tilt: -tilt, along, down },
        { position: [cx, my, cz + half / 2], tilt: tilt, along, down },
      ]
    : [
        { position: [cx - half / 2, my, cz], tilt: tilt, along, down },
        { position: [cx + half / 2, my, cz], tilt: -tilt, along, down },
      ];

  const lo = ridgeX ? roof.z : roof.x;
  const hi = ridgeX ? roof.z + roof.d : roof.x + roof.w;
  const mid = (lo + hi) / 2;
  const triangle: [number, number][] = [
    [lo, eavesY],
    [hi, eavesY],
    [mid, ridgeY],
  ];
  const gables: GableEnd[] = ridgeX
    ? [
        { at: roof.x, points: triangle },
        { at: roof.x + roof.w, points: triangle },
      ]
    : [
        { at: roof.z, points: triangle },
        { at: roof.z + roof.d, points: triangle },
      ];

  return { eavesY, ridgeY, slopes, gables };
}

/** One solar panel: where its centre sits and how it lies, relative to the storey. */
export interface Panel {
  position: [number, number, number];
  /** Rotation about the ridge axis, radians — the slope's own tilt. */
  tilt: number;
  /** Extent along the ridge, and down the slope. */
  along: number;
  down: number;
}

/** A standard module, in metres: along the ridge, and down the slope. */
export const PANEL_ALONG = 1.05;
export const PANEL_DOWN = 1.75;
const PANEL_GAP = 0.06;
/** How far a panel stands off the roof surface. */
const PANEL_LIFT = 0.07;

/**
 * The array on the sunward slope — south for a ridge running east–west, east
 * otherwise — centred on it, `rows` deep down the slope and `perRow` wide along
 * the ridge. Each panel lies in the slope's plane, lifted a little off it, which
 * is what a mounted module looks like and what stops it fighting the roof for
 * the same pixels.
 */
export function solarPanels(roof: Roof, wallHeight: number): Panel[] {
  if (!roof.solar || roof.kind !== "gable") return [];
  const { rows, perRow } = roof.solar;
  const shape = gableRoof(roof, wallHeight);
  const ridgeX = roof.ridge !== "z";
  // The second slope faces +z (south) for an x ridge, +x (east) for a z ridge.
  const slope = shape.slopes[1];
  const a = Math.abs(slope.tilt);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const [cx, cy, cz] = slope.position;

  const panels: Panel[] = [];
  const spanAlong = perRow * PANEL_ALONG + (perRow - 1) * PANEL_GAP;
  const spanDown = rows * PANEL_DOWN + (rows - 1) * PANEL_GAP;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      // Offsets in the slope's own frame: u along the ridge, v down the slope
      // (positive towards the eaves), n off the surface.
      const u = -spanAlong / 2 + PANEL_ALONG / 2 + c * (PANEL_ALONG + PANEL_GAP);
      const v = -spanDown / 2 + PANEL_DOWN / 2 + r * (PANEL_DOWN + PANEL_GAP);
      const n = PANEL_LIFT;
      // Down the south slope is +z and −y; its normal is +y and +z. Mirror for east.
      const position: [number, number, number] = ridgeX
        ? [cx + u, cy - v * sin + n * cos, cz + v * cos + n * sin]
        : [cx + v * cos + n * sin, cy - v * sin + n * cos, cz + u];
      panels.push({ position, tilt: slope.tilt, along: PANEL_ALONG, down: PANEL_DOWN });
    }
  }
  return panels;
}

/** The tallest thing on the house above its top storey's walls, for framing. */
export function roofRise(plan: Plan): number {
  return Math.max(0, ...(plan.roofs ?? []).map((r) => r.rise + 0.05));
}

/** A block of furniture: a box, and which material it is drawn in. */
export interface Piece {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  material: "wood" | "fabric" | "white" | "dark" | "metal" | "car" | "glass" | "water";
}

/**
 * What a room of a kind is furnished with, laid out from its corners.
 *
 * Not a catalogue — a bed, a wardrobe, a desk, a sofa, a table — enough that a
 * room reads as what it is at a glance and no more, because every block is drawn
 * on a phone. Positions are relative to the room, so the same kitchen fits a
 * kitchen of any size, and nothing is placed within a door's swing of the walls
 * that carry one: the north wall in most rooms, so furniture keeps to the south.
 */
export function furnitureFor(room: Room): Piece[] {
  const { x, z, w, d } = room;
  const pieces: Piece[] = [];
  const add = (
    px: number,
    pz: number,
    pw: number,
    ph: number,
    pd: number,
    material: Piece["material"],
    py = 0,
  ): void => {
    pieces.push({ x: x + px, y: py, z: z + pz, w: pw, h: ph, d: pd, material });
  };
  switch (room.kind) {
    case "bedroom": {
      // The bed against the south wall, head to it; a wardrobe on the west.
      const bw = Math.min(1.6, w - 1.2);
      add((w - bw) / 2, d - 2.1, bw, 0.45, 2.0, "wood");
      add((w - bw) / 2 + 0.05, d - 2.05, bw - 0.1, 0.2, 1.9, "white", 0.45);
      add((w - bw) / 2 + 0.1, d - 2.0, bw - 0.2, 0.12, 0.45, "fabric", 0.65);
      add(0.1, 0.6, 0.6, 2.0, Math.min(1.6, d - 2.9), "wood");
      break;
    }
    case "bathroom": {
      // A bath along the west with water in it, a glass shower cabin in the
      // south-east corner, the basin on a cabinet against the east wall, the toilet
      // beside the door. Enough that nobody has to ask what room this is.
      add(0.1, d - 1.9, 0.8, 0.55, 1.75, "white");
      add(0.2, d - 1.8, 0.6, 0.06, 1.55, "water", 0.42);
      add(w - 1.0, d - 1.0, 0.9, 2.0, 0.9, "glass");
      add(w - 1.0, d - 1.0, 0.9, 0.08, 0.9, "white");
      add(w - 0.6, 0.9, 0.55, 0.8, 0.9, "wood");
      add(w - 0.55, 0.95, 0.45, 0.12, 0.8, "white", 0.8);
      add(w - 0.5, 0.15, 0.4, 0.42, 0.6, "white");
      add(w - 0.45, 0.05, 0.3, 0.75, 0.15, "white", 0.42);
      break;
    }
    case "wc": {
      // The pan against the far wall, its cistern behind it, a hand basin by the door.
      add(w / 2 - 0.2, 0.15, 0.4, 0.42, 0.6, "white");
      add(w / 2 - 0.2, 0.05, 0.4, 0.75, 0.15, "white", 0.42);
      add(w - 0.45, d - 0.55, 0.35, 0.85, 0.35, "white");
      break;
    }
    case "kitchen": {
      // A run of counters along the east wall, a fridge at its end, an island.
      add(w - 0.65, 0.3, 0.6, 0.9, d - 1.0, "white");
      add(w - 0.65, d - 1.2, 0.6, 1.9, 0.7, "metal");
      add(w / 2 - 1.0, d / 2 - 0.45, 1.6, 0.9, 0.9, "wood");
      break;
    }
    case "living": {
      // An L of sofa round a low table, west half; the dining table east.
      add(0.6, d - 1.5, 2.6, 0.75, 0.9, "fabric");
      add(0.6, d - 3.2, 0.9, 0.75, 1.7, "fabric");
      add(1.9, d - 3.0, 1.1, 0.4, 0.8, "wood");
      const tx = w * 0.62;
      add(tx, d / 2 - 0.5, 1.8, 0.75, 1.0, "wood");
      for (const [cx, cz] of [
        [tx - 0.5, d / 2 - 0.25],
        [tx + 1.8, d / 2 - 0.25],
        [tx + 0.35, d / 2 - 1.0],
        [tx + 1.0, d / 2 - 1.0],
        [tx + 0.35, d / 2 + 0.55],
        [tx + 1.0, d / 2 + 0.55],
      ]) {
        add(cx, cz, 0.45, 0.45, 0.45, "dark");
      }
      break;
    }
    case "office": {
      // A desk under the window on the north, a chair, a bookcase on the west.
      add(w / 2 - 0.8, 0.35, 1.6, 0.74, 0.7, "wood");
      add(w / 2 - 0.25, 1.15, 0.5, 0.5, 0.5, "dark");
      add(0.1, d - 1.3, 0.35, 1.9, 1.1, "wood");
      break;
    }
    case "hall":
      // A console by the door.
      add(w - 1.1, d - 0.5, 1.0, 0.85, 0.35, "wood");
      break;
    case "garage": {
      // The car, nose to the house; shelves on the north wall.
      const cx = w / 2 - 0.9;
      add(cx, 0.8, 1.8, 0.55, 4.2, "car", 0.3);
      add(cx + 0.2, 1.8, 1.4, 0.55, 2.0, "dark", 0.85);
      for (const [wx, wz] of [
        [cx - 0.05, 1.4],
        [cx + 1.55, 1.4],
        [cx - 0.05, 4.0],
        [cx + 1.55, 4.0],
      ]) {
        add(wx, wz, 0.3, 0.6, 0.6, "dark");
      }
      add(0.1, 0.2, w - 0.2, 1.8, 0.4, "metal");
      break;
    }
    default:
      break;
  }
  return pieces;
}

/**
 * Where a room's flowers grow: scattered on a grid with a deterministic jitter,
 * so a bed looks planted rather than tiled and the same bed looks the same on
 * every load.
 */
export function flowerSpots(bed: Bed, spacing = 0.55): [number, number][] {
  if (bed.kind !== "flowers") return [];
  const spots: [number, number][] = [];
  let seed = Math.round((bed.x * 31 + bed.z * 17) * 1000);
  const jitter = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648 - 0.5) * spacing * 0.6;
  };
  for (let px = bed.x + spacing / 2; px < bed.x + bed.w; px += spacing) {
    for (let pz = bed.z + spacing / 2; pz < bed.z + bed.d; pz += spacing) {
      spots.push([px + jitter(), pz + jitter()]);
    }
  }
  return spots;
}

/** Where the sprinklers stand on a bed: its centre, and a few more on a big one. */
export function sprinklerSpots(bed: Bed): [number, number][] {
  const across = Math.max(1, Math.round(bed.w / 4));
  const down = Math.max(1, Math.round(bed.d / 4));
  const spots: [number, number][] = [];
  for (let i = 0; i < across; i++) {
    for (let j = 0; j < down; j++) {
      spots.push([bed.x + ((i + 0.5) * bed.w) / across, bed.z + ((j + 0.5) * bed.d) / down]);
    }
  }
  return spots;
}

/** A tree as a trunk and a crown of spheres; a bush as a squashed sphere. */
export interface TreeParts {
  trunk: { x: number; y: number; z: number; radius: number; height: number } | null;
  crown: { x: number; y: number; z: number; radius: number }[];
}

export function treeParts(tree: Tree): TreeParts {
  const { x, z, size } = tree;
  if (tree.kind === "bush") {
    return { trunk: null, crown: [{ x, y: size * 0.45, z, radius: size * 0.55 }] };
  }
  const trunkHeight = size * (tree.kind === "olive" ? 0.35 : 0.42);
  const r = size * (tree.kind === "olive" ? 0.36 : 0.3);
  return {
    trunk: { x, y: trunkHeight / 2, z, radius: size * 0.05, height: trunkHeight },
    crown: [
      { x, y: trunkHeight + r * 0.8, z, radius: r },
      { x: x + r * 0.55, y: trunkHeight + r * 0.55, z: z + r * 0.2, radius: r * 0.75 },
      { x: x - r * 0.5, y: trunkHeight + r * 0.6, z: z - r * 0.3, radius: r * 0.7 },
      { x, y: trunkHeight + r * 1.45, z, radius: r * 0.65 },
    ],
  };
}
