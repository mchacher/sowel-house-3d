/**
 * The frame's anchor, which is how the page the vignette floats in talks to it
 * (spec 003, amended 2026-09-27): `full`, `level=<n>` and `walk=<room>`, in any
 * combination — `#full`, `#level=1&walk=salle-de-bain`. Setting a same-origin
 * frame's hash reloads nothing, needs no handshake, and a person can type it.
 */

import type { Focus } from "./scene/house.ts";

export interface Anchor {
  full: boolean;
  /** The storey to show, when the anchor names one. */
  level: Focus | null;
  /** The room the visitor's figure walks to, or `away` to leave (spec 005). */
  walk: string | null;
}

export function parseAnchor(hash: string): Anchor {
  const anchor: Anchor = { full: false, level: null, walk: null };
  for (const part of hash.replace(/^#/, "").split("&")) {
    if (!part) continue;
    const [key, raw = ""] = part.split("=");
    const value = decodeURIComponent(raw);
    if (key === "full") anchor.full = true;
    else if (key === "level") {
      if (value === "outside") anchor.level = "outside";
      else if (/^-?\d+$/.test(value)) anchor.level = Number(value);
    } else if (key === "walk" && /^[a-z0-9-]+$/.test(value)) anchor.walk = value;
  }
  return anchor;
}
