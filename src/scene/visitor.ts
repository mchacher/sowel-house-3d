/**
 * The visitor's figure (spec 005, FR1).
 *
 * A toy-like figurine, and a generic one: a large round head, a cylindrical body,
 * short legs, arms as rounded sticks, a face of two dots. None of a known toy's
 * signatures — no helmet of hair, no C-shaped hands, no printed face. Amber top,
 * ocean trousers: Sowel's colours, and told apart from the household at a glance.
 * About 1.1 m tall: a toy in a house, readable in a 440 × 300 vignette.
 *
 * Its own materials, never ghosted: whichever storey is read, the visitor is there.
 */

import {
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Object3D,
} from "three";

export interface VisitorFigure {
  root: Group;
  leftLeg: Object3D;
  rightLeg: Object3D;
  leftArm: Object3D;
  rightArm: Object3D;
}

const AMBER = 0xf2c035;
const OCEAN = 0x1a4f6e;
const SKIN = 0xf1cfae;
const DARK = 0x22313b;

/** A limb hung from a joint, so swinging the joint swings the limb from its top. */
function limb(radius: number, length: number, material: MeshStandardMaterial): Group {
  const joint = new Group();
  const mesh = new Mesh(new CapsuleGeometry(radius, length, 4, 10), material);
  mesh.position.y = -(length / 2 + radius);
  mesh.castShadow = true;
  joint.add(mesh);
  return joint;
}

export function buildVisitor(): VisitorFigure {
  const top = new MeshStandardMaterial({ color: AMBER, roughness: 0.55 });
  const trousers = new MeshStandardMaterial({ color: OCEAN, roughness: 0.6 });
  const skin = new MeshStandardMaterial({ color: SKIN, roughness: 0.7 });
  const dark = new MeshStandardMaterial({ color: DARK, roughness: 0.6 });

  const root = new Group();
  root.name = "visitor";

  const leftLeg = limb(0.07, 0.24, trousers);
  const rightLeg = limb(0.07, 0.24, trousers);
  leftLeg.position.set(-0.08, 0.38, 0);
  rightLeg.position.set(0.08, 0.38, 0);

  const hips = new Mesh(new CylinderGeometry(0.16, 0.16, 0.1, 16), trousers);
  hips.position.y = 0.42;
  const body = new Mesh(new CylinderGeometry(0.15, 0.17, 0.3, 16), top);
  body.position.y = 0.62;

  const leftArm = limb(0.05, 0.22, top);
  const rightArm = limb(0.05, 0.22, top);
  leftArm.position.set(-0.21, 0.74, 0);
  rightArm.position.set(0.21, 0.74, 0);

  const head = new Mesh(new SphereGeometry(0.19, 20, 16), skin);
  head.position.y = 0.95;
  const eye = (x: number) => {
    const dot = new Mesh(new SphereGeometry(0.022, 8, 6), dark);
    dot.position.set(x, 0.98, 0.175);
    return dot;
  };

  for (const mesh of [hips, body, head]) mesh.castShadow = true;
  root.add(leftLeg, rightLeg, hips, body, leftArm, rightArm, head, eye(-0.06), eye(0.06));
  return { root, leftLeg, rightLeg, leftArm, rightArm };
}

/** The walk cycle: legs and arms swinging by the distance walked; still when stopped. */
export function pose(figure: VisitorFigure, distance: number, moving: boolean): void {
  const swing = moving ? Math.sin(distance * 7) * 0.55 : 0;
  figure.leftLeg.rotation.x = swing;
  figure.rightLeg.rotation.x = -swing;
  figure.leftArm.rotation.x = -swing * 0.8;
  figure.rightArm.rotation.x = swing * 0.8;
}
