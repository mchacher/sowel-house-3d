/**
 * The palette, in one place.
 *
 * Sowel's own colours (`CLAUDE.md`): ocean `#1A4F6E`, amber `#F2C035`, light
 * `#EEF5F8`. Stylised rather than realistic — the house should read as a drawing of
 * a house, not a photograph of one, and a phone has to hold a frame rate.
 */

import { Color, MeshStandardMaterial, MeshBasicMaterial, type Material } from "three";

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
  door: 0x7f95a3,
  step: 0xd3dde3,
  drive: 0xb9bfc4,
  path: 0xd6dbde,
} as const;

export interface Materials {
  wall: Material;
  floor: Material;
  ground: Material;
  water: Material;
  shutter: Material;
  glass: Material;
  roof: Material;
  door: Material;
  step: Material;
  drive: Material;
  path: Material;
  person: Material;
  shadeOff: Material;
  shadeOn: Material;
  sensorOff: Material;
  sensorOn: Material;
  /** A pane with a lit room behind it: what a house looks like from outside at night. */
  glassLit: Material;
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
    door: standard(PALETTE.door, { roughness: 0.7 }),
    step: standard(PALETTE.step, { roughness: 0.9 }),
    drive: standard(PALETTE.drive, { roughness: 1 }),
    path: standard(PALETTE.path, { roughness: 1 }),
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
  "door",
  "step",
  "drive",
  "path",
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
  door: 1,
  step: 1,
  drive: 1,
  path: 1,
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
  door: 0.09,
  step: 0.09,
  drive: 0.1,
  path: 0.1,
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
