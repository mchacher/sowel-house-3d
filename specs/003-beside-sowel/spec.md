# Spec 003 — The house beside Sowel

**Status**: ✅ Implemented — written after the fact, 2026-09-26, to put on record
work that was built iteratively with the owner at the screen. The showroom's half
is its spec 002.

## Context

Spec 002 made a house worth looking at, on a page of its own at `/maison/`. A
visitor in the Sowel interface never saw it: once past the landing page, `/` is the
dashboard, and nothing pointed to the 3D view. The owner's ask was to watch the
house react while using Sowel — switch on the garden lights in the product, see
them come on in the house.

Two layouts were tried on the running demo. **Side by side**, with a draggable
divider, needed Sowel framed, and the owner found it looked poor. **A vignette** —
the house small in a corner, over the interface — is what stayed. This spec is the
3D application's part of it; the showroom injects and frames the vignette (its
spec 002).

## Goals

- The 3D app runs in two sizes: a vignette (`?mini=1`) and full screen.
- In the vignette, the house is readable at 440 × 300 px and the storey buttons are
  still there.
- The camera stays where the visitor put it. It never moves because something
  changed.
- The app speaks the visitor's language, the one Sowel already speaks to them.
- A way back to Sowel from the full page, and none where it would make no sense.

## Non-goals

- Clicking in the 3D view to send orders. Phase 4.
- Where the vignette sits, how it is dragged or resized: the showroom's page does
  that (its spec 002). This app only knows its own size.

## Functional requirements

### FR1 — The vignette

`?mini=1` starts the app outside, the camera closer (`MINI_CLOSENESS = 0.68` of the
normal framing), and the HUD cut to two things: the trouble line when there is
one, and compact storey buttons (Extérieur, RDC, Étage). Nothing else fits, and
nothing else is needed to follow the house.

### FR2 — Full screen, and back

The page that hosts the vignette opens it full screen by setting the frame's
`#full` anchor, which reloads nothing. The app listens for `hashchange`: with
`#full` it shows the full HUD and the normal framing, without it the vignette's.
The storey being read is kept across the switch.

### FR3 — A camera that stays put

The first vignette flew the camera to whatever had just changed. On the running
demo it lurched on every click, often to somewhere unrelated, and the owner asked
for it to stop. The camera moves only when the visitor moves it, or presses
Recadrer, or changes storey.

### FR4 — The visitor's language

The Sowel interface stores its language in `localStorage.sowel_language`. This app
is served from the same origin (showroom spec 002), so it reads the same key:
French or English, falling back on the browser's language. The HUD's FR/EN toggle
writes the key back, so switching here switches Sowel too. Rooms carry `nameEn` in
the plan and the scene uses it in English.

### FR5 — A way back to Sowel

The full page has an "Ouvrir Sowel" button to the product interface. It is hidden
when the app is framed — Sowel is already on screen around it, and the link would
load Sowel inside its own vignette — and when there is no session.

## Acceptance criteria

- `/maison/?mini=1` in a 440 × 300 frame shows the house from outside and three
  storey buttons that work.
- Setting the frame's hash to `#full` gives the full HUD without a reload; clearing
  it gives the vignette back, on the same storey.
- Switching a light on in Sowel lights it in the vignette and the camera does not
  move.
- With `sowel_language = "en"`, the HUD and room names are in English.
- "Ouvrir Sowel" is absent in the vignette and present on `/maison/` opened directly.

## Edge cases

- `#full` without `?mini=1`: the page is already full; the anchor changes nothing.
- No `sowel_language` and a French browser: French.
- The frame is resized: the renderer follows its canvas size, whatever it is.
