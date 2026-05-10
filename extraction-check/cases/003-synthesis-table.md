All three reviewers completed. Here's a synthesis:

---

## Correctness Review — 0 Blockers, 2 Warnings

**Solid overall.** The dual-message scheme, session tree branching, state reconstruction, and hook composition are all correct. 176 tests pass.

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | Warning | `parseBranchEntry` returns `undefined` (non-null assertion on potentially missing `taskIndex`) — `undefined` passes the `!== null` check downstream | `branching.ts:17` → `return entryData.taskIndex ?? null;` |
| 2 | Warning | `reconstructState` done/undone loop doesn't scope to entries after the last init — double-start on the same leaf could apply stale done states | `state.ts:26-41` → iterate only entries after last init index |

Plus 6 notes (display glitch at ≤30 cols, misleading "not active" message, `handleNext`/`handlePrev` state before `await`, `findBranchInSubtree` picks latest across sub-branches, test assertion via reference mutation, `buildFileName` minute-granularity collision).

---

## Tests Review — 0 Blockers, 0 Warnings, 10 Suggestions

**Mature suite** — 176 tests, 21 files, full module coverage, real `SessionManager.inMemory()` for tree tests.

Notable gaps (all Suggestion-level):
- No test for `hasUI` guard on any command handler
- No test for `skipSessionTree` flag in session_tree handler
- No test for `formatStatus` title truncation at narrow terminals
- No test verifying `handleWrite` file path/content
- No test for `handleDone`/`handleUndone` when `!state.insideBbb`
- No test for `handleWrite` when `!ctx.model` with discussion
- `switchToTask` has no direct unit test (only tested through commands)

---

## Complexity Review — 0 Blockers, 7 Warnings, 4 Suggestions

| # | Severity | Finding |
|---|----------|---------|
| 1 | Warning | **9 command handlers copy-paste the same 3-step preamble** (hasUI guard → waitForIdle → initialized/active check). `done`/`undone` differ only in boolean direction; `next`/`prev` differ only in +1/−1 |
| 2 | Warning | `resolveNextTask`/`resolvePrevTask` are trivially inlinable one-liners exported solely for unit testing |
| 3 | Warning | Over-modularization: `wait-for-idle.ts` (12 lines), `commands.ts` (12 lines), `formatting.ts` (28 lines) — single-function files that could merge |
| 4 | Warning | `ExtractionCancelled` custom error class is never caught by type — a plain `Error` would suffice |
| 5 | Warning | `Task.index` is a denormalized field always equal to array position |
| 6 | Warning | Type aliases (`SessionManagerRO`, `SessionTreeNode`, `AuthResult`) obscure rather than clarify |
| 7 | Warning | `BitByBitEntryData` is a loosely-typed optional bag used with `!` non-null assertions at call sites |
| 8 | Suggestion | `findBranchInSubtree` does two unrelated things (find branch + find latest leaf) |
| 9 | Suggestion | Architecture doc comment lives on a constant rather than near the hooks that implement it |
| 10 | Suggestion | Two separate tree traversal implementations (recursive in `state.ts`, iterative in `branching.ts`) |
| 11 | Suggestion | `HANDLERS` dispatch table could be a simple `switch` |

---

## Recommended actions

**Fix now (2 items):**
1. The `?? null` fix in `branching.ts:17` (one-liner, prevents undefined propagation)
2. Scope `reconstructState`'s done/undone loop to entries after last init

**Consider for cleanup (high-ROI complexity reduction):**
- Extract a `guard()` helper to eliminate the 9-file preamble duplication
- Collapse `done`/`undone` into a shared `toggleDone(direction)` and `next`/`prev` into `navigate(delta)`
- Drop `ExtractionCancelled` class, `Task.index`, and the `HANDLERS` dispatch table

Want me to apply any of these fixes?