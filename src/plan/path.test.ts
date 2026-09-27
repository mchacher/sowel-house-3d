import { describe, expect, it } from "vitest";
import showroomPlan from "../../public/plans/showroom.json";
import { furnitureFor, levelElevation, pieceBox, wallPieces } from "../scene/geometry.ts";
import { Walk } from "../scene/walk.ts";
import { focusAt, route } from "./path.ts";
import type { Plan } from "./types.ts";

const plan = showroomPlan as unknown as Plan;

describe("the way through the house (spec 005)", () => {
  const entered = (from: string, to: string) =>
    (route(plan, from, to) ?? []).filter((p) => p.enter).map((p) => p.enter);

  it("reaches every room from the street", () => {
    for (const room of plan.rooms.filter((r) => !r.ground && r.level !== null)) {
      const seen = entered("away", room.id);
      expect(seen[seen.length - 1], room.id).toBe(room.id);
    }
  });

  it("walks in through the hall and up the stairs to the bathroom", () => {
    expect(entered("away", "salle-de-bain")).toEqual(["entree", "escalier", "salle-de-bain"]);
    const points = route(plan, "away", "salle-de-bain") ?? [];
    const upstairs = levelElevation(plan, 1);
    expect(points[0].y).toBe(0);
    expect(points[points.length - 1].y).toBeCloseTo(upstairs);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].y).toBeGreaterThanOrEqual(points[i - 1].y - 1e-9);
    }
    // Into the bathroom through its door, in its south wall at (2, 3).
    const door = points.find((p) => p.enter === "salle-de-bain");
    expect(Math.abs((door?.x ?? 0) - 2)).toBeLessThan(0.45);
    expect(Math.abs((door?.z ?? 0) - 3)).toBeLessThan(0.3);
  });

  it("comes back down and out the way it went in", () => {
    expect(entered("salle-de-bain", "away")).toEqual(["escalier", "entree", "away"]);
    const points = route(plan, "salle-de-bain", "away") ?? [];
    expect(points[points.length - 1].y).toBe(0);
  });

  it("walks through nothing: walls, furniture, beds, bushes, trunks, the pool", () => {
    const inside = (
      p: { x: number; z: number },
      r: { x: number; z: number; w: number; d: number },
    ) => p.x > r.x && p.x < r.x + r.w && p.z > r.z && p.z < r.z + r.d;
    for (const room of plan.rooms.filter((r) => !r.ground && r.level !== null)) {
      const points = route(plan, "away", room.id) ?? [];
      for (const p of points) {
        const level = Math.round(p.y / levelElevation(plan, 1));
        const flatHere = Math.abs(p.y - levelElevation(plan, level)) < 1e-6;
        if (!flatHere) continue; // on the stairs
        for (const wall of plan.walls.filter((w) => w.level === level)) {
          for (const piece of wallPieces(wall, plan.height)) {
            if (piece.y0 > 0.1) continue;
            const b = pieceBox(wall, piece, plan.thickness);
            const box = { x: b.x - b.w / 2, z: b.z - b.d / 2, w: b.w, d: b.d };
            expect(inside(p, box), `${room.id}: through a wall at ${p.x},${p.z}`).toBe(false);
          }
        }
        for (const r of plan.rooms.filter((x) => x.level === level)) {
          for (const piece of furnitureFor(r).filter((f) => f.h >= 0.05)) {
            expect(inside(p, piece), `${room.id}: through furniture in ${r.id}`).toBe(false);
          }
        }
        if (level === 0) {
          for (const bed of (plan.beds ?? []).filter((b) => b.kind === "flowers")) {
            expect(inside(p, bed), `${room.id}: through the ${bed.id} bed`).toBe(false);
          }
          for (const pool of plan.rooms.filter((r) => r.kind === "pool")) {
            expect(inside(p, pool), `${room.id}: through the pool`).toBe(false);
          }
          for (const tree of plan.trees ?? []) {
            const radius = tree.kind === "bush" ? tree.size * 0.55 : tree.size * 0.05;
            expect(
              Math.hypot(p.x - tree.x, p.z - tree.z),
              `${room.id}: through a ${tree.kind}`,
            ).toBeGreaterThan(radius);
          }
        }
      }
    }
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

describe("what is shown for the figure (spec 005, FR4, amended)", () => {
  it("is the house from outside when the figure is outside", () => {
    expect(focusAt(plan, null, 0)).toBe("outside");
    expect(focusAt(plan, "jardin", 0)).toBe("outside");
  });

  it("is the storey the figure stands on, switching halfway up the stairs", () => {
    const pitch = levelElevation(plan, 1);
    expect(focusAt(plan, "entree", 0)).toBe(0);
    expect(focusAt(plan, "escalier", pitch * 0.4)).toBe(0);
    expect(focusAt(plan, "escalier", pitch * 0.6)).toBe(1);
    expect(focusAt(plan, "salle-de-bain", pitch)).toBe(1);
  });

  it("goes outside, ground floor, upstairs along the walk to the bathroom", () => {
    const walk = new Walk(route(plan, "away", "salle-de-bain") ?? []);
    let room: string | null = null;
    const seen: (number | "outside")[] = [];
    for (let i = 0; i < 400; i++) {
      const step = walk.step(0.1);
      for (const r of step.entered) room = r === "away" ? null : r;
      const focus = focusAt(plan, room, step.position[1]);
      if (seen[seen.length - 1] !== focus) seen.push(focus);
      if (step.done) break;
    }
    expect(seen).toEqual(["outside", 0, 1]);
  });
});
