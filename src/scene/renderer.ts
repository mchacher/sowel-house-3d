/**
 * The renderer: a canvas, a camera, a sun and a loop.
 *
 * **This file is the untested tier**, deliberately and by itself. Everything it
 * calls — the geometry, the scene graph, the state — is exercised in node; what is
 * left here is WebGL, a camera, and whether the result is pleasant, which is a
 * person's judgement. Keeping that in one thin file is what makes the boundary
 * honest rather than nominal.
 */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  PCFSoftShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Plan } from "../plan/types.ts";
import type { SceneState } from "../state/scene-state.ts";
import { cameraFor, levelElevation, roofRise, stackHeight, sunDirection } from "./geometry.ts";
import {
  applyState,
  buildHouse,
  focusLevel,
  syncPeople,
  LIFT_OPEN_SCALE,
  animateWater,
  setDrop,
  type Counts,
  type DoorHandle,
  type Focus,
  type HouseHandles,
} from "./house.ts";
import { makeMaterials, PALETTE, type Materials } from "./materials.ts";
import { buildCompass, buildSky, placeSky, type SkyHandle } from "./sky.ts";
import { buildVisitor, pose, type VisitorFigure } from "./visitor.ts";
import { Walk } from "./walk.ts";
import { focusAt, route } from "../plan/path.ts";
import type { Lang } from "../i18n.ts";

/** How fast a shutter and a figure catch up with what Sowel said, per second. */
const EASE_PER_SECOND = 3.5;
/** How close the vignette's overview stands, against the full view's framing. */
export const MINI_CLOSENESS = 0.68;

type View = { position: [number, number, number]; target: [number, number, number] };

/**
 * One step of a motorised travel: at the constant speed that crosses `span` in
 * `travelS`, never past the goal. Without a travel time, the first-order easing
 * everything else uses.
 */
function travel(
  from: number,
  goal: number,
  span: number,
  travelS: number | undefined,
  dt: number,
  k: number,
): number {
  if (!travelS) return from + (goal - from) * k;
  const step = (span / travelS) * dt;
  const gap = goal - from;
  return Math.abs(gap) <= step ? goal : from + Math.sign(gap) * step;
}
export class HouseRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly plan: Plan;
  private readonly materials: Materials;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly sun: DirectionalLight;
  private readonly controls: OrbitControls;
  private readonly target = new Vector3();
  private handles: HouseHandles | null = null;
  private level: Focus;
  private lampCounts: Record<string, number> = {};
  private counts: Partial<Counts> = {};
  private lang: Lang = "fr";
  private sky: SkyHandle | null = null;
  /** The visitor's figure and where it is walking (spec 005). */
  private visitor: VisitorFigure | null = null;
  private walk: Walk | null = null;
  private visitorRoom: string | null = null;
  /** Told each room the figure walks into — the app moves the visitor's ghost there. */
  onVisitorEnter: ((room: string) => void) | null = null;
  /** Whether the view follows the figure (spec 005, FR4): during a walk, until the visitor picks a storey. */
  private following = false;
  /** Told when the view changed storey to follow the figure, so the HUD's buttons agree. */
  onFollow: ((focus: Focus) => void) | null = null;
  private compass: Group | null = null;
  private state: SceneState | null = null;
  private frame = 0;
  /** Seconds since start, for what cycles on its own: the pools' water. */
  private time = 0;
  private last = 0;
  /**
   * How close the view from outside stands, 1 being the full view's framing. The
   * vignette is a few hundred pixels wide, and at the full framing the house was a
   * postage stamp in the middle of the sky.
   */
  private closeness: number;

  constructor(
    canvas: HTMLCanvasElement,
    plan: Plan,
    level: Focus = 0,
    lang: Lang = "fr",
    closeness = 1,
  ) {
    this.canvas = canvas;
    this.plan = plan;
    this.closeness = closeness;
    this.level = level;
    this.lang = lang;
    this.materials = makeMaterials();

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;

    this.scene = new Scene();
    this.scene.background = new Color(PALETTE.light);

    // 0.5…250, not 0.1…400.
    //
    // Depth precision is spent near the near plane: a ratio of 4000 leaves so
    // little of it at house distance that surfaces a few millimetres apart swap
    // order as the camera moves, which is what "glitches while zooming" is. The
    // geometry fix is to stop putting surfaces in the same plane; this is the other
    // half, and the near plane costs nothing because the camera cannot come closer
    // than three metres anyway.
    // Far enough for the sun on its dome (`SKY_RADIUS`) with the camera pulled back.
    this.camera = new PerspectiveCamera(42, 1, 0.5, 400);

    // Orbit, zoom and pan. Without these the scene is a photograph: the first thing
    // anyone does with a 3D house is try to turn it round, and a view that refuses
    // reads as broken rather than as read-only.
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 120;
    // Never below the floor: an under-the-house view is disorienting and shows the
    // undersides of everything.
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.zoomSpeed = 0.8;
    this.controls.rotateSpeed = 0.6;
    // Three lights and no more: a sun that casts, a sky that fills, and a floor
    // bounce. Anything further is post-processing a phone cannot afford.
    this.sun = new DirectionalLight(0xfff2dc, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 110;
    // Four storeys stacked are eleven metres tall; a frustum cut for one clips the roof.
    const extent = 26;
    Object.assign(this.sun.shadow.camera, {
      left: -extent,
      right: extent,
      top: extent,
      bottom: -extent,
    });
    this.scene.add(this.sun);
    this.scene.add(new HemisphereLight(0xbfe0f5, PALETTE.ground, 0.55));
    this.scene.add(new AmbientLight(0xffffff, 0.18));
  }

  /** Counts come from the derivation, so the graph is built with the right ones. */
  setLampCounts(counts: Record<string, number>, rest: Partial<Counts> = {}): void {
    this.lampCounts = counts;
    this.counts = rest;
    this.rebuild();
  }

  /** The signs are drawn at build time, so a new language is a rebuild. Rare. */
  setLang(lang: Lang): void {
    if (lang === this.lang) return;
    this.lang = lang;
    if (this.handles) this.rebuild();
  }

  /**
   * Which storey is solid. `reframe` moves the camera to that storey's framing, as a
   * visitor's click on a storey does; following the walking figure does not — only
   * the ghosting changes, the camera stays where the visitor put it.
   */
  setLevel(level: Focus, reframe = true): void {
    if (level === this.level) return;
    this.level = level;
    // Every storey is already built and standing. Switching floors is a change of
    // which one is solid, not a change of what exists.
    if (this.handles) focusLevel(this.handles, level);
    if (reframe) this.frameLevel();
  }

  /** Switch between the vignette and the vignette opened full screen: the framing from outside. */
  setMini(mini: boolean): void {
    this.closeness = mini ? MINI_CLOSENESS : 1;
  }

  /** Where the visitor's figure is, or null when it is not in the house. */
  get visitorAt(): string | null {
    return this.visitorRoom;
  }

  /**
   * Walk the visitor's figure to a room, or `away` to leave (spec 005, FR2): from
   * where it stands, or from the street when it is not in the house yet. A new walk
   * while walking turns round from where it is.
   */
  walkTo(room: string): boolean {
    // From where the figure stands, or from the street when it is not in the house.
    const here = this.visitor?.root.visible ? this.visitor.root.position : null;
    const from = here ? { x: here.x, y: here.y, z: here.z } : "away";
    const points = route(this.plan, from, room);
    if (!points) return false;
    if (!this.visitor) {
      this.visitor = buildVisitor();
      this.scene.add(this.visitor.root);
    }
    this.visitor.root.visible = true;
    const start = points[0];
    this.visitor.root.position.set(start.x, start.y, start.z);
    this.walk = new Walk(points);
    this.following = true;
    return true;
  }

  /** The visitor picked a storey: the view stops following the figure until the next walk. */
  stopFollowing(): void {
    this.following = false;
  }

  get currentLevel(): Focus {
    return this.level;
  }

  update(state: SceneState): void {
    const first = this.state === null;
    this.state = state;
    if (!this.handles) return;
    // The first state after a build snaps: a freshly opened scene should already be
    // right rather than sliding into place from nowhere.
    applyState(this.handles, state, this.materials, first);
    syncPeople(this.handles, state, this.plan, this.materials);
    this.placeSun(state);
  }

  private rebuild(): void {
    if (this.handles) this.scene.remove(this.handles.root);
    if (this.sky) this.scene.remove(this.sky.group);
    if (this.compass) this.scene.remove(this.compass);
    this.sky = buildSky(this.plan);
    this.compass = buildCompass(
      this.plan,
      this.lang === "fr" ? { N: "N", E: "E", S: "S", W: "O" } : { N: "N", E: "E", S: "S", W: "W" },
    );
    this.scene.add(this.sky.group, this.compass);
    this.handles = buildHouse({
      plan: this.plan,
      materials: this.materials,
      level: this.level,
      lampCounts: this.lampCounts,
      counts: this.counts,
      lang: this.lang,
    });
    this.scene.add(this.handles.root);
    if (this.state) {
      // A rebuild is a new graph, so it snaps too — switching storey should not
      // show every shutter rolling down.
      applyState(this.handles, this.state, this.materials, true);
      syncPeople(this.handles, this.state, this.plan, this.materials);
      this.placeSun(this.state);
    }

    this.frameLevel();
  }

  /** Put the camera back where a level is framed. Also what the HUD's reset calls. */
  frameLevel(): void {
    const view = this.viewFor(this.level);
    this.camera.position.set(...view.position);
    this.target.set(...view.target);
    this.controls.target.copy(this.target);
    this.controls.update();
  }

  private viewFor(level: Focus): View {
    const lowest = Math.min(...this.plan.levels.map((l) => l.level));
    // From outside the house is framed as a whole, roof included, read from its
    // ground floor; a storey is framed at its own height.
    const slab =
      level === "outside"
        ? (this.plan.levels.find((l) => l.level === lowest) ?? this.plan.levels[0])
        : (this.plan.levels.find((l) => l.level === level) ?? this.plan.levels[0]);
    // The footprint framed is the storey's body and its wings together: framing the
    // body alone left the garage half off the right of the screen.
    const rects = [slab, ...(slab.parts ?? [])];
    const x0 = Math.min(...rects.map((r) => r.x));
    const z0 = Math.min(...rects.map((r) => r.z));
    const x1 = Math.max(...rects.map((r) => r.x + r.w));
    const z1 = Math.max(...rects.map((r) => r.z + r.d));
    // From outside the grounds are the picture, not just the walls: a margin of
    // garden round the footprint, or the gate and the beds sit on the screen's edge.
    const margin = level === "outside" ? 4.5 : 0;
    const footprint = {
      ...slab,
      x: x0 - margin,
      z: z0 - margin,
      w: x1 - x0 + 2 * margin,
      d: z1 - z0 + 2 * margin,
    };
    const view = cameraFor({
      level: footprint,
      height: this.plan.height,
      aspect: this.aspect(),
      elevation: levelElevation(this.plan, slab.level),
      stack: stackHeight(this.plan) + roofRise(this.plan),
      lowest: levelElevation(this.plan, lowest),
    });
    if (level !== "outside" || this.closeness === 1) return view;
    const [tx, ty, tz] = view.target;
    const k = this.closeness;
    return {
      target: view.target,
      position: [
        tx + (view.position[0] - tx) * k,
        ty + (view.position[1] - ty) * k,
        tz + (view.position[2] - tz) * k,
      ],
    };
  }

  private placeSun(state: SceneState): void {
    const d = sunDirection(state.sky.elevationDeg, state.sky.azimuthDeg);
    const distance = 40;
    this.sun.position.set(d.x * distance, Math.max(2, d.y * distance), d.z * distance);
    // The framed centre, not the orbit target: panning the camera must not swing
    // the sun across the house.
    this.sun.target.position.copy(this.target);
    this.sun.target.updateMatrixWorld();

    // Lit by the sun's height, **not** by `isDaylight`.
    //
    // That flag carries the home's `sunriseOffset` and `sunsetOffset` — thirty and
    // forty-five minutes in the showroom — because it exists to tell a recipe when
    // to treat the day as begun, not to describe the sky. Keying the scene off it
    // would leave the house dark for half an hour after a visible sunrise and dark
    // it three quarters of an hour before dusk. The elevation comes from the raw
    // sunrise and sunset, so the sky follows the sun and the flag stays what it is.
    //
    // Cloud flattens the sun rather than dimming it away: an overcast noon is still
    // bright, just shadowless.
    const daylight = state.sky.elevationDeg > 0;
    const clearness = state.sky.clearness;
    this.sun.intensity = daylight ? 0.5 + 1.4 * clearness : 0;
    this.sun.castShadow = daylight && clearness > 0.35;

    const dusk = new Color(0xf3d9bd);
    const day = new Color(PALETTE.light).lerp(new Color(0xbfe0f5), 1 - clearness);
    const night = new Color(0x16323f);
    const sky = daylight
      ? day.clone().lerp(dusk, Math.max(0, 1 - state.sky.elevationDeg / 22))
      : night;
    (this.scene.background as Color).copy(sky);
    if (this.sky) placeSky(this.sky, state.sky);
  }

  private aspect(): number {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    return w / h;
  }

  resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    this.resize();
    if (!this.handles) this.rebuild();
    this.last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.ease(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.controls.dispose();
    this.renderer.dispose();
  }

  /**
   * Move what is in flight towards what Sowel said, and never past it.
   *
   * `applyState` sets the targets; this walks the scene towards them so a shutter
   * slides and a figure drifts instead of teleporting. The easing is first-order, so
   * it cannot overshoot — the scene is always somewhere Sowel has actually been.
   */
  private stepVisitor(dt: number): void {
    if (!this.walk || !this.visitor) return;
    const step = this.walk.step(dt);
    const figure = this.visitor;
    figure.root.position.set(...step.position);
    figure.root.rotation.y = step.heading;
    pose(figure, step.distance, !step.done);
    for (const room of step.entered) {
      this.visitorRoom = room === "away" ? null : room;
      this.onVisitorEnter?.(room);
    }
    if (this.following) {
      const focus = focusAt(this.plan, this.visitorRoom, step.position[1]);
      if (focus !== this.currentLevel) {
        this.setLevel(focus, false);
        this.onFollow?.(focus);
      }
    }
    if (step.done) {
      this.walk = null;
      this.following = false;
      if (this.visitorRoom === null) figure.root.visible = false;
    }
  }

  private ease(dt: number): void {
    if (!this.handles) return;
    const k = 1 - Math.exp(-EASE_PER_SECOND * dt);
    // A pool cover is a shutter lying down, and follows the position Sowel reports
    // as it rolls, so the easing only smooths between readings.
    for (const shutter of [
      ...[...this.handles.shutters.values()].flat(),
      ...this.handles.covers.values(),
    ]) {
      setDrop(shutter, shutter.drop + (shutter.target - shutter.drop) * k);
    }
    const moving: DoorHandle[] = [
      ...[...this.handles.doors.values()].flat(),
      ...this.handles.gates.values(),
    ];
    for (const item of moving) {
      const o = item.object;
      switch (item.kind) {
        case "swing":
          o.rotation.y += (item.target - o.rotation.y) * k;
          break;
        case "lift":
          o.scale.y = travel(o.scale.y, item.target, 1 - LIFT_OPEN_SCALE, item.travelS, dt, k);
          break;
        case "slide": {
          const axis = item.axis ?? "x";
          const goal = (item.home ?? 0) + item.target;
          const span = Math.abs((o.userData.travel as number | undefined) ?? 1);
          o.position[axis] = travel(o.position[axis], goal, span, item.travelS, dt, k);
          break;
        }
      }
    }
    this.time += dt;
    this.stepVisitor(dt);
    animateWater(this.handles, this.time);
    for (const entry of this.state?.people ?? []) {
      const figure = this.handles.people.get(entry.id);
      if (!figure) continue;
      const room = entry.room ? this.handles.rooms.get(entry.room) : undefined;
      const spot = room ? room.spot : this.plan.awaySpot;
      figure.position.x += (spot[0] - figure.position.x) * k;
      figure.position.z += (spot[1] - figure.position.z) * k;
    }
  }
}
