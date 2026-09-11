# Plan — spec 002

| Step | What                                                                         | Test                                             | State |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------ | ----- |
| 1    | Every storey built at once, ghosting by focus (started under spec 001's PR). | `house.test.ts` "choosing a storey"              | ✅    |
| 2    | Plan types: parts, hole, stairs, roofs, patches, `gate` openings.            | typecheck                                        | ✅    |
| 3    | `compose.ts`: walls from rooms; openings hung; graph edges.                  | `compose.test.ts`                                | ✅    |
| 4    | `scripts/plan/showroom.ts`: the pavilion, composed and validated.            | `showroom.test.ts`                               | ✅    |
| 5    | Geometry: slab pieces, stair steps, gable roof.                              | `geometry.test.ts`                               | ✅    |
| 6    | Scene: slabs with holes, stairs, roofs, doors, patches, `outside` focus.     | `house.test.ts`                                  | ✅    |
| 7    | Doors derived from contacts; door state.                                     | `derive.test.ts`, `scene-state.test.ts`          | ✅    |
| 8    | Lit panes.                                                                   | `house.test.ts` "windows at night"               | ✅    |
| 9    | HUD: Extérieur, RDC, Étage. Framing includes the wing.                       | seen                                             | ✅    |
| 10   | Simulator reshaped and released as 0.3.0; showroom reset on it.              | simulator `validate`; showroom `verify-showroom` | 🚧    |

## Seen, on the running showroom

Screenshots from a driven Chrome, software WebGL: outside, ground floor, upstairs.
The garage door on the east wall, the drive to the street, the terrace and the pool
to the south.
