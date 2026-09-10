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
} as const;

export interface Materials {
  wall: Material;
  floor: Material;
  ground: Material;
  water: Material;
  shutter: Material;
  glass: Material;
  person: Material;
  shadeOff: Material;
  shadeOn: Material;
  sensorOff: Material;
  sensorOn: Material;
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
  };
}
