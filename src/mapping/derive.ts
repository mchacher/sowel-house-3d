/**
 * What belongs to which room, derived rather than listed (spec 001, FR2).
 *
 * The mapping says only which Sowel zone each plan room is. Everything else comes
 * from the equipments Sowel reports: a room's lamps are the light equipments in its
 * zone, its shutters pair with the plan's windows, its sensor is the one carrying a
 * motion binding, and an occupant is recognised by publishing a `zone` reading
 * whose value is a plan room id.
 *
 * Nothing throws. A plan that names a zone Sowel does not have, a room with more
 * shutters than windows, an occupant standing somewhere the plan has never heard
 * of — each is collected as a problem and shown on screen, because the alternative
 * is a scene that is quietly missing a room.
 */

import type { Plan } from "../plan/types.ts";
import type { Equipment, Zone } from "../sowel/types.ts";
import { flattenZones, hasCategory } from "../sowel/types.ts";
import type { Mapping } from "./types.ts";

const LAMP_TYPES = new Set(["light_onoff", "light_dimmable", "light_color"]);
const SHUTTER_TYPES = new Set(["shutter", "awning"]);
const HEATER_TYPES = new Set(["heater"]);
const THERMOSTAT_TYPES = new Set(["thermostat"]);
const COVER_TYPES = new Set(["pool_cover"]);

export interface RoomBindings {
  roomId: string;
  zoneId: string;
  zoneName: string;
  /**
   * The zone and its ancestors, nearest first.
   *
   * Most rooms in a real house have no thermometer: in the showroom only three
   * zones out of twenty-two report a temperature, because the house measures the
   * study, the ground floor and itself and nothing else. Walking up the tree lets
   * the scene show the nearest figure Sowel actually computed, and say where it
   * came from, instead of either inventing one or showing a blank.
   */
  zoneChain: { id: string; name: string }[];
  lamps: Equipment[];
  /** One per window of the room, in plan order. `null` where the zone has none. */
  shutters: (Equipment | null)[];
  /** Equipments carrying a motion binding. A room may have several. */
  sensors: Equipment[];
  /**
   * One per door of the room the plan gave an id — the front door, the terrace
   * door, the garage — paired in plan order with the zone's contact sensors.
   * `null` where the room has none.
   */
  doors: (Equipment | null)[];
  /** Electric radiators in the room: drawn on a wall, warm when on. */
  heaters: Equipment[];
  /** A local thermostat — the living room's stove. Drawn as one. */
  thermostat: Equipment | null;
  /** The pool's cover, on the pool room. */
  cover: Equipment | null;
}

export interface Person {
  /** The equipment id, which is also how phase 4 will address it. */
  id: string;
  label: string;
  /** A plan room id, or `away`, or null when Sowel says somewhere unknown. */
  room: string | null;
}

export interface Derived {
  rooms: Record<string, RoomBindings>;
  people: Person[];
  weather: Equipment | null;
  /** Fence gate id → the equipment the mapping names, or null when it is missing. */
  gates: Record<string, Equipment | null>;
  /** Watering group → the valve the mapping names, or null. */
  watering: Record<string, Equipment | null>;
  /** The root zone, whose aggregation carries the house's sunlight. */
  houseZoneId: string | null;
  problems: string[];
}

/** Window ids of a room, in the order the plan declares them. */
export function windowsOfRoom(plan: Plan, roomId: string): string[] {
  const ids: string[] = [];
  for (const wall of plan.walls) {
    for (const opening of wall.openings) {
      if (opening.kind !== "window" || !opening.id) continue;
      if (opening.id.replace(/^window:/, "").replace(/-\d+$/, "") === roomId) ids.push(opening.id);
    }
  }
  return ids;
}

/** Ids of a room's reporting doors — `door:` and `gate:` openings — in plan order. */
export function doorsOfRoom(plan: Plan, roomId: string): string[] {
  const ids: string[] = [];
  for (const wall of plan.walls) {
    for (const opening of wall.openings) {
      if ((opening.kind !== "door" && opening.kind !== "gate") || !opening.id) continue;
      if (opening.id.replace(/^(door|gate):/, "").replace(/-\d+$/, "") === roomId) {
        ids.push(opening.id);
      }
    }
  }
  return ids;
}

/**
 * An occupant, recognised by what it publishes rather than by what it is called.
 *
 * The simulator gives each household member a device with a `zone` reading and a
 * `present` boolean, and no other equipment in the house has both. Matching on that
 * shape is what lets this work against a Sowel whose occupants are named something
 * else entirely.
 *
 * **Detection and position are deliberately separate.** An earlier version also
 * required the zone value to be a room the plan knows, which meant an occupant
 * standing somewhere unexpected stopped being an occupant and vanished from the
 * scene without a word — the precise failure the problem list exists to prevent.
 * Whether a person is a person, and whether the scene knows where to draw them,
 * are two questions.
 */
export function isOccupant(equipment: Equipment): boolean {
  const zone = equipment.dataBindings.find((b) => b.alias === "zone");
  const present = equipment.dataBindings.find((b) => b.alias === "present");
  return typeof zone?.value === "string" && present?.type === "boolean";
}

export function derive(
  plan: Plan,
  mapping: Mapping,
  zoneTree: Zone[],
  equipments: Equipment[],
): Derived {
  const problems: string[] = [];
  const zones = flattenZones(zoneTree);
  const byName = new Map(zones.map((z) => [z.name, z]));
  const root = zones.find((z) => z.parentId === null) ?? null;

  const byZone = new Map<string, Equipment[]>();
  for (const equipment of equipments) {
    if (!equipment.enabled) continue;
    const list = byZone.get(equipment.zoneId) ?? [];
    list.push(equipment);
    byZone.set(equipment.zoneId, list);
  }

  const rooms: Record<string, RoomBindings> = {};
  for (const room of plan.rooms) {
    const zoneName = mapping.zones[room.id];
    if (!zoneName) {
      problems.push(`Pièce absente du mapping : ${room.id}`);
      continue;
    }
    const zone = byName.get(zoneName);
    if (!zone) {
      problems.push(`Pièce inconnue de Sowel : ${room.id} (zone « ${zoneName} »)`);
      continue;
    }

    const inZone = byZone.get(zone.id) ?? [];
    const lamps = inZone.filter((e) => LAMP_TYPES.has(e.type));
    const sensors = inZone.filter((e) => hasCategory(e, "motion"));
    const available = inZone.filter((e) => SHUTTER_TYPES.has(e.type));
    const windows = windowsOfRoom(plan, room.id);

    // Paired in order: the plan declares its windows in one order and the zone
    // lists its shutters in another, and the only thing that makes a shutter land
    // on the right window is that both are read the same way round. Stated here
    // because nothing enforces it.
    const shutters = windows.map((_, i) => available[i] ?? null);
    if (available.length > windows.length) {
      problems.push(
        `${room.id} : ${available.length} volets pour ${windows.length} fenêtres — ${available
          .slice(windows.length)
          .map((e) => e.name)
          .join(", ")} n'est pas rendu`,
      );
    }

    // Doors pair with contact sensors the way shutters pair with windows: in
    // order, and by nothing else. A contact on a window would take a door's place,
    // and the plan has no way to tell them apart; the showroom has none.
    const contacts = inZone.filter((e) => hasCategory(e, "contact_door"));
    const doors = doorsOfRoom(plan, room.id).map((_, i) => contacts[i] ?? null);

    const chain: { id: string; name: string }[] = [];
    for (let z: Zone | undefined = zone; z; z = zones.find((c) => c.id === z?.parentId)) {
      chain.push({ id: z.id, name: z.name });
      if (chain.length > 12) break; // a cycle in the tree is not worth hanging over
    }

    rooms[room.id] = {
      roomId: room.id,
      zoneId: zone.id,
      zoneName,
      zoneChain: chain,
      lamps,
      shutters,
      sensors,
      doors,
      heaters: inZone.filter((e) => HEATER_TYPES.has(e.type)),
      thermostat: inZone.find((e) => THERMOSTAT_TYPES.has(e.type)) ?? null,
      cover: inZone.find((e) => COVER_TYPES.has(e.type)) ?? null,
    };
  }

  const roomIds = new Set(plan.rooms.map((r) => r.id));
  const people: Person[] = [];
  for (const equipment of equipments) {
    if (!isOccupant(equipment)) continue;
    const value = equipment.dataBindings.find((b) => b.alias === "zone")?.value;
    const where = typeof value === "string" ? value : null;
    if (where !== null && where !== "away" && !roomIds.has(where)) {
      problems.push(`${equipment.name} est dans « ${where} », que le plan ne connaît pas`);
      people.push({ id: equipment.id, label: equipment.name, room: null });
      continue;
    }
    people.push({ id: equipment.id, label: equipment.name, room: where });
  }

  let weather: Equipment | null = null;
  if (mapping.weatherEquipment) {
    weather = equipments.find((e) => e.name === mapping.weatherEquipment) ?? null;
    if (!weather) {
      problems.push(`Station météo introuvable : « ${mapping.weatherEquipment} »`);
    }
  }

  // The plot's own equipments, named in the mapping because no room owns them.
  const named = (
    table: Record<string, string> | undefined,
    what: string,
  ): Record<string, Equipment | null> => {
    const out: Record<string, Equipment | null> = {};
    for (const [key, name] of Object.entries(table ?? {})) {
      const found = equipments.find((e) => e.name === name && e.enabled) ?? null;
      if (!found) problems.push(`${what} introuvable : « ${name} » (${key})`);
      out[key] = found;
    }
    return out;
  };
  const gates = named(mapping.gates, "Portail");
  const watering = named(mapping.watering, "Vanne");

  return { rooms, people, weather, gates, watering, houseZoneId: root?.id ?? null, problems };
}
