import { describe, expect, it } from "vitest";
import { isTrouble, statusLine, type AppPhase } from "./status.ts";
import type { SceneState } from "../state/scene-state.ts";

const live: AppPhase = { kind: "live" };

function state(overrides: Partial<SceneState> = {}): SceneState {
  return {
    rooms: {
      sejour: {
        id: "sejour",
        name: "Séjour",
        shutters: [],
        doors: [],
        lamps: [
          { on: true, brightness: 1 },
          { on: false, brightness: 0 },
        ],
        motion: true,
        temperatureC: 20.4,
        temperatureFrom: "RDC",
        humidityPct: 48,
      },
    },
    people: [
      { id: "a", label: "Adulte 1", room: "sejour" },
      { id: "b", label: "Adulte 2", room: "away" },
    ],
    sky: { elevationDeg: 30, azimuthDeg: 180, isDaylight: true, rainMmPerHour: 0, clearness: 1 },
    problems: [],
    ...overrides,
  };
}

describe("the one line a visitor reads", () => {
  it("says what the house is doing when all is well", () => {
    expect(statusLine(live, "open", state())).toBe(
      "1 personne à la maison · 1 lumière allumée · jour",
    );
    expect(isTrouble(live, "open", state())).toBe(false);
  });

  it("gets the plurals right, because a demo that says 2 personne looks unfinished", () => {
    const two = state({
      people: [
        { id: "a", label: "A", room: "sejour" },
        { id: "b", label: "B", room: "sejour" },
      ],
    });
    expect(statusLine(live, "open", two)).toContain("2 personnes à la maison");
    const none = state({ people: [], rooms: {} });
    expect(statusLine(live, "open", none)).toContain("0 personnes");
    expect(statusLine(live, "open", none)).toContain("0 lumières allumées");
  });

  it("says it is night when Sowel says so", () => {
    const dark = state();
    dark.sky.isDaylight = false;
    expect(statusLine(live, "open", dark)).toContain("nuit");
  });

  it("puts a missing room ahead of the summary", () => {
    // The fixable thing is worth saying; the summary can wait.
    const broken = state({ problems: ["Pièce inconnue de Sowel : cave (zone « Cellier »)"] });
    expect(statusLine(live, "open", broken)).toBe(
      "Pièce inconnue de Sowel : cave (zone « Cellier »)",
    );
    expect(isTrouble(live, "open", broken)).toBe(true);
  });

  it("admits a dropped socket instead of showing stale state as live", () => {
    expect(statusLine(live, "reconnecting", state())).toBe("Reconnexion…");
    expect(isTrouble(live, "reconnecting", state())).toBe(true);
    expect(statusLine(live, "closed", state())).toBe("Connexion fermée.");
  });

  it("asks a visitor with no session to come back through the front door", () => {
    expect(statusLine({ kind: "no-session" }, "closed", null)).toBe(
      "Pas de session — revenez par la page d'accueil.",
    );
    expect(isTrouble({ kind: "no-session" }, "closed", null)).toBe(true);
  });

  it("says so when Sowel is not answering", () => {
    expect(statusLine({ kind: "unreachable" }, "closed", null)).toBe("Sowel ne répond pas.");
  });

  it("says something while loading rather than nothing", () => {
    expect(statusLine({ kind: "loading" }, "connecting", null)).toBe("Chargement de la maison…");
  });

  it("never returns an empty line in any state it can be in", () => {
    const phases: AppPhase[] = [
      { kind: "loading" },
      { kind: "no-session" },
      { kind: "unreachable" },
      { kind: "live" },
    ];
    for (const phase of phases) {
      for (const socket of ["connecting", "open", "reconnecting", "closed"] as const) {
        const line = statusLine(phase, socket, state());
        expect(line.length, `${phase.kind}/${socket}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("a browser that will not draw", () => {
  // The failure this covers was a blank white page: WebGL threw inside an effect,
  // React unmounted the tree, and nothing at all was left to read. The data was
  // arriving the whole time.
  it("says so, and says the house is still there", () => {
    const line = statusLine({ kind: "no-webgl" }, "open", state());
    expect(line).toContain("WebGL");
    expect(line).toContain("la maison est là");
  });

  it("reads as trouble even when everything else is healthy", () => {
    expect(isTrouble({ kind: "no-webgl" }, "open", state())).toBe(true);
  });
});
