/**
 * The palette, in one place.
 *
 * Sowel's own colours (`CLAUDE.md`): ocean `#1A4F6E`, amber `#F2C035`, light
 * `#EEF5F8`. Stylised rather than realistic — the house should read as a drawing of
 * a house, not a photograph of one, and a phone has to hold a frame rate.
 */

import { Color, DoubleSide, MeshStandardMaterial, MeshBasicMaterial, type Material } from "three";

export const PALETTE = {
  ocean: 0x1a4f6e,
  oceanDark: 0x144159,
  amber: 0xf2c035,
  light: 0xeef5f8,
  wall: 0xe7eef2,
  floor: 0xd9e3e9,
  ground: 0x8fae8a,
  water: 0x4e9cc4,
  shutter: 0x9fb2bd,
  person: 0x1a4f6e,
  glass: 0xbfd8e6,
  roof: 0x4f6675,
  panel: 0x1d3557,
  door: 0x7f95a3,
  step: 0xd3dde3,
  drive: 0xb9bfc4,
  path: 0xd6dbde,
  hedge: 0x4f7a4a,
  soil: 0x6b5340,
  lawn: 0x86b873,
  trunk: 0x7a5a3a,
  leaves: 0x5f9a5a,
  olive: 0x93a88c,
  coping: 0xe3e8ea,
  cover: 0xa9c4d3,
  wood: 0xb08a5c,
  fabric: 0x6d8aa6,
  white: 0xf2f5f7,
  dark: 0x3a3f44,
  metal: 0x9aa5ad,
  stove: 0x2f3338,
  bollard: 0x6b7a85,
  car: 0x8a2f3b,
} as const;

export interface Materials {
  wall: Material;
  floor: Material;
  ground: Material;
  water: Material;
  shutter: Material;
  glass: Material;
  roof: Material;
  panel: Material;
  door: Material;
  step: Material;
  drive: Material;
  path: Material;
  hedge: Material;
  soil: Material;
  lawn: Material;
  trunk: Material;
  leaves: Material;
  olive: Material;
  coping: Material;
  cover: Material;
  wood: Material;
  fabric: Material;
  white: Material;
  dark: Material;
  metal: Material;
  stove: Material;
  bollard: Material;
  car: Material;
  person: Material;
  shadeOff: Material;
  shadeOn: Material;
  sensorOff: Material;
  sensorOn: Material;
  /** A pane with a lit room behind it: what a house looks like from outside at night. */
  glassLit: Material;
  /** The pool of light a lamp throws on the floor. */
  lightPool: Material;
  /** The halo round a sensor that sees somebody. */
  halo: Material;
  /** A radiator or stove that is on. A storey's own: a glow through the floor above is not a signal, it is a radiator. */
  warm: Material;
  /** Water in the air over a bed being sprinkled. */
  jet: Material;
  /** Flowers, three at a time so a bed is not one colour. */
  flowers: Material[];
}

export function makeMaterials(): Materials {
  const standard = (color: number, extra: Partial<MeshStandardMaterial> = {}): Material =>
    Object.assign(new MeshStandardMaterial({ color: new Color(color) }), extra);

  return {
    wall: standard(PALETTE.wall, { roughness: 0.9 }),
    floor: standard(PALETTE.floor, { roughness: 0.95 }),
    ground: standard(PALETTE.ground, { roughness: 1 }),
    water: standard(PALETTE.water, { roughness: 0.15, metalness: 0.1 }),
    shutter: standard(PALETTE.shutter, { roughness: 0.7 }),
    // Glass is cheap here on purpose: a transmissive material is the first thing to
    // cost a phone its frame rate, and a tinted pane reads as glass perfectly well.
    glass: Object.assign(new MeshStandardMaterial({ color: new Color(PALETTE.glass) }), {
      transparent: true,
      opacity: 0.3,
      roughness: 0.1,
    }),
    roof: standard(PALETTE.roof, { roughness: 0.85 }),
    // Glass over cells: the one shiny thing on the house.
    panel: standard(PALETTE.panel, { roughness: 0.25, metalness: 0.35 }),
    door: standard(PALETTE.door, { roughness: 0.7 }),
    step: standard(PALETTE.step, { roughness: 0.9 }),
    drive: standard(PALETTE.drive, { roughness: 1 }),
    path: standard(PALETTE.path, { roughness: 1 }),
    hedge: standard(PALETTE.hedge, { roughness: 1 }),
    soil: standard(PALETTE.soil, { roughness: 1 }),
    lawn: standard(PALETTE.lawn, { roughness: 1 }),
    trunk: standard(PALETTE.trunk, { roughness: 0.95 }),
    leaves: standard(PALETTE.leaves, { roughness: 0.9 }),
    olive: standard(PALETTE.olive, { roughness: 0.9 }),
    coping: standard(PALETTE.coping, { roughness: 0.8 }),
    cover: Object.assign(new MeshStandardMaterial({ color: new Color(PALETTE.cover) }), {
      transparent: true,
      opacity: 0.85,
      roughness: 0.4,
    }),
    wood: standard(PALETTE.wood, { roughness: 0.8 }),
    fabric: standard(PALETTE.fabric, { roughness: 1 }),
    white: standard(PALETTE.white, { roughness: 0.7 }),
    dark: standard(PALETTE.dark, { roughness: 0.6 }),
    metal: standard(PALETTE.metal, { roughness: 0.4, metalness: 0.5 }),
    stove: standard(PALETTE.stove, { roughness: 0.5, metalness: 0.3 }),
    bollard: standard(PALETTE.bollard, { roughness: 0.6 }),
    car: standard(PALETTE.car, { roughness: 0.35, metalness: 0.3 }),
    person: standard(PALETTE.person, { roughness: 0.6 }),
    shadeOff: standard(PALETTE.light, { roughness: 0.8 }),
    // A lit shade is emissive rather than brighter: the light in the room comes from
    // the PointLight, and the shade only has to look like its source.
    shadeOn: Object.assign(new MeshStandardMaterial({ color: new Color(PALETTE.amber) }), {
      emissive: new Color(PALETTE.amber),
      emissiveIntensity: 1.4,
    }),
    sensorOff: new MeshBasicMaterial({ color: new Color(PALETTE.shutter) }),
    sensorOn: new MeshBasicMaterial({ color: new Color(PALETTE.amber) }),
    lightPool: Object.assign(new MeshBasicMaterial({ color: new Color(0xffd27a) }), {
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
    halo: Object.assign(new MeshBasicMaterial({ color: new Color(PALETTE.amber) }), {
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
    warm: Object.assign(new MeshStandardMaterial({ color: new Color(0xffb070) }), {
      emissive: new Color(0xff8c40),
      emissiveIntensity: 0.8,
    }),
    // Double-sided: the cone hangs tip down and is seen from above, which is its
    // inside, and a single-sided inside is culled — invisible water.
    jet: Object.assign(new MeshBasicMaterial({ color: new Color(0xa8dcf2) }), {
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: DoubleSide,
    }),
    flowers: [0xe0567a, 0xf2c035, 0xf7f0ea].map((c) => standard(c, { roughness: 0.9 })),
    // Shared and never ghosted, like the shades: a lit window is a signal.
    glassLit: Object.assign(new MeshStandardMaterial({ color: new Color(0xffe2a8) }), {
      emissive: new Color(0xffc75a),
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.75,
      roughness: 0.2,
    }),
  };
}

/**
 * The materials a storey owns, as opposed to the ones every storey shares.
 *
 * A level that is not the one in focus is shown as a ghost, and a ghost is a
 * property of its materials rather than of its geometry — so each storey is built
 * with its own copies of these and nothing is rebuilt when the focus moves.
 *
 * Lamp shades and sensors are deliberately **not** here: seeing at a glance that a
 * light is on upstairs is most of the reason for showing upstairs at all, and a
 * ghosted amber dot is no longer a signal.
 */
const GHOSTABLE = [
  "wall",
  "floor",
  "ground",
  "water",
  "shutter",
  "glass",
  "roof",
  "panel",
  "door",
  "step",
  "drive",
  "path",
  "hedge",
  "soil",
  "lawn",
  "trunk",
  "leaves",
  "olive",
  "coping",
  "cover",
  "wood",
  "fabric",
  "white",
  "dark",
  "metal",
  "stove",
  "bollard",
  "car",
  "warm",
] as const;

type Ghostable = (typeof GHOSTABLE)[number];

/** What each of them looks like when it is the storey being read. */
const SOLID_OPACITY: Record<Ghostable, number> = {
  wall: 1,
  floor: 1,
  ground: 1,
  water: 1,
  shutter: 1,
  glass: 0.3,
  roof: 1,
  panel: 1,
  door: 1,
  step: 1,
  drive: 1,
  path: 1,
  hedge: 1,
  soil: 1,
  lawn: 1,
  trunk: 1,
  leaves: 1,
  olive: 1,
  coping: 1,
  cover: 0.85,
  wood: 1,
  fabric: 1,
  white: 1,
  dark: 1,
  metal: 1,
  stove: 1,
  bollard: 1,
  car: 1,
  warm: 1,
};

/** Faint enough to see through four of them stacked, present enough to read as a wall. */
const GHOST_OPACITY: Record<Ghostable, number> = {
  wall: 0.09,
  // Fainter than the walls, and deliberately so: a slab is the largest surface in
  // the scene and the storey in focus is read *through* the one above it. At the
  // walls' opacity the ground floor came out milky, lit through a lid.
  floor: 0.05,
  ground: 0.07,
  water: 0.14,
  shutter: 0.08,
  glass: 0.04,
  roof: 0.07,
  panel: 0.12,
  door: 0.09,
  step: 0.09,
  drive: 0.1,
  path: 0.1,
  hedge: 0.1,
  soil: 0.1,
  lawn: 0.1,
  trunk: 0.1,
  leaves: 0.1,
  olive: 0.1,
  coping: 0.1,
  cover: 0.1,
  wood: 0.08,
  fabric: 0.08,
  white: 0.08,
  dark: 0.08,
  metal: 0.08,
  stove: 0.08,
  bollard: 0.1,
  car: 0.08,
  warm: 0.08,
};

/** A set sharing the signals and owning its own structure. One per storey. */
export function copyMaterials(source: Materials): Materials {
  const copy = { ...source };
  for (const key of GHOSTABLE) copy[key] = source[key].clone();
  return copy;
}

/**
 * Turn one storey's structure to glass, or back.
 *
 * `depthWrite` goes off with it: a ghost that writes depth hides whatever is behind
 * it, which for a stack of four storeys means the focused one disappears under the
 * roof above it.
 */
export function setGhost(materials: Materials, ghost: boolean): void {
  for (const key of GHOSTABLE) {
    const material = materials[key] as Material & { opacity: number; depthWrite: boolean };
    const opacity = ghost ? GHOST_OPACITY[key] : SOLID_OPACITY[key];
    material.transparent = opacity < 1;
    material.opacity = opacity;
    material.depthWrite = !ghost;
    material.needsUpdate = true;
  }
}
