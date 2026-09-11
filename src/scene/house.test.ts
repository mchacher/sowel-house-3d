import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, PointLight, type Material } from "three";
import {
  applyState,
  buildHouse,
  focusLevel,
  LIFT_OPEN_SCALE,
  SWING_OPEN_RAD,
  syncPeople,
  type Focus,
} from "./house.ts";
import { makeMaterials } from "./materials.ts";
import { levelElevation, wallPieces } from "./geometry.ts";
import type { Plan } from "../plan/types.ts";
import type { SceneState } from "../state/scene-state.ts";
import showroomPlan from "../../public/plans/showroom.json";

const plan = showroomPlan as unknown as Plan;
const materials = makeMaterials();

/** The lamp counts the showroom actually has, per derived bindings. */
const LAMP_COUNTS: Record<string, number> = { sejour: 3, cuisine: 1, entree: 1, bureau: 1 };

function build(level: Focus = 0) {
  return buildHouse({ plan, materials, level, lampCounts: LAMP_COUNTS });
}

function state(overrides: Partial<SceneState> = {}): SceneState {
  const rooms: SceneState["rooms"] = {};
  for (const room of plan.rooms) {
    rooms[room.id] = {
      id: room.id,
      name: room.name,
      shutters: [],
      doors: [],
      heating: false,
      cover: null,
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
    garden: { gates: {}, watering: {} },
    problems: [],
    ...overrides,
  };
}

describe("building the house", () => {
  it("builds without a renderer, which is why any of this is testable", () => {
    const handles = build();
    // A group per storey, plus the outdoors, plus the roof.
    expect(handles.levels.size).toBe(plan.levels.length);
    expect(handles.root.children).toHaveLength(plan.levels.length + 2);
  });

  it("builds every storey at once, each at its own height", () => {
    const handles = build(0);
    for (const slab of plan.levels) {
      const entry = handles.levels.get(slab.level);
      expect(entry, `level ${slab.level}`).toBeDefined();
      expect(entry!.group.position.y).toBeCloseTo(levelElevation(plan, slab.level));
      expect(entry!.group.children.length).toBeGreaterThan(3);
    }
    // Every room of the house is in the graph, whichever storey is in focus.
    expect(handles.rooms.has("sejour")).toBe(true);
    expect(handles.rooms.has("chambre-parents")).toBe(true);
    expect(handles.rooms.has("garage")).toBe(true);
  });

  it("raises one mesh per solid wall piece of every level", () => {
    const handles = build(0);
    for (const slab of plan.levels) {
      const expected = plan.walls
        .filter((w) => w.level === slab.level)
        .reduce((n, w) => n + wallPieces(w, plan.height).length, 0);
      const entry = handles.levels.get(slab.level)!;
      // Walls, plus the panes and panels and lamps and sensors; count the walls by
      // their material, which is the only thing that identifies them.
      const wallMeshes = entry.group.children.filter(
        (c) => c instanceof Mesh && c.material === entry.materials.wall,
      );
      expect(wallMeshes, `level ${slab.level}`).toHaveLength(expected);
    }
  });

  it("hangs the lamps the rooms have, and no others", () => {
    const handles = build(0);
    expect(handles.lamps.get("sejour")).toHaveLength(3);
    expect(handles.lamps.get("cuisine")).toHaveLength(1);
    expect(handles.lamps.get("escalier") ?? []).toHaveLength(0);
    const lights = [...handles.levels.values()].flatMap((e) =>
      e.group.children.filter((c) => c instanceof PointLight),
    );
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

  it("never lays the garden in the same plane as a floor slab", () => {
    // Two coplanar faces are a coin toss the depth buffer re-tosses every frame,
    // and the result was grass striped across the ground floor, crawling as the
    // camera zoomed. The fix is geometric and this is what holds it.
    const h = handles0();
    const flat = new Set([
      h.outdoor.materials.ground,
      h.outdoor.materials.floor,
      h.outdoor.materials.water,
      h.outdoor.materials.lawn,
      h.outdoor.materials.soil,
      h.outdoor.materials.drive,
      h.outdoor.materials.path,
    ]);
    const patches = h.outdoor.group.children.filter(
      (c) => c instanceof Mesh && flat.has(c.material as Material),
    );
    expect(patches.length).toBeGreaterThan(5);
    const slabTop = 0; // the ground floor slab is SLAB thick, centred at -SLAB / 2
    for (const patch of patches)
      expect(Math.abs(patch.position.y - slabTop)).toBeGreaterThan(0.005);
  });
});

describe("choosing a storey", () => {
  it("makes the chosen one solid and the rest glass, without rebuilding", () => {
    const handles = build(0);
    const ground = handles.levels.get(0)!.materials.wall as Material & { opacity: number };
    const first = handles.levels.get(1)!.materials.wall as Material & { opacity: number };
    expect(ground.opacity).toBe(1);
    expect(first.opacity).toBeLessThan(0.3);
    expect(first.transparent).toBe(true);
    // A ghost that writes depth hides what is behind it — which is the storey the
    // visitor is actually reading.
    expect(first.depthWrite).toBe(false);

    focusLevel(handles, 1);
    expect(ground.opacity).toBeLessThan(0.3);
    expect(first.opacity).toBe(1);
    expect(first.depthWrite).toBe(true);
  });

  it("keeps the garden solid above ground and turns it to glass below", () => {
    const handles = build(0);
    const ground = handles.outdoor.materials.ground as Material & { opacity: number };
    const casts = () => {
      const out: boolean[] = [];
      handles.outdoor.group.traverse((o) => {
        if (o instanceof Mesh) out.push(o.castShadow);
      });
      return out;
    };
    expect(ground.opacity).toBe(1);
    expect(casts().some((c) => c)).toBe(true);

    // The cellar is under the garden: an opaque lawn is a cellar you are told about
    // and never shown — and a transparent lawn that still casts its shadow is a
    // cellar shown in the dark, which is no better.
    focusLevel(handles, -1);
    expect(ground.opacity).toBeLessThan(0.3);
    expect(casts().every((c) => c === false)).toBe(true);
  });

  it("lights only the storey in focus, and leaves every shade readable", () => {
    const handles = build(0);
    const sejour = handles.lamps.get("sejour") ?? [];
    expect(sejour.every((l) => l.light.visible)).toBe(true);
    focusLevel(handles, 1);
    // The lamp stops lighting the room; its shade still shows whether it is on,
    // which is most of the reason for showing the other storeys at all.
    expect(sejour.every((l) => l.light.visible)).toBe(false);
    expect(sejour.every((l) => l.shade.visible)).toBe(true);
  });

  it("stops a ghosted storey casting shadows onto the one being read", () => {
    const handles = build(0);
    const upstairs = handles.levels.get(1)!.group;
    const casters: boolean[] = [];
    upstairs.traverse((o) => {
      if (o instanceof Mesh) casters.push(o.castShadow);
    });
    expect(casters.length).toBeGreaterThan(10);
    expect(casters.every((c) => c === false)).toBe(true);
  });
});

function handles0() {
  return build(0);
}

describe("the doors the house reports on", () => {
  it("hangs a leaf per reporting door: two that swing, one that lifts", () => {
    const handles = build(0);
    expect(handles.doors.get("entree")?.map((d) => d.kind)).toEqual(["swing"]);
    expect(handles.doors.get("sejour")?.map((d) => d.kind)).toEqual(["swing"]);
    expect(handles.doors.get("garage")?.map((d) => d.kind)).toEqual(["lift"]);
    // A plain doorway gets nothing to move.
    expect(handles.doors.get("cuisine")).toBeUndefined();
  });

  it("starts every door shut", () => {
    const handles = build(0);
    for (const doors of handles.doors.values()) {
      for (const door of doors) {
        if (door.kind === "swing") expect(door.object.rotation.y).toBe(0);
        else expect(door.object.scale.y).toBe(1);
      }
    }
  });

  it("swings the front door and rolls the garage up when Sowel says open", () => {
    const handles = build(0);
    const s = state();
    s.rooms.entree.doors = [true];
    s.rooms.garage.doors = [true];
    applyState(handles, s, materials, true);
    expect(handles.doors.get("entree")![0].object.rotation.y).toBeCloseTo(SWING_OPEN_RAD);
    expect(handles.doors.get("garage")![0].object.scale.y).toBeCloseTo(LIFT_OPEN_SCALE);
    // A door with no contact bound stays shut rather than guessing.
    s.rooms.sejour.doors = [null];
    applyState(handles, s, materials, true);
    expect(handles.doors.get("sejour")![0].object.rotation.y).toBe(0);
  });
});

describe("storeys meeting", () => {
  it("runs the ground-floor walls up to the underside of the floor above", () => {
    const handles = build(0);
    const ground = handles.levels.get(0)!;
    const walls = ground.group.children.filter(
      (c) => c instanceof Mesh && c.material === ground.materials.wall,
    ) as Mesh[];
    const top = Math.max(
      ...walls.map((m) => m.position.y + (m.geometry as BoxGeometry).parameters.height / 2),
    );
    const upstairs = handles.levels.get(1)!.group.position.y;
    expect(top).toBeCloseTo(upstairs, 5);
    // And the top storey's walls stop at the wall height, under the roof.
    const first = handles.levels.get(1)!;
    const upper = first.group.children.filter(
      (c) => c instanceof Mesh && c.material === first.materials.wall,
    ) as Mesh[];
    const upperTop = Math.max(
      ...upper.map((m) => m.position.y + (m.geometry as BoxGeometry).parameters.height / 2),
    );
    expect(upperTop).toBeCloseTo(plan.height, 5);
  });
});

describe("windows at night", () => {
  it("lights a room's panes when one of its lamps is on, and only then", () => {
    const handles = build(0);
    const s = state();
    s.rooms.sejour.lamps = [{ on: true, brightness: 1 }];
    applyState(handles, s, materials, true);
    const sejour = handles.panes.get("sejour") ?? [];
    expect(sejour.length).toBe(3);
    expect(sejour.every((p) => p.material === materials.glassLit)).toBe(true);
    // The kitchen is dark, and its panes are the storey's own glass.
    const cuisine = handles.panes.get("cuisine") ?? [];
    expect(cuisine.every((p) => p.material === handles.levels.get(0)!.materials.glass)).toBe(true);

    s.rooms.sejour.lamps = [{ on: false, brightness: 0 }];
    applyState(handles, s, materials, true);
    expect(sejour.every((p) => p.material === materials.glassLit)).toBe(false);
  });
});

describe("the roof and the stairs", () => {
  it("builds a roof in a group of its own", () => {
    const handles = build(0);
    expect(handles.roof).not.toBeNull();
    // Two slopes, eight panels, two gables, and the garage's flat slab.
    expect(handles.roof!.group.children.length).toBe(13);
    const panels = handles.roof!.group.children.filter(
      (c) => c instanceof Mesh && c.material === handles.roof!.materials.panel,
    );
    expect(panels).toHaveLength(8);
  });

  it("puts the stairs on the storey they start from, climbing to the next", () => {
    const handles = build(0);
    const ground = handles.levels.get(0)!.group;
    const steps = ground.children.filter(
      (c) => c instanceof Mesh && c.material === handles.levels.get(0)!.materials.step,
    ) as Mesh[];
    expect(steps.length).toBeGreaterThan(10);
    // Blocks are centred: the top one's centre is half its height under the arrival.
    const top = Math.max(...steps.map((m) => m.position.y));
    expect(top).toBeGreaterThan(plan.height * 0.7);
  });

  it("cuts the upper slab around the stairwell", () => {
    const handles = build(0);
    const upstairs = handles.levels.get(1)!;
    const slabs = upstairs.group.children.filter(
      (c) => c instanceof Mesh && c.material === upstairs.materials.floor,
    );
    expect(slabs.length).toBe(4);
  });
});

describe("reading the house from outside", () => {
  it("makes every storey and the roof solid, and turns the roof to glass from within", () => {
    const handles = build("outside");
    const roof = handles.roof!.materials.roof as Material & { opacity: number };
    const upstairs = handles.levels.get(1)!.materials.wall as Material & { opacity: number };
    expect(roof.opacity).toBe(1);
    expect(upstairs.opacity).toBe(1);

    focusLevel(handles, 0);
    expect(roof.opacity).toBeLessThan(0.3);
    expect(upstairs.opacity).toBeLessThan(0.3);

    focusLevel(handles, 1);
    // Reading the top floor: the roof over it would be a lid.
    expect(roof.opacity).toBeLessThan(0.3);
  });

  it("lights every room from outside, since the windows are what shows", () => {
    const handles = build("outside");
    for (const lamps of handles.lamps.values()) {
      expect(lamps.every((l) => l.light.visible)).toBe(true);
    }
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
