/**
 * The house as a scene graph, built from the plan and updated from the state
 * (spec 001, FR5).
 *
 * Separated from the renderer on purpose: a Three.js scene graph is constructible
 * without WebGL, so everything here is exercised in node — the right number of
 * walls, a lamp where a lamp should be, a shutter that moves when Sowel says so.
 * What is left untested is the renderer, the camera controls and whether any of it
 * is nice to look at, which is a person's judgement and not a test's.
 *
 * The objects are built once and **mutated** afterwards. Rebuilding the graph on
 * every event would be simpler to write and would drop frames on a phone for no
 * benefit, since nothing in the geometry changes — only what is lit and where
 * things are.
 */

import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Sprite,
  SpriteMaterial,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Object3D,
  PlaneGeometry,
  PointLight,
  Shape,
  SphereGeometry,
  type Material,
} from "three";
import type { Fixture, Machine, Opening, Plan, Room, Side, Wall } from "../plan/types.ts";
import type { SceneState } from "../state/scene-state.ts";
import {
  flowerSpots,
  furnitureFor,
  gableRoof,
  lampSpots,
  levelContents,
  levelElevation,
  outdoorRooms,
  pieceBox,
  shutterDrop,
  SLAB,
  slabPieces,
  solarPanels,
  sprinklerSpots,
  stairSteps,
  storeyPitch,
  treeParts,
  wallPieces,
} from "./geometry.ts";
import { copyMaterials, setGhost, type Materials } from "./materials.ts";
import { named, type Lang } from "../i18n.ts";

/** One storey: its own group, at its own height, with its own structural materials. */
export interface LevelHandles {
  level: number;
  group: Group;
  materials: Materials;
  /** The room names, hung in the rooms and faded with the storey. */
  labels: Sprite[];
}

/**
 * A room's name on a small sign that always faces the camera, hung near the
 * ceiling so no wardrobe stands in front of it. Built only where there is a
 * document to draw on: the scene graph is otherwise constructible in node, and the
 * tests that prove it should stay that way.
 */
function roomSign(text: string): Sprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Sized to the words: a canvas as wide as the name needs, plus a margin, so
  // "Chambre Enfant 1" is not cut at the frame and "WC" is not a long empty sign.
  const font = "600 60px Inter, system-ui, sans-serif";
  ctx.font = font;
  const width = ctx.measureText(text.toUpperCase()).width;
  canvas.width = Math.min(1024, Math.max(256, Math.ceil(width) + 72));
  canvas.height = 128;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // White with an ocean outline: readable on a pale wall by day and on the same
  // wall gone slate at night, when a plain blue vanished into it.
  ctx.lineWidth = 9;
  ctx.strokeStyle = "rgba(26, 79, 110, 0.95)";
  ctx.strokeText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
  const material = new SpriteMaterial({
    map: new CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    opacity: 0.95,
  });
  const sprite = new Sprite(material);
  // Half a metre tall, as wide as its canvas is in proportion.
  sprite.scale.set((0.5 * canvas.width) / canvas.height, 0.5, 1);
  return sprite;
}

/**
 * One light equipment in the scene. `shades` change colour with it, `glow` — the
 * pools of light on the floor, an uplight's beam — appears with it, and the light
 * itself lights the room around. One PointLight per equipment however many bulbs
 * it has: lights cost every material in the scene, and the pools and beams are
 * what carries the signal anyway.
 */
export interface LampHandle {
  light: PointLight;
  /** Full intensity, for this kind of fitting. */
  power: number;
  shades: Mesh[];
  glow: Object3D[];
}

const FACING: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

/**
 * A light fitting as the plan describes it. `ceiling` is the storey's wall height,
 * for what hangs from it; outdoors it is the height of the ground-floor walls.
 * `room` is the room it belongs to, for a light whose effect is the room itself —
 * the pool, lit from within.
 */
function buildLamp(
  fixture: Fixture,
  ceiling: number,
  materials: Materials,
  group: Group,
  room?: Room,
): LampHandle {
  const shades: Mesh[] = [];
  const glow: Object3D[] = [];
  const [fx, fz] = fixture.face ? FACING[fixture.face] : [0, 0];
  const along = fixture.face === "N" || fixture.face === "S"; // the wall runs along x
  const points = fixture.points;
  const cx = points.reduce((n, p) => n + p[0], 0) / points.length;
  const cz = points.reduce((n, p) => n + p[1], 0) / points.length;

  const shade = (mesh: Mesh, x: number, y: number, z: number): void => {
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    group.add(mesh);
    shades.push(mesh);
  };
  const pool = (x: number, z: number, radius: number, y = 0.012): void => {
    const disc = new Mesh(new CircleGeometry(radius, 24), materials.lightPool);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, y, z);
    disc.visible = false;
    group.add(disc);
    glow.push(disc);
  };
  const light = (
    x: number,
    y: number,
    z: number,
    distance: number,
    colour = 0xffd9a0,
  ): PointLight => {
    // Shadows are off: seventeen shadow-casting lights is what costs a phone its
    // frame rate.
    const l = new PointLight(colour, 0, distance);
    l.castShadow = false;
    l.position.set(x, y, z);
    group.add(l);
    return l;
  };

  switch (fixture.kind) {
    case "ceiling": {
      const [x, z] = points[0];
      shade(new Mesh(new SphereGeometry(0.13, 12, 10), materials.shadeOff), x, ceiling - 0.35, z);
      pool(x, z, 1.15);
      return { light: light(x, ceiling - 0.45, z, 6.5), power: 2.2, shades, glow };
    }
    case "spots": {
      for (const [x, z] of points) {
        shade(
          new Mesh(new CylinderGeometry(0.08, 0.08, 0.04, 14), materials.shadeOff),
          x,
          ceiling - 0.04,
          z,
        );
        pool(x, z, 0.55);
      }
      return { light: light(cx, ceiling - 0.4, cz, 6.5), power: 2.4, shades, glow };
    }
    case "sconce": {
      for (const [x, z] of points) {
        const body = along ? new BoxGeometry(0.24, 0.3, 0.1) : new BoxGeometry(0.1, 0.3, 0.24);
        shade(new Mesh(body, materials.shadeOff), x + fx * 0.07, 1.85, z + fz * 0.07);
        pool(x + fx * 0.7, z + fz * 0.7, 0.65);
      }
      return { light: light(cx + fx * 0.45, 1.8, cz + fz * 0.45, 5), power: 1.6, shades, glow };
    }
    case "wall": {
      for (const [x, z] of points) {
        const body = along ? new BoxGeometry(0.2, 0.3, 0.16) : new BoxGeometry(0.16, 0.3, 0.2);
        shade(new Mesh(body, materials.shadeOff), x + fx * 0.14, 2.3, z + fz * 0.14);
        pool(x + fx * 1.4, z + fz * 1.4, 1.3, 0.03);
      }
      return { light: light(cx + fx * 0.9, 2.1, cz + fz * 0.9, 7), power: 3, shades, glow };
    }
    case "uplight": {
      for (const [x, z] of points) {
        shade(new Mesh(new CylinderGeometry(0.1, 0.12, 0.08, 12), materials.shadeOff), x, 0.04, z);
        // The beam, narrow at the ground and opening upwards into the crown.
        const beam = new Mesh(new ConeGeometry(0.9, 2.6, 18, 1, true), materials.beam);
        beam.rotation.x = Math.PI;
        beam.position.set(x, 1.34, z);
        beam.visible = false;
        group.add(beam);
        glow.push(beam);
      }
      const [x, z] = points[0];
      return { light: light(x, 1.2, z, 6), power: 2.5, shades, glow };
    }
    case "bollard": {
      for (const [x, z] of points) {
        const post = new Mesh(new CylinderGeometry(0.05, 0.06, 0.7, 8), materials.bollard);
        group.add(at(post, x, 0.35, z));
        shade(new Mesh(new SphereGeometry(0.1, 10, 8), materials.shadeOff), x, 0.78, z);
        pool(x, z, 0.9, 0.03);
      }
      return { light: light(cx, 0.8, cz, 5), power: 2, shades, glow };
    }
    case "underwater": {
      // Set in the pool's wall below the surface, where nobody sees the fitting — a
      // globe floating mid-pool was the first attempt, and it looked it. What shows
      // is the water: the whole basin glowing turquoise while the light is on.
      for (const [x, z] of points) {
        const lens = new Mesh(new CylinderGeometry(0.1, 0.1, 0.03, 14), materials.shadeOff);
        lens.rotation.set(along ? Math.PI / 2 : 0, 0, along ? 0 : Math.PI / 2);
        shade(lens, x + fx * 0.02, -0.01, z + fz * 0.02);
      }
      if (room) {
        const water = new Mesh(new PlaneGeometry(room.w, room.d), materials.poolGlow);
        water.rotation.x = -Math.PI / 2;
        water.position.set(room.x + room.w / 2, 0.012, room.z + room.d / 2);
        water.visible = false;
        group.add(water);
        glow.push(water);
      }
      // Below the surface, at the fitting. The water is glossy: any light above it
      // is mirrored as a white hotspot, and from the camera that hotspot is a ball
      // in the pool — twice, first hung over the middle, then at the edge. Under the
      // surface it lights nothing the camera sees mirrored; the turquoise glow of the
      // water is the whole effect, as it is for a real pool at night.
      return {
        light: light(cx + fx * 0.3, -0.3, cz + fz * 0.3, 5, 0x7fd0ff),
        power: 1,
        shades,
        glow,
      };
    }
  }
}

/** The machines outside: a box, and a fan or a filter to say what it is. */
function buildMachine(machine: Machine, materials: Materials, group: Group): void {
  const [fx, fz] = FACING[machine.face];
  const along = machine.face === "N" || machine.face === "S";
  const size =
    machine.kind === "pool-pump"
      ? [0.45, 0.35, 0.35]
      : machine.kind === "heat-pump"
        ? [0.95, 0.7, 0.36]
        : [0.85, 0.75, 0.5];
  const [w, h, d] = along ? size : [size[2], size[1], size[0]];
  const body = box(w, h, d, materials.metal);
  group.add(at(body, machine.x, h / 2, machine.z));
  if (machine.kind === "pool-pump") {
    const filter = new Mesh(new CylinderGeometry(0.18, 0.18, 0.62, 14), materials.white);
    filter.castShadow = true;
    group.add(
      at(
        filter,
        machine.x - fx * 0.05 + (along ? 0.4 : 0),
        0.31,
        machine.z - fz * 0.05 + (along ? 0 : 0.4),
      ),
    );
    return;
  }
  // The fan, on the face it blows out of.
  const fan = new Mesh(new CylinderGeometry(0.24, 0.24, 0.03, 20), materials.dark);
  fan.rotation.set(along ? Math.PI / 2 : 0, 0, along ? 0 : Math.PI / 2);
  const depth = along ? d : w;
  group.add(
    at(fan, machine.x + fx * (depth / 2 + 0.01), h / 2, machine.z + fz * (depth / 2 + 0.01)),
  );
}

/**
 * What the visitor is reading: one storey, or the house from outside.
 *
 * From outside every storey is solid and the roof is on — the postcard. Inside a
 * storey the roof and the other storeys turn to glass, because a roof over the
 * floor being read is a lid.
 */
export type Focus = number | "outside";

/**
 * A door the house reports on. `target` is where Sowel says it should be and the
 * renderer walks the object there: a swing door's `rotation.y` towards an angle, a
 * lifting door's `scale.y` towards a drop — the same easing a shutter gets.
 */
export interface DoorHandle {
  kind: "swing" | "lift" | "slide" | "cover";
  object: Object3D;
  target: number;
  /**
   * For a sliding gate, which coordinate it slides along; for a pool cover, which
   * way it unrolls.
   */
  axis?: "x" | "z";
  home?: number;
  /**
   * For what a motor drives across its whole travel — the garage door, the gate —
   * how long that travel takes. Moved at that constant speed rather than eased:
   * eased, they covered their travel in about a second, which no motorised door
   * does, and it showed.
   */
  travelS?: number;
}

/** A sectional garage door, bottom to top. */
export const GARAGE_DOOR_TRAVEL_S = 12;
/** A sliding gate, shut to open. */
export const GATE_TRAVEL_S = 16;

/** What Sowel reports per room that the graph must be built with the right number of. */
export interface Counts {
  lamps: Record<string, number>;
  heaters: Record<string, number>;
  /** Rooms with a local thermostat — drawn as a stove. */
  stoves: string[];
}

/** Where a swing door stops when open, and a lifting one when open. */
export const SWING_OPEN_RAD = 1.35;
export const LIFT_OPEN_SCALE = 0.04;

/** What the scene keeps hold of so it can be updated without being rebuilt. */
export interface HouseHandles {
  root: Group;
  /** Every storey, built at once. Keyed by `Room.level`. */
  levels: Map<number, LevelHandles>;
  /** The ground, the terrace and the pool, which belong to no storey. */
  outdoor: LevelHandles;
  /** Per room, in the order its lamps pair with its fixtures. */
  lamps: Map<string, LampHandle[]>;
  /**
   * Per room, in plan window order; the panel is anchored at the lintel.
   *
   * `target` is where Sowel says it should be, as a drop in 0…1. The renderer walks
   * `panel.scale.y` towards it, which is what makes a shutter slide instead of
   * jumping — so nothing but `applyState` writes the target and nothing but the
   * easing writes the scale.
   */
  shutters: Map<string, { panel: Mesh; height: number; target: number }[]>;
  sensors: Map<string, Mesh>;
  /** The halo round a sensor, shown while it sees somebody. */
  halos: Map<string, Mesh>;
  /** Radiators and stoves per room, warm when the room is heating. */
  heaters: Map<string, { body: Mesh; cold: Material }[]>;
  /** Fence gates by id, sliding. */
  gates: Map<string, DoorHandle>;
  /** Pool covers by room, rolling from the north edge. */
  covers: Map<string, DoorHandle>;
  /** The sprinkler jets of each watering group, shown while the valve is open. */
  watering: Map<string, Object3D[]>;
  /** Per room: its window panes, lit from outside when a lamp in the room is on. */
  panes: Map<string, Mesh[]>;
  /** Per room, in plan order of its `door:` and `gate:` openings. */
  doors: Map<string, DoorHandle[]>;
  /** The roof, which is solid only from outside. Null when the plan has none. */
  roof: LevelHandles | null;
  people: Map<string, Group>;
  rooms: Map<string, Room>;
}

function box(w: number, h: number, d: number, material: Material): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function at(mesh: Mesh | Group, x: number, y: number, z: number): Mesh | Group {
  mesh.position.set(x, y, z);
  return mesh;
}

/** A figure simple enough to read at a glance and cheap enough to have five of. */
function person(materials: Materials): Group {
  const group = new Group();
  const body = new Mesh(new CylinderGeometry(0.16, 0.2, 0.9, 10), materials.person);
  body.position.y = 0.45;
  body.castShadow = true;
  const head = new Mesh(new SphereGeometry(0.13, 12, 10), materials.person);
  head.position.y = 1.05;
  head.castShadow = true;
  group.add(body, head);
  return group;
}

export interface BuildHouseOptions {
  plan: Plan;
  materials: Materials;
  /** Which storey to read, or the house from outside. */
  level: Focus;
  /** Lamp counts per room, so the right number of lights exist from the start. */
  lampCounts: Record<string, number>;
  /** Radiators and stoves, from the derivation; none when absent. */
  counts?: Partial<Counts>;
  /** The language the signs are written in. */
  lang?: Lang;
}

export function buildHouse(options: BuildHouseOptions): HouseHandles {
  const { plan, materials, level, lampCounts } = options;
  const root = new Group();

  // The garden is built once, beside the storeys rather than inside each of them.
  const outdoor: LevelHandles = {
    level: 0,
    group: new Group(),
    materials: copyMaterials(materials),
    labels: [],
  };
  root.add(outdoor.group);

  const handles: HouseHandles = {
    root,
    levels: new Map(),
    outdoor,
    lamps: new Map(),
    shutters: new Map(),
    sensors: new Map(),
    halos: new Map(),
    heaters: new Map(),
    gates: new Map(),
    covers: new Map(),
    watering: new Map(),
    panes: new Map(),
    doors: new Map(),
    roof: null,
    people: new Map(),
    rooms: new Map(),
  };

  buildOutdoors(plan, outdoor, handles, lampCounts);

  // Every storey, at its own height. Showing one at a time was a way of not solving
  // the occlusion: a house is four floors and a visitor asking what is upstairs
  // should not have to leave the room they are looking at to find out.
  for (const slab of plan.levels) {
    const entry: LevelHandles = {
      level: slab.level,
      group: new Group(),
      materials: copyMaterials(materials),
      labels: [],
    };
    entry.group.position.y = levelElevation(plan, slab.level);
    root.add(entry.group);
    handles.levels.set(slab.level, entry);
    buildLevel(plan, entry, handles, lampCounts, options.counts ?? {}, options.lang ?? "fr");
  }

  if ((plan.roofs ?? []).length > 0) {
    const roof: LevelHandles = {
      level: 0,
      group: new Group(),
      materials: copyMaterials(materials),
      labels: [],
    };
    root.add(roof.group);
    handles.roof = roof;
    buildRoofs(plan, roof);
  }

  focusLevel(handles, level);
  return handles;
}

/** The ground and the patches on it. Heights are staggered on purpose — see below. */
function buildOutdoors(
  plan: Plan,
  entry: LevelHandles,
  handles: HouseHandles,
  lampCounts: Record<string, number>,
): void {
  const { group, materials } = entry;
  const rooms = outdoorRooms(plan);

  const ground = rooms.find((r) => r.ground);
  if (ground) {
    // Four centimetres under the ground floor's slab, not flush with it.
    //
    // They used to share the plane y = 0 exactly, and two coplanar faces are a
    // coin toss the depth buffer re-tosses every frame: the floor came out
    // striped with grass, and the stripes crawled as the camera zoomed, because
    // zooming is what changes depth precision. No amount of material tuning fixes
    // coplanar geometry; moving one of them does.
    const slab = box(ground.w, 0.1, ground.d, materials.ground);
    group.add(at(slab, ground.x + ground.w / 2, -0.09, ground.z + ground.d / 2));
  }

  for (const room of rooms) {
    handles.rooms.set(room.id, room);
    if (room.ground) continue;
    const material = room.id === "piscine" ? materials.water : materials.floor;
    // Sunk into the ground rather than resting on it: touching faces fight too.
    const patch = box(room.w, 0.05, room.d, material);
    group.add(at(patch, room.x + room.w / 2, -0.02, room.z + room.d / 2));
  }

  // The drive and the path: decoration, and the reason the garage door opens onto
  // something rather than onto lawn.
  for (const patch of plan.patches ?? []) {
    const material = patch.kind === "drive" ? materials.drive : materials.path;
    const slab = box(patch.w, 0.05, patch.d, material);
    slab.castShadow = false;
    group.add(at(slab, patch.x + patch.w / 2, -0.015, patch.z + patch.d / 2));
  }

  // The hedge, and the gate that slides along it.
  const fence = plan.fence;
  if (fence) {
    for (const seg of fence.segments) {
      const length = seg.to - seg.from;
      const mid = (seg.from + seg.to) / 2;
      const hedge =
        seg.axis === "x"
          ? box(length, fence.height, fence.thickness, materials.hedge)
          : box(fence.thickness, fence.height, length, materials.hedge);
      group.add(
        at(
          hedge,
          seg.axis === "x" ? mid : seg.at,
          fence.height / 2,
          seg.axis === "x" ? seg.at : mid,
        ),
      );
    }
    for (const gate of fence.gates) {
      const length = gate.to - gate.from;
      const h = fence.height * 0.95;
      // Slats: a frame and bars rather than a slab, so it reads as a gate and not
      // as a bit of wall that moves.
      const panel = new Group();
      const bar = (px: number, pw: number): void => {
        const slat =
          gate.axis === "x" ? box(pw, h, 0.06, materials.metal) : box(0.06, h, pw, materials.metal);
        slat.position.set(gate.axis === "x" ? px : 0, h / 2, gate.axis === "x" ? 0 : px);
        panel.add(slat);
      };
      for (let u = -length / 2 + 0.08; u <= length / 2 - 0.08; u += 0.22) bar(u, 0.05);
      const rail =
        gate.axis === "x"
          ? box(length, 0.08, 0.08, materials.dark)
          : box(0.08, 0.08, length, materials.dark);
      rail.position.y = h - 0.04;
      const rail2 = rail.clone();
      rail2.position.y = 0.1;
      panel.add(rail, rail2);
      const home = (gate.from + gate.to) / 2;
      panel.position.set(gate.axis === "x" ? home : gate.at, 0, gate.axis === "x" ? gate.at : home);
      panel.userData.travel = length * gate.slide;
      group.add(panel);
      handles.gates.set(gate.id, {
        kind: "slide",
        object: panel,
        target: 0,
        axis: gate.axis,
        home,
        travelS: GATE_TRAVEL_S,
      });
    }
  }

  // Beds: soil with flowers, or a lawn; each with the sprinklers its valve drives.
  for (const bed of plan.beds ?? []) {
    const patch = box(bed.w, 0.06, bed.d, bed.kind === "lawn" ? materials.lawn : materials.soil);
    patch.castShadow = false;
    group.add(at(patch, bed.x + bed.w / 2, -0.01, bed.z + bed.d / 2));
    flowerSpots(bed).forEach(([fx, fz], i) => {
      const stem = new Mesh(new CylinderGeometry(0.015, 0.015, 0.3, 5), materials.leaves);
      group.add(at(stem, fx, 0.17, fz));
      const head = new Mesh(new SphereGeometry(0.09, 7, 6), materials.flowers[i % 3]);
      group.add(at(head, fx, 0.36, fz));
    });
    if (bed.watering) {
      const jets: Object3D[] = [];
      for (const [sx, sz] of sprinklerSpots(bed)) {
        const post = new Mesh(new CylinderGeometry(0.03, 0.03, 0.25, 6), materials.metal);
        group.add(at(post, sx, 0.13, sz));
        // A cone of water, tip down on the sprinkler, hidden until the valve opens.
        const jet = new Mesh(new ConeGeometry(1.3, 0.9, 14, 1, true), materials.jet);
        jet.rotation.x = Math.PI;
        jet.position.set(sx, 0.7, sz);
        jet.visible = false;
        group.add(jet);
        jets.push(jet);
      }
      handles.watering.set(bed.watering, [...(handles.watering.get(bed.watering) ?? []), ...jets]);
    }
  }

  for (const tree of plan.trees ?? []) {
    const parts = treeParts(tree);
    if (parts.trunk) {
      const t = parts.trunk;
      const trunk = new Mesh(
        new CylinderGeometry(t.radius, t.radius * 1.3, t.height, 8),
        materials.trunk,
      );
      trunk.castShadow = true;
      group.add(at(trunk, t.x, t.y, t.z));
    }
    const leaf =
      tree.kind === "olive"
        ? materials.olive
        : tree.kind === "bush"
          ? materials.hedge
          : materials.leaves;
    for (const c of parts.crown) {
      const crown = new Mesh(new SphereGeometry(c.radius, 10, 8), leaf);
      crown.castShadow = true;
      if (tree.kind === "bush") crown.scale.y = 0.75;
      group.add(at(crown, c.x, c.y, c.z));
    }
  }

  // The pool: a coping round the water, and the cover that rolls from its north
  // edge when Sowel says so.
  for (const room of rooms) {
    if (room.kind !== "pool") continue;
    const c = 0.4;
    const ring: [number, number, number, number][] = [
      [room.x - c, room.z - c, room.w + 2 * c, c],
      [room.x - c, room.z + room.d, room.w + 2 * c, c],
      [room.x - c, room.z, c, room.d],
      [room.x + room.w, room.z, c, room.d],
    ];
    for (const [rx, rz, rw, rd] of ring) {
      const coping = box(rw, 0.1, rd, materials.coping);
      coping.castShadow = false;
      group.add(at(coping, rx + rw / 2, 0.03, rz + rd / 2));
    }
    // A roller cover: the roller across the pool's width at its west end, and the
    // cover unrolling along its length. The first version had the roller along a
    // long side and unrolled across the width, which is not how any pool cover is
    // built; the second put the roller at the east end, and the owner wanted it
    // on the opposite edge.
    const long = room.w >= room.d; // the pool runs along x
    const length = long ? room.w : room.d;
    const width = long ? room.d : room.w;
    const geometry = long
      ? new BoxGeometry(length, 0.04, width - 0.1)
      : new BoxGeometry(width - 0.1, 0.04, length);
    // Anchored at the roller, so scaling shortens it towards the roller.
    if (long) geometry.translate(length / 2, 0, 0);
    else geometry.translate(0, 0, length / 2);
    const cover = new Mesh(geometry, materials.cover);
    cover.castShadow = false;
    const rx = long ? room.x : room.x + room.w / 2;
    const rz = long ? room.z + room.d / 2 : room.z;
    cover.position.set(rx, 0.05, rz);
    if (long) cover.scale.x = 0.0001;
    else cover.scale.z = 0.0001;
    group.add(cover);
    const roller = new Mesh(new CylinderGeometry(0.22, 0.22, width + 0.3, 16), materials.metal);
    roller.castShadow = true;
    if (long) roller.rotation.x = Math.PI / 2;
    else roller.rotation.z = Math.PI / 2;
    roller.position.set(long ? rx - 0.3 : rx, 0.24, long ? rz : rz - 0.3);
    group.add(roller);
    handles.covers.set(room.id, {
      kind: "cover",
      object: cover,
      target: 0.0001,
      axis: long ? "x" : "z",
    });
  }

  // Outdoor lights stand where the plan's fixtures say — lanterns on the terrace
  // wall, uplights under the trees, bollards along the pool — one per lamp Sowel
  // reports, in the order the mapping places them. A lamp the plan did not place is
  // **not drawn**, and the derivation says so on screen. Outdoors there is no
  // ceiling to fall back to, and the fallback that used to stand a bollard on the
  // room's spot put one in the middle of the pool. They stay lit whichever storey
  // is read: the garden is never the storey out of focus.
  for (const room of rooms) {
    const count = Math.min(lampCounts[room.id] ?? 0, room.fixtures?.length ?? 0);
    const lamps: LampHandle[] = [];
    for (let i = 0; i < count; i++) {
      lamps.push(buildLamp(room.fixtures![i], plan.height, materials, group, room));
    }
    if (lamps.length > 0) handles.lamps.set(room.id, lamps);
  }

  for (const machine of plan.machines ?? []) buildMachine(machine, materials, group);
}

function buildLevel(
  plan: Plan,
  entry: LevelHandles,
  handles: HouseHandles,
  lampCounts: Record<string, number>,
  counts: Partial<Counts>,
  lang: Lang,
): void {
  const { group, materials, level } = entry;
  const { rooms, walls } = levelContents(plan, level);

  const slab = plan.levels.find((l) => l.level === level);
  if (slab) {
    for (const piece of slabPieces(slab)) {
      const floor = box(piece.w, SLAB, piece.d, materials.floor);
      group.add(at(floor, piece.x + piece.w / 2, -SLAB / 2, piece.z + piece.d / 2));
    }
  }

  // Walls reach the underside of the slab above, not merely their own height:
  // a storey's walls stopping short of the next floor is the slot of daylight
  // described in `storeyPitch`.
  const hasStoreyAbove = plan.levels.some((l) => l.level === level + 1);
  const wallTop = hasStoreyAbove ? storeyPitch(plan) : plan.height;

  for (const stair of (plan.stairs ?? []).filter((s) => s.level === level)) {
    for (const run of stair.runs) {
      for (const step of stairSteps(run)) {
        const block = box(step.w, step.y1 - step.y0, step.d, materials.step);
        group.add(at(block, step.x + step.w / 2, (step.y0 + step.y1) / 2, step.z + step.d / 2));
      }
    }
    for (const landing of stair.landings) {
      const block = box(landing.w, 0.12, landing.d, materials.step);
      group.add(at(block, landing.x + landing.w / 2, landing.y - 0.06, landing.z + landing.d / 2));
    }
  }

  for (const room of rooms) {
    handles.rooms.set(room.id, room);

    // A lamp the plan placed gets its fixture — appliques on a wall, a row of
    // spots; one it did not gets a ceiling light, spread along the room. The pools
    // of light on the floor are what shows a lamp is on: a point light in a
    // stylised room is subtle by day, and that is the first thing a visitor looks for.
    const count = lampCounts[room.id] ?? 0;
    const defaults = lampSpots(room, count, plan.height);
    const lamps: LampHandle[] = [];
    for (let i = 0; i < count; i++) {
      const fixture = room.fixtures?.[i] ?? {
        kind: "ceiling" as const,
        points: [[defaults[i][0], defaults[i][2]] as [number, number]],
      };
      lamps.push(buildLamp(fixture, plan.height, materials, group));
    }
    handles.lamps.set(room.id, lamps);

    // A sensor reads as a small sphere near the ceiling corner, and a halo round
    // it while it sees somebody. It is the only thing in the scene with no
    // physical analogue, and it earns its place by being what a visitor clicks in
    // phase 4.
    const sensor = new Mesh(new SphereGeometry(0.09, 10, 8), materials.sensorOff);
    group.add(at(sensor, room.x + 0.3, plan.height - 0.2, room.z + 0.3));
    handles.sensors.set(room.id, sensor);
    const halo = new Mesh(new SphereGeometry(0.32, 12, 10), materials.halo);
    halo.visible = false;
    group.add(at(halo, room.x + 0.3, plan.height - 0.2, room.z + 0.3));
    handles.halos.set(room.id, halo);

    for (const piece of furnitureFor(room)) {
      const block =
        piece.shape === "cylinder"
          ? new Mesh(
              new CylinderGeometry(piece.w / 2, piece.w / 2, piece.h, 18),
              materials[piece.material],
            )
          : box(piece.w, piece.h, piece.d, materials[piece.material]);
      block.castShadow = true;
      if (piece.material === "glass" || piece.material === "water") block.castShadow = false;
      group.add(at(block, piece.x + piece.w / 2, piece.y + piece.h / 2, piece.z + piece.d / 2));
    }

    // The room's name, hung over its spot under the ceiling. A legend without one.
    const label = roomSign(named(room, lang));
    if (label) {
      label.position.set(room.spot[0], plan.height - 0.55, room.spot[1]);
      group.add(label);
      entry.labels.push(label);
    }

    // Radiators on the west wall, a stove in the corner: only where Sowel has one.
    const heaters: { body: Mesh; cold: Material }[] = [];
    for (let i = 0; i < (counts.heaters?.[room.id] ?? 0); i++) {
      const body = box(0.08, 0.6, 1.0, materials.white);
      group.add(at(body, room.x + 0.13, 0.4, room.z + room.d / 2 + i * 1.3));
      heaters.push({ body, cold: materials.white });
    }
    if (counts.stoves?.includes(room.id)) {
      const stove = box(0.55, 1.1, 0.55, materials.stove);
      group.add(at(stove, room.x + 0.5, 0.55, room.z + room.d - 0.6));
      const pipe = new Mesh(new CylinderGeometry(0.06, 0.06, plan.height - 1.1, 8), materials.dark);
      group.add(at(pipe, room.x + 0.5, 1.1 + (plan.height - 1.1) / 2, room.z + room.d - 0.6));
      // The little window in its door is what glows.
      const window = box(0.3, 0.22, 0.03, materials.dark);
      group.add(at(window, room.x + 0.5, 0.55, room.z + room.d - 0.6 - 0.28));
      heaters.push({ body: window, cold: materials.dark });
    }
    if (heaters.length > 0) handles.heaters.set(room.id, heaters);
  }

  // Walls, and the windows and shutters they carry.
  for (const wall of walls) {
    for (const piece of wallPieces(wall, wallTop)) {
      const b = pieceBox(wall, piece, plan.thickness);
      group.add(at(box(b.w, b.h, b.d, materials.wall), b.x, b.y, b.z));
    }

    for (const opening of [...wall.openings].sort((a, b) => a.at - b.at)) {
      if (opening.id && (opening.kind === "door" || opening.kind === "gate")) {
        const roomId = opening.id.replace(/^(door|gate):/, "").replace(/-\d+$/, "");
        const list = handles.doors.get(roomId) ?? [];
        list.push(doorLeaf(wall, opening, plan.thickness, materials, group));
        handles.doors.set(roomId, list);
        continue;
      }
      if (opening.kind !== "window") continue;
      const gh = opening.head - opening.sill;
      const gy = (opening.head + opening.sill) / 2;
      const pane =
        wall.axis === "x"
          ? box(opening.w, gh, 0.03, materials.glass)
          : box(0.03, gh, opening.w, materials.glass);
      pane.castShadow = false;
      const paneRoom = (opening.id ?? "").replace(/^window:/, "").replace(/-\d+$/, "");
      handles.panes.set(paneRoom, [...(handles.panes.get(paneRoom) ?? []), pane]);
      group.add(
        at(
          pane,
          wall.axis === "x" ? opening.at : wall.at,
          gy,
          wall.axis === "x" ? wall.at : opening.at,
        ),
      );

      // The panel's geometry is anchored at its top edge, so scaling y downwards
      // makes it roll down from the lintel rather than grow from its middle.
      const geometry =
        wall.axis === "x"
          ? new BoxGeometry(opening.w - 0.02, gh, 0.05)
          : new BoxGeometry(0.05, gh, opening.w - 0.02);
      geometry.translate(0, -gh / 2, 0);
      const panel = new Mesh(geometry, materials.shutter);
      panel.castShadow = true;
      const offset = wall.outside ? plan.thickness / 2 + 0.04 : 0;
      const outward = wall.at <= 0 ? -1 : 1;
      panel.position.set(
        wall.axis === "x" ? opening.at : wall.at + offset * outward,
        opening.head,
        wall.axis === "x" ? wall.at + offset * outward : opening.at,
      );
      panel.scale.y = 0.0001;
      group.add(panel);

      const roomId = (opening.id ?? "").replace(/^window:/, "").replace(/-\d+$/, "");
      const list = handles.shutters.get(roomId) ?? [];
      list.push({ panel, height: gh, target: 0 });
      handles.shutters.set(roomId, list);
    }
  }
}

/**
 * A door leaf in its opening: hung on a pivot at one jamb so it swings, or hung
 * from the lintel so it lifts. Either way it starts shut, and `applyState` says
 * where it should be.
 */
function doorLeaf(
  wall: Wall,
  opening: Opening,
  thickness: number,
  materials: Materials,
  group: Group,
): DoorHandle {
  const h = opening.head - opening.sill;
  const w = opening.w - 0.04;
  const alongX = wall.axis === "x";
  const cx = alongX ? opening.at : wall.at;
  const cz = alongX ? wall.at : opening.at;

  if (opening.kind === "gate") {
    // A sectional door: anchored at the lintel and rolled up, like a shutter, only
    // the size of a car.
    const geometry = alongX
      ? new BoxGeometry(w, h, thickness * 0.4)
      : new BoxGeometry(thickness * 0.4, h, w);
    geometry.translate(0, -h / 2, 0);
    const panel = new Mesh(geometry, materials.door);
    panel.castShadow = true;
    panel.position.set(cx, opening.head, cz);
    group.add(panel);
    return { kind: "lift", object: panel, target: 1, travelS: GARAGE_DOOR_TRAVEL_S };
  }

  // A pivot at the jamb: the leaf hangs off it by half its width, so rotating the
  // pivot swings the leaf through the doorway rather than around its middle.
  const pivot = new Group();
  pivot.position.set(alongX ? cx - w / 2 : cx, opening.sill, alongX ? cz : cz - w / 2);
  const leaf = new Mesh(
    alongX ? new BoxGeometry(w, h, 0.05) : new BoxGeometry(0.05, h, w),
    materials.door,
  );
  leaf.castShadow = true;
  leaf.position.set(alongX ? w / 2 : 0, h / 2, alongX ? 0 : w / 2);
  pivot.add(leaf);
  group.add(pivot);
  return { kind: "swing", object: pivot, target: 0 };
}

/** How far a sliding gate travels: its own length, signed the way the plan says. */
function gateLength(gate: DoorHandle): number {
  return (gate.object.userData.travel as number | undefined) ?? 0;
}

/** The roofs, in a group of their own: their ghosting is not any storey's. */
function buildRoofs(plan: Plan, entry: LevelHandles): void {
  const { group, materials } = entry;
  for (const roof of plan.roofs ?? []) {
    const elevation = levelElevation(plan, roof.over);
    if (roof.kind === "flat") {
      const o = roof.overhang;
      const slab = box(roof.w + 2 * o, roof.rise, roof.d + 2 * o, materials.roof);
      group.add(
        at(slab, roof.x + roof.w / 2, elevation + plan.height + roof.rise / 2, roof.z + roof.d / 2),
      );
      continue;
    }

    const shape = gableRoof(roof, plan.height);
    const ridgeX = roof.ridge !== "z";
    for (const slope of shape.slopes) {
      const slab = box(
        ridgeX ? slope.along : slope.down,
        0.12,
        ridgeX ? slope.down : slope.along,
        materials.roof,
      );
      slab.position.set(slope.position[0], elevation + slope.position[1], slope.position[2]);
      if (ridgeX) slab.rotation.x = slope.tilt;
      else slab.rotation.z = slope.tilt;
      group.add(slab);
    }
    for (const panel of solarPanels(roof, plan.height)) {
      const module = box(
        ridgeX ? panel.along : panel.down,
        0.05,
        ridgeX ? panel.down : panel.along,
        materials.panel,
      );
      module.position.set(panel.position[0], elevation + panel.position[1], panel.position[2]);
      if (ridgeX) module.rotation.x = panel.tilt;
      else module.rotation.z = panel.tilt;
      group.add(module);
    }
    for (const gable of shape.gables) {
      // The triangle is drawn in the plane across the ridge and stood up on the
      // wall line; a shape's own plane is xy, so the extrusion runs along the
      // ridge and the rotation puts it there.
      const outline = new Shape();
      gable.points.forEach(([across, y], i) =>
        i === 0 ? outline.moveTo(across, y) : outline.lineTo(across, y),
      );
      const geometry = new ExtrudeGeometry(outline, { depth: plan.thickness, bevelEnabled: false });
      const end = new Mesh(geometry, materials.wall);
      end.castShadow = true;
      end.receiveShadow = true;
      if (ridgeX) {
        // Shape x → world z, extrusion → world x.
        end.rotation.y = -Math.PI / 2;
        end.position.set(gable.at + plan.thickness / 2, elevation, 0);
      } else {
        end.position.set(0, elevation, gable.at - plan.thickness / 2);
      }
      group.add(end);
    }
  }
}

/**
 * Which storey is being read, and which are context.
 *
 * Mutation only: the ghosting lives in each storey's own materials, so switching
 * floors touches a dozen materials rather than rebuilding seventeen hundred meshes.
 * A ghosted storey also stops casting shadows and stops lighting the room — its
 * lamp shades keep their colour, which is the part worth seeing from below.
 */
export function focusLevel(handles: HouseHandles, focus: Focus): void {
  const outside = focus === "outside";
  for (const [id, entry] of handles.levels) {
    const solid = outside || id === focus;
    setGhost(entry.materials, !solid);
    for (const label of entry.labels) label.material.opacity = solid ? 0.95 : 0.08;
    entry.group.traverse((object) => {
      if (object instanceof Mesh) object.castShadow = solid;
    });
  }
  if (handles.roof) {
    // The roof is the postcard and the lid: on from outside, glass from within.
    setGhost(handles.roof.materials, !outside);
    handles.roof.group.traverse((object) => {
      if (object instanceof Mesh) object.castShadow = outside;
    });
  }
  // The garden turns to glass only when the storey in focus is under it — otherwise
  // the cellar is a room you are told about and never shown. The lawn stops casting
  // with it: a cellar lit through a transparent lawn that still throws the lawn's
  // shadow is a cellar in the dark, which is what the first attempt looked like.
  const underground = typeof focus === "number" && focus < 0;
  setGhost(handles.outdoor.materials, underground);
  handles.outdoor.group.traverse((object) => {
    if (object instanceof Mesh) object.castShadow = !underground;
  });

  for (const [roomId, lamps] of handles.lamps) {
    const level = handles.rooms.get(roomId)?.level ?? null;
    const on = outside || level === null || level === focus;
    for (const lamp of lamps) lamp.light.visible = on;
  }
}

/**
 * Add a figure per person, reusing one that already exists.
 *
 * A figure seen for the first time is **placed**; one that already exists keeps its
 * position and is walked there by the renderer's easing. Otherwise somebody who has
 * just appeared slides across the house from the origin.
 */
export function syncPeople(
  handles: HouseHandles,
  state: SceneState,
  plan: Plan,
  materials: Materials,
): void {
  for (const entry of state.people) {
    let figure = handles.people.get(entry.id);
    const isNew = !figure;
    if (!figure) {
      figure = person(materials);
      handles.people.set(entry.id, figure);
      handles.root.add(figure);
    }
    const room = entry.room ? handles.rooms.get(entry.room) : undefined;
    const spot = room ? room.spot : plan.awaySpot;
    figure.visible = entry.room !== null;
    // Height is set outright, never eased: somebody going upstairs should appear
    // upstairs, not glide up through the ceiling.
    figure.position.y = levelElevation(plan, room?.level ?? null);
    if (isNew) figure.position.set(spot[0], figure.position.y, spot[1]);
  }
  // Somebody Sowel has stopped reporting stops being drawn.
  for (const [id, figure] of handles.people) {
    if (!state.people.some((p) => p.id === id)) figure.visible = false;
  }
}

/**
 * Push the current state onto the graph. Mutates; builds nothing.
 *
 * @param immediate snap what moves to its target instead of letting the renderer
 * walk it there. True for the first state after a build — a freshly opened scene
 * should already be right rather than sliding into place — and false afterwards,
 * which is what makes a shutter slide at all.
 */
export function applyState(
  handles: HouseHandles,
  state: SceneState,
  materials: Materials,
  immediate = false,
): void {
  for (const [roomId, lamps] of handles.lamps) {
    const room = state.rooms[roomId];
    lamps.forEach((lamp, i) => {
      const lit = room?.lamps[i];
      const on = lit?.on ?? false;
      lamp.light.intensity = on ? lamp.power * Math.max(0.15, lit?.brightness ?? 1) : 0;
      for (const shade of lamp.shades) shade.material = on ? materials.shadeOn : materials.shadeOff;
      for (const glow of lamp.glow) glow.visible = on;
    });
  }

  for (const [roomId, halo] of handles.halos) {
    halo.visible = state.rooms[roomId]?.motion ?? false;
  }

  for (const [roomId, heaters] of handles.heaters) {
    const warm = state.rooms[roomId]?.heating ?? false;
    const level = handles.rooms.get(roomId)?.level ?? null;
    // The storey's own warm, so a radiator glowing upstairs ghosts with upstairs.
    const own =
      (level === null ? undefined : handles.levels.get(level)?.materials.warm) ?? materials.warm;
    for (const heater of heaters) heater.body.material = warm ? own : heater.cold;
  }

  for (const [id, gate] of handles.gates) {
    const open = state.garden.gates[id] ?? false;
    // Slid its own length along the fence, the way the plan says.
    gate.target = open ? gateLength(gate) : 0;
    if (immediate && gate.axis) gate.object.position[gate.axis] = (gate.home ?? 0) + gate.target;
  }

  for (const [roomId, cover] of handles.covers) {
    const position = state.rooms[roomId]?.cover ?? null;
    cover.target = Math.max(0.0001, shutterDrop(position));
    if (immediate) cover.object.scale[cover.axis ?? "x"] = cover.target;
  }

  for (const [group, jets] of handles.watering) {
    const on = state.garden.watering[group] ?? false;
    for (const jet of jets) jet.visible = on;
  }

  for (const [roomId, shutters] of handles.shutters) {
    const room = state.rooms[roomId];
    shutters.forEach((shutter, i) => {
      // Never exactly zero: a zero scale makes the matrix singular and Three.js
      // warns about it on every frame.
      shutter.target = Math.max(0.0001, shutterDrop(room?.shutters[i] ?? null));
      if (immediate) shutter.panel.scale.y = shutter.target;
    });
  }

  for (const [roomId, sensor] of handles.sensors) {
    sensor.material = state.rooms[roomId]?.motion ? materials.sensorOn : materials.sensorOff;
  }

  // A lit room glows through its windows. Seen from outside at night that is the
  // whole house: without it the postcard is a dark box with a status line saying
  // three lights are on somewhere.
  for (const [roomId, panes] of handles.panes) {
    const lit = state.rooms[roomId]?.lamps.some((l) => l.on) ?? false;
    const level = handles.rooms.get(roomId)?.level ?? null;
    const own = level === null ? handles.outdoor.materials : handles.levels.get(level)?.materials;
    for (const pane of panes)
      pane.material = lit ? materials.glassLit : (own?.glass ?? materials.glass);
  }

  for (const [roomId, doors] of handles.doors) {
    const room = state.rooms[roomId];
    doors.forEach((door, i) => {
      const open = room?.doors[i] ?? false;
      door.target =
        door.kind === "swing" ? (open ? SWING_OPEN_RAD : 0) : open ? LIFT_OPEN_SCALE : 1;
      if (immediate) {
        if (door.kind === "swing") door.object.rotation.y = door.target;
        else door.object.scale.y = door.target;
      }
    });
  }
}
