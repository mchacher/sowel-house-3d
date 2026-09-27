/**
 * The sun in the sky, its path, and the cardinal points (spec 004).
 *
 * The sun sits on a dome around the plot, past the farthest the camera can stand
 * (`maxDistance`), so it can never pass between the camera and the house. Its path is
 * today's arc on the same dome, dotted, with the part already travelled drawn
 * stronger. The same `SunPosition` puts the light, this sun and the HUD's dial where
 * they are: one sun, three uses.
 *
 * None of it casts or takes shadows, and none of it is ghosted with a storey: the
 * sky is not a storey.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from "three";
import type { Plan } from "../plan/types.ts";
import type { SkyState } from "../state/scene-state.ts";
import { sunPath } from "../state/sun.ts";
import { sunDirection } from "./geometry.ts";

/** Past the camera's `maxDistance` (120 m), inside its far plane. */
export const SKY_RADIUS = 160;
const SUN_RADIUS = 4.5;
const HIGH = new Color(0xfff1b8);
const LOW = new Color(0xffa24a);

export interface SkyHandle {
  group: Group;
  sun: Mesh;
  halo: Sprite | null;
  /** Today's arc, dotted, and the part already travelled. */
  path: Line;
  travelled: Line;
  /** The sunrise and sunset the path was drawn for. */
  drawnFor: string;
  centre: { x: number; z: number };
}

function onDome(
  centre: { x: number; z: number },
  elevationDeg: number,
  azimuthDeg: number,
): [number, number, number] {
  const d = sunDirection(elevationDeg, azimuthDeg);
  return [centre.x + d.x * SKY_RADIUS, d.y * SKY_RADIUS, centre.z + d.z * SKY_RADIUS];
}

/** A soft round glow, drawn once. Null where there is no canvas (tests). */
function glow(): SpriteMaterial | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255, 230, 170, 0.75)");
  g.addColorStop(0.3, "rgba(255, 205, 120, 0.25)");
  g.addColorStop(1, "rgba(255, 190, 100, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new SpriteMaterial({
    map: new CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
    // Straight to the screen: tone-mapped, the sun came out a dull beige.
    toneMapped: false,
  });
}

/** Where the plot is: the ground room, or the storeys' extent. */
export function plotOf(plan: Plan): { x: number; z: number; w: number; d: number } {
  const ground = plan.rooms.find((r) => r.ground);
  if (ground) return { x: ground.x, z: ground.z, w: ground.w, d: ground.d };
  const xs = plan.levels.flatMap((l) => [l.x, l.x + l.w]);
  const zs = plan.levels.flatMap((l) => [l.z, l.z + l.d]);
  return {
    x: Math.min(...xs),
    z: Math.min(...zs),
    w: Math.max(...xs) - Math.min(...xs),
    d: Math.max(...zs) - Math.min(...zs),
  };
}

export function buildSky(plan: Plan): SkyHandle {
  const plot = plotOf(plan);
  const centre = { x: plot.x + plot.w / 2, z: plot.z + plot.d / 2 };
  const group = new Group();
  group.name = "sky";

  const sun = new Mesh(
    new SphereGeometry(SUN_RADIUS, 24, 16),
    new MeshBasicMaterial({ color: HIGH, fog: false, toneMapped: false }),
  );
  sun.visible = false;
  group.add(sun);

  const haloMaterial = glow();
  const halo = haloMaterial ? new Sprite(haloMaterial) : null;
  if (halo) {
    halo.scale.set(SUN_RADIUS * 6, SUN_RADIUS * 6, 1);
    halo.visible = false;
    group.add(halo);
  }

  const path = new Line(
    new BufferGeometry(),
    new LineDashedMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      dashSize: 3,
      gapSize: 3,
      fog: false,
    }),
  );
  const travelled = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.7, fog: false }),
  );
  path.visible = travelled.visible = false;
  group.add(path, travelled);

  return { group, sun, halo, path, travelled, drawnFor: "", centre };
}

/** Put the sun where the state says, and redraw the path when the day changes. */
export function placeSky(handle: SkyHandle, sky: SkyState): void {
  const key = `${sky.sunrise}|${sky.sunset}`;
  if (key !== handle.drawnFor) {
    handle.drawnFor = key;
    const points = sunPath(sky.sunrise, sky.sunset).flatMap((p) =>
      onDome(handle.centre, p.elevationDeg, p.azimuthDeg),
    );
    for (const line of [handle.path, handle.travelled]) {
      line.geometry.dispose();
      line.geometry = new BufferGeometry();
      line.geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
    }
    handle.path.computeLineDistances();
  }

  const segments = (handle.path.geometry.getAttribute("position")?.count ?? 0) - 1;
  const up = sky.elevationDeg > 0;
  handle.path.visible = segments > 0 && sky.dayFraction !== null;
  handle.travelled.visible = handle.path.visible;
  if (sky.dayFraction !== null && segments > 0) {
    handle.travelled.geometry.setDrawRange(0, Math.floor(sky.dayFraction * segments) + 1);
  }

  handle.sun.visible = up;
  if (handle.halo) handle.halo.visible = up;
  if (!up) return;
  const [x, y, z] = onDome(handle.centre, sky.elevationDeg, sky.azimuthDeg);
  handle.sun.position.set(x, y, z);
  handle.halo?.position.set(x, y, z);
  // Warmer and larger near the horizon, white higher up.
  const low = Math.max(0, 1 - sky.elevationDeg / 15);
  (handle.sun.material as MeshBasicMaterial).color.copy(HIGH).lerp(LOW, low);
  handle.sun.scale.setScalar(1 + 0.4 * low);
}

/** N, E, S and W on the ground, just outside the plot. Empty where there is no canvas. */
export function buildCompass(plan: Plan, letters: Record<"N" | "E" | "S" | "W", string>): Group {
  const group = new Group();
  group.name = "compass";
  if (typeof document === "undefined") return group;
  const plot = plotOf(plan);
  const cx = plot.x + plot.w / 2;
  const cz = plot.z + plot.d / 2;
  const margin = 2.2;
  // North is −z, as `sunDirection` lays the scene out.
  const at: Record<"N" | "E" | "S" | "W", [number, number]> = {
    N: [cx, plot.z - margin],
    S: [cx, plot.z + plot.d + margin],
    E: [plot.x + plot.w + margin, cz],
    W: [plot.x - margin, cz],
  };
  for (const side of ["N", "E", "S", "W"] as const) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.font = "700 88px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(26, 79, 110, 0.9)";
    ctx.strokeText(letters[side], 64, 68);
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillText(letters[side], 64, 68);
    const sprite = new Sprite(
      new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false }),
    );
    sprite.scale.set(1.6, 1.6, 1);
    sprite.position.set(at[side][0], 0.9, at[side][1]);
    group.add(sprite);
  }
  return group;
}
