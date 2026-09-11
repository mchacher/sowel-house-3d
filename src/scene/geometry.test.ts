import { describe, expect, it } from "vitest";
import {
  cameraFor,
  lampSpots,
  levelContents,
  levelElevation,
  outdoorRooms,
  gableRoof,
  slabPieces,
  solarPanels,
  stackHeight,
  stairSteps,
  storeyPitch,
  pieceBox,
  selectableLevels,
  shutterDrop,
  sunDirection,
  wallPieces,
} from "./geometry.ts";
import type { Plan, Room, Wall } from "../plan/types.ts";
import showroomPlan from "../../public/plans/showroom.json";

const plan = showroomPlan as unknown as Plan;
const HEIGHT = plan.height;

const wall = (openings: Wall["openings"]): Wall => ({
  level: 0,
  axis: "x",
  at: 0,
  from: 0,
  to: 10,
  openings,
});

describe("cutting a wall around its openings", () => {
  it("leaves one piece when there is nothing to cut", () => {
    expect(wallPieces(wall([]), HEIGHT)).toEqual([{ from: 0, to: 10, y0: 0, y1: HEIGHT }]);
  });

  it("leaves a sill below a window and a lintel above it", () => {
    const pieces = wallPieces(
      wall([{ kind: "window", at: 5, w: 2, sill: 0.9, head: 2.1 }]),
      HEIGHT,
    );
    expect(pieces).toEqual([
      { from: 0, to: 4, y0: 0, y1: HEIGHT },
      { from: 4, to: 6, y0: 0, y1: 0.9 },
      { from: 4, to: 6, y0: 2.1, y1: HEIGHT },
      { from: 6, to: 10, y0: 0, y1: HEIGHT },
    ]);
  });

  it("leaves no lintel when a door reaches the ceiling", () => {
    const pieces = wallPieces(wall([{ kind: "door", at: 5, w: 1, sill: 0, head: HEIGHT }]), HEIGHT);
    // Nothing under the sill, nothing over the head: just the two runs beside it.
    expect(pieces).toEqual([
      { from: 0, to: 4.5, y0: 0, y1: HEIGHT },
      { from: 5.5, to: 10, y0: 0, y1: HEIGHT },
    ]);
  });

  it("sorts openings, because a plan lists them in the order they were thought of", () => {
    const unsorted = wallPieces(
      wall([
        { kind: "door", at: 8, w: 1, sill: 0, head: 2.1 },
        { kind: "door", at: 2, w: 1, sill: 0, head: 2.1 },
      ]),
      HEIGHT,
    );
    const runs = unsorted.filter((p) => p.y0 === 0 && p.y1 === HEIGHT);
    // Three full-height runs: before, between, after. An unsorted pass leaves holes.
    expect(runs.map((p) => [p.from, p.to])).toEqual([
      [0, 1.5],
      [2.5, 7.5],
      [8.5, 10],
    ]);
  });

  it("never emits a piece too thin to see", () => {
    // An opening flush with the wall's end leaves no run beside it.
    const pieces = wallPieces(wall([{ kind: "door", at: 0.5, w: 1, sill: 0, head: 2.1 }]), HEIGHT);
    expect(pieces.every((p) => p.to - p.from > 0.001 && p.y1 - p.y0 > 0.001)).toBe(true);
    expect(pieces.some((p) => p.from === 0 && p.to === 0)).toBe(false);
  });

  it("covers the whole wall, with no overlap and no gap, at every height", () => {
    // The property that matters: every point of the wall is either solid exactly
    // once or inside an opening.
    const w = wall([
      { kind: "window", at: 3, w: 1.4, sill: 0.9, head: 2.1 },
      { kind: "door", at: 7, w: 0.9, sill: 0, head: 2.1 },
    ]);
    const pieces = wallPieces(w, HEIGHT);
    // Offset and stepped so no sample lands exactly on an edge: a boundary belongs
    // to neither piece by design, and sampling one proves nothing about a gap.
    for (let along = 0.017; along < 10; along += 0.043) {
      for (let y = 0.013; y < HEIGHT; y += 0.037) {
        const covering = pieces.filter(
          (p) => along > p.from && along < p.to && y > p.y0 && y < p.y1,
        );
        const inOpening = w.openings.some(
          (o) => along > o.at - o.w / 2 && along < o.at + o.w / 2 && y > o.sill && y < o.head,
        );
        expect(covering.length, `along ${along.toFixed(2)} y ${y.toFixed(2)}`).toBe(
          inOpening ? 0 : 1,
        );
      }
    }
  });

  it("cuts every wall of the real plan without leaving a hole", () => {
    for (const w of plan.walls) {
      const pieces = wallPieces(w, plan.height);
      const solid = pieces.reduce((a, p) => a + (p.to - p.from) * (p.y1 - p.y0), 0);
      const openArea = w.openings.reduce((a, o) => a + o.w * (o.head - o.sill), 0);
      expect(solid + openArea).toBeCloseTo((w.to - w.from) * plan.height, 6);
    }
  });
});

describe("placing a piece in the world", () => {
  it("runs an x-axis wall along x at a fixed z", () => {
    const box = pieceBox(wall([]), { from: 2, to: 6, y0: 0, y1: 2 }, 0.14);
    expect(box).toEqual({ x: 4, y: 1, z: 0, w: 4, h: 2, d: 0.14 });
  });

  it("runs a z-axis wall along z at a fixed x", () => {
    const w: Wall = { ...wall([]), axis: "z", at: 3 };
    const box = pieceBox(w, { from: 2, to: 6, y0: 0, y1: 2 }, 0.14);
    expect(box).toEqual({ x: 3, y: 1, z: 4, w: 0.14, h: 2, d: 4 });
  });
});

describe("a shutter's drop", () => {
  it("hangs fully at 0 and not at all at 100", () => {
    expect(shutterDrop(0)).toBe(1);
    expect(shutterDrop(100)).toBe(0);
    expect(shutterDrop(50)).toBeCloseTo(0.5);
  });

  it("does not hang at all when there is no shutter", () => {
    expect(shutterDrop(null)).toBe(0);
  });

  it("clamps a plugin that is wrong rather than trusting it", () => {
    expect(shutterDrop(-40)).toBe(1);
    expect(shutterDrop(260)).toBe(0);
  });
});

describe("the sun's direction", () => {
  it("is in the east at sunrise and the west at sunset", () => {
    expect(sunDirection(5, 90).x).toBeGreaterThan(0.9);
    expect(sunDirection(5, 270).x).toBeLessThan(-0.9);
  });

  it("is due south at noon, which is +z on this plan", () => {
    const noon = sunDirection(60, 180);
    expect(noon.z).toBeGreaterThan(0);
    expect(Math.abs(noon.x)).toBeLessThan(1e-9);
  });

  it("is due north at midnight, which is −z", () => {
    const north = sunDirection(10, 0);
    expect(north.z).toBeLessThan(0);
    expect(Math.abs(north.x)).toBeLessThan(1e-9);
  });

  it("is overhead at ninety degrees and below the floor at night", () => {
    expect(sunDirection(90, 180).y).toBeCloseTo(1);
    expect(sunDirection(-20, 180).y).toBeLessThan(0);
  });

  it("is always a unit vector", () => {
    for (const el of [-30, 0, 15, 45, 89]) {
      for (const az of [0, 90, 180, 270, 359]) {
        const d = sunDirection(el, az);
        expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
      }
    }
  });
});

describe("framing a level", () => {
  it("puts the camera above the walls and pulls back for a bigger house", () => {
    const small = cameraFor({
      level: { level: 0, name: "a", x: 0, z: 0, w: 6, d: 6 },
      height: 2.6,
    });
    const big = cameraFor({
      level: { level: 0, name: "b", x: 0, z: 0, w: 20, d: 20 },
      height: 2.6,
    });
    expect(small.position[1]).toBeGreaterThan(2.6);
    expect(big.position[1]).toBeGreaterThan(small.position[1]);
    expect(Math.hypot(big.position[0], big.position[2])).toBeGreaterThan(
      Math.hypot(small.position[0], small.position[2]),
    );
  });

  it("aims at the level's centre wherever the level is", () => {
    const shifted = cameraFor({
      level: { level: 0, name: "a", x: 10, z: -4, w: 8, d: 6 },
      height: 2.6,
    });
    expect(shifted.target[0]).toBe(14);
    expect(shifted.target[2]).toBe(-1);
  });

  it("pulls further back on a portrait viewport, which sees less across", () => {
    const level = { level: 0, name: "a", x: 0, z: 0, w: 10, d: 10 };
    const wide = cameraFor({ level, height: 2.6, aspect: 16 / 9 });
    const phone = cameraFor({ level, height: 2.6, aspect: 9 / 16 });
    expect(phone.position[0]).toBeGreaterThan(wide.position[0]);
  });
});

describe("hanging a room's lamps", () => {
  it("hangs one in the middle", () => {
    const room: Room = { id: "a", name: "A", level: 0, x: 0, z: 0, w: 4, d: 6, spot: [2, 3] };
    expect(lampSpots(room, 1, 2.6)).toEqual([[2, 2.25, 3]]);
  });

  it("spreads several along the room's long axis", () => {
    const room: Room = { id: "a", name: "A", level: 0, x: 0, z: 0, w: 9, d: 3, spot: [4, 1] };
    const spots = lampSpots(room, 3, 2.6);
    expect(spots.map((s) => s[0])).toEqual([1.5, 4.5, 7.5]);
    // Not all three in the middle, which is what an (i / count) spacing would give.
    expect(new Set(spots.map((s) => s[0])).size).toBe(3);
  });

  it("hangs nothing for a room with no lamp", () => {
    const room: Room = { id: "a", name: "A", level: 0, x: 0, z: 0, w: 4, d: 4, spot: [2, 2] };
    expect(lampSpots(room, 0, 2.6)).toEqual([]);
  });
});

describe("what a level contains", () => {
  it("shows its own rooms and nobody else's", () => {
    const ground = levelContents(plan, 0);
    const ids = ground.rooms.map((r) => r.id);
    expect(ids).toContain("sejour");
    expect(ids).not.toContain("chambre-parents");
    // The garden is built once now, beside the storeys — not handed to each of them.
    expect(ids).not.toContain("jardin");
    expect(ground.walls.every((w) => w.level === 0)).toBe(true);
  });

  it("keeps the outdoors apart, and on no storey", () => {
    const ids = outdoorRooms(plan).map((r) => r.id);
    expect(ids).toContain("jardin");
    expect(ids).toContain("piscine");
    expect(outdoorRooms(plan).every((r) => r.level === null)).toBe(true);
  });

  it("stacks the storeys on each other, the cellar under the ground floor", () => {
    expect(levelElevation(plan, 0)).toBe(0);
    expect(levelElevation(plan, 1)).toBeCloseTo(storeyPitch(plan));
    expect(levelElevation(plan, -1)).toBeCloseTo(-storeyPitch(plan));
    // Above the wall height: a storey must clear the one below it, not sit in it.
    expect(storeyPitch(plan)).toBeGreaterThan(plan.height);
    // The outdoors is at ground level, because that is where the ground is.
    expect(levelElevation(plan, null)).toBe(0);
  });

  it("frames a storey at its own height", () => {
    const slab = plan.levels.find((l) => l.level === 1)!;
    const common = { level: slab, height: plan.height, aspect: 16 / 9, stack: stackHeight(plan) };
    const up = cameraFor({ ...common, elevation: levelElevation(plan, 1) });
    const down = cameraFor({ ...common, elevation: levelElevation(plan, 0) });
    // Framing the second floor must not frame the cellar.
    expect(up.target[1]).toBeGreaterThan(down.target[1] + 1);
    expect(up.position[1]).toBeGreaterThan(down.position[1]);
  });

  it("offers the two storeys, lowest first, and not the outdoors", () => {
    expect(selectableLevels(plan).map((l) => l.level)).toEqual([0, 1]);
  });
});

describe("a slab with a stairwell", () => {
  it("is four strips around the hole, and its wings", () => {
    const pieces = slabPieces({
      level: 1,
      name: "Étage",
      x: 0,
      z: 0,
      w: 10,
      d: 8,
      hole: { x: 3, z: 2, w: 3, d: 2 },
      parts: [{ x: 10, z: 0, w: 4, d: 4 }],
    });
    expect(pieces).toHaveLength(5);
    const area = pieces.reduce((n, p) => n + p.w * p.d, 0);
    expect(area).toBeCloseTo(10 * 8 - 3 * 2 + 4 * 4);
    // Nothing covers the hole.
    for (const p of pieces) {
      const overlaps = p.x < 6 && p.x + p.w > 3 && p.z < 4 && p.z + p.d > 2;
      expect(overlaps, JSON.stringify(p)).toBe(false);
    }
  });

  it("is one box when there is no hole", () => {
    expect(slabPieces({ level: 0, name: "RDC", x: 0, z: 0, w: 5, d: 5 })).toHaveLength(1);
  });
});

describe("a run of stairs", () => {
  it("divides the rise evenly and climbs from the low end", () => {
    const up = stairSteps({ axis: "z", direction: 1, x: 0, z: 0, w: 1, d: 1.5, y0: 0, y1: 1.2 });
    expect(up).toHaveLength(6);
    expect(up[0].z).toBe(0);
    expect(up[0].y1).toBeCloseTo(0.2);
    expect(up[5].y1).toBeCloseTo(1.2);
    // Solid from the floor: every block starts at the run's floor.
    expect(up.every((s) => s.y0 === 0)).toBe(true);
  });

  it("puts the first step at the far end when the run climbs backwards", () => {
    const down = stairSteps({
      axis: "x",
      direction: -1,
      x: 3.5,
      z: 4,
      w: 2,
      d: 1,
      y0: 1.2,
      y1: 2.9,
    });
    // The lowest step is at the east end, the highest at x = 3.5.
    expect(down[0].x + down[0].w).toBeCloseTo(5.5);
    expect(down[down.length - 1].x).toBeCloseTo(3.5);
  });
});

describe("a gable roof", () => {
  const roof = gableRoof(
    { over: 1, kind: "gable", ridge: "x", x: 0, z: 0, w: 10, d: 8, rise: 2, overhang: 0.5 },
    2.6,
  );

  it("has two slopes tilted opposite ways, meeting at the ridge", () => {
    expect(roof.slopes).toHaveLength(2);
    expect(roof.slopes[0].tilt).toBeCloseTo(-roof.slopes[1].tilt);
    // Each slope runs from the eaves (half the depth plus the overhang) to the ridge.
    expect(roof.slopes[0].down).toBeCloseTo(Math.hypot(4.5, 2));
    expect(roof.slopes[0].along).toBeCloseTo(11);
    expect(roof.ridgeY).toBeCloseTo(roof.eavesY + 2);
  });

  it("closes both ends with a triangle on the wall line, not the overhang", () => {
    expect(roof.gables.map((g) => g.at)).toEqual([0, 10]);
    expect(roof.gables[0].points).toEqual([
      [0, roof.eavesY],
      [8, roof.eavesY],
      [4, roof.ridgeY],
    ]);
  });
});

describe("the solar array", () => {
  const roof = {
    over: 1,
    kind: "gable" as const,
    ridge: "x" as const,
    x: 0,
    z: 0,
    w: 10,
    d: 8,
    rise: 2,
    overhang: 0.5,
    solar: { rows: 2, perRow: 4 },
  };

  it("lays eight panels on the south slope, lying in its plane, just off it", () => {
    const panels = solarPanels(roof, 2.6);
    const shape = gableRoof(roof, 2.6);
    expect(panels).toHaveLength(8);
    const south = shape.slopes[1];
    for (const panel of panels) {
      expect(panel.tilt).toBeCloseTo(south.tilt);
      // South of the ridge, and never past the eaves.
      expect(panel.position[2]).toBeGreaterThan(4);
      expect(panel.position[2]).toBeLessThan(8.5);
      // Between the eaves and the ridge in height, and above the slope surface: the
      // point on the slope directly under it is lower by the lift.
      const v = (panel.position[2] - south.position[2]) / Math.cos(south.tilt);
      const onSlope = south.position[1] - v * Math.sin(south.tilt);
      expect(panel.position[1] - onSlope).toBeGreaterThan(0.03);
    }
    // Four across, centred on the roof.
    const xs = [...new Set(panels.map((p) => p.position[0].toFixed(2)))];
    expect(xs).toHaveLength(4);
    expect(panels.reduce((n, p) => n + p.position[0], 0) / 8).toBeCloseTo(5);
  });

  it("puts none on a flat roof or a roof with no array", () => {
    expect(solarPanels({ ...roof, solar: undefined }, 2.6)).toEqual([]);
    expect(solarPanels({ ...roof, kind: "flat" }, 2.6)).toEqual([]);
  });
});
