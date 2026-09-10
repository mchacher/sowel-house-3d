import { describe, expect, it } from "vitest";
import { validatePlan } from "./validate.ts";
import type { Plan } from "./types.ts";

function plan(): Plan {
  return {
    height: 2.6,
    thickness: 0.14,
    levels: [{ level: 0, name: "RDC", x: 0, z: 0, w: 10, d: 10 }],
    rooms: [
      { id: "salon", name: "Salon", level: 0, x: 0, z: 0, w: 6, d: 5, spot: [3, 3] },
      { id: "entree", name: "Entrée", level: 0, x: 0, z: 5, w: 2, d: 3, spot: [1, 6.5] },
    ],
    walls: [
      {
        level: 0,
        axis: "x",
        at: 8,
        from: 0,
        to: 6,
        outside: true,
        openings: [{ kind: "door", at: 1, w: 0.9, sill: 0, head: 2.1 }],
      },
      {
        level: 0,
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
    p.rooms.push({ id: "cave", name: "Cave", level: 0, x: 6, z: 0, w: 3, d: 3, spot: [7, 1] });
    expect(validatePlan(p)).toContain('room "cave" cannot be reached from outside');
  });

  it("reports a door to an unknown room", () => {
    const p = plan();
    p.doors.push({ a: "salon", b: "grenier", x: 3, z: 0 });
    expect(validatePlan(p)).toContain('door salon-grenier references unknown room "grenier"');
  });

  it("reports two rooms given the same corner", () => {
    // The mistake a plan author makes most, and the one hardest to see in the
    // scene: the second room is simply inside the first.
    const p = plan();
    p.rooms.push({ id: "bureau", name: "Bureau", level: 0, x: 1, z: 1, w: 3, d: 3, spot: [2, 2] });
    p.doors.push({ a: "salon", b: "bureau", x: 1, z: 1 });
    expect(validatePlan(p)).toContain('rooms "salon" and "bureau" overlap on level 0');
  });

  it("lets rooms on different levels share a footprint, which is what a house is", () => {
    const p = plan();
    p.rooms.push({
      id: "chambre",
      name: "Chambre",
      level: 1,
      x: 0,
      z: 0,
      w: 6,
      d: 5,
      spot: [3, 3],
    });
    p.doors.push({ a: "salon", b: "chambre", x: 3, z: 2 });
    expect(validatePlan(p)).toEqual([]);
  });

  it("reports rooms that merely touch as fine", () => {
    const p = plan();
    p.rooms.push({
      id: "cuisine",
      name: "Cuisine",
      level: 0,
      x: 6,
      z: 0,
      w: 3,
      d: 5,
      spot: [7, 2],
    });
    p.doors.push({ a: "salon", b: "cuisine", x: 6, z: 2 });
    expect(validatePlan(p)).toEqual([]);
  });

  it("lets the ground contain what sits on it", () => {
    // A garden contains a terrace; that is not two rooms given the same corner.
    const p = plan();
    p.rooms.push({
      id: "jardin",
      name: "Jardin",
      level: null,
      x: -5,
      z: -5,
      w: 30,
      d: 30,
      spot: [-3, -3],
      ground: true,
    });
    p.rooms.push({
      id: "terrasse",
      name: "Terrasse",
      level: null,
      x: 0,
      z: 8,
      w: 6,
      d: 2,
      spot: [3, 9],
    });
    p.doors.push({ a: "away", b: "jardin", x: -3, z: -3 });
    p.doors.push({ a: "jardin", b: "terrasse", x: 3, z: 8 });
    p.doors.push({ a: "terrasse", b: "salon", x: 3, z: 8 });
    expect(validatePlan(p)).toEqual([]);
  });

  it("reports two rooms claiming to be the ground", () => {
    const p = plan();
    p.rooms[0].ground = true;
    p.rooms[1].ground = true;
    expect(validatePlan(p).some((m) => m.includes("claim to be the ground"))).toBe(true);
  });

  it("reports a wall on a level with no room", () => {
    const p = plan();
    p.walls.push({ level: 3, axis: "x", at: 0, from: 0, to: 4, openings: [] });
    expect(validatePlan(p)).toContain("wall #2 is on level 3, which has no room");
  });

  it("reports a duplicate room id", () => {
    const p = plan();
    p.rooms.push({ ...p.rooms[0] });
    expect(validatePlan(p)).toContain('duplicate room id "salon"');
  });

  it("reports an opening taller than the wall", () => {
    const p = plan();
    p.walls[0].openings[0].head = 9;
    expect(validatePlan(p).some((m) => m.includes("taller than the wall"))).toBe(true);
  });
});
