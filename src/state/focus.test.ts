import { describe, expect, it } from "vitest";
import { targetOf } from "./focus.ts";
import { derive } from "../mapping/derive.ts";
import { closeView, levelElevation } from "../scene/geometry.ts";
import type { Plan } from "../plan/types.ts";
import type { Mapping } from "../mapping/types.ts";
import type { Equipment, Zone } from "../sowel/types.ts";
import showroomPlan from "../../public/plans/showroom.json";
import showroomMapping from "../../public/plans/showroom.mapping.json";
import equipmentsFixture from "./__fixtures__/equipments.json";
import zonesFixture from "./__fixtures__/zones.json";

const plan = showroomPlan as unknown as Plan;
const mapping = showroomMapping as Mapping;
const equipments = equipmentsFixture as unknown as Equipment[];
const zones = zonesFixture as unknown as Zone[];
const derived = derive(plan, mapping, zones, equipments);

const zoneId = (name: string) => {
  const walk = (list: Zone[]): string | undefined => {
    for (const z of list) {
      if (z.name === name) return z.id;
      const found = z.children ? walk(z.children) : undefined;
      if (found) return found;
    }
    return undefined;
  };
  return walk(zones);
};
const inZone = (zone: string, type?: string) =>
  equipments.find((e) => e.zoneId === zoneId(zone) && (!type || e.type === type))!;
const named = (name: string) => equipments.find((e) => e.name === name)!;
const room = (id: string) => plan.rooms.find((r) => r.id === id)!;
const target = (e: Equipment) => targetOf(e.id, derived, plan, equipments);

describe("where the camera goes when somebody acts", () => {
  it("goes to the living room for a living-room lamp, reading the ground floor", () => {
    const lamp = derived.rooms.sejour.lamps[0];
    const t = target(lamp)!;
    const sejour = room("sejour");
    expect(t.level).toBe(0);
    expect(t.point[0]).toBeCloseTo(sejour.x + sejour.w / 2);
    expect(t.point[2]).toBeCloseTo(sejour.z + sejour.d / 2);
  });

  it("goes upstairs for a bedroom shutter, at the upper storey's height", () => {
    const shutter = inZone("Chambre Parents", "shutter");
    const t = target(shutter)!;
    expect(t.level).toBe(1);
    expect(t.point[1]).toBeGreaterThan(levelElevation(plan, 1));
  });

  it("goes to the room of a motion sensor, which is what sim.motion is ordered on", () => {
    const sensor = derived.rooms.garage.sensors[0];
    expect(target(sensor)?.level).toBe(0);
  });

  it("goes to the gate on the fence for the Portail, from outside", () => {
    const t = target(named("Portail"))!;
    const gate = plan.fence!.gates[0];
    expect(t.level).toBe("outside");
    expect(t.point[0]).toBeCloseTo((gate.from + gate.to) / 2);
    expect(t.point[2]).toBeCloseTo(gate.at);
  });

  it("goes to every bed a valve waters, and only those", () => {
    const t = target(named("Vanne Pelouse"))!;
    const lawn = plan.beds!.find((b) => b.watering === "pelouse")!;
    expect(t.level).toBe("outside");
    expect(t.point[0]).toBeCloseTo(lawn.x + lawn.w / 2);
    expect(t.point[2]).toBeCloseTo(lawn.z + lawn.d / 2);
  });

  it("goes to the pool for the pool's equipments", () => {
    const t = target(named("Volet Piscine"))!;
    const pool = room("piscine");
    expect(t.level).toBe("outside");
    expect(t.point[0]).toBeCloseTo(pool.x + pool.w / 2);
  });

  it("stays put for what belongs to the whole house, and for what it does not know", () => {
    expect(target(named("PAC"))).toBeNull();
    expect(targetOf("no-such-equipment", derived, plan, equipments)).toBeNull();
  });
});

describe("the close view", () => {
  it("looks at the point from the overview's direction, closer", () => {
    const view = closeView([5, 1, 7], 6);
    expect(view.target).toEqual([5, 1, 7]);
    // South-east and above, like the overview.
    expect(view.position[0]).toBeGreaterThan(5);
    expect(view.position[1]).toBeGreaterThan(1);
    expect(view.position[2]).toBeGreaterThan(7);
  });

  it("stands back for a big room and not too far for a small one", () => {
    const dist = (v: ReturnType<typeof closeView>) =>
      Math.hypot(...v.position.map((p, i) => p - v.target[i]));
    expect(dist(closeView([0, 0, 0], 2))).toBeCloseTo(6.5);
    expect(dist(closeView([0, 0, 0], 40))).toBeCloseTo(16);
    // A portrait viewport needs more distance for the same room.
    expect(dist(closeView([0, 0, 0], 6, 0.6))).toBeGreaterThan(dist(closeView([0, 0, 0], 6)));
  });
});
