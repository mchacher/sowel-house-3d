/**
 * Sowel's shape translated into the scene's, and the only place that happens
 * (spec 001, FR5).
 *
 * Pure: equipments in, a `SceneState` out. A single event is applied by replacing
 * the equipment it names and recomputing — **not** by surgically patching the scene
 * state. Eighty-six equipments recomputed a few times a second is nothing, and the
 * surgical version is where a lamp ends up lit in the wrong room after the
 * fourteenth kind of event nobody tested.
 */

import type { Plan } from "../plan/types.ts";
import type { Aggregation, Equipment, Zone } from "../sowel/types.ts";
import type { Mapping } from "../mapping/types.ts";
import { derive, type Derived } from "../mapping/derive.ts";
import { localMinutes, sunPosition, type SunPosition } from "./sun.ts";

export interface LampState {
  on: boolean;
  /** 0…1. A lamp with no brightness binding is 1 when on. */
  brightness: number;
}

export interface RoomState {
  id: string;
  name: string;
  /** 0 closed … 100 open, one per window the plan declares. Null: no shutter. */
  shutters: (number | null)[];
  lamps: LampState[];
  /** True open, one per reporting door the plan declares. Null: no contact bound. */
  doors: (boolean | null)[];
  /** What a sensor in the room reports, or false when it has none. */
  motion: boolean;
  temperatureC: number | null;
  humidityPct: number | null;
  /**
   * The zone the temperature came from, when it is not the room's own.
   *
   * Most rooms in a real house have no thermometer — in the showroom only three
   * zones of twenty-two report one. Rather than show a blank or invent a figure,
   * the scene shows the nearest aggregate Sowel itself computed and names it, so a
   * visitor reading "20.3 °C (RDC)" knows what they are looking at.
   */
  temperatureFrom: string | null;
}

export interface SkyState extends SunPosition {
  /** Millimetres in the last hour, 0 when dry. From the weather equipment. */
  rainMmPerHour: number;
  /** 0 overcast … 1 clear, inferred from luminosity against the sun's height. */
  clearness: number;
}

export interface SceneState {
  rooms: Record<string, RoomState>;
  people: { id: string; label: string; room: string | null }[];
  sky: SkyState;
  problems: string[];
}

/** The brightness scale the core hard-codes for a Zigbee dimmer (sowel#933). */
const BRIGHTNESS_MAX = 254;

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOf(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["on", "true", "1", "open"].includes(value.toLowerCase());
  if (typeof value === "number") return value !== 0;
  return false;
}

function lampState(equipment: Equipment): LampState {
  const bindings = equipment.dataBindings;
  const on = booleanOf(bindings.find((b) => b.alias === "state")?.value);
  const raw = numberOf(bindings.find((b) => b.alias === "brightness")?.value);
  return { on, brightness: on ? (raw === null ? 1 : raw / BRIGHTNESS_MAX) : 0 };
}

/**
 * How clear the sky is, from the luminosity the house reports against what the sun's
 * height would give under a clear one.
 *
 * Inferred, because **no current weather condition exists in the API** — the
 * forecast equipment carries tomorrow's, and nothing carries today's. Rather than
 * invent a condition string, the scene uses the two facts it does have: whether it
 * is raining, and how much light there is for the hour. A plugin publishing its own
 * cloud cover would make this honest instead of merely defensible, and that is a
 * product conversation rather than something to fake here.
 */
export function clearness(luminosityLx: number | null, elevationDeg: number): number {
  if (elevationDeg <= 0) return 1;
  if (luminosityLx === null) return 1;
  const expected = 800 * Math.sin((elevationDeg * Math.PI) / 180);
  if (expected <= 1) return 1;
  return Math.max(0, Math.min(1, luminosityLx / expected));
}

export interface BuildInput {
  plan: Plan;
  mapping: Mapping;
  zones: Zone[];
  equipments: Equipment[];
  aggregation: Aggregation;
  /** Minutes since local midnight. Injected so a test is not at the mercy of a clock. */
  nowMinutes?: number;
}

export function buildSceneState(input: BuildInput): SceneState {
  const derived = derive(input.plan, input.mapping, input.zones, input.equipments);
  return assemble(input, derived);
}

function assemble(input: BuildInput, derived: Derived): SceneState {
  const { plan, aggregation } = input;
  const rooms: Record<string, RoomState> = {};

  for (const room of plan.rooms) {
    const bindings = derived.rooms[room.id];
    if (!bindings) continue;
    const zone = aggregation[bindings.zoneId];
    const sensorMotion = bindings.sensors.some((sensor) =>
      sensor.dataBindings.some((b) => b.category === "motion" && booleanOf(b.value)),
    );
    // The nearest ancestor that actually reports a temperature.
    let temperatureC: number | null = null;
    let temperatureFrom: string | null = null;
    for (const [depth, link] of bindings.zoneChain.entries()) {
      const value = aggregation[link.id]?.temperature ?? null;
      if (value === null) continue;
      temperatureC = value;
      temperatureFrom = depth === 0 ? null : link.name;
      break;
    }
    let humidityPct: number | null = null;
    for (const link of bindings.zoneChain) {
      const value = aggregation[link.id]?.humidity ?? null;
      if (value !== null) {
        humidityPct = value;
        break;
      }
    }

    rooms[room.id] = {
      id: room.id,
      name: room.name,
      shutters: bindings.shutters.map((shutter) =>
        shutter === null
          ? null
          : (numberOf(shutter.dataBindings.find((b) => b.alias === "position")?.value) ?? 100),
      ),
      lamps: bindings.lamps.map(lampState),
      // Zigbee's `contact` is true when the door is **shut**, so open is its complement.
      doors: bindings.doors.map((contact) =>
        contact === null
          ? null
          : !booleanOf(contact.dataBindings.find((b) => b.category === "contact_door")?.value),
      ),
      // The zone's own aggregation is the better answer where it exists: it folds
      // every sensor in the room, including ones the derivation did not pick.
      motion: zone?.motion ?? sensorMotion,
      temperatureC,
      temperatureFrom,
      humidityPct,
    };
  }

  const house = derived.houseZoneId ? aggregation[derived.houseZoneId] : undefined;
  const sun = sunPosition(
    house?.sunrise ?? null,
    house?.sunset ?? null,
    input.nowMinutes ?? localMinutes(),
    house?.isDaylight ?? null,
  );
  const rain =
    numberOf(derived.weather?.dataBindings.find((b) => b.category === "rain")?.value) ?? 0;

  return {
    rooms,
    people: derived.people,
    sky: {
      ...sun,
      rainMmPerHour: rain,
      clearness: clearness(house?.luminosity ?? null, sun.elevationDeg),
    },
    problems: derived.problems,
  };
}

/**
 * Apply one event to the two things startup fetched.
 *
 * The payloads are the core's own (`EngineEvent` in `src/shared/types.ts`), and they
 * are **not** what one would guess. `equipment.data.changed` carries
 * `{ equipmentId, alias, value }` — one binding, not the equipment — so the first
 * version of this function, which looked for `event.equipment`, would have returned
 * the array untouched for ever and frozen the scene a second after it loaded. It
 * would have looked like a rendering bug.
 *
 * Returns the inputs unchanged when an event touches nothing this app reads, so a
 * caller can skip recomputing.
 */
export function applyEvent(
  equipments: Equipment[],
  aggregation: Aggregation,
  event: { type: string; [key: string]: unknown },
): { equipments: Equipment[]; aggregation: Aggregation; changed: boolean } {
  const unchanged = { equipments, aggregation, changed: false };

  if (event.type === "equipment.data.changed") {
    const equipmentId = event.equipmentId;
    const alias = event.alias;
    if (typeof equipmentId !== "string" || typeof alias !== "string") return unchanged;
    const index = equipments.findIndex((e) => e.id === equipmentId);
    if (index < 0) return unchanged;
    const equipment = equipments[index];
    const bindingIndex = equipment.dataBindings.findIndex((b) => b.alias === alias);
    if (bindingIndex < 0) return unchanged;

    const dataBindings = [...equipment.dataBindings];
    dataBindings[bindingIndex] = { ...dataBindings[bindingIndex], value: event.value };
    const next = [...equipments];
    next[index] = { ...equipment, dataBindings };
    return { equipments: next, aggregation, changed: true };
  }

  if (event.type === "zone.data.changed") {
    const zoneId = event.zoneId;
    const data = event.aggregatedData;
    if (typeof zoneId !== "string" || typeof data !== "object" || data === null) return unchanged;
    return {
      equipments,
      aggregation: { ...aggregation, [zoneId]: data as Aggregation[string] },
      changed: true,
    };
  }

  if (event.type === "equipment.status.changed") {
    const equipmentId = event.equipmentId;
    const newStatus = event.newStatus;
    if (typeof equipmentId !== "string" || typeof newStatus !== "string") return unchanged;
    const index = equipments.findIndex((e) => e.id === equipmentId);
    if (index < 0) return unchanged;
    const next = [...equipments];
    next[index] = { ...next[index], status: newStatus as Equipment["status"] };
    return { equipments: next, aggregation, changed: true };
  }

  return unchanged;
}
