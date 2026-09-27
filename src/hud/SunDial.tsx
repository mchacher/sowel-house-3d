/**
 * Where the sun is, whatever the camera does (spec 004, FR4).
 *
 * The camera frames the house from the south-east, so the morning and midday sun
 * are behind it and the sky is above the frame. The dial is where the sun cannot be
 * lost: a half circle for the sky, east on the left and west on the right as seen
 * facing south, the sun on its arc, the day's sunrise and sunset at its ends. At
 * night the sun waits under the horizon and the dial says when it rises.
 */

import type { SkyState } from "../state/scene-state.ts";
import { strings, type Lang } from "../i18n.ts";

interface Props {
  sky: SkyState;
  lang: Lang;
  /** The vignette's: the arc and the sun, no words. */
  compact?: boolean;
}

export function SunDial({ sky, lang, compact = false }: Props): React.ReactElement | null {
  const t = strings(lang);
  const w = compact ? 64 : 128;
  const r = compact ? 24 : 46;
  const cx = w / 2;
  const cy = r + (compact ? 6 : 10);
  const h = cy + (compact ? 6 : 26);
  const f = sky.dayFraction;
  const point = (fraction: number) => ({
    x: cx - r * Math.cos(Math.PI * fraction),
    y: cy - r * Math.sin(Math.PI * fraction),
  });
  const sun = f === null ? { x: cx, y: cy + (compact ? 3 : 8) } : point(f);
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const travelled = f === null ? null : `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${sun.x} ${sun.y}`;

  return (
    <div
      className={`pointer-events-auto rounded-lg bg-white/80 shadow-sm backdrop-blur dark:bg-slate-900/80 ${
        compact ? "p-0.5" : "px-2 pt-1.5 pb-1"
      }`}
      title={t.sun}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t.sun}>
        <line
          x1={cx - r - 4}
          x2={cx + r + 4}
          y1={cy}
          y2={cy}
          className="stroke-slate-400 dark:stroke-slate-500"
          strokeWidth={1}
        />
        <path
          d={arc}
          fill="none"
          className="stroke-slate-400 dark:stroke-slate-500"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
        {travelled && <path d={travelled} fill="none" stroke="#F2C035" strokeWidth={2} />}
        {f !== null && (
          <circle cx={sun.x} cy={sun.y} r={compact ? 7 : 11} fill="#F2C035" opacity={0.25} />
        )}
        <circle
          cx={sun.x}
          cy={sun.y}
          r={compact ? 3.5 : 5.5}
          fill={f === null ? "#94a3b8" : "#F2C035"}
          stroke={f === null ? "none" : "#D4A41C"}
        />
        {!compact && (
          <g
            className="fill-slate-500 dark:fill-slate-400"
            fontSize={9}
            fontFamily="Inter, system-ui"
          >
            <text x={cx - r} y={cy + 11} textAnchor="middle">
              {t.east}
            </text>
            <text x={cx} y={cy - r - 3} textAnchor="middle" dominantBaseline="auto">
              {t.south}
            </text>
            <text x={cx + r} y={cy + 11} textAnchor="middle">
              {t.west}
            </text>
          </g>
        )}
        {!compact && (sky.sunrise || sky.sunset) && (
          <g
            className="fill-slate-600 dark:fill-slate-300"
            fontSize={10}
            fontFamily="JetBrains Mono, ui-monospace, monospace"
          >
            {f === null ? (
              <text x={cx} y={h - 3} textAnchor="middle">
                {t.sunrise} {sky.sunrise ?? "—"}
              </text>
            ) : (
              <>
                <text x={2} y={h - 3} textAnchor="start">
                  ↑{sky.sunrise ?? "—"}
                </text>
                <text x={w - 2} y={h - 3} textAnchor="end">
                  ↓{sky.sunset ?? "—"}
                </text>
              </>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
