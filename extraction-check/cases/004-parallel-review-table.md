## Parallel Review Complete — `bit-by-bit` Extension

All three fresh-context reviewers finished. Here's the synthesis:

---

### 🔴 Correctness Review — Key Findings

| Severity | Finding | Location |
|----------|---------|----------|
| **Blocker** | `state.ts:42,44,63` — `taskIndex` has no bounds check during reconstruction. A stale or corrupted DONE/UNDONE/BRANCH entry with `taskIndex >= tasks.length` throws `TypeError` and crashes the entire `session_start` handler | `state.ts:42,44,63` |
| Note | In-memory state mutated before async `switchToTask` with no rollback on failure | `choose.ts:80`, `next-prev.ts:35`, `start.ts:75` |
| Note | `slugify` can return empty string → malformed filenames like `2026-05-10-14-30-.md` | `write.ts:20` |
| Note | `buildDocumentWithDiscussion` doesn't check `stopReason === 'aborted'` | `write.ts:146` |

**What's correct:** Dual-message scheme, `skipSessionTree` guard, command guard pattern, branch reconstruction, `parseTaskJson` — all solid.

---

### 🟡 Tests Review — Key Findings

168 tests pass across 20 files. Strong coverage overall. Gaps:

| Priority | Gap | Location |
|----------|-----|----------|
| **Medium** | `switchToTask` never tested with `navigateTree` returning `{ cancelled: true }` — code would incorrectly create branch entries | `commands/__tests__/` (no test file) |
| Low-Med | `getLeafId()` returning null in `switchToTask` — null-safety path untested | `commands/switch-task.ts:44-52` |
| Low | `guard.ts` `hasUI = false` path untested for all commands | `commands/__tests__/helpers.ts` hardcodes `true` |
| Low | `formatBranchConversation` string `msg.content` path untested | `write.ts:76-78` |
| Very Low | `parseTaskJson` bare fence (no `json` tag) untested | `extraction.ts:39` |

---

### 🟠 Unnecessary Complexity Review — Key Findings

| Priority | Finding | Location |
|----------|---------|----------|
| **Medium** | `resume.ts` duplicates 3 guard checks instead of extending `guard()` with a `{ requirePaused: true }` option | `resume.ts:8-27` vs `guard.ts:14-25` |
| Low | `Task.index` field is redundant with array position | `types.ts:5`, set in `start.ts:104` |
| Low | ~8 exports exist solely for test access (no external consumers) | Various |
| Low | `resolveNextTask`/`resolvePrevTask` are trivial ±1 one-liners, over-abstracted | `next-prev.ts:7-14` |
| Low | `EXTRACTION_PROMPT`, `MAX_SLUG_LENGTH` exported but never imported externally | `extraction.ts:4`, `write.ts:8` |
| Low | `wait-for-idle.ts` is a 5-line standalone module | `wait-for-idle.ts` |
| Low | `GuardOptions` interface for a single optional boolean | `guard.ts:5-7` |
| Low | `BitByBitEntryData` is too loose to provide meaningful type safety | `types.ts:22-25` |

---

### Synthesis — Fixes Worth Doing Now

1. **Bounds-check `taskIndex` in `reconstructState`** (correctness blocker — crash on corrupted sessions)
2. **Handle `navigateTree` cancelled result in `switchToTask`** (test gap + latent logic bug)
3. **Extend `guard()` with a `requirePaused` option and fold `resume.ts` checks into it** (complexity reduction)

### Defer

- Test-only exports, `Task.index` removal, `wait-for-idle` folding — good cleanup backlog items but not urgent
- Slug edge cases, status truncation at 0 columns, TOCTOU in wait-for-idle — cosmetic/minor

Want me to implement any of these fixes?