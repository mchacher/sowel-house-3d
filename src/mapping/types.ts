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
}
