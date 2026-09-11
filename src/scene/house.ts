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
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Object3D,
  PointLight,
  Shape,
  SphereGeometry,
  type Material,
} from "three";
import type { Opening, Plan, Room, Wall } from "../plan/types.ts";
import type { SceneState } from "../state/scene-state.ts";
import {
  gableRoof,
  lampSpots,
  levelContents,
  levelElevation,
  outdoorRooms,
  pieceBox,
  shutterDrop,
  slabPieces,
  stairSteps,
  wallPieces,
} from "./geometry.ts";
import { copyMaterials, setGhost, type Materials } from "./materials.ts";

/** One storey: its own group, at its own height, with its own structural materials. */
export interface LevelHandles {
  level: number;
  group: Group;
  materials: Materials;
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
  kind: "swing" | "lift";
  object: Object3D;
  target: number;
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
  lamps: Map<string, { light: PointLight; shade: Mesh }[]>;
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
}

export function buildHouse(options: BuildHouseOptions): HouseHandles {
  const { plan, materials, level, lampCounts } = options;
  const root = new Group();

  // The garden is built once, beside the storeys rather than inside each of them.
  const outdoor: LevelHandles = {
    level: 0,
    group: new Group(),
    materials: copyMaterials(materials),
  };
  root.add(outdoor.group);

  const handles: HouseHandles = {
    root,
    levels: new Map(),
    outdoor,
    lamps: new Map(),
    shutters: new Map(),
    sensors: new Map(),
    panes: new Map(),
    doors: new Map(),
    roof: null,
    people: new Map(),
    rooms: new Map(),
  };

  buildOutdoors(plan, outdoor, handles);

  // Every storey, at its own height. Showing one at a time was a way of not solving
  // the occlusion: a house is four floors and a visitor asking what is upstairs
  // should not have to leave the room they are looking at to find out.
  for (const slab of plan.levels) {
    const entry: LevelHandles = {
      level: slab.level,
      group: new Group(),
      materials: copyMaterials(materials),
    };
    entry.group.position.y = levelElevation(plan, slab.level);
    root.add(entry.group);
    handles.levels.set(slab.level, entry);
    buildLevel(plan, entry, handles, lampCounts);
  }

  if ((plan.roofs ?? []).length > 0) {
    const roof: LevelHandles = {
      level: 0,
      group: new Group(),
      materials: copyMaterials(materials),
    };
    root.add(roof.group);
    handles.roof = roof;
    buildRoofs(plan, roof);
  }

  focusLevel(handles, level);
  return handles;
}

/** The ground and the patches on it. Heights are staggered on purpose — see below. */
function buildOutdoors(plan: Plan, entry: LevelHandles, handles: HouseHandles): void {
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
}

function buildLevel(
  plan: Plan,
  entry: LevelHandles,
  handles: HouseHandles,
  lampCounts: Record<string, number>,
): void {
  const { group, materials, level } = entry;
  const { rooms, walls } = levelContents(plan, level);

  const slab = plan.levels.find((l) => l.level === level);
  if (slab) {
    for (const piece of slabPieces(slab)) {
      const floor = box(piece.w, 0.08, piece.d, materials.floor);
      group.add(at(floor, piece.x + piece.w / 2, -0.04, piece.z + piece.d / 2));
    }
  }

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

    const lamps: { light: PointLight; shade: Mesh }[] = [];
    for (const [x, y, z] of lampSpots(room, lampCounts[room.id] ?? 0, plan.height)) {
      const shade = new Mesh(new SphereGeometry(0.13, 12, 10), materials.shadeOff);
      group.add(at(shade, x, y, z));
      // Shadows are off by default: seventeen shadow-casting lights is what costs a
      // phone its frame rate. The renderer turns them on for the level in view.
      const light = new PointLight(0xffd9a0, 0, 6.5);
      light.castShadow = false;
      light.position.set(x, y - 0.1, z);
      group.add(light);
      lamps.push({ light, shade });
    }
    handles.lamps.set(room.id, lamps);

    // A sensor reads as a small disc near the ceiling corner; it is the only thing
    // in the scene with no physical analogue, and it earns its place by being what
    // a visitor clicks in phase 4.
    const sensor = new Mesh(new SphereGeometry(0.07, 8, 6), materials.sensorOff);
    group.add(at(sensor, room.x + 0.3, plan.height - 0.2, room.z + 0.3));
    handles.sensors.set(room.id, sensor);
  }

  // Walls, and the windows and shutters they carry.
  for (const wall of walls) {
    for (const piece of wallPieces(wall, plan.height)) {
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
    return { kind: "lift", object: panel, target: 1 };
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
    const on = outside || handles.rooms.get(roomId)?.level === focus;
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
      lamp.light.intensity = on ? 2.2 * Math.max(0.15, lit?.brightness ?? 1) : 0;
      lamp.shade.material = on ? materials.shadeOn : materials.shadeOff;
    });
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
