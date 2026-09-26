/**
 * What the camera should go and look at when somebody acts on an equipment.
 *
 * The mini view that floats over the Sowel interface follows the action: a visitor
 * switches on the living-room lamp in Sowel and the camera flies to the living
 * room. This is where "which equipment" becomes "which place", and it is pure so
 * it is tested against the showroom as captured.
 *
 * Resolved in order of precision: a gate on the fence and a watering group are
 * named in the mapping and have a place of their own; an outdoor lamp has the spot
 * the plan gives it; anything else belongs to the room whose zone it sits in. An
 * equipment of the whole house — the heat pump, the meters — has no one place to
 * show, and gets none: the camera stays where it is rather than guess.
 */

import type { Plan } from "../plan/types.ts";
import type { Derived } from "../mapping/derive.ts";
import type { Equipment } from "../sowel/types.ts";
import type { Focus } from "../scene/house.ts";
import { levelElevation } from "../scene/geometry.ts";

export interface FocusTarget {
  /** What the camera looks at, in world coordinates. */
  point: [number, number, number];
  /** How big the thing is across, so the camera stands back accordingly. */
  span: number;
  /** Which storey to read while looking — `outside` for the grounds. */
  level: Focus;
}

export function targetOf(
  equipmentId: string,
  derived: Derived,
  plan: Plan,
  equipments: Equipment[],
): FocusTarget | null {
  // A gate on the fence.
  for (const [gateId, gate] of Object.entries(derived.gates)) {
    if (gate?.id !== equipmentId) continue;
    const spec = plan.fence?.gates.find((g) => g.id === gateId);
    if (!spec) continue;
    const mid = (spec.from + spec.to) / 2;
    return {
      point: spec.axis === "x" ? [mid, 0.8, spec.at] : [spec.at, 0.8, mid],
      // Wide enough to show the drive it opens onto: at a gate's own width the
      // camera saw hedge and little else.
      span: 9,
      level: "outside",
    };
  }

  // A watering valve: the beds it waters, all of them.
  for (const [group, valve] of Object.entries(derived.watering)) {
    if (valve?.id !== equipmentId) continue;
    const beds = (plan.beds ?? []).filter((b) => b.watering === group);
    if (beds.length === 0) continue;
    const x0 = Math.min(...beds.map((b) => b.x));
    const z0 = Math.min(...beds.map((b) => b.z));
    const x1 = Math.max(...beds.map((b) => b.x + b.w));
    const z1 = Math.max(...beds.map((b) => b.z + b.d));
    return {
      point: [(x0 + x1) / 2, 0.3, (z0 + z1) / 2],
      span: Math.hypot(x1 - x0, z1 - z0),
      level: "outside",
    };
  }

  const equipment = equipments.find((e) => e.id === equipmentId);
  if (!equipment) return null;

  for (const bindings of Object.values(derived.rooms)) {
    if (bindings.zoneId !== equipment.zoneId) continue;
    const room = plan.rooms.find((r) => r.id === bindings.roomId);
    if (!room) continue;

    // An outdoor lamp stands where the plan puts it; the garden as a whole is too
    // big to be "the place" a bollard is.
    const lampIndex = bindings.lamps.findIndex((l) => l.id === equipmentId);
    const spot = lampIndex >= 0 ? room.lamps?.[lampIndex] : undefined;
    if (spot) return { point: [spot[0], 0.5, spot[1]], span: 4, level: "outside" };

    if (room.level === null) {
      return {
        point: [room.x + room.w / 2, 0.3, room.z + room.d / 2],
        span: Math.min(12, Math.hypot(room.w, room.d)),
        level: "outside",
      };
    }
    return {
      point: [room.x + room.w / 2, levelElevation(plan, room.level) + 1, room.z + room.d / 2],
      span: Math.hypot(room.w, room.d),
      level: room.level,
    };
  }
  return null;
}
