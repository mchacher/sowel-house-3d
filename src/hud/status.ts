/**
 * The status line, apart from the component that shows it.
 *
 * Pulled out so the sentence a visitor reads when something is wrong is tested —
 * it is the only thing standing between a broken demo and a demo that looks fine.
 */

import type { SceneState } from "../state/scene-state.ts";
import type { SocketStatus } from "../client/socket.ts";

export type AppPhase =
  { kind: "loading" } | { kind: "no-session" } | { kind: "unreachable" } | { kind: "live" };

export function statusLine(
  phase: AppPhase,
  socket: SocketStatus,
  state: SceneState | null,
): string {
  if (phase.kind === "no-session") return "Pas de session — revenez par la page d'accueil.";
  if (phase.kind === "unreachable") return "Sowel ne répond pas.";
  if (phase.kind === "loading") return "Chargement de la maison…";
  if (socket === "reconnecting") return "Reconnexion…";
  if (socket === "closed") return "Connexion fermée.";
  // A problem the derivation found beats a summary: a missing room is the thing
  // worth saying, and saying it first is the difference between a fixable demo and
  // a mysterious one.
  const problems = state?.problems ?? [];
  if (problems.length > 0) return problems[0];
  if (!state) return "";
  const lit = Object.values(state.rooms).reduce(
    (n, r) => n + r.lamps.filter((l) => l.on).length,
    0,
  );
  const here = state.people.filter((p) => p.room && p.room !== "away").length;
  const plural = (n: number) => (n === 1 ? "" : "s");
  return `${here} personne${plural(here)} à la maison · ${lit} lumière${plural(lit)} allumée${plural(lit)} · ${state.sky.isDaylight ? "jour" : "nuit"}`;
}

/** Whether the line should read as trouble rather than as news. */
export function isTrouble(
  phase: AppPhase,
  socket: SocketStatus,
  state: SceneState | null,
): boolean {
  if (phase.kind !== "live") return true;
  if (socket === "reconnecting" || socket === "closed") return true;
  return (state?.problems.length ?? 0) > 0;
}
