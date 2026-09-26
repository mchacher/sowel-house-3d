# Architecture — spec 003

## Where each piece lives

| Concern           | File                    | Notes                                                                       |
| ----------------- | ----------------------- | --------------------------------------------------------------------------- |
| Mode from the URL | `src/App.tsx`           | `MINI` from `?mini=1`, read once; `fullRequested()` reads `#full`.          |
| Switching size    | `src/App.tsx`           | a `hashchange` listener sets `mini` and calls `renderer.setMini`.           |
| Framing distance  | `src/scene/renderer.ts` | `setMini(mini)` sets `closeness`; `recentre` multiplies by it.              |
| HUD in each size  | `src/hud/Hud.tsx`       | `mini` prop: trouble line and compact levels only. `FRAMED` hides the link. |
| Language          | `src/i18n.ts`           | `detectLang`, `rememberLang`, `named(room, lang)`; one strings table.       |

## Why an anchor and not a message

The host page and this app share an origin, so the host could call into the frame
or `postMessage` it. The anchor is simpler than both: it survives a reload of the
frame, needs no handshake, and a person can type it. Setting a same-origin frame's
`location.hash` does not reload it.

## Why the camera does not follow

`ease()` in the renderer walks the scene towards the state Sowel reports: lamps,
shutters, doors, people. The camera is not part of that state. A flight was an
extra target on the camera, set from the last change; removing it removed the
target, and the controls own the camera again.
