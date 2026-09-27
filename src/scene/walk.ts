/**
 * A walk along a route, stepped by the renderer's clock (spec 005, FR2).
 *
 * Pure: a position along a polyline at a constant speed, the direction it faces, and
 * the rooms entered since the last step — which is when the app tells Sowel where the
 * visitor is (FR3).
 */

import type { Waypoint } from "../plan/path.ts";

/** Walking pace, metres per second. */
export const WALK_SPEED = 1.4;

export interface WalkStep {
  position: [number, number, number];
  /** Radians about y, 0 facing +z. */
  heading: number;
  /** Rooms entered during this step, in order. */
  entered: string[];
  /** Metres walked so far: what the legs swing by. */
  distance: number;
  done: boolean;
}

export class Walk {
  private segment = 0;
  private along = 0;
  private walked = 0;
  private heading = 0;
  private readonly points: Waypoint[];
  private readonly speed: number;

  constructor(points: Waypoint[], speed = WALK_SPEED) {
    this.points = points;
    this.speed = speed;
  }

  get current(): Waypoint {
    return this.pointAt();
  }

  step(dt: number): WalkStep {
    const entered: string[] = [];
    let budget = Math.max(0, dt) * this.speed;
    while (budget > 0 && this.segment < this.points.length - 1) {
      const a = this.points[this.segment];
      const b = this.points[this.segment + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (Math.hypot(b.x - a.x, b.z - a.z) > 1e-6) this.heading = Math.atan2(b.x - a.x, b.z - a.z);
      const left = length - this.along;
      if (budget < left) {
        this.along += budget;
        this.walked += budget;
        budget = 0;
      } else {
        budget -= left;
        this.walked += left;
        this.segment += 1;
        this.along = 0;
        if (b.enter) entered.push(b.enter);
      }
    }
    const p = this.pointAt();
    return {
      position: [p.x, p.y, p.z],
      heading: this.heading,
      entered,
      distance: this.walked,
      done: this.segment >= this.points.length - 1,
    };
  }

  private pointAt(): Waypoint {
    const a = this.points[Math.min(this.segment, this.points.length - 1)];
    const b = this.points[this.segment + 1];
    if (!b) return a;
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
    const t = this.along / length;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  }
}
