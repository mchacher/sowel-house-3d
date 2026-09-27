/**
 * The figures: the visitor's (spec 005, FR1), and the household's (spec 005,
 * amended 2026-09-27) — the same figurine in other colours, without the ring.
 *
 * A toy-like figurine, and a generic one: a large round head, a cylindrical body,
 * short legs, arms as rounded sticks, a face of two dots. None of a known toy's
 * signatures — no helmet of hair, no C-shaped hands, no printed face. Amber top,
 * ocean trousers: Sowel's colours, and told apart from the household at a glance.
 * About 1.5 m tall, with an amber ring at its feet: found at a glance.
 *
 * Its own materials, never ghosted: whichever storey is read, the visitor is there.
 */

import {
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  type Object3D,
} from "three";

/**
 * Scaled up from the toy's own proportions: at 1.1 m it vanished in the vignette,
 * and inside a household member standing on the room's spot. 1.5 m, taller than
 * the household, with a ring on the floor.
 */
const SCALE = 1.35;

/** What tells one figurine from another. */
export interface FigureStyle {
  top: number;
  trousers: number;
  /** Relative to the toy's own proportions. */
  scale: number;
  /** The amber ring at its feet: the visitor's, and only the visitor's. */
  ring: boolean;
}

/**
 * The household's colours: calm, told apart from each other, and never the
 * visitor's amber. Chosen by the occupant's id, so a person keeps theirs.
 */
const HOUSEHOLD_TOPS = [0x3f8f8a, 0xc8674f, 0x7a6fb0, 0x5f9a4f, 0xb0617f];
const HOUSEHOLD_TROUSERS = [0x2f3e4a, 0x4a4033, 0x33404f];

export function householdStyle(id: string, label: string): FigureStyle {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  // A child is a size smaller; the label is the only thing Sowel says about it.
  const child = /enfant|child|kid/i.test(label);
  return {
    top: HOUSEHOLD_TOPS[hash % HOUSEHOLD_TOPS.length],
    trousers: HOUSEHOLD_TROUSERS[(hash >>> 3) % HOUSEHOLD_TROUSERS.length],
    scale: child ? 1.0 : 1.2,
    ring: false,
  };
}

export interface VisitorFigure {
  root: Group;
  leftLeg: Object3D;
  rightLeg: Object3D;
  leftArm: Object3D;
  rightArm: Object3D;
}

const AMBER = 0xf2c035;
const OCEAN = 0x1a4f6e;

const VISITOR_STYLE: FigureStyle = { top: AMBER, trousers: OCEAN, scale: SCALE, ring: true };
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
  return buildFigure(VISITOR_STYLE);
}

export function buildFigure(style: FigureStyle): VisitorFigure {
  const top = new MeshStandardMaterial({ color: style.top, roughness: 0.55 });
  const trousers = new MeshStandardMaterial({ color: style.trousers, roughness: 0.6 });
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
  const figure = new Group();
  figure.add(leftLeg, rightLeg, hips, body, leftArm, rightArm, head, eye(-0.06), eye(0.06));
  figure.scale.setScalar(style.scale);
  root.add(figure);
  const handles = { root, leftLeg, rightLeg, leftArm, rightArm };
  if (!style.ring) return handles;

  // Where the visitor is, on the floor: seen through a ghosted storey too.
  const ring = new Mesh(
    new RingGeometry(0.34, 0.46, 32),
    new MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  root.add(ring);
  return handles;
}

/** The walk cycle: legs and arms swinging by the distance walked; still when stopped. */
export function pose(figure: VisitorFigure, distance: number, moving: boolean): void {
  const swing = moving ? Math.sin(distance * 7) * 0.55 : 0;
  figure.leftLeg.rotation.x = swing;
  figure.rightLeg.rotation.x = -swing;
  figure.leftArm.rotation.x = -swing * 0.8;
  figure.rightArm.rotation.x = swing * 0.8;
}
