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
import {
  cameraFor,
  closeView,
  levelElevation,
  roofRise,
  stackHeight,
  sunDirection,
} from "./geometry.ts";
import {
  applyState,
  buildHouse,
  focusLevel,
  syncPeople,
  type Counts,
  type DoorHandle,
  type Focus,
  type HouseHandles,
} from "./house.ts";
import { makeMaterials, PALETTE, type Materials } from "./materials.ts";
import type { Lang } from "../i18n.ts";
import type { FocusTarget } from "../state/focus.ts";

/** How fast a shutter and a figure catch up with what Sowel said, per second. */
const EASE_PER_SECOND = 3.5;
/** How close the vignette's overview stands, against the full view's framing. */
export const MINI_CLOSENESS = 0.68;
/** How long a flight to something takes. Long enough to follow, short enough not to wait. */
const FLIGHT_S = 1.2;

type View = { position: [number, number, number]; target: [number, number, number] };

interface Flight {
  fromPosition: Vector3;
  fromTarget: Vector3;
  toPosition: Vector3;
  toTarget: Vector3;
  t: number;
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

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
  private state: SceneState | null = null;
  private frame = 0;
  private last = 0;
  private flight: Flight | null = null;
  /** Where the view goes back to after showing something. */
  private home: Focus;
  private returnTimer = 0;
  /** The visitor took hold of the camera since the last flight: leave it with them. */
  private touched = false;
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
    this.home = level;
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
    this.camera = new PerspectiveCamera(42, 1, 0.5, 250);

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
    // A hand on the camera beats any flight: stop mid-air, and do not fly home
    // behind the visitor's back.
    this.controls.addEventListener("start", () => {
      this.flight = null;
      this.touched = true;
      clearTimeout(this.returnTimer);
    });

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

  setLevel(level: Focus): void {
    if (level === this.level) return;
    this.level = level;
    // Every storey is already built and standing. Switching floors is a change of
    // which one is solid, not a change of what exists.
    if (this.handles) focusLevel(this.handles, level);
    this.frameLevel();
  }

  /**
   * Switch between the vignette and the vignette opened full screen: the framing
   * from outside, and whatever was in flight — a camera flying home behind the
   * visitor's back as they open the big view would be the camera fighting them.
   */
  setMini(mini: boolean): void {
    this.closeness = mini ? MINI_CLOSENESS : 1;
    this.flight = null;
    this.touched = false;
    clearTimeout(this.returnTimer);
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

  /**
   * Fly to something somebody just acted on, read the storey it is on, and come
   * back to the overview after `holdMs` — unless the visitor has taken the camera
   * in the meantime, in which case it stays theirs.
   */
  show(target: FocusTarget, holdMs = 7000): void {
    if (!this.handles) return;
    this.touched = false;
    if (target.level !== this.level) {
      this.level = target.level;
      focusLevel(this.handles, target.level);
    }
    this.flyTo(closeView(target.point, target.span, this.aspect()));
    clearTimeout(this.returnTimer);
    this.returnTimer = window.setTimeout(() => this.returnHome(), holdMs);
  }

  private returnHome(): void {
    if (this.touched || !this.handles) return;
    if (this.level !== this.home) {
      this.level = this.home;
      focusLevel(this.handles, this.home);
    }
    this.flyTo(this.viewFor(this.home));
  }

  private flyTo(view: View): void {
    this.flight = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPosition: new Vector3(...view.position),
      toTarget: new Vector3(...view.target),
      t: 0,
    };
  }

  /** Put the camera back where a level is framed. Also what the HUD's reset calls. */
  frameLevel(): void {
    this.flight = null;
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
      this.stepFlight(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stepFlight(dt: number): void {
    const flight = this.flight;
    if (!flight) return;
    flight.t = Math.min(1, flight.t + dt / FLIGHT_S);
    const e = easeInOut(flight.t);
    this.camera.position.lerpVectors(flight.fromPosition, flight.toPosition, e);
    this.controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
    if (flight.t >= 1) this.flight = null;
  }

  stop(): void {
    clearTimeout(this.returnTimer);
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
  private ease(dt: number): void {
    if (!this.handles) return;
    const k = 1 - Math.exp(-EASE_PER_SECOND * dt);
    for (const shutters of this.handles.shutters.values()) {
      for (const shutter of shutters) {
        shutter.panel.scale.y += (shutter.target - shutter.panel.scale.y) * k;
      }
    }
    const moving: DoorHandle[] = [
      ...[...this.handles.doors.values()].flat(),
      ...this.handles.gates.values(),
      ...this.handles.covers.values(),
    ];
    for (const item of moving) {
      const o = item.object;
      switch (item.kind) {
        case "swing":
          o.rotation.y += (item.target - o.rotation.y) * k;
          break;
        case "lift":
          o.scale.y += (item.target - o.scale.y) * k;
          break;
        case "cover":
          o.scale.z += (item.target - o.scale.z) * k;
          break;
        case "slide": {
          const axis = item.axis ?? "x";
          const goal = (item.home ?? 0) + item.target;
          o.position[axis] += (goal - o.position[axis]) * k;
          break;
        }
      }
    }
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
