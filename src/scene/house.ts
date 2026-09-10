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
  Group,
  Mesh,
  PointLight,
  SphereGeometry,
  type Material,
} from "three";
import type { Plan, Room } from "../plan/types.ts";
import type { SceneState } from "../state/scene-state.ts";
import { lampSpots, levelContents, pieceBox, shutterDrop, wallPieces } from "./geometry.ts";
import type { Materials } from "./materials.ts";

/** What the scene keeps hold of so it can be updated without being rebuilt. */
export interface HouseHandles {
  root: Group;
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
  /** Which storey to show. The outdoors is always shown with it. */
  level: number;
  /** Lamp counts per room, so the right number of lights exist from the start. */
  lampCounts: Record<string, number>;
}

export function buildHouse(options: BuildHouseOptions): HouseHandles {
  const { plan, materials, level, lampCounts } = options;
  const root = new Group();
  const handles: HouseHandles = {
    root,
    lamps: new Map(),
    shutters: new Map(),
    sensors: new Map(),
    people: new Map(),
    rooms: new Map(),
  };

  const { rooms, walls } = levelContents(plan, level);

  // The ground first, so everything else sits on it.
  const ground = rooms.find((r) => r.ground);
  if (ground) {
    const slab = box(ground.w, 0.1, ground.d, materials.ground);
    root.add(at(slab, ground.x + ground.w / 2, -0.05, ground.z + ground.d / 2));
  }

  const slab = plan.levels.find((l) => l.level === level);
  if (slab) {
    const floor = box(slab.w, 0.08, slab.d, materials.floor);
    root.add(at(floor, slab.x + slab.w / 2, -0.04, slab.z + slab.d / 2));
  }

  for (const room of rooms) {
    handles.rooms.set(room.id, room);
    if (room.ground) continue;

    // The pool is water; every other outdoor room is a patch of a different ground.
    if (room.level === null) {
      const material = room.id === "piscine" ? materials.water : materials.floor;
      const patch = box(room.w, 0.06, room.d, material);
      root.add(at(patch, room.x + room.w / 2, 0.01, room.z + room.d / 2));
      continue;
    }

    const lamps: { light: PointLight; shade: Mesh }[] = [];
    for (const [x, y, z] of lampSpots(room, lampCounts[room.id] ?? 0, plan.height)) {
      const shade = new Mesh(new SphereGeometry(0.13, 12, 10), materials.shadeOff);
      root.add(at(shade, x, y, z));
      // Shadows are off by default: seventeen shadow-casting lights is what costs a
      // phone its frame rate. The renderer turns them on for the level in view.
      const light = new PointLight(0xffd9a0, 0, 6.5);
      light.castShadow = false;
      light.position.set(x, y - 0.1, z);
      root.add(light);
      lamps.push({ light, shade });
    }
    handles.lamps.set(room.id, lamps);

    // A sensor reads as a small disc near the ceiling corner; it is the only thing
    // in the scene with no physical analogue, and it earns its place by being what
    // a visitor clicks in phase 4.
    const sensor = new Mesh(new SphereGeometry(0.07, 8, 6), materials.sensorOff);
    root.add(at(sensor, room.x + 0.3, plan.height - 0.2, room.z + 0.3));
    handles.sensors.set(room.id, sensor);
  }

  // Walls, and the windows and shutters they carry.
  const shuttersByRoom = new Map<string, { panel: Mesh; height: number; target: number }[]>();
  for (const wall of walls) {
    for (const piece of wallPieces(wall, plan.height)) {
      const b = pieceBox(wall, piece, plan.thickness);
      root.add(at(box(b.w, b.h, b.d, materials.wall), b.x, b.y, b.z));
    }

    for (const opening of [...wall.openings].sort((a, b) => a.at - b.at)) {
      if (opening.kind !== "window") continue;
      const gh = opening.head - opening.sill;
      const gy = (opening.head + opening.sill) / 2;
      const pane =
        wall.axis === "x"
          ? box(opening.w, gh, 0.03, materials.glass)
          : box(0.03, gh, opening.w, materials.glass);
      pane.castShadow = false;
      root.add(
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
      root.add(panel);

      const roomId = (opening.id ?? "").replace(/^window:/, "").replace(/-\d+$/, "");
      const list = shuttersByRoom.get(roomId) ?? [];
      list.push({ panel, height: gh, target: 0 });
      shuttersByRoom.set(roomId, list);
    }
  }
  handles.shutters = shuttersByRoom;

  return handles;
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
    if (isNew) figure.position.set(spot[0], 0, spot[1]);
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
}
