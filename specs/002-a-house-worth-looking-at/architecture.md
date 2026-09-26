# Architecture — spec 002

## The tiers, unchanged

Pure and tested: `src/plan/compose.ts` (rooms → walls), `src/scene/geometry.ts`
(slab pieces, stair steps, gable roof, framing), `src/mapping/derive.ts` (doors),
`src/state/scene-state.ts` (door state). Scene graph, tested without WebGL:
`src/scene/house.ts`. Seen, not tested: `src/scene/renderer.ts`.

## Composition

```
scripts/plan/showroom.ts      the description: rooms, windows, doors, links,
        │                     stairs, roofs, patches
        ▼
src/plan/compose.ts           wallsOf(level, rooms) → Wall[]
        │                     composePlan(spec) → Plan (+ graph edges)
        ▼
public/plans/showroom.json    the contract everything else reads
```

`wallsOf` works line by line. For each axis, the lines are every room edge and
every slab edge; on each line the cut points are every corner touching it. An
elementary interval is probed a hair either side: a wall stands where the room on
one side is not the room on the other (a room, the corridor, or nothing), and it is
`outside` where one side is not under the slab. Adjacent intervals of the same kind
merge, so a façade is one run carrying all its windows.

## The scene graph

```
root
├── outdoor   (group at y = 0; ground, patches, terrace, pool)
├── level 0   (group at y = 0)
├── level 1   (group at y = pitch)
└── roof      (group; slopes and gables at their storey's elevation)
```

Each group owns a copy of the structural materials (`copyMaterials`), and
`focusLevel(handles, focus)` flips them with `setGhost`. Nothing is rebuilt on a
focus change. `Focus = number | "outside"`.

Doors are `DoorHandle`s: a pivot group (swing) or a lintel-anchored panel (lift),
with a `target` the renderer eases towards, exactly as shutters are handled. Panes
are kept per room so `applyState` can swap them to `glassLit`.

## What the simulator does on its side

`scripts/fixture/reshape.ts` in `sowel-plugin-simulator` reshapes the backup to
the same rooms; `layout.ts` there carries this plan's areas and orientations. The
plan is the drawing; the simulator is the physics of the same building.
