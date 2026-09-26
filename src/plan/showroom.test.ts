import { describe, expect, it } from "vitest";
import { validatePlan } from "./validate.ts";
import type { Plan } from "./types.ts";
import { furnitureFor, type Piece } from "../scene/geometry.ts";
// The app fetches the plan at runtime, because it is data a deployment swaps. The
// test imports it so the app tier needs no node types for a file read.
import showroom from "../../public/plans/showroom.json";
import showroomMapping from "../../public/plans/showroom.mapping.json";
import type { Mapping } from "../mapping/types.ts";

const plan = showroom as unknown as Plan;
const mapping = showroomMapping as Mapping;

describe("the showroom plan", () => {
  it("validates", () => {
    expect(validatePlan(plan)).toEqual([]);
  });

  it("names the same rooms as the simulator", () => {
    // The two describe the same building. A second vocabulary for the same rooms
    // would be a translation table waiting to go stale.
    const expected = [
      "bureau",
      "chambre-enfant-1",
      "chambre-enfant-2",
      "chambre-enfant-3",
      "chambre-parents",
      "cuisine",
      "entree",
      "escalier",
      "garage",
      "jardin",
      "piscine",
      "salle-de-bain",
      "sejour",
      "terrasse",
      "wc",
    ];
    expect(plan.rooms.map((r) => r.id).sort()).toEqual(expected);
  });

  it("keeps every room's area within a few percent of the simulator's", () => {
    // Floor areas come from the thermal model, so the house a visitor sees and the
    // house the physics runs on are the same size.
    const expected: Record<string, number> = {
      entree: 7.5,
      sejour: 47,
      cuisine: 20,
      bureau: 10.5,
      "chambre-parents": 18,
      "chambre-enfant-1": 15.75,
      "salle-de-bain": 10.5,
      "chambre-enfant-2": 13.5,
      "chambre-enfant-3": 16,
      escalier: 7.5,
      garage: 30,
      terrasse: 31.5,
      piscine: 32,
      wc: 3,
    };
    for (const room of plan.rooms) {
      // The ground is the world, not a room: its size is whatever frames the house.
      if (room.ground) continue;
      const want = expected[room.id];
      const got = room.w * room.d;
      expect(Math.abs(got - want) / want, `${room.id}: ${got} vs ${want} m²`).toBeLessThan(0.06);
    }
  });

  it("puts every room inside its level's slab, wings included", () => {
    for (const room of plan.rooms) {
      if (room.level === null) continue;
      const slab = plan.levels.find((l) => l.level === room.level);
      expect(slab, `no slab for level ${room.level}`).toBeDefined();
      if (!slab) continue;
      const parts = [slab, ...(slab.parts ?? [])];
      const within = parts.some(
        (p) =>
          room.x >= p.x - 1e-9 &&
          room.z >= p.z - 1e-9 &&
          room.x + room.w <= p.x + p.w + 1e-9 &&
          room.z + room.d <= p.z + p.d + 1e-9,
      );
      expect(within, `${room.id} is off its slab`).toBe(true);
    }
  });

  it("is a pavilion: two storeys, a roof over the top one, stairs between them", () => {
    expect(plan.levels.map((l) => l.level)).toEqual([0, 1]);
    expect(plan.roofs?.some((r) => r.kind === "gable" && r.over === 1)).toBe(true);
    expect(plan.stairs?.[0]?.level).toBe(0);
    // The stairs arrive at the upper floor, and the slab is cut for them.
    const top = Math.max(...(plan.stairs?.[0]?.runs.map((r) => r.y1) ?? [0]));
    expect(top).toBeGreaterThan(plan.height);
    expect(plan.levels.find((l) => l.level === 1)?.hole).toBeDefined();
  });

  it("names every room and level in both languages", () => {
    for (const room of plan.rooms) expect(room.nameEn, room.id).toBeTruthy();
    for (const level of plan.levels) expect(level.nameEn, level.name).toBeTruthy();
  });

  it("keeps every light fixture inside the room that owns it", () => {
    // A sconce or a lantern sits on the wall line, which is the room's edge: inside,
    // inclusive.
    for (const room of plan.rooms) {
      for (const fixture of room.fixtures ?? []) {
        for (const [x, z] of fixture.points) {
          const inside =
            x >= room.x - 1e-9 &&
            x <= room.x + room.w + 1e-9 &&
            z >= room.z - 1e-9 &&
            z <= room.z + room.d + 1e-9;
          expect(inside, `${room.id} ${fixture.kind} at ${x},${z}`).toBe(true);
        }
      }
    }
  });

  describe("its furniture", () => {
    const furnished = plan.rooms.filter((room) => room.furniture);
    const flat = (piece: Piece) => piece.h < 0.05;
    const overlaps = (piece: Piece, x0: number, x1: number, z0: number, z1: number) =>
      piece.x < x1 - 1e-9 &&
      piece.x + piece.w > x0 + 1e-9 &&
      piece.z < z1 - 1e-9 &&
      piece.z + piece.d > z0 + 1e-9;
    /** A wall's opening as a rectangle on the floor, `reach` either side of the wall. */
    const zone = (axis: "x" | "z", wallAt: number, at: number, w: number, reach: number) =>
      axis === "x"
        ? ([at - w / 2, at + w / 2, wallAt - reach, wallAt + reach] as const)
        : ([wallAt - reach, wallAt + reach, at - w / 2, at + w / 2] as const);

    it("furnishes every bedroom, and no two alike", () => {
      const bedrooms = plan.rooms.filter((room) => room.kind === "bedroom");
      expect(bedrooms.every((room) => room.furniture)).toBe(true);
      const accents = new Set(bedrooms.map((room) => room.accent));
      expect(accents.size).toBe(bedrooms.length);
      const layouts = new Set(
        bedrooms.map((room) => (room.furniture ?? []).map((i) => `${i.kind}@${i.wall}`).join()),
      );
      expect(layouts.size).toBe(bedrooms.length);
    });

    it("keeps every piece inside its room, clear of the walls", () => {
      const half = plan.thickness / 2;
      for (const room of furnished) {
        for (const piece of furnitureFor(room)) {
          const inside =
            piece.x >= room.x + half - 1e-9 &&
            piece.x + piece.w <= room.x + room.w - half + 1e-9 &&
            piece.z >= room.z + half - 1e-9 &&
            piece.z + piece.d <= room.z + room.d - half + 1e-9;
          expect(inside, `${room.id} ${piece.material} at ${piece.x},${piece.z}`).toBe(true);
        }
      }
    });

    it("leaves every door room to open", () => {
      // A rug is walked on; anything else in a door's swing is in the way.
      for (const room of furnished) {
        const walls = plan.walls.filter((wall) => wall.level === room.level);
        for (const piece of furnitureFor(room).filter((p) => !flat(p))) {
          for (const wall of walls) {
            for (const door of wall.openings.filter((o) => o.kind !== "window")) {
              const [x0, x1, z0, z1] = zone(wall.axis, wall.at, door.at, door.w, door.w);
              expect(overlaps(piece, x0, x1, z0, z1), `${room.id} ${piece.material}`).toBe(false);
            }
          }
        }
      }
    });

    it("blocks no window: nothing in front of one rises past a third of it", () => {
      // A desk under a window is where a desk goes, its screen a hand above the
      // sill; a wardrobe or a bunk bed there is a window nobody sees.
      for (const room of furnished) {
        const walls = plan.walls.filter((wall) => wall.level === room.level);
        for (const piece of furnitureFor(room)) {
          for (const wall of walls) {
            for (const window of wall.openings.filter((o) => o.kind === "window")) {
              const [x0, x1, z0, z1] = zone(wall.axis, wall.at, window.at, window.w, 0.5);
              const inFront = overlaps(piece, x0, x1, z0, z1);
              if (inFront)
                expect(piece.y + piece.h, `${room.id} ${piece.material}`).toBeLessThanOrEqual(
                  (window.sill ?? 0) + ((window.head ?? 0) - (window.sill ?? 0)) / 3,
                );
            }
          }
        }
      }
    });
  });

  it("places no more lights in a room than the mapping names for it", () => {
    for (const room of plan.rooms) {
      const placed = mapping.placement?.[room.id];
      if (!room.fixtures || !placed) continue;
      expect(room.fixtures.length, room.id).toBeLessThanOrEqual(placed.length);
    }
  });

  it("reports on the front door, the terrace door and the garage door", () => {
    const ids = plan.walls.flatMap((w) => w.openings.filter((o) => o.id && o.kind !== "window"));
    expect(ids.map((o) => o.id).sort()).toEqual([
      "door:entree-1",
      "door:sejour-1",
      "gate:garage-1",
    ]);
    const gate = ids.find((o) => o.kind === "gate");
    // Wide enough for a car, which is the point of it.
    expect(gate?.w).toBeGreaterThanOrEqual(2.4);
  });

  it("gives every window an id, because a shutter binds to one", () => {
    const windows = plan.walls.flatMap((w) => w.openings.filter((o) => o.kind === "window"));
    expect(windows.length).toBeGreaterThan(0);
    for (const window of windows) expect(window.id, JSON.stringify(window)).toBeTruthy();
    const ids = windows.map((w) => w.id);
    expect(new Set(ids).size, "duplicate window id").toBe(ids.length);
  });

  it("has a window for every room the simulator gives one", () => {
    const simulatorWindows: Record<string, number> = {
      sejour: 3,
      cuisine: 2,
      bureau: 1,
      "chambre-parents": 1,
      "chambre-enfant-1": 1,
      "salle-de-bain": 1,
      "chambre-enfant-2": 1,
      "chambre-enfant-3": 1,
    };
    const byRoom = new Map<string, number>();
    for (const wall of plan.walls) {
      for (const opening of wall.openings) {
        if (opening.kind !== "window" || !opening.id) continue;
        const room = opening.id.replace(/^window:/, "").replace(/-\d+$/, "");
        byRoom.set(room, (byRoom.get(room) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries([...byRoom].sort())).toEqual(
      Object.fromEntries(Object.entries(simulatorWindows).sort()),
    );
  });

  it("can be walked: every room is reachable from outside", () => {
    // Already covered by validatePlan, asserted here because a visitor's ghost and
    // the household both walk this graph and a stranded room is a person stuck.
    expect(validatePlan(plan).filter((p) => p.includes("cannot be reached"))).toEqual([]);
  });
});
