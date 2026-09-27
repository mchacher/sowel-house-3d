/**
 * The visitor's figure (spec 005, FR1).
 *
 * A toy-like figurine, and a generic one: a large round head, a cylindrical body,
 * short legs, arms as rounded sticks, a face of two dots. None of a known toy's
 * signatures — no helmet of hair, no C-shaped hands, no printed face. Amber top,
 * ocean trousers: Sowel's colours, and told apart from the household at a glance.
 * About 1.5 m tall, an amber ring at its feet and a label over its head: found at a
 * glance in a 440 × 300 vignette.
 *
 * Its own materials, never ghosted: whichever storey is read, the visitor is there.
 */

import {
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Object3D,
} from "three";

/**
 * Scaled up from the toy's own proportions: at 1.1 m it vanished in the vignette,
 * and inside a household member standing on the room's spot. 1.5 m, taller than
 * the household, with a ring on the floor and a label, reads at 440 × 300.
 */
const SCALE = 1.35;

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

/** A label over the head. Null where there is no canvas (tests). */
function label(text: string): Sprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(26, 79, 110, 0.92)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 144, 52, 18);
  ctx.fill();
  ctx.font = "700 34px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#F2C035";
  ctx.fillText(text, 80, 35);
  // The same size on screen however far the camera is: in the vignette the figure
  // is a few pixels at the back of the house, and the label is how it is found.
  const sprite = new Sprite(
    new SpriteMaterial({
      map: new CanvasTexture(canvas),
      depthTest: false,
      transparent: true,
      sizeAttenuation: false,
    }),
  );
  sprite.scale.set(0.12, 0.054, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function buildVisitor(name = "Toi"): VisitorFigure {
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
  const figure = new Group();
  figure.add(leftLeg, rightLeg, hips, body, leftArm, rightArm, head, eye(-0.06), eye(0.06));
  figure.scale.setScalar(SCALE);

  // Where the visitor is, on the floor: seen through a ghosted storey too.
  const ring = new Mesh(
    new RingGeometry(0.34, 0.46, 32),
    new MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  root.add(figure, ring);
  const tag = label(name);
  if (tag) {
    tag.position.y = 1.35 * SCALE + 0.25;
    root.add(tag);
  }
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
