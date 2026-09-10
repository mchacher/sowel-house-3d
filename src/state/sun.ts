/**
 * Where the sun is, from what Sowel actually says (spec 001, FR5).
 *
 * Sowel gives the house zone a `sunrise` and a `sunset` as local `HH:MM`, and an
 * `isDaylight` flag. It does not give an elevation or an azimuth, and this app does
 * not know the home's coordinates — so the arc is **interpolated between the two
 * times Sowel reports** rather than computed astronomically.
 *
 * That is deliberate, and the trade is worth naming. An exact sun would need the
 * latitude and a solar algorithm, and it would then be free to disagree with
 * Sowel's own sunrise: a scene going dark while the engine still says daylight is a
 * worse error than a sun a few degrees off its true bearing. Agreeing with the
 * engine matters more than agreeing with the sky.
 */

export interface SunPosition {
  /** Degrees above the horizon; negative before sunrise and after sunset. */
  elevationDeg: number;
  /** Degrees clockwise from north: sunrise in the east, sunset in the west. */
  azimuthDeg: number;
  isDaylight: boolean;
}

/** The highest the sun is taken to climb. A stylised sky, not an almanac. */
const PEAK_ELEVATION_DEG = 62;
/** How far below the horizon the sun is taken to sit at solar midnight. */
const TROUGH_ELEVATION_DEG = -34;

function minutesOf(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * @param now minutes since local midnight.
 */
export function sunPosition(
  sunrise: string | null,
  sunset: string | null,
  now: number,
  isDaylight: boolean | null,
): SunPosition {
  const rise = minutesOf(sunrise);
  const set = minutesOf(sunset);

  // With no sunrise to go by — a polar day, or a zone that reports none — fall back
  // to the flag alone rather than inventing an arc.
  if (rise === null || set === null || set <= rise) {
    const lit = isDaylight ?? true;
    return {
      elevationDeg: lit ? PEAK_ELEVATION_DEG / 2 : TROUGH_ELEVATION_DEG / 2,
      azimuthDeg: 180,
      isDaylight: lit,
    };
  }

  if (now >= rise && now <= set) {
    const fraction = (now - rise) / (set - rise);
    return {
      elevationDeg: Math.sin(Math.PI * fraction) * PEAK_ELEVATION_DEG,
      azimuthDeg: 90 + 180 * fraction,
      isDaylight: isDaylight ?? true,
    };
  }

  // Night: the same arc, run backwards under the horizon, so the sky keeps moving
  // and a lamp at 3 a.m. is still the only light in the room.
  const nightLength = 24 * 60 - (set - rise);
  const since = now > set ? now - set : now + 24 * 60 - set;
  const fraction = nightLength > 0 ? since / nightLength : 0;
  return {
    elevationDeg: Math.sin(Math.PI * fraction) * TROUGH_ELEVATION_DEG,
    azimuthDeg: (270 + 180 * fraction) % 360,
    isDaylight: isDaylight ?? false,
  };
}

/** Minutes since local midnight, for the browser's own clock. */
export function localMinutes(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}
