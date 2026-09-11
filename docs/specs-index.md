# Specs index — sowel-house-3d

Every feature ever specified in this repository, one row each, newest last. A
CI check (`scripts/check-specs-index.sh`) fails a pull request that creates a
`specs/NNN-name/` folder without its row here.

The seven cross-repository phases live in the showroom's
[project map](https://github.com/mchacher/sowel-showroom/blob/main/docs/project-map.md).
This index is the detail below them: a phase can take several specs, and a spec
here says which phase it serves.

Status: 📝 Draft · 🚧 In progress · ✅ Shipped

| #   | Title                    | Status | Summary                                                                                                                                                 |
| --- | ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | The house, read-only     | ✅     | Phase 3. The plan as data, the Sowel mapping derived rather than listed, REST + WebSocket, and the scene ported from the prototype.                     |
| 002 | A house worth looking at | 🚧     | Phase 3, second pass. A composed plan of a pavilion, two storeys stacked with the one being read solid, a roof, stairs, doors that report, lit windows. |

## How to use this index after context loss

1. Read the showroom's project map first — the decisions there are not reopened.
2. Look at `prototype/maison-temoin.html` for the visual direction that was
   validated. Do not grow it; it is a reference, not a codebase.
3. Scan this table for a spec that already covers what you are about to do.
4. Open `specs/NNN-name/spec.md` for the requirements, `architecture.md` for the
   shape, `plan.md` for the steps and the test plan.
