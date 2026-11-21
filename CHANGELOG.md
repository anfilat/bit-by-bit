# Changelog

## [Unreleased]

## [0.3.0] - 2026-11-21

### Added

- Task groups: select several tasks and work on them together in one shared branch.
  - `/bit-by-bit start 2,3`, `2-4` or `2-4,7` — start a group right away.
  - `/bit-by-bit list` — `space` marks tasks (`a` — all, `i` — invert), `enter` confirms; enter without marks keeps the old single-select behavior.
  - Group status bar (`bit-by-bit: 2,3/8(✓1) | ✗ ▸ Title +1`) and group branch labels (`bbb:2+3:…`).
  - `done`/`undone` operate on the whole group; `next`/`prev` step over it.
  - `/bit-by-bit write` includes every task of the group in the document.

### Changed

- Branch entries now persist `taskIndexes` (one entry per task group). Old sessions with single-task `taskIndex` entries still reconstruct — as one-element groups.

## [0.2.0] - 2026-10-25

### Added

- The per-turn context message now warns the assistant that other tasks from the list may already be completed, so existing edits and git changes are expected and should be verified before assuming anything from the task description.

### Changed

- Renamed `/bit-by-bit choose` to `/bit-by-bit list`.
- Migrated to the pi 1.0 extension API.

### Fixed

- Hardened session restore (stale entries from previous bit-by-bit runs no longer leak into the current one) and command dispatch.

## [0.1.0] - 2026-05-11

- Initial release: task extraction from the last assistant message, an isolated session-tree branch per task, `start`/`choose`/`next`/`prev` navigation, `done`/`undone` markers, `/bit-by-bit write` progress documents, `off`/`resume` pause, status bar, and full state reconstruction on session restore.
