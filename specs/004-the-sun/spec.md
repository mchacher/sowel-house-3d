# Spec 004 — The sun in the sky

**Status**: 📝 Draft, for review.

## Context

The owner, 2026-09-26: _it would be good to see the sun in the sky, its position —
one way or another._

The scene already knows where the sun is. `SunPosition` (spec 001, FR5) gives an
elevation and an azimuth, interpolated between the sunrise and sunset Sowel reports,
and the renderer points its light along it: the shadows turn, the sky warms at dusk.
Nothing shows the sun itself. A visitor sees the light change and has to guess why.

Where the camera stands decides what can be seen. It frames the house from the
south-east, looking north-west and down (`cameraFor`). The morning sun, in the east,
and the midday sun, in the south, are behind it; only the afternoon sun, going down
in the west, comes into view. A sun drawn only in the sky would be missing most of
the day, so the sun is also shown where the camera cannot lose it: in the HUD.

## Goals

- The sun is visible in the sky whenever the camera faces it.
- Its position in the day reads at a glance, whatever the camera does: in the HUD, a
  small dial with the sun on its arc, and the day's sunrise and sunset.
- Directions in the scene can be read — the panels face south, the terrace west.
- The sun in the sky, the one on the dial and the light on the house are the same
  sun: one `SunPosition`, three uses.

## Non-goals

- An astronomical sun. Spec 001's interpolation stands: agreeing with Sowel's sunrise
  matters more than agreeing with the almanac.
- The moon, stars, clouds. Weather visuals are phase 6.

## Functional requirements

### FR1 — The sun, in the sky

A disc with a soft halo, on a dome around the house far enough out that it never
passes in front of it, at the current elevation and azimuth. Warmer and larger near
the horizon, white higher up. Below the horizon it is not drawn. It moves as the
light does, eased, never jumping.

### FR2 — Its path

Today's arc on the same dome, from where the sun rose to where it will set, drawn
faint and dotted, with the part already travelled a shade stronger. From outside, a
visitor facing west in the afternoon sees the sun on its way down its own path.

### FR3 — The cardinal points

N, E, S and W, set on the ground just outside the plot, in the HUD's type, so the
scene can be read against the dial: the panels on the south slope, the sun setting
behind the terrace.

### FR4 — The sun in the HUD

A small dial in a corner: a half circle for the sky from east to west, the horizon
under it, the sun on the arc at its current position, sunrise and sunset times at
its two ends. At night the sun sits under the horizon, greyed, and the dial says
when it rises. In the vignette (spec 003) it shrinks to the half circle and the sun,
without the times.

## Acceptance criteria

- At 15:00 on a clear day, from outside, orbiting to face south-west shows the sun
  on its path, and the shadows fall away from it.
- At any time, the HUD's dial shows the sun where the light comes from: east in the
  morning, high in the south at midday, west in the evening, below the horizon at
  night.
- The dial's sunrise and sunset match the house zone's in Sowel.
- The vignette shows the compact dial and stays readable at 440 × 300 px.

## Edge cases

- **Sowel reports no sunrise or sunset.** The sun keeps spec 001's fallback position;
  the dial shows no times rather than wrong ones.
- **The camera orbits under the dome's horizon.** The sun is not drawn through the
  ground.
- **Polar day or night** — not a case for this app's interpolation, which needs both
  times; the fallback above applies.
