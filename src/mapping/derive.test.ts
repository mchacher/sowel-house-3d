import { describe, expect, it } from "vitest";
import { derive, doorsOfRoom, isOccupant, windowsOfRoom } from "./derive.ts";
import type { Mapping } from "./types.ts";
import type { Plan } from "../plan/types.ts";
import type { Equipment, Zone } from "../sowel/types.ts";
import showroomPlan from "../../public/plans/showroom.json";
import showroomMapping from "../../public/plans/showroom.mapping.json";
// Captured from a running showroom, so these are what Sowel sends rather than what
// I think it sends.
import equipmentsFixture from "../state/__fixtures__/equipments.json";
import zonesFixture from "../state/__fixtures__/zones.json";

const plan = showroomPlan as unknown as Plan;
const mapping = showroomMapping as Mapping;
const equipments = equipmentsFixture as unknown as Equipment[];
const zones = zonesFixture as unknown as Zone[];

describe("deriving against the real showroom", () => {
  const result = derive(plan, mapping, zones, equipments);

  it("resolves every plan room to a zone", () => {
    expect(result.problems.filter((p) => p.includes("inconnue de Sowel"))).toEqual([]);
    expect(Object.keys(result.rooms).sort()).toEqual(plan.rooms.map((r) => r.id).sort());
  });

  it("finds the lamps without being told which they are", () => {
    // Fourteen light_onoff and three dimmable in the fixture; every one lands in a
    // room, and the rooms that have them are the rooms that should.
    const total = Object.values(result.rooms).reduce((n, r) => n + r.lamps.length, 0);
    expect(total).toBeGreaterThanOrEqual(14);
    expect(result.rooms.sejour.lamps.length).toBeGreaterThan(0);
    expect(result.rooms.garage.lamps.length).toBeGreaterThan(0);
  });

  it("pairs a shutter with each window the plan declares", () => {
    for (const room of plan.rooms) {
      const windows = windowsOfRoom(plan, room.id);
      const bindings = result.rooms[room.id];
      if (!bindings) continue;
      expect(bindings.shutters.length, room.id).toBe(windows.length);
    }
    // Séjour has three windows in the plan and three shutters in the fixture.
    expect(result.rooms.sejour.shutters.filter(Boolean).length).toBe(3);
  });

  it("finds a motion sensor in the rooms that have one", () => {
    expect(result.rooms.garage.sensors.length).toBeGreaterThan(0);
    expect(result.rooms.garage.sensors.length).toBeGreaterThan(0);
  });

  it("recognises the occupants by what they publish, not by their name", () => {
    expect(result.people.length).toBeGreaterThanOrEqual(4);
    for (const person of result.people) {
      expect(person.room === null || person.room === "away" || person.room in result.rooms).toBe(
        true,
      );
    }
  });

  it("finds the weather station and the house zone", () => {
    expect(result.weather?.name).toBe("Station Météo");
    expect(result.houseZoneId).toBeTruthy();
  });

  it("is quiet when nothing is wrong", () => {
    // Any problem here is a real mismatch between the plan and the showroom, and
    // the message is what a maintainer would read, so print it rather than a count.
    expect(result.problems).toEqual([]);
  });
});

describe("deriving when something is wrong", () => {
  it("names a zone Sowel does not have, and carries on", () => {
    const broken: Mapping = { ...mapping, zones: { ...mapping.zones, garage: "Remise" } };
    const result = derive(plan, broken, zones, equipments);
    expect(result.problems).toContain("Pièce inconnue de Sowel : garage (zone « Remise »)");
    // The rest of the house still builds.
    expect(result.rooms.sejour).toBeDefined();
    expect(result.rooms.garage).toBeUndefined();
  });

  it("names a room the mapping forgot", () => {
    const zonesOnly = { ...mapping.zones };
    delete zonesOnly.piscine;
    const result = derive(plan, { ...mapping, zones: zonesOnly }, zones, equipments);
    expect(result.problems).toContain("Pièce absente du mapping : piscine");
  });

  it("notes a shutter with no window rather than dropping it in silence", () => {
    const trimmed: Plan = {
      ...plan,
      walls: plan.walls.map((w) => ({
        ...w,
        openings: w.openings.filter((o) => o.id !== "window:sejour-3"),
      })),
    };
    const result = derive(trimmed, mapping, zones, equipments);
    expect(result.problems.some((p) => p.startsWith("sejour : 3 volets pour 2 fenêtres"))).toBe(
      true,
    );
  });

  it("notes a weather station that is not there", () => {
    const result = derive(plan, { ...mapping, weatherEquipment: "Nuage" }, zones, equipments);
    expect(result.problems).toContain("Station météo introuvable : « Nuage »");
    expect(result.weather).toBeNull();
  });

  it("keeps an occupant standing somewhere unknown, and says so", () => {
    const moved = equipments.map((e) =>
      e.name === "Adulte 1"
        ? {
            ...e,
            dataBindings: e.dataBindings.map((b) =>
              b.alias === "zone" ? { ...b, value: "grenier" } : b,
            ),
          }
        : e,
    );
    const result = derive(plan, mapping, zones, moved);
    expect(result.problems.some((p) => p.includes("grenier"))).toBe(true);
    expect(result.people.find((p) => p.label === "Adulte 1")?.room).toBeNull();
  });
});

describe("isOccupant", () => {
  it("accepts an equipment publishing a zone and a presence", () => {
    const occupant = equipments.find((e) => e.name === "Adulte 1");
    expect(occupant && isOccupant(occupant)).toBe(true);
  });

  it("refuses a lamp", () => {
    const lamp = equipments.find((e) => e.type === "light_onoff");
    expect(lamp && isOccupant(lamp)).toBe(false);
  });

  it("still recognises an occupant standing somewhere the plan does not know", () => {
    // Detection and position are separate questions: an earlier version conflated
    // them, and an occupant in an unexpected room vanished from the scene without
    // a word.
    const occupant = equipments.find((e) => e.name === "Adulte 1");
    expect(occupant).toBeDefined();
    if (!occupant) return;
    const lost = {
      ...occupant,
      dataBindings: occupant.dataBindings.map((b) =>
        b.alias === "zone" ? { ...b, value: "grenier" } : b,
      ),
    };
    expect(isOccupant(lost)).toBe(true);
  });

  it("refuses an equipment with a zone but no presence", () => {
    const half = {
      ...equipments[0],
      dataBindings: [{ ...equipments[0].dataBindings[0], alias: "zone", value: "sejour" }],
    };
    expect(isOccupant(half)).toBe(false);
  });
});

describe("doors that report", () => {
  const result = derive(plan, mapping, zones, equipments);

  it("lists a room's reporting doors in plan order", () => {
    expect(doorsOfRoom(plan, "entree")).toEqual(["door:entree-1"]);
    expect(doorsOfRoom(plan, "garage")).toEqual(["gate:garage-1"]);
    expect(doorsOfRoom(plan, "cuisine")).toEqual([]);
  });

  it("pairs each with a contact sensor of the zone, and nothing else", () => {
    // The showroom reports on exactly these three: the front door, the terrace
    // door and the garage door. Each pairs with the contact in its zone.
    for (const room of ["entree", "sejour", "garage"]) {
      const doors = result.rooms[room].doors;
      expect(doors, room).toHaveLength(1);
      expect(
        doors[0]?.dataBindings.some((b) => b.category === "contact_door"),
        room,
      ).toBe(true);
    }
    expect(result.rooms.cuisine.doors).toEqual([]);
  });
});
