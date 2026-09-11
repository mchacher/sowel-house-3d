/**
 * The showroom house, described — the plan is composed from this.
 *
 *   npx tsx scripts/plan/showroom.ts        → public/plans/showroom.json
 *
 * A pavilion: a ground floor and one storey, the garage attached on the east, the
 * terrace and the pool to the south, the street to the north. The layout is the
 * ordinary French one — living spaces below, bedrooms and the bathroom above — and
 * the simulator's `layout.ts` carries the same rooms at the same sizes, facing the
 * same way, because the house a visitor sees and the house the physics runs on are
 * one house.
 *
 * Coordinates in metres: x east, z south. The camera looks from the south-east,
 * so the garden façade and the garage door are what a visitor sees first.
 */

import { writeFileSync } from "node:fs";
import { composePlan, type HouseSpec } from "../../src/plan/compose.ts";
import { validatePlan } from "../../src/plan/validate.ts";
import { storeyPitch } from "../../src/scene/geometry.ts";

const HEIGHT = 2.6;
/** Where the stairs arrive: the floor of the storey above. */
const UPSTAIRS = storeyPitch({ height: HEIGHT } as Parameters<typeof storeyPitch>[0]);

const house: HouseSpec = {
  height: HEIGHT,
  thickness: 0.18,
  awaySpot: [8, -3],

  levels: [
    {
      level: 0,
      name: "RDC",
      x: 0,
      z: 0,
      w: 10.5,
      d: 9.5,
      parts: [{ x: 10.5, z: 3, w: 5.5, d: 5.5 }],
    },
    {
      level: 1,
      name: "Étage",
      x: 0,
      z: 0,
      w: 10.5,
      d: 9.5,
      hole: { x: 3.5, z: 2.5, w: 3, d: 2.5 },
    },
  ],

  rooms: [
    // ── Ground floor ─────────────────────────────────────────────────────
    { id: "bureau", name: "Bureau", level: 0, x: 0, z: 0, w: 3.5, d: 3, spot: [1.75, 1.6] },
    { id: "entree", name: "Entrée", level: 0, x: 3.5, z: 0, w: 3, d: 2.5, spot: [5, 1.3] },
    // The stairs live here: a quarter-turn flight up the east side and across the
    // south, leaving a hall in the north-west corner.
    { id: "escalier", name: "Escalier", level: 0, x: 3.5, z: 2.5, w: 3, d: 2.5, spot: [4.4, 3.2] },
    { id: "cuisine", name: "Cuisine", level: 0, x: 6.5, z: 0, w: 4, d: 5, spot: [8.5, 2.6] },
    { id: "sejour", name: "Séjour", level: 0, x: 0, z: 5, w: 10.5, d: 4.5, spot: [5.2, 7.4] },
    { id: "garage", name: "Garage", level: 0, x: 10.5, z: 3, w: 5.5, d: 5.5, spot: [13.2, 5.7] },

    // ── Upstairs ─────────────────────────────────────────────────────────
    {
      id: "salle-de-bain",
      name: "Salle de Bain",
      level: 1,
      x: 0,
      z: 0,
      w: 3.5,
      d: 3,
      spot: [1.75, 1.5],
    },
    {
      id: "chambre-enfant-3",
      name: "Chambre Enfant 3",
      level: 1,
      x: 6.5,
      z: 0,
      w: 4,
      d: 4,
      spot: [8.5, 2],
    },
    {
      id: "chambre-parents",
      name: "Chambre Parents",
      level: 1,
      x: 0,
      z: 5,
      w: 4,
      d: 4.5,
      spot: [2, 7.2],
    },
    {
      id: "chambre-enfant-1",
      name: "Chambre Enfant 1",
      level: 1,
      x: 4,
      z: 5,
      w: 3.5,
      d: 4.5,
      spot: [5.75, 7.2],
    },
    {
      id: "chambre-enfant-2",
      name: "Chambre Enfant 2",
      level: 1,
      x: 7.5,
      z: 5,
      w: 3,
      d: 4.5,
      spot: [9, 7.2],
    },

    // ── Outdoors ─────────────────────────────────────────────────────────
    {
      id: "jardin",
      name: "Jardin",
      level: null,
      x: -5,
      z: -4,
      w: 26,
      d: 24,
      spot: [-2, 12],
      ground: true,
    },
    { id: "terrasse", name: "Terrasse", level: null, x: 0, z: 9.5, w: 10.5, d: 3, spot: [5.2, 11] },
    { id: "piscine", name: "Piscine", level: null, x: 1.5, z: 13.5, w: 8, d: 4, spot: [5.5, 15.5] },
  ],

  // Named by room and side, centred `at` metres from the room's north or west end.
  // The simulator's layout lists the same windows, in the same order, facing the
  // same way — the shutters pair by that order.
  windows: [
    { room: "bureau", side: "N", at: 1.75, w: 1.2, sill: 0.9, head: 2.1 },
    // Two bays onto the terrace and a window to the west.
    { room: "sejour", side: "S", at: 2.6, w: 2.6, sill: 0, head: 2.3 },
    { room: "sejour", side: "S", at: 6.2, w: 2.0, sill: 0.4, head: 2.3 },
    { room: "sejour", side: "W", at: 2.25, w: 1.8, sill: 0.5, head: 2.3 },
    { room: "cuisine", side: "N", at: 2.0, w: 1.4, sill: 0.9, head: 2.1 },
    { room: "cuisine", side: "E", at: 1.5, w: 1.6, sill: 0, head: 2.25 },
    { room: "chambre-parents", side: "S", at: 2, w: 1.6, sill: 0.9, head: 2.1 },
    { room: "chambre-enfant-1", side: "S", at: 1.75, w: 1.2, sill: 0.9, head: 2.1 },
    { room: "chambre-enfant-2", side: "S", at: 1.5, w: 1.0, sill: 0.9, head: 2.1 },
    { room: "chambre-enfant-3", side: "N", at: 2.0, w: 1.2, sill: 0.9, head: 2.1 },
    { room: "salle-de-bain", side: "N", at: 1.75, w: 0.8, sill: 1.3, head: 2.0 },
  ],

  doors: [
    // The three the house reports on: the front door, the terrace door, the garage.
    { room: "entree", side: "N", at: 1.5, w: 1.0, id: "door:entree-1", to: "away" },
    { room: "sejour", side: "S", at: 9.0, w: 1.0, head: 2.2, id: "door:sejour-1", to: "terrasse" },
    {
      room: "garage",
      side: "E",
      at: 2.75,
      w: 2.6,
      kind: "gate",
      id: "gate:garage-1",
      to: "jardin",
    },
    // Doorways.
    { room: "bureau", side: "E", at: 1.2, w: 0.9, to: "entree" },
    { room: "escalier", side: "N", at: 1.0, w: 1.2, to: "entree" },
    { room: "escalier", side: "W", at: 0.6, w: 1.0 },
    { room: "sejour", side: "N", at: 1.7, w: 1.0 },
    { room: "cuisine", side: "S", at: 2.0, w: 2.4, head: 2.3, to: "sejour" },
    { room: "cuisine", side: "E", at: 4.05, w: 0.9, to: "garage" },
    { room: "salle-de-bain", side: "S", at: 2.0, w: 0.8 },
    { room: "chambre-parents", side: "N", at: 2.0, w: 0.9 },
    { room: "chambre-enfant-1", side: "N", at: 3.0, w: 0.8 },
    { room: "chambre-enfant-2", side: "N", at: 1.5, w: 0.8 },
    { room: "chambre-enfant-3", side: "S", at: 2.4, w: 0.9 },
  ],

  // Through the corridors and the landing, which belong to no room.
  links: [
    ["escalier", "sejour"],
    ["escalier", "salle-de-bain"],
    ["escalier", "chambre-parents"],
    ["escalier", "chambre-enfant-1"],
    ["escalier", "chambre-enfant-2"],
    ["escalier", "chambre-enfant-3"],
    ["terrasse", "jardin"],
    ["jardin", "piscine"],
    ["away", "jardin"],
  ],

  stairs: [
    {
      level: 0,
      // Up the east side of the stairwell, a corner landing, then west along the
      // south to arrive on the upstairs corridor.
      runs: [
        { axis: "z", direction: 1, x: 5.5, z: 2.5, w: 1.0, d: 1.5, y0: 0, y1: 1.2 },
        { axis: "x", direction: -1, x: 3.5, z: 4.0, w: 2.0, d: 1.0, y0: 1.2, y1: UPSTAIRS },
      ],
      landings: [{ x: 5.5, z: 4.0, w: 1.0, d: 1.0, y: 1.2 }],
    },
  ],

  roofs: [
    // Eight panels — 4 kWc in the simulator — on the south slope, over the terrace.
    {
      over: 1,
      kind: "gable",
      ridge: "x",
      x: 0,
      z: 0,
      w: 10.5,
      d: 9.5,
      rise: 2.4,
      overhang: 0.45,
      solar: { rows: 2, perRow: 4 },
    },
    { over: 0, kind: "flat", x: 10.5, z: 3, w: 5.5, d: 5.5, rise: 0.3, overhang: 0.15 },
  ],

  patches: [
    // The drive: an apron in front of the garage door, then north to the street.
    { kind: "drive", x: 16, z: 3, w: 3.5, d: 5.5 },
    { kind: "drive", x: 16.5, z: -4, w: 2.8, d: 7.5 },
    // The path from the street to the front door.
    { kind: "path", x: 4.4, z: -4, w: 1.2, d: 4 },
  ],
};

const plan = composePlan(house);
const problems = validatePlan(plan);
if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`  ${problem}\n`);
  process.exit(1);
}
writeFileSync("public/plans/showroom.json", `${JSON.stringify(plan, null, 2)}\n`);
process.stdout.write(
  `${plan.rooms.length} rooms, ${plan.walls.length} walls, ${plan.walls.reduce((n, w) => n + w.openings.length, 0)} openings, ${plan.doors.length} graph edges → public/plans/showroom.json\n`,
);
