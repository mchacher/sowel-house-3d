import { describe, expect, it } from "vitest";
import { parseAnchor } from "./anchor.ts";

describe("the frame's anchor (spec 003, amended)", () => {
  it("reads full, level and walk, in any combination", () => {
    expect(parseAnchor("")).toEqual({ full: false, level: null, walk: null });
    expect(parseAnchor("#full")).toEqual({ full: true, level: null, walk: null });
    expect(parseAnchor("#level=1&walk=salle-de-bain")).toEqual({
      full: false,
      level: 1,
      walk: "salle-de-bain",
    });
    expect(parseAnchor("#walk=away&full&level=outside")).toEqual({
      full: true,
      level: "outside",
      walk: "away",
    });
  });

  it("ignores what it does not understand", () => {
    expect(parseAnchor("#level=up&walk=../etc&colour=red")).toEqual({
      full: false,
      level: null,
      walk: null,
    });
  });
});
