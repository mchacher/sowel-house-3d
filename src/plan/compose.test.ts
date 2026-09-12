import { describe, expect, it } from "vitest";
import { composePlan, wallsOf, type HouseSpec } from "./compose.ts";
import { validatePlan } from "./validate.ts";

/** Two rooms side by side on one slab, with a corridor gap along the south. */
const spec: HouseSpec = {
  height: 2.6,
  thickness: 0.18,
  awaySpot: [0, -2],
  levels: [{ level: 0, name: "RDC", x: 0, z: 0, w: 8, d: 5 }],
  rooms: [
    { id: "a", name: "A", level: 0, x: 0, z: 0, w: 4, d: 4, spot: [2, 2] },
    { id: "b", name: "B", level: 0, x: 4, z: 0, w: 4, d: 4, spot: [6, 2] },
  ],
  windows: [{ room: "a", side: "N", at: 2, w: 1.2, sill: 0.9, head: 2.1 }],
  doors: [
    { room: "a", side: "N", at: 0.8, w: 1, id: "door:a-1", to: "away" },
    { room: "a", side: "E", at: 2, w: 0.9, to: "b" },
    { room: "b", side: "S", at: 2, w: 0.9 },
  ],
  links: [],
};

describe("composing walls from rooms", () => {
  const walls = wallsOf(spec.levels[0], spec.rooms);
  const find = (axis: "x" | "z", at: number) => walls.filter((w) => w.axis === axis && w.at === at);

  it("stands one wall between two rooms, and none through a room", () => {
    const shared = find("z", 4);
    expect(shared).toHaveLength(1);
    expect(shared[0].from).toBe(0);
    expect(shared[0].to).toBe(4);
    expect(shared[0].outside).toBeUndefined();
    // z = 4 is also the north edge of the corridor: a wall stands there between the
    // rooms and the corridor, but not one extended across anything.
    expect(find("x", 2)).toHaveLength(0);
  });

  it("merges a façade into one run and marks it outside", () => {
    const north = find("x", 0);
    expect(north).toHaveLength(1);
    expect(north[0]).toMatchObject({ from: 0, to: 8, outside: true });
  });

  it("closes the envelope along a corridor no room touches", () => {
    // The slab's south edge at z = 5 has no room on it; the corridor does not make
    // it a hole in the house.
    const south = find("x", 5);
    expect(south).toHaveLength(1);
    expect(south[0]).toMatchObject({ from: 0, to: 8, outside: true });
    // And the west wall runs the slab's full depth, corridor included.
    expect(find("z", 0)[0]).toMatchObject({ from: 0, to: 5, outside: true });
  });

  it("stands an interior wall between a room and the corridor", () => {
    const corridorSide = find("x", 4);
    expect(corridorSide).toHaveLength(1);
    expect(corridorSide[0].outside).toBeUndefined();
  });
});

describe("composing a plan", () => {
  const plan = composePlan(spec);

  it("hangs each opening on the wall it lies on, at its world position", () => {
    const north = plan.walls.find((w) => w.axis === "x" && w.at === 0)!;
    expect(north.openings.map((o) => [o.kind, o.at])).toEqual([
      ["door", 0.8],
      ["window", 2],
    ]);
    expect(north.openings[1].id).toBe("window:a-1");
    const east = plan.walls.find((w) => w.axis === "z" && w.at === 4)!;
    expect(east.openings[0]).toMatchObject({ kind: "door", at: 2, w: 0.9 });
  });

  it("makes a graph edge of a door with a far side, and none of a doorway", () => {
    expect(plan.doors.map((d) => `${d.a}-${d.b}`).sort()).toEqual(["away-a", "b-a"]);
    expect(validatePlan(plan)).toEqual([]);
  });

  it("refuses an opening that no single wall can carry", () => {
    const broken: HouseSpec = {
      ...spec,
      windows: [{ room: "a", side: "N", at: 3.9, w: 1, sill: 0.9, head: 2.1 }],
    };
    // Straddles the corner at x = 4: half on A's wall, half past it. The composed
    // façade at z = 0 is one run from 0 to 8, so this one is fine —
    expect(() => composePlan(broken)).not.toThrow();
    // — but an opening on B's south side, where the corridor wall stops at x = 8,
    // hanging out past the wall's end is not.
    const past: HouseSpec = {
      ...spec,
      windows: [],
      doors: [{ room: "b", side: "S", at: 3.8, w: 1 }],
    };
    expect(() => composePlan(past)).toThrow(/no single wall/);
  });
});
