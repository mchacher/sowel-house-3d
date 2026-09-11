/**
 * The overlay: what the app is showing, and what it cannot (spec 001, FR7).
 *
 * One line for trouble, a level switcher, and a room readout. Never a silent
 * failure — a scene quietly missing a room looks like a scene, which is the whole
 * problem.
 */

import type { SceneState } from "../state/scene-state.ts";
import type { SocketStatus } from "../client/socket.ts";
import type { Level } from "../plan/types.ts";
import type { Focus } from "../scene/house.ts";
import { isTrouble, statusLine, type AppPhase } from "./status.ts";

export type { AppPhase };

interface Props {
  phase: AppPhase;
  socket: SocketStatus;
  state: SceneState | null;
  levels: Level[];
  level: Focus;
  onLevel: (level: Focus) => void;
  onRecentre: () => void;
}

export function Hud(props: Props): React.ReactElement {
  const { phase, socket, state, levels, level, onLevel, onRecentre } = props;
  const trouble = isTrouble(phase, socket, state);

  const rooms = state
    ? Object.values(state.rooms)
        .filter((r) => r.temperatureC !== null || r.motion || r.lamps.some((l) => l.on))
        .slice(0, 10)
    : [];

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div
          className={`pointer-events-auto rounded-lg px-3 py-2 text-sm font-medium shadow-sm backdrop-blur ${
            trouble
              ? "bg-amber-100/90 text-amber-900 dark:bg-amber-900/80 dark:text-amber-100"
              : "bg-white/80 text-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
          }`}
        >
          {statusLine(phase, socket, state)}
        </div>

        {phase.kind === "no-session" && (
          <a
            className="pointer-events-auto rounded-lg bg-[#1A4F6E] px-3 py-2 text-sm font-semibold text-white shadow-sm"
            href="/bienvenue"
          >
            Page d'accueil
          </a>
        )}

        {state && state.problems.length > 1 && (
          <details className="pointer-events-auto rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-300">
            <summary className="cursor-pointer font-medium">
              {state.problems.length} anomalies
            </summary>
            <ul className="mt-1 list-disc pl-4">
              {state.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        {rooms.length > 0 && (
          <ul className="pointer-events-auto max-w-[17rem] rounded-lg bg-white/80 p-2 text-xs shadow-sm backdrop-blur dark:bg-slate-900/80">
            {rooms.map((room) => (
              <li
                key={room.id}
                className="flex items-center justify-between gap-3 px-1 py-0.5 text-slate-700 dark:text-slate-200"
              >
                <span className="truncate">
                  {room.name}
                  {room.motion && <span className="ml-1 text-[#F2C035]">●</span>}
                </span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {room.temperatureC === null
                    ? "—"
                    : `${room.temperatureC.toFixed(1)} °C${room.temperatureFrom ? ` (${room.temperatureFrom})` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Camera controls with no camera behind them are a promise the page cannot
            keep — worse than their absence, because pressing one teaches the visitor
            that the page is broken rather than limited. */}
        {levels.length > 0 && (
          <div className="pointer-events-auto flex gap-1 rounded-lg bg-white/80 p-1 shadow-sm backdrop-blur dark:bg-slate-900/80">
            <button
              type="button"
              onClick={onRecentre}
              title="Recadrer la vue"
              className="rounded px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-700/70"
            >
              Recadrer
            </button>
            <span aria-hidden className="my-1 w-px bg-slate-300 dark:bg-slate-700" />
            {/* From outside: every storey solid and the roof on. The postcard. */}
            <button
              type="button"
              onClick={() => onLevel("outside")}
              aria-pressed={level === "outside"}
              className={`rounded px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                level === "outside"
                  ? "bg-[#1A4F6E] text-white"
                  : "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-700/70"
              }`}
            >
              Extérieur
            </button>
            {levels.map((entry) => (
              <button
                key={entry.level}
                type="button"
                onClick={() => onLevel(entry.level)}
                aria-pressed={entry.level === level}
                className={`rounded px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  entry.level === level
                    ? "bg-[#1A4F6E] text-white"
                    : "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-700/70"
                }`}
              >
                {entry.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
