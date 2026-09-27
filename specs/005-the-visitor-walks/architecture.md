# Architecture — spec 005

| Piece                                                                                                                                                 | File                                                      | Tested                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| Path finder: breadth-first over `plan.doors` (rooms and `away`), door points as waypoints; an edge between storeys expands into the stair run's steps | `src/plan/path.ts`                                        | yes: every room reachable from `away`, through doors only |
| The anchor: `full`, `level`, `walk`                                                                                                                   | `src/anchor.ts`                                           | yes                                                       |
| The figure: meshes, walk cycle                                                                                                                        | `src/scene/visitor.ts`                                    | graph built without WebGL                                 |
| The walk: position along the path each frame, room entered → callback                                                                                 | `src/scene/walk.ts`                                       | pure stepping, tested                                     |
| The ghost orders                                                                                                                                      | `src/client/rest.ts` (`order(equipmentId, alias, value)`) | against a fake fetch                                      |

The renderer owns the figure like the household's people; the walk advances in the
same `ease(dt)` loop. Entering a room is the moment the walk's position crosses a door
waypoint; the app then sends the order and, at the destination, renews it every
minute while standing.
