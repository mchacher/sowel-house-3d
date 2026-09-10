import { describe, expect, it } from "vitest";
import { validatePlan } from "./validate.ts";
import type { Plan } from "./types.ts";
// The app fetches the plan at runtime, because it is data a deployment swaps. The
// test imports it so the app tier needs no node types for a file read.
import showroom from "../../public/plans/showroom.json";

const plan = showroom as unknown as Plan;

describe("the showroom plan", () => {
  it("validates", () => {
    expect(validatePlan(plan)).toEqual([]);
  });

  it("names the same rooms as the simulator", () => {
    // The two describe the same building. A second vocabulary for the same rooms
    // would be a translation table waiting to go stale.
    const expected = [
      "atelier",
      "bureau",
      "cave",
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
    ];
    expect(plan.rooms.map((r) => r.id).sort()).toEqual(expected);
  });

  it("keeps every room's area within a few percent of the simulator's", () => {
    // Floor areas come from the thermal model, so the house a visitor sees and the
    // house the physics runs on are the same size.
    const expected: Record<string, number> = {
      entree: 8,
      sejour: 38,
      cuisine: 14,
      bureau: 12,
      "chambre-parents": 16,
      "chambre-enfant-1": 12,
      "salle-de-bain": 7,
      "chambre-enfant-2": 11,
      "chambre-enfant-3": 11,
      escalier: 9,
      garage: 22,
      cave: 14,
      atelier: 18,
      terrasse: 25,
      piscine: 32,
      jardin: 400,
    };
    for (const room of plan.rooms) {
      const want = expected[room.id];
      const got = room.w * room.d;
      expect(Math.abs(got - want) / want, `${room.id}: ${got} vs ${want} m²`).toBeLessThan(0.06);
    }
  });

  it("puts every room inside its level's slab", () => {
    for (const room of plan.rooms) {
      if (room.level === null) continue;
      const slab = plan.levels.find((l) => l.level === room.level);
      expect(slab, `no slab for level ${room.level}`).toBeDefined();
      if (!slab) continue;
      expect(room.x).toBeGreaterThanOrEqual(slab.x - 1e-9);
      expect(room.z).toBeGreaterThanOrEqual(slab.z - 1e-9);
      expect(room.x + room.w).toBeLessThanOrEqual(slab.x + slab.w + 1e-9);
      expect(room.z + room.d).toBeLessThanOrEqual(slab.z + slab.d + 1e-9);
    }
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
