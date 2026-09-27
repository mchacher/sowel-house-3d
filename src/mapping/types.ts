/**
 * What the plan needs to know about a particular Sowel, and nothing more.
 *
 * One line per room: the plan's room id, and the name of the Sowel zone it is.
 * **Nothing here names an equipment.** Which lamp, which shutter, which sensor is
 * derived from the zone's equipments and their types (`derive.ts`), because a list
 * of seventy-odd things somebody typed is wrong within a month and a derivation
 * from what Sowel actually says is not.
 *
 * It is also what makes the app generic: a different Sowel with a different plan
 * needs a different mapping file and no code.
 */

export interface Mapping {
  /** Plan room id → Sowel zone name. */
  zones: Record<string, string>;
  /** The equipment carrying the weather, by name. Optional: a house may have none. */
  weatherEquipment?: string;
  /**
   * Fence gate id → the equipment reporting on it, by name. Named rather than
   * derived because the plot belongs to no room, so there is no zone to look in.
   */
  gates?: Record<string, string>;
  /** Watering group (a bed's `watering`) → the valve equipment, by name. */
  watering?: Record<string, string>;
  /** The house's heat pump, by name: its outdoor unit's fan turns while it runs. */
  heatPump?: string;
  /**
   * Plan room id → names of its equipments, in the order the plan lists what they
   * pair with: its fixtures for lamps, its windows for shutters. Without it they
   * pair in whatever order Sowel lists them, which put the west shutter on the
   * south bay and the terrace light on a bollard by the pool.
   *
   * A name here may also be an equipment Sowel files under a parent zone — the
   * stove, filed under "RDC", is in the living room — and the room claims it.
   */
  placement?: Record<string, string[]>;
}
