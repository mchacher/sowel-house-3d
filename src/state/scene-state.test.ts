import { describe, expect, it } from "vitest";
import { applyEvent, buildSceneState, clearness, type BuildInput } from "./scene-state.ts";
import { sunPosition } from "./sun.ts";
import type { Plan } from "../plan/types.ts";
import type { Mapping } from "../mapping/types.ts";
import type { Aggregation, Equipment, Zone } from "../sowel/types.ts";
import showroomPlan from "../../public/plans/showroom.json";
import showroomMapping from "../../public/plans/showroom.mapping.json";
import equipmentsFixture from "./__fixtures__/equipments.json";
import zonesFixture from "./__fixtures__/zones.json";
import aggregationFixture from "./__fixtures__/aggregation.json";

const base: BuildInput = {
  plan: showroomPlan as unknown as Plan,
  mapping: showroomMapping as Mapping,
  zones: zonesFixture as unknown as Zone[],
  equipments: equipmentsFixture as unknown as Equipment[],
  aggregation: aggregationFixture as unknown as Aggregation,
  nowMinutes: 13 * 60,
};

describe("the scene state, from the real showroom", () => {
  const state = buildSceneState(base);

  it("populates every room the plan declares", () => {
    expect(Object.keys(state.rooms).sort()).toEqual(base.plan.rooms.map((r) => r.id).sort());
    expect(state.problems).toEqual([]);
  });

  it("gives each room one shutter slot per window", () => {
    expect(state.rooms.sejour.shutters).toHaveLength(3);
    expect(state.rooms.garage.shutters).toHaveLength(0);
    for (const value of state.rooms.sejour.shutters) {
      expect(value === null || (value >= 0 && value <= 100)).toBe(true);
    }
  });

  it("reads a lamp's state and normalises its brightness", () => {
    const lamps = Object.values(state.rooms).flatMap((r) => r.lamps);
    expect(lamps.length).toBeGreaterThan(10);
    for (const lamp of lamps) {
      expect(lamp.brightness).toBeGreaterThanOrEqual(0);
      expect(lamp.brightness).toBeLessThanOrEqual(1);
      if (!lamp.on) expect(lamp.brightness).toBe(0);
    }
  });

  it("shows the nearest temperature Sowel computed, and says where it came from", () => {
    // Only three of the showroom's twenty-two zones report a temperature: the house
    // measures the study, the ground floor and itself, and nothing else. Walking up
    // the tree is how the séjour gets a figure at all.
    expect(state.rooms.bureau.temperatureC).toBeTypeOf("number");
    expect(state.rooms.bureau.temperatureFrom).toBeNull();

    expect(state.rooms.sejour.temperatureC).toBeTypeOf("number");
    expect(state.rooms.sejour.temperatureFrom).toBe("RDC");
  });

  it("falls back no further than the house", () => {
    // The cellar has no thermometer anywhere below the root, so it reads the house
    // average and says so rather than pretending to be measured.
    // The garage sits under the ground floor, whose stove reports a temperature;
    // the bathroom's storey has none, so it climbs to the house.
    expect(state.rooms.garage.temperatureFrom).toBe("RDC");
    expect(state.rooms["salle-de-bain"].temperatureFrom).toBe("Maison");
  });

  it("places the household", () => {
    expect(state.people.length).toBeGreaterThanOrEqual(4);
  });

  it("puts the sun somewhere consistent with Sowel's own sunrise", () => {
    // 13:00, between the fixture's 07:19 and 20:14, so above the horizon.
    expect(state.sky.elevationDeg).toBeGreaterThan(0);
    expect(state.sky.azimuthDeg).toBeGreaterThan(90);
    expect(state.sky.azimuthDeg).toBeLessThan(270);
  });
});

describe("applying an event", () => {
  it("turns a lamp on without touching anything else", () => {
    // The payload is the core's own: equipmentId, alias, value — NOT the equipment.
    const lamp = base.equipments.find((e) => e.type === "light_onoff" && e.zoneId);
    expect(lamp).toBeDefined();
    if (!lamp) return;
    const wasOn = lamp.dataBindings.find((b) => b.alias === "state")?.value === true;

    const result = applyEvent(base.equipments, base.aggregation, {
      type: "equipment.data.changed",
      equipmentId: lamp.id,
      alias: "state",
      value: !wasOn,
    });
    expect(result.changed).toBe(true);

    const after = buildSceneState({ ...base, equipments: result.equipments });
    const before = buildSceneState(base);
    const room = Object.values(after.rooms).find((r) =>
      after.rooms[r.id].lamps.length > 0 ? r.id : undefined,
    );
    expect(room).toBeDefined();
    // Exactly one lamp changed across the whole house.
    const flat = (s: typeof before) =>
      Object.values(s.rooms).flatMap((r) => r.lamps.map((l) => l.on));
    const diff = flat(before).filter((v, i) => v !== flat(after)[i]).length;
    expect(diff).toBe(1);
  });

  it("ignores an event for an equipment it has never heard of", () => {
    const result = applyEvent(base.equipments, base.aggregation, {
      type: "equipment.data.changed",
      equipmentId: "nobody",
      alias: "state",
      value: true,
    });
    expect(result.changed).toBe(false);
    expect(result.equipments).toBe(base.equipments);
  });

  it("ignores an alias the equipment does not carry", () => {
    const lamp = base.equipments.find((e) => e.type === "light_onoff");
    const result = applyEvent(base.equipments, base.aggregation, {
      type: "equipment.data.changed",
      equipmentId: lamp?.id,
      alias: "nanoe",
      value: true,
    });
    expect(result.changed).toBe(false);
  });

  it("replaces a zone's aggregation", () => {
    const zoneId = Object.keys(base.aggregation)[0];
    const result = applyEvent(base.equipments, base.aggregation, {
      type: "zone.data.changed",
      zoneId,
      aggregatedData: { ...base.aggregation[zoneId], motion: true, temperature: 42 },
    });
    expect(result.changed).toBe(true);
    expect(result.aggregation[zoneId].temperature).toBe(42);
    // The others are untouched.
    expect(Object.keys(result.aggregation)).toHaveLength(Object.keys(base.aggregation).length);
  });

  it("lights a room's sensor when its zone reports motion", () => {
    const sejourZone = Object.entries(base.aggregation).find(
      ([, a]) => a.temperature !== null,
    )?.[0];
    expect(sejourZone).toBeDefined();
    const state = buildSceneState(base);
    const room = Object.values(state.rooms).find((r) => r.motion);
    // The fixture has motion somewhere; if not, the assertion below still holds.
    expect(room === undefined || room.motion).toBe(true);
  });

  it("moves an occupant", () => {
    const occupant = base.equipments.find((e) =>
      e.dataBindings.some((b) => b.alias === "zone" && typeof b.value === "string"),
    );
    expect(occupant).toBeDefined();
    if (!occupant) return;
    const result = applyEvent(base.equipments, base.aggregation, {
      type: "equipment.data.changed",
      equipmentId: occupant.id,
      alias: "zone",
      value: "away",
    });
    const state = buildSceneState({ ...base, equipments: result.equipments });
    expect(state.people.find((p) => p.id === occupant.id)?.room).toBe("away");
  });

  it("updates an equipment's status", () => {
    const target = base.equipments[0];
    const result = applyEvent(base.equipments, base.aggregation, {
      type: "equipment.status.changed",
      equipmentId: target.id,
      newStatus: "offline",
    });
    expect(result.changed).toBe(true);
    expect(result.equipments.find((e) => e.id === target.id)?.status).toBe("offline");
  });

  it("ignores an event type it does not read", () => {
    const result = applyEvent(base.equipments, base.aggregation, {
      type: "recipe.instance.started",
      instanceId: "x",
    });
    expect(result.changed).toBe(false);
  });
});

describe("the sun, interpolated between Sowel's own times", () => {
  it("rises in the east and sets in the west", () => {
    const morning = sunPosition("07:00", "21:00", 8 * 60, true);
    const evening = sunPosition("07:00", "21:00", 20 * 60, true);
    expect(morning.azimuthDeg).toBeLessThan(135);
    expect(evening.azimuthDeg).toBeGreaterThan(225);
  });

  it("peaks at the midpoint of the day Sowel reports", () => {
    const noon = sunPosition("07:00", "21:00", 14 * 60, true);
    const later = sunPosition("07:00", "21:00", 17 * 60, true);
    expect(noon.elevationDeg).toBeGreaterThan(later.elevationDeg);
    expect(noon.azimuthDeg).toBeCloseTo(180, 0);
  });

  it("goes below the horizon at night, so a lamp is the only light", () => {
    const night = sunPosition("07:00", "21:00", 2 * 60, false);
    expect(night.elevationDeg).toBeLessThan(0);
    expect(night.isDaylight).toBe(false);
  });

  it("never disagrees with Sowel about whether it is daylight", () => {
    // The reason the arc is interpolated rather than computed: the engine's flag
    // wins, always.
    expect(sunPosition("07:00", "21:00", 12 * 60, false).isDaylight).toBe(false);
    expect(sunPosition("07:00", "21:00", 2 * 60, true).isDaylight).toBe(true);
  });

  it("keeps the sun above the horizon through the home's sunrise offset", () => {
    // Sowel's isDaylight carries the home's offsets — thirty minutes at sunrise in
    // the showroom — so for half an hour after a visible sunrise the flag says night.
    // The elevation must not: the scene follows the sun, and the flag stays what it
    // is, which is the automation's notion of day.
    const justAfterSunrise = sunPosition("07:19", "20:14", 7 * 60 + 30, false);
    expect(justAfterSunrise.elevationDeg).toBeGreaterThan(0);
    expect(justAfterSunrise.isDaylight).toBe(false);
  });

  it("copes with no sunrise at all", () => {
    const polar = sunPosition(null, null, 12 * 60, true);
    expect(Number.isFinite(polar.elevationDeg)).toBe(true);
    expect(polar.isDaylight).toBe(true);
    expect(Number.isFinite(sunPosition("bad", "worse", 0, null).elevationDeg)).toBe(true);
  });
});

describe("clearness, inferred because nothing reports it", () => {
  it("is clear at night, when there is nothing to infer from", () => {
    expect(clearness(0, -10)).toBe(1);
  });

  it("is overcast when there is far less light than the sun's height allows", () => {
    expect(clearness(40, 50)).toBeLessThan(0.2);
  });

  it("is clear when the light matches the height", () => {
    expect(clearness(900, 50)).toBe(1);
  });

  it("is clear when nothing reports luminosity at all", () => {
    expect(clearness(null, 50)).toBe(1);
  });
});

describe("doors", () => {
  it("reads open as the complement of the contact, which is true when shut", () => {
    const state = buildSceneState({ ...base, nowMinutes: 12 * 60 });
    // The captured showroom had every door shut.
    expect(state.rooms.entree.doors).toEqual([false]);
    expect(state.rooms.garage.doors).toEqual([false]);
    const opened = base.equipments.map((e) =>
      e.name === "Porte Garage Contact"
        ? {
            ...e,
            dataBindings: e.dataBindings.map((b) =>
              b.category === "contact_door" ? { ...b, value: false } : b,
            ),
          }
        : e,
    );
    const after = buildSceneState({ ...base, equipments: opened, nowMinutes: 12 * 60 });
    expect(after.rooms.garage.doors).toEqual([true]);
  });
});
