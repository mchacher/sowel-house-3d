# Plan — spec 003

Built iteratively on the running showroom, then written down. Each step shipped in
`feat/serve-under-proxy` (PR #5).

| Step | What                                                                  | Test                                           | State |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------- | ----- |
| 1    | FR/EN strings, `sowel_language` shared with Sowel, `nameEn` on rooms. | `showroom.test.ts` names both languages        | ✅    |
| 2    | "Ouvrir Sowel", hidden when framed or signed out.                     | seen                                           | ✅    |
| 3    | `?mini=1`: closer framing, trouble line, compact storey buttons.      | seen in the showroom's vignette                | ✅    |
| 4    | `#full` and back without a reload, storey kept.                       | seen, driven over DevTools                     | ✅    |
| 5    | No camera flights.                                                    | seen: lights switched from Sowel, camera still | ✅    |

## Seen, on the running showroom

A driven Chrome on the local showroom: the vignette over the dashboard, full screen
and back with the button and with Escape, the garden lights switched from Sowel and
lit in the vignette.
| 6 | Amendment 09-27: `level=<n>` in the anchor. | the anchor parser, tested | 📝 |
