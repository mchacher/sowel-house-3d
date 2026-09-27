# Plan — spec 005

| Step | What                                                                                                                             | Test                                                     | State |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----- |
| 1    | `path.ts`: routes through doors and stairs.                                                                                      | every room from `away`; doors only                       | ✅    |
| 2    | `anchor.ts`: `full`, `level`, `walk`.                                                                                            | parser tests                                             | ✅    |
| 3    | `visitor.ts`: the figurine.                                                                                                      | seen, full and vignette                                  | ✅    |
| 4    | `walk.ts` and the renderer: walking, stairs, storey follows.                                                                     | stepping tests; seen                                     | ✅    |
| 5    | Ghost orders on entering, renewed while standing.                                                                                | fake fetch; seen with the lights                         | ✅    |
| 7    | Amendment 09-27: walking around everything — a grid per storey, A*, entries read off the walk.                                   | every walk clear of every obstacle; every room reachable | ✅    |
| 6    | Amendment 09-27: the view and the ghosting follow the figure — outside, ground floor, upstairs, switching halfway up the stairs. | `focusAt` tested; seen                                   | ✅    |

## Walked, on the local showroom

As the guest on the dashboard, "Entrer dans la salle de bain" from the showroom's
panel: the figure walks in from the street, the hall, stairwell and bathroom lamps
come on as it enters each, the vignette follows it to the upper storey, and the
bathroom recipe switches the lamp off about two minutes after "Sortir".

Two things the walk found. The figure stopped on the room's spot, where a household
member stands, and vanished inside them: it stops beside the spot now. And at 1.1 m
it was a few pixels in the vignette: it is 1.5 m, with an amber ring at its feet (a
"Toi" label was tried and dropped).
