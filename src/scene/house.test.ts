import { describe, expect, it } from "vitest";
import { Mesh, PointLight } from "three";
import { applyState, buildHouse, syncPeople } from "./house.ts";
import { makeMaterials } from "./materials.ts";
import { wallPieces } from "./geometry.ts";
import type { Plan } from "../plan/types.ts";
import type { SceneState } from "../state/scene-state.ts";
import showroomPlan from "../../public/plans/showroom.json";

const plan = showroomPlan as unknown as Plan;
const materials = makeMaterials();

/** The lamp counts the showroom actually has, per derived bindings. */
const LAMP_COUNTS: Record<string, number> = { sejour: 3, cuisine: 1, entree: 1, bureau: 1 };

function build(level = 0) {
  return buildHouse({ plan, materials, level, lampCounts: LAMP_COUNTS });
}

function state(overrides: Partial<SceneState> = {}): SceneState {
  const rooms: SceneState["rooms"] = {};
  for (const room of plan.rooms) {
    rooms[room.id] = {
      id: room.id,
      name: room.name,
      shutters: [],
      lamps: [],
      motion: false,
      temperatureC: null,
      temperatureFrom: null,
      humidityPct: null,
    };
  }
  return {
    rooms,
    people: [],
    sky: { elevationDeg: 40, azimuthDeg: 180, isDaylight: true, rainMmPerHour: 0, clearness: 1 },
    problems: [],
    ...overrides,
  };
}

describe("building the house", () => {
  it("builds without a renderer, which is why any of this is testable", () => {
    const handles = build();
    expect(handles.root.children.length).toBeGreaterThan(20);
  });

  it("raises one mesh per solid wall piece of the level", () => {
    const handles = build(0);
    const expected = plan.walls
      .filter((w) => w.level === 0)
      .reduce((n, w) => n + wallPieces(w, plan.height).length, 0);
    // Walls, plus the panes and panels and lamps and sensors; count the walls by
    // their material, which is the only thing that identifies them.
    const wallMeshes = handles.root.children.filter(
      (c) => c instanceof Mesh && c.material === materials.wall,
    );
    expect(wallMeshes).toHaveLength(expected);
    expect(expected).toBeGreaterThan(10);
  });

  it("hangs the lamps the rooms have, and no others", () => {
    const handles = build(0);
    expect(handles.lamps.get("sejour")).toHaveLength(3);
    expect(handles.lamps.get("cuisine")).toHaveLength(1);
    expect(handles.lamps.get("escalier") ?? []).toHaveLength(0);
    const lights = handles.root.children.filter((c) => c instanceof PointLight);
    expect(lights).toHaveLength(6);
  });

  it("starts every lamp dark, so an unlit house is not lit by accident", () => {
    const handles = build(0);
    for (const lamps of handles.lamps.values()) {
      for (const lamp of lamps) expect(lamp.light.intensity).toBe(0);
    }
  });

  it("gives the séjour a shutter panel per window, in plan order", () => {
    const handles = build(0);
    expect(handles.shutters.get("sejour")).toHaveLength(3);
    expect(handles.shutters.get("cuisine")).toHaveLength(2);
  });

  it("anchors a shutter panel at its lintel", () => {
    const handles = build(0);
    const panels = handles.shutters.get("sejour") ?? [];
    for (const { panel } of panels) {
      // Anchored at the top: rolled up, the panel's origin sits at the window head.
      expect(panel.position.y).toBeGreaterThan(1.5);
      expect(panel.scale.y).toBeLessThan(0.01);
    }
  });

  it("shows the outdoors whichever storey is chosen", () => {
    for (const level of [-1, 0, 1, 2]) {
      const handles = build(level);
      expect(handles.rooms.has("jardin"), `level ${level}`).toBe(true);
      expect(handles.rooms.has("piscine"), `level ${level}`).toBe(true);
    }
  });

  it("shows only the storey chosen", () => {
    const upstairs = build(1);
    expect(upstairs.rooms.has("chambre-parents")).toBe(true);
    expect(upstairs.rooms.has("sejour")).toBe(false);
  });
});

describe("applying the state", () => {
  it("lights a lamp Sowel says is on, and dims one it says is off", () => {
    const handles = build(0);
    const lit = state();
    lit.rooms.sejour.lamps = [
      { on: true, brightness: 1 },
      { on: false, brightness: 0 },
      { on: true, brightness: 0.5 },
    ];
    applyState(handles, lit, materials);
    const lamps = handles.lamps.get("sejour") ?? [];
    expect(lamps[0].light.intensity).toBeGreaterThan(0);
    expect(lamps[1].light.intensity).toBe(0);
    expect(lamps[2].light.intensity).toBeGreaterThan(0);
    // A dim lamp is dimmer than a bright one, and neither is off.
    expect(lamps[2].light.intensity).toBeLessThan(lamps[0].light.intensity);
    expect(lamps[0].shade.material).toBe(materials.shadeOn);
    expect(lamps[1].shade.material).toBe(materials.shadeOff);
  });

  it("sets a shutter's target, and leaves the moving to the renderer", () => {
    // The split is what makes a shutter slide: applyState says where it should be,
    // the renderer's easing walks it there. An earlier version wrote the scale here
    // too, so the easing had nothing left to do and every shutter jumped.
    const handles = build(0);
    const closing = state();
    closing.rooms.sejour.shutters = [0, 100, 50];
    applyState(handles, closing, materials);
    const panels = handles.shutters.get("sejour") ?? [];
    expect(panels[0].target).toBeCloseTo(1);
    expect(panels[1].target).toBeLessThan(0.01);
    expect(panels[2].target).toBeCloseTo(0.5);
    // Untouched: the panel is still where it was.
    expect(panels[0].panel.scale.y).toBeLessThan(0.01);
  });

  it("snaps when asked, so a freshly opened scene is already right", () => {
    const handles = build(0);
    const closing = state();
    closing.rooms.sejour.shutters = [0, 100, 50];
    applyState(handles, closing, materials, true);
    const panels = handles.shutters.get("sejour") ?? [];
    expect(panels[0].panel.scale.y).toBeCloseTo(1);
    expect(panels[2].panel.scale.y).toBeCloseTo(0.5);
  });

  it("never targets or scales a panel to exactly zero", () => {
    // A zero scale makes the matrix singular and Three.js complains every frame.
    const handles = build(0);
    applyState(handles, state(), materials, true);
    for (const panels of handles.shutters.values()) {
      for (const shutter of panels) {
        expect(shutter.target).toBeGreaterThan(0);
        expect(shutter.panel.scale.y).toBeGreaterThan(0);
      }
    }
  });

  it("lights a sensor when the room has motion", () => {
    const handles = build(0);
    const moving = state();
    moving.rooms.sejour.motion = true;
    applyState(handles, moving, materials);
    expect(handles.sensors.get("sejour")?.material).toBe(materials.sensorOn);
    expect(handles.sensors.get("cuisine")?.material).toBe(materials.sensorOff);
  });

  it("is safe to apply a state mentioning rooms this level does not show", () => {
    const handles = build(0);
    const upstairs = state();
    upstairs.rooms["chambre-parents"].motion = true;
    expect(() => applyState(handles, upstairs, materials)).not.toThrow();
  });
});

describe("the people", () => {
  it("stands someone in the room Sowel says they are in", () => {
    const handles = build(0);
    const occupied = state({ people: [{ id: "p1", label: "Adulte 1", room: "sejour" }] });
    syncPeople(handles, occupied, plan, materials);
    const figure = handles.people.get("p1");
    const room = plan.rooms.find((r) => r.id === "sejour");
    expect(figure?.visible).toBe(true);
    expect(figure?.position.x).toBeCloseTo(room?.spot[0] ?? 0);
    expect(figure?.position.z).toBeCloseTo(room?.spot[1] ?? 0);
  });

  it("puts someone who is away outside, and still draws them", () => {
    const handles = build(0);
    syncPeople(
      handles,
      state({ people: [{ id: "p1", label: "A", room: "away" }] }),
      plan,
      materials,
    );
    const figure = handles.people.get("p1");
    expect(figure?.visible).toBe(true);
    expect(figure?.position.x).toBeCloseTo(plan.awaySpot[0]);
  });

  it("hides someone Sowel puts somewhere the plan does not know", () => {
    // Better an absent figure than one standing at the origin for no reason.
    const handles = build(0);
    syncPeople(handles, state({ people: [{ id: "p1", label: "A", room: null }] }), plan, materials);
    expect(handles.people.get("p1")?.visible).toBe(false);
  });

  it("places a new figure but does not move an existing one", () => {
    // A figure that has just appeared should not slide across the house from the
    // origin; one that already exists is walked to its new room by the renderer.
    const handles = build(0);
    syncPeople(
      handles,
      state({ people: [{ id: "p1", label: "A", room: "sejour" }] }),
      plan,
      materials,
    );
    const figure = handles.people.get("p1");
    const before = figure?.position.clone();
    syncPeople(
      handles,
      state({ people: [{ id: "p1", label: "A", room: "cuisine" }] }),
      plan,
      materials,
    );
    expect(handles.people.get("p1")?.position.x).toBeCloseTo(before?.x ?? -1);
  });

  it("reuses a figure rather than making a second one", () => {
    const handles = build(0);
    const one = state({ people: [{ id: "p1", label: "A", room: "sejour" }] });
    syncPeople(handles, one, plan, materials);
    const figure = handles.people.get("p1");
    syncPeople(
      handles,
      { ...one, people: [{ id: "p1", label: "A", room: "cuisine" }] },
      plan,
      materials,
    );
    expect(handles.people.get("p1")).toBe(figure);
    expect(handles.people.size).toBe(1);
  });

  it("stops drawing somebody Sowel has stopped reporting", () => {
    const handles = build(0);
    syncPeople(
      handles,
      state({ people: [{ id: "p1", label: "A", room: "sejour" }] }),
      plan,
      materials,
    );
    syncPeople(handles, state({ people: [] }), plan, materials);
    expect(handles.people.get("p1")?.visible).toBe(false);
  });
});
