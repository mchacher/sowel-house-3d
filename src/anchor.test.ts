import { describe, expect, it } from "vitest";
import { parseAnchor } from "./anchor.ts";

describe("the frame's anchor (spec 003, amended)", () => {
  it("reads full, level and walk, in any combination", () => {
    expect(parseAnchor("")).toEqual({ full: false, level: null, walk: null, me: true, who: null });
    expect(parseAnchor("#full")).toEqual({
      full: true,
      level: null,
      walk: null,
      me: true,
      who: null,
    });
    expect(parseAnchor("#level=1&walk=salle-de-bain")).toEqual({
      full: false,
      level: 1,
      walk: "salle-de-bain",
      me: true,
      who: null,
    });
    expect(parseAnchor("#walk=away&full&level=outside")).toEqual({
      full: true,
      level: "outside",
      walk: "away",
      me: true,
      who: null,
    });
  });

  it("ignores what it does not understand", () => {
    expect(parseAnchor("#level=up&walk=../etc&colour=red")).toEqual({
      full: false,
      level: null,
      walk: null,
      me: true,
      who: null,
    });
  });

  it("walks someone else's figure, named, when told it is not mine (spec 005, amended)", () => {
    const anchor = parseAnchor("#walk=salle-de-bain&who=Visiteur%203&me=0&t=1");
    expect(anchor.walk).toBe("salle-de-bain");
    expect(anchor.me).toBe(false);
    expect(anchor.who).toBe("Visiteur 3");
  });

  it("never takes markup for a name", () => {
    expect(parseAnchor("#who=%3Cimg%20src%3Dx%3E").who).toBeNull();
    expect(parseAnchor("#walk=sejour").me).toBe(true);
  });
});
