import { describe, expect, it } from "vitest";
import showroomPlan from "../../public/plans/showroom.json";
import { levelElevation } from "../scene/geometry.ts";
import { Walk } from "../scene/walk.ts";
import { roomsBetween, route } from "./path.ts";
import type { Plan } from "./types.ts";

const plan = showroomPlan as unknown as Plan;

describe("the way through the house (spec 005)", () => {
  it("reaches every room from the street, through doors only", () => {
    for (const room of plan.rooms.filter((r) => !r.ground)) {
      const points = route(plan, "away", room.id);
      expect(points, room.id).not.toBeNull();
      const entered = (points ?? []).filter((p) => p.enter).map((p) => p.enter);
      expect(entered[entered.length - 1], room.id).toBe(room.id);
    }
  });

  it("walks in through the hall and up the stairs to the bathroom", () => {
    expect(roomsBetween(plan, "away", "salle-de-bain")).toEqual([
      "away",
      "entree",
      "escalier",
      "salle-de-bain",
    ]);
    const points = route(plan, "away", "salle-de-bain") ?? [];
    expect(points.filter((p) => p.enter).map((p) => p.enter)).toEqual([
      "entree",
      "escalier",
      "salle-de-bain",
    ]);
    // Climbs from the ground to the upper floor, never through it.
    const upstairs = levelElevation(plan, 1);
    expect(points[0].y).toBe(0);
    expect(points[points.length - 1].y).toBeCloseTo(upstairs);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].y).toBeGreaterThanOrEqual(points[i - 1].y - 1e-9);
    }
    // The bathroom door is crossed on the upper floor.
    const door = points.find((p) => p.enter === "salle-de-bain");
    expect(door?.y).toBeCloseTo(upstairs);
  });

  it("comes back down and out the way it went in", () => {
    const points = route(plan, "salle-de-bain", "away") ?? [];
    expect(points.filter((p) => p.enter).map((p) => p.enter)).toEqual([
      "escalier",
      "entree",
      "away",
    ]);
    expect(points[points.length - 1].y).toBe(0);
  });

  it("refuses a room it cannot reach", () => {
    expect(route(plan, "away", "nowhere")).toBeNull();
  });
});

describe("a walk along a route", () => {
  it("enters the rooms in order and arrives in about twenty seconds", () => {
    const walk = new Walk(route(plan, "away", "salle-de-bain") ?? []);
    const entered: string[] = [];
    let seconds = 0;
    let done = false;
    while (!done && seconds < 120) {
      const step = walk.step(0.1);
      entered.push(...step.entered);
      done = step.done;
      seconds += 0.1;
    }
    expect(done).toBe(true);
    expect(entered).toEqual(["entree", "escalier", "salle-de-bain"]);
    expect(seconds).toBeGreaterThan(8);
    expect(seconds).toBeLessThan(30);
  });

  it("faces where it goes", () => {
    const walk = new Walk([
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
    ]);
    expect(walk.step(0.5).heading).toBeCloseTo(Math.PI / 2);
  });
});
