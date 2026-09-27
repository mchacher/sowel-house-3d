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
      nameEn: "Ground floor",
      x: 0,
      z: 0,
      w: 10.5,
      d: 9.5,
      parts: [{ x: 10.5, z: 3, w: 5.5, d: 5.5 }],
    },
    {
      level: 1,
      name: "Étage",
      nameEn: "Upstairs",
      x: 0,
      z: 0,
      w: 10.5,
      d: 9.5,
      // Over the stairs only — the U in the north half of the stairwell — so the band
      // south of it is the upstairs landing, joining the two wings (2026-09-27).
      hole: { x: 3.5, z: 2.5, w: 3, d: 1.5 },
    },
  ],

  rooms: [
    // ── Ground floor ─────────────────────────────────────────────────────
    {
      id: "bureau",
      kind: "office",
      name: "Bureau",
      nameEn: "Study",
      level: 0,
      x: 0,
      z: 0,
      w: 3.5,
      d: 3,
      spot: [1.75, 1.6],
    },
    // Off the corridor behind the study, where a pavilion keeps it.
    {
      id: "wc",
      kind: "wc",
      name: "WC",
      nameEn: "WC",
      level: 0,
      x: 0,
      z: 3,
      w: 1.5,
      d: 2,
      spot: [0.75, 4],
    },
    {
      id: "entree",
      kind: "hall",
      name: "Entrée",
      nameEn: "Hall",
      level: 0,
      x: 3.5,
      z: 0,
      w: 3,
      d: 2.5,
      spot: [5, 1.3],
    },
    // The stairs live here: a quarter-turn flight up the east side and across the
    // south, leaving a hall in the north-west corner.
    {
      id: "escalier",
      kind: "stair",
      name: "Escalier",
      nameEn: "Stairs",
      level: 0,
      x: 3.5,
      z: 2.5,
      w: 3,
      d: 2.5,
      spot: [4.4, 3.2],
    },
    {
      id: "cuisine",
      kind: "kitchen",
      name: "Cuisine",
      nameEn: "Kitchen",
      level: 0,
      x: 6.5,
      z: 0,
      w: 4,
      d: 5,
      spot: [8.5, 2.6],
      fixtures: [
        {
          kind: "spots",
          points: [
            [7.6, 2],
            [9, 2],
            [7.6, 3],
            [9, 3],
          ],
        },
      ],
    },
    {
      id: "sejour",
      kind: "living",
      accent: "terracotta",
      name: "Séjour",
      nameEn: "Living room",
      level: 0,
      x: 0,
      z: 5,
      w: 10.5,
      d: 4.5,
      spot: [5.2, 7.4],
      fixtures: [
        // "Appliques x 2": two appliques on the north wall, over the sofa's side.
        {
          kind: "sconce",
          points: [
            [4.2, 5],
            [5.8, 5],
          ],
          face: "S",
        },
        // "Applique x 1": one on the east wall, by the dining table.
        { kind: "sconce", points: [[10.5, 7.2]], face: "W" },
        // "Spots": four over the dining table.
        {
          kind: "spots",
          points: [
            [6.6, 6.5],
            [8.2, 6.5],
            [6.6, 8],
            [8.2, 8],
          ],
        },
      ],
    },
    {
      id: "garage",
      kind: "garage",
      name: "Garage",
      nameEn: "Garage",
      level: 0,
      x: 10.5,
      z: 3,
      w: 5.5,
      d: 5.5,
      spot: [13.2, 5.7],
    },

    // ── Upstairs ─────────────────────────────────────────────────────────
    {
      id: "salle-de-bain",
      kind: "bathroom",
      name: "Salle de Bain",
      nameEn: "Bathroom",
      level: 1,
      x: 0,
      z: 0,
      w: 3.5,
      d: 3,
      spot: [1.75, 1.5],
    },
    {
      id: "chambre-enfant-3",
      kind: "bedroom",
      name: "Chambre Enfant 3",
      nameEn: "Bedroom 3",
      level: 1,
      x: 6.5,
      z: 0,
      w: 4,
      d: 4,
      spot: [8.5, 2],
      accent: "rose",
      furniture: [
        { kind: "single-bed", wall: "E", at: 2.6 },
        { kind: "bedside", wall: "E", at: 1.55 },
        { kind: "desk", wall: "N", at: 2.0 },
        { kind: "wardrobe", wall: "W", at: 1.0, w: 1.2 },
        { kind: "pouf", wall: "S", at: 0.8, off: 0.25 },
        { kind: "rug", wall: "N", at: 1.4, off: 1.4, w: 1.8, d: 1.2 },
      ],
      fixtures: [
        {
          kind: "spots",
          points: [
            [7.8, 1.3],
            [9.2, 1.3],
            [7.8, 2.7],
            [9.2, 2.7],
          ],
        },
      ],
    },
    {
      id: "chambre-parents",
      kind: "bedroom",
      name: "Chambre Parents",
      nameEn: "Main bedroom",
      level: 1,
      x: 0,
      z: 5,
      w: 4,
      d: 4.5,
      spot: [2, 7.2],
      accent: "slate",
      furniture: [
        { kind: "rug", wall: "W", at: 2.4, off: 1.3, w: 2.4, d: 1.6 },
        { kind: "double-bed", wall: "W", at: 2.4 },
        { kind: "bedside", wall: "W", at: 1.05 },
        { kind: "bedside", wall: "W", at: 3.75 },
        { kind: "wardrobe", wall: "E", at: 2.2, w: 1.6 },
        { kind: "dresser", wall: "S", at: 3.3 },
        { kind: "armchair", wall: "N", at: 3.35 },
      ],
    },
    {
      id: "chambre-enfant-1",
      kind: "bedroom",
      name: "Chambre Enfant 1",
      nameEn: "Bedroom 1",
      level: 1,
      x: 4,
      z: 5,
      w: 3.5,
      d: 4.5,
      spot: [5.75, 7.2],
      accent: "sage",
      furniture: [
        { kind: "round-rug", wall: "N", at: 1.9, off: 1.5 },
        { kind: "single-bed", wall: "N", at: 0.6 },
        { kind: "bedside", wall: "N", at: 1.4 },
        { kind: "desk", wall: "S", at: 1.75 },
        { kind: "toy-box", wall: "E", at: 1.9 },
        { kind: "shelf", wall: "E", at: 3.5 },
      ],
    },
    {
      id: "chambre-enfant-2",
      kind: "bedroom",
      name: "Chambre Enfant 2",
      nameEn: "Bedroom 2",
      level: 1,
      x: 7.5,
      z: 5,
      w: 3,
      d: 4.5,
      spot: [9, 7.2],
      accent: "amber",
      furniture: [
        { kind: "round-rug", wall: "N", at: 1.4, off: 2.0, w: 1.1 },
        { kind: "bunk-bed", wall: "S", at: 2.4 },
        { kind: "desk", wall: "W", at: 1.2 },
        { kind: "shelf", wall: "E", at: 1.0 },
        { kind: "pouf", wall: "W", at: 3.9, off: 0.3 },
      ],
      fixtures: [
        {
          kind: "spots",
          points: [
            [9, 6.2],
            [9, 7.3],
            [9, 8.4],
          ],
        },
      ],
    },

    // ── Outdoors ─────────────────────────────────────────────────────────
    {
      id: "jardin",
      kind: "garden",
      name: "Jardin",
      nameEn: "Garden",
      level: null,
      x: -5,
      z: -4,
      w: 26,
      d: 24,
      spot: [-2, 12],
      ground: true,
      // In the order the mapping places the garden's four lights.
      fixtures: [
        // "Lumiere Terrasse": lanterns on the terrace wall, between the bays.
        {
          kind: "wall",
          points: [
            [0.6, 9.5],
            [4.5, 9.5],
            [7.85, 9.5],
          ],
          face: "S",
        },
        // "Circulation - Escalier Piscine": bollards along the pool's west side, the way
        // down from the terrace. Not along its north edge: from the camera, the middle
        // one stood square in front of the water and read as a lamp in the pool.
        {
          kind: "bollard",
          points: [
            [0.5, 13.4],
            [0.5, 15.5],
            [0.5, 17.6],
          ],
        },
        // "Oliviers": an uplight under each olive tree.
        {
          kind: "uplight",
          points: [
            [12.75, 11.65],
            [15.25, 13.25],
          ],
        },
        // "Végétations": uplights under the three big trees and in the west bed.
        {
          kind: "uplight",
          points: [
            [-2.4, 18.1],
            [18.4, 18.1],
            [-2.4, 1.6],
            [-2.6, 11.2],
            [-1.3, 14.2],
          ],
        },
      ],
    },
    {
      id: "terrasse",
      kind: "terrace",
      name: "Terrasse",
      nameEn: "Terrace",
      level: null,
      x: 0,
      z: 9.5,
      w: 10.5,
      d: 3,
      spot: [5.2, 11],
    },
    {
      id: "piscine",
      kind: "pool",
      name: "Piscine",
      nameEn: "Pool",
      level: null,
      x: 1.5,
      z: 13.5,
      w: 8,
      d: 4,
      spot: [5.5, 15.5],
      // "Spot Piscine": set in the wall on the terrace side, shining across the water.
      fixtures: [{ kind: "underwater", points: [[5.5, 13.5]], face: "S" }],
    },
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
    // West of centre, which leaves the bunk bed the east end of the wall.
    { room: "chambre-enfant-2", side: "S", at: 1.2, w: 1.0, sill: 0.9, head: 2.1 },
    { room: "chambre-enfant-3", side: "N", at: 2.0, w: 1.2, sill: 0.9, head: 2.1 },
    { room: "salle-de-bain", side: "N", at: 1.75, w: 0.8, sill: 1.3, head: 2.0 },
  ],

  doors: [
    // The three the house reports on: the front door, the terrace door, the garage.
    { room: "entree", side: "N", at: 1.5, w: 1.0, id: "door:entree-1", to: "away" },
    {
      room: "sejour",
      side: "S",
      at: 9.0,
      w: 1.0,
      head: 2.2,
      id: "door:sejour-1",
      to: "terrasse",
      glazed: true,
    },
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
    // From the hall straight onto the first flight, at its foot.
    { room: "escalier", side: "N", at: 0.4, w: 0.8, to: "entree" },
    // From the passage by the WC onto the free band south of the stairs.
    { room: "escalier", side: "W", at: 2.0, w: 0.9 },
    { room: "wc", side: "E", at: 1.2, w: 0.7 },
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
    ["escalier", "wc"],
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
      // A U in the north half of the stairwell: east along the hall's wall, a half
      // landing against the east wall, back west to arrive upstairs by the bathroom.
      // The first design ran the second flight along the south, and its opening
      // took the whole middle of the upper floor: the children's rooms opened onto
      // the void, with no landing between the wings. The band south of the U is now
      // that landing upstairs, and free floor downstairs.
      runs: [
        { axis: "x", direction: 1, x: 3.5, z: 2.5, w: 2.5, d: 0.75, y0: 0, y1: UPSTAIRS / 2 },
        {
          axis: "x",
          direction: -1,
          x: 3.5,
          z: 3.25,
          w: 2.5,
          d: 0.75,
          y0: UPSTAIRS / 2,
          y1: UPSTAIRS,
        },
      ],
      landings: [{ x: 6.0, z: 2.5, w: 0.5, d: 1.5, y: UPSTAIRS / 2 }],
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
      solar: { rows: 2, perRow: 6 },
    },
    { over: 0, kind: "flat", x: 10.5, z: 3, w: 5.5, d: 5.5, rise: 0.3, overhang: 0.15 },
  ],

  // The plot: a hedge all round, the gate across the drive, a gap for the path.
  fence: {
    height: 1.4,
    thickness: 0.5,
    segments: [
      // North, along the street: hedge — gap for the path — hedge — gate — hedge.
      { axis: "x", at: -4, from: -5, to: 4.2 },
      { axis: "x", at: -4, from: 5.8, to: 16.3 },
      { axis: "x", at: -4, from: 19.5, to: 21 },
      { axis: "x", at: 20, from: -5, to: 21 },
      { axis: "z", at: -5, from: -4, to: 20 },
      { axis: "z", at: 21, from: -4, to: 20 },
    ],
    // Slides west, inside the hedge, when the Portail says it is open.
    gates: [{ id: "gate:portail-1", axis: "x", at: -3.6, from: 16.3, to: 19.5, slide: -1 }],
  },

  beds: [
    // The plantations: a bed along the west of the terrace and one under the
    // office window, both on the Vanne Plantations.
    { id: "massif-ouest", kind: "flowers", x: -3.5, z: 9.5, w: 3, d: 6, watering: "plantations" },
    {
      id: "massif-nord",
      kind: "flowers",
      x: -0.5,
      z: -2.2,
      w: 4.5,
      d: 1.6,
      watering: "plantations",
    },
    // The lawn east of the pool, on the Vanne Pelouse.
    { id: "pelouse", kind: "lawn", x: 11, z: 10, w: 9, d: 9, watering: "pelouse" },
  ],

  trees: [
    { x: -3, z: 17.5, kind: "tree", size: 5 },
    { x: 19, z: 17.5, kind: "tree", size: 5.5 },
    { x: -3, z: 1, kind: "tree", size: 4.5 },
    // Two olive trees on the lawn by the terrace — "Oliviers" is plural.
    { x: 12.3, z: 11.2, kind: "olive", size: 2.6 },
    { x: 14.8, z: 12.8, kind: "olive", size: 2.4 },
    { x: 2, z: -2.9, kind: "bush", size: 0.9 },
    { x: 8, z: -2.9, kind: "bush", size: 1 },
    { x: 13, z: -2.9, kind: "bush", size: 0.9 },
    { x: 11.2, z: 19.2, kind: "bush", size: 0.9 },
    { x: 19.5, z: 8, kind: "bush", size: 1.1 },
  ],

  // The machines Sowel knows and no room holds: the heat pump's outdoor unit
  // against the west wall, between the tree and the living room's window. The
  // pool's heat pump and pump are left out on purpose — boxes on the pool's edge
  // were ugly, and what they do shows in the water instead (its jets).
  machines: [{ kind: "heat-pump", x: -0.3, z: 3.6, face: "W" }],

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
