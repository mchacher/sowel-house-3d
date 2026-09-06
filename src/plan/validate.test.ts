import { describe, expect, it } from "vitest";
import { validatePlan } from "./validate.ts";
import type { Plan } from "./types.ts";

function plan(): Plan {
  return {
    height: 2.6,
    thickness: 0.14,
    rooms: [
      { id: "salon", name: "Salon", x: 0, z: 0, w: 6, d: 5, spot: [3, 3] },
      { id: "entree", name: "Entrée", x: 0, z: 5, w: 2, d: 3, spot: [1, 6.5] },
    ],
    walls: [
      {
        axis: "x",
        at: 8,
        from: 0,
        to: 6,
        outside: true,
        openings: [{ kind: "door", at: 1, w: 0.9, sill: 0, head: 2.1 }],
      },
      {
        axis: "x",
        at: 5,
        from: 0,
        to: 6,
        openings: [{ kind: "door", at: 1, w: 0.9, sill: 0, head: 2.1 }],
      },
    ],
    doors: [
      { a: "salon", b: "entree", x: 1, z: 5 },
      { a: "entree", b: "away", x: 1, z: 8 },
    ],
    awaySpot: [1, 11],
  };
}

describe("validatePlan", () => {
  it("accepts a consistent plan", () => {
    expect(validatePlan(plan())).toEqual([]);
  });

  it("reports a spot outside its room", () => {
    const p = plan();
    p.rooms[0].spot = [9, 9];
    expect(validatePlan(p)).toContain('room "salon" spot is outside the room');
  });

  it("reports an opening that overflows its wall", () => {
    const p = plan();
    p.walls[0].openings[0].at = 5.9;
    expect(validatePlan(p).some((m) => m.includes("overflows"))).toBe(true);
  });

  it("reports a room no door leads to", () => {
    const p = plan();
    p.rooms.push({ id: "cave", name: "Cave", x: 6, z: 0, w: 3, d: 3, spot: [7, 1] });
    expect(validatePlan(p)).toContain('room "cave" cannot be reached from outside');
  });

  it("reports a door to an unknown room", () => {
    const p = plan();
    p.doors.push({ a: "salon", b: "grenier", x: 3, z: 0 });
    expect(validatePlan(p)).toContain('door salon-grenier references unknown room "grenier"');
  });
});
