import { describe, expect, it } from "vitest";
import { dayFraction, sunPath, sunPosition } from "./sun.ts";

describe("the day's arc (spec 004)", () => {
  it("runs from the eastern horizon to the western one, highest at solar noon", () => {
    const path = sunPath("07:30", "19:30", 24);
    expect(path).toHaveLength(25);
    expect(path[0].azimuthDeg).toBe(90);
    expect(path[0].elevationDeg).toBeCloseTo(0);
    expect(path[24].azimuthDeg).toBe(270);
    expect(path[24].elevationDeg).toBeCloseTo(0);
    const highest = path.reduce((a, b) => (b.elevationDeg > a.elevationDeg ? b : a));
    expect(highest.azimuthDeg).toBe(180);
  });

  it("puts the sun on its own path", () => {
    const now = 11 * 60;
    const f = dayFraction("07:30", "19:30", now);
    expect(f).toBeCloseTo(3.5 / 12);
    const sun = sunPosition("07:30", "19:30", now, true);
    const path = sunPath("07:30", "19:30", 12 * 60);
    const onPath = path[Math.round((f ?? 0) * 12 * 60)];
    expect(onPath.azimuthDeg).toBeCloseTo(sun.azimuthDeg);
    expect(onPath.elevationDeg).toBeCloseTo(sun.elevationDeg);
  });

  it("has no fraction at night, and no path without both times", () => {
    expect(dayFraction("07:30", "19:30", 22 * 60)).toBeNull();
    expect(dayFraction(null, "19:30", 12 * 60)).toBeNull();
    expect(sunPath(null, null)).toEqual([]);
  });
});
