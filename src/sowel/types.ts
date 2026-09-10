/**
 * The slice of Sowel's API this app reads.
 *
 * Kept by hand against `docs/technical/api-reference.md` and the payloads in
 * `src/state/__fixtures__/`, which are captured from a running showroom rather
 * than written from the documentation — so the types describe what Sowel sends.
 *
 * Only what is read. This app never writes in phase 3.
 */

export interface DataBinding {
  id: string;
  alias: string;
  key: string;
  category: string | null;
  type: "number" | "boolean" | "string" | "enum";
  value: unknown;
  deviceId: string;
  deviceName: string;
  stale: boolean;
  lastChanged: string | null;
}

export interface OrderBinding {
  id: string;
  alias: string;
  key: string;
  category: string | null;
}

export type EquipmentStatus = "online" | "degraded" | "offline";

export interface Equipment {
  id: string;
  name: string;
  type: string;
  zoneId: string;
  enabled: boolean;
  status: EquipmentStatus;
  dataBindings: DataBinding[];
  orderBindings: OrderBinding[];
}

export interface Zone {
  id: string;
  name: string;
  parentId: string | null;
  children?: Zone[];
}

/** What `GET /api/v1/zones/aggregation` gives per zone id. Only what is used. */
export interface ZoneAggregation {
  temperature: number | null;
  humidity: number | null;
  luminosity: number | null;
  motion: boolean | null;
  motionSensors: number;
  lightsOn: number;
  lightsTotal: number;
  averageShutterPosition: number | null;
  sunrise: string | null;
  sunset: string | null;
  isDaylight: boolean | null;
}

export type Aggregation = Record<string, ZoneAggregation>;

/** Flatten the zone tree the API returns as a single root. */
export function flattenZones(tree: Zone[]): Zone[] {
  const out: Zone[] = [];
  const walk = (zones: Zone[]): void => {
    for (const zone of zones) {
      out.push(zone);
      if (zone.children) walk(zone.children);
    }
  };
  walk(tree);
  return out;
}

/** The value of a binding by alias, or undefined when it is not bound. */
export function bindingValue(equipment: Equipment, alias: string): unknown {
  return equipment.dataBindings.find((b) => b.alias === alias)?.value;
}

export function hasBinding(equipment: Equipment, alias: string): boolean {
  return equipment.dataBindings.some((b) => b.alias === alias);
}

export function hasCategory(equipment: Equipment, category: string): boolean {
  return equipment.dataBindings.some((b) => b.category === category);
}
