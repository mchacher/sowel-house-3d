/**
 * The status line, apart from the component that shows it.
 *
 * Pulled out so the sentence a visitor reads when something is wrong is tested —
 * it is the only thing standing between a broken demo and a demo that looks fine.
 */

import type { SceneState } from "../state/scene-state.ts";
import type { SocketStatus } from "../client/socket.ts";
import { strings, type Lang } from "../i18n.ts";

export type AppPhase =
  | { kind: "loading" }
  | { kind: "no-session" }
  | { kind: "unreachable" }
  | { kind: "no-webgl" }
  | { kind: "live" };

export function statusLine(
  phase: AppPhase,
  socket: SocketStatus,
  state: SceneState | null,
  lang: Lang = "fr",
): string {
  const t = strings(lang);
  // Worth saying before anything else: the data may be arriving perfectly and the
  // visitor still sees nothing, which is the one failure that reads as "the site is
  // broken" rather than as "something is wrong".
  if (phase.kind === "no-webgl") return t.noWebgl;
  if (phase.kind === "no-session") return t.noSession;
  if (phase.kind === "unreachable") return t.unreachable;
  if (phase.kind === "loading") return t.loading;
  if (socket === "reconnecting") return t.reconnecting;
  if (socket === "closed") return t.closed;
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
  return `${t.people(here)} · ${t.lights(lit)} · ${state.sky.isDaylight ? t.day : t.night}`;
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
