# Architecture — spec 004

## One sun, three uses

```
state/sun.ts        sunPosition(sunrise, sunset, now) → { elevationDeg, azimuthDeg }
                    + NEW sunPath(sunrise, sunset): the day's arc, sampled
       │
       ├── renderer.ts   the directional light (as today)
       ├── scene/sky.ts  NEW — the sun disc and halo, the dotted path, on a dome
       └── hud/SunDial.tsx NEW — the dial, from the same position and times
```

`sunPath` is pure and tested: sampled positions from rise to set, the first at the
eastern horizon, the last at the western one, the highest at solar noon.

## The dome

Radius: the plot's half-diagonal plus a margin, so the disc never passes between the
camera and the house, and small enough to stay inside the camera's far plane. The
disc and the halo are sprites with a radial gradient drawn on a canvas once, additive,
`depthWrite` off, `fog` off; the path is a dashed line. None of it casts or receives
shadows, and none of it is ghosted by the storey focus: the sky is not a storey.

## The cardinal points

Four sprites on the ground at the plot's edges, from the plan's own frame: the scene
is laid out with north towards −z (`sunDirection`), so the letters are placed from
that, not from the camera.

## The dial

An SVG half circle in the HUD, mapping azimuth from east (90°) to west (270°) across,
elevation up. Its colours follow the HUD's themes (Tailwind `dark:`).
