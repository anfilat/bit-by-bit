All green — tests, types, formatting, linting. Now let me do the thorough code review.

---

## Review of `extensions/bit-by-bit/`

### Summary

This is a well-structured extension implementing step-by-step task management that splits an LLM response into individual tasks, each worked on in an isolated session tree branch. The architecture is clean, with good separation of concerns across modules.

---

### ✅ What's done well

1. **Architecture & Separation of Concerns**
   - Clean module breakdown: `index.ts` (entry point + event wiring), `commands/` (subcommand handlers), `branching.ts` (tree traversal), `state.ts` (reconstruction), `extraction.ts` (LLM task extraction), `formatting.ts` (display helpers), `status.ts` (status bar), `write.ts` (progress documents).
   - Each command handler is its own file with a single responsibility.
   - `switchToTask` extracted as a shared utility in `commands/switch-task.ts`.

2. **Dual-message scheme** (well-documented in `constants.ts`)
   - `TASK_DESCRIPTION` (display: true, filtered from LLM context) — user-visible markers.
   - `CONTEXT` (display: false, injected via `before_agent_start`) — LLM-focused instructions.
   - Clean separation of user-facing and model-facing context.

3. **State persistence & reconstruction** (`state.ts`)
   - `reconstructState` properly replays `DONE`/`UNDONE`/`OFF`/`RESUME` entries over the init data.
   - Computes `branchLeafId` from the tree structure.
   - Determines `insideBbb` from the current leaf position.

4. **Event handling** (`index.ts`)
   - `skipSessionTree` flag to prevent self-triggering during programmatic navigation — correct pattern.
   - `onSessionTree` correctly handles both \"inside bbb\" and \"outside bbb\" cases, preserving `currentTaskIndex` when outside.
   - `onTurnEnd` persists `branchLeafId` on every turn for proper branch restoration.

5. **Error handling & UX**
   - Guards: `hasUI`, model check, no assistant message, cancelled extraction, empty/single task.
   - `BorderedLoader` for async operations (extraction, summarization) with abort support.
   - Proper autocomplete for subcommands.
   - Status bar with truncation for long titles.

6. **Test coverage** — 179 tests across 21 files, covering:
   - Integration (command registration, event handlers, autocomplete).
   - Each subcommand handler with edge cases.
   - Pure functions (extraction, formatting, parsing, branching).
   - State reconstruction, session lifecycle events.

7. **Pi API usage**
   - Correct use of `pi.appendEntry()` for non-LLM state, `pi.sendMessage()` for LLM-visible messages.
   - `pi.setLabel()` for branch identification in `/tree`.
   - `ctx.navigateTree()` with `{ summarize: false }`.
   - `BorderedLoader` follows the documented pattern from TUI docs.
   - `SelectList` with `DynamicBorder` in `choose.ts` follows the recommended Pattern 1.

---

### ⚠️ Issues and Suggestions

#### Critical / Bugs

**1. `findBranchInSubtree` may return wrong `leafId`** (`branching.ts`)

The function iterates subtree nodes and tracks the one with the latest timestamp as `leafId`. But this isn't the actual leaf — it's just the node with the highest timestamp among entries in that subtree. The session tree's actual leaf for a branch is determined by `parentId` chains, not by timestamps. If entries have non-monotonic timestamps (e.g., due to clock adjustments, parallel operations, or restored sessions), this could return the wrong leaf.

```typescript
// branching.ts:58-61
if (entry.timestamp >= latestTs) {
  latestTs = entry.timestamp;
  latestId = entry.id;
}
```

**Risk**: Restoring a branch after session reload could navigate to the wrong position. In practice, timestamps are usually monotonic, so this is a low-severity issue, but it's still an assumption worth documenting or replacing with proper tree traversal (walking to the deepest child or using the actual leaf tracking from the session tree).

**2. `onSessionTree` saves `branchLeafId` unconditionally when `insideBbb`** (`index.ts:88-93`)

```typescript
if (state.insideBbb) {
  const currentTask = state.tasks[state.currentTaskIndex];
  if (currentTask?.branchLeafId) {  // ← only saves if already has a leafId
    const leafId = ctx.sessionManager.getLeafId();
    if (leafId) currentTask.branchLeafId = leafId;
  }
}
```

This is guarded by `currentTask?.branchLeafId` (falsy check), so it only updates tasks that already have a `branchLeafId`. This is correct — but the condition name is slightly misleading. The intent is \"only update if the task has been visited\", which is what `branchLeafId` being set means. No actual bug, but worth a comment for clarity.

#### Warnings

**3. `write.ts` uses synchronous `writeFileSync` / `mkdirSync`** (`commands/write.ts:46-48`)

```typescript
mkdirSync(dir, { recursive: true });
writeFileSync(filePath, document, 'utf-8');
```

This blocks the event loop during I/O. In an extension context this is unlikely to be a problem (small files, infrequent operation), but the async versions (`fs.promises.mkdir`, `fs.promises.writeFile`) would be more idiomatic for an async extension handler. This matches common patterns in other pi extensions though.

**4. `state.ts` applies done/undone entries across ALL entries, not just those on the current branch** (`state.ts:36-51`)

```typescript
for (const e of entries) {
  // ... applies DONE/UNDONE/OFF/RESUME for matching rootEntryId
}
```

`getEntries()` returns *all* entries (not just current branch). If the user navigated to a different branch and created conflicting entries there, they'd all be replayed. Since the entries are scoped by `rootEntryId`, this is safe — but if there were multiple `bit-by-bit-init` entries (from separate `/bit-by-bit start` calls), only the last init is used, but ALL subsequent done/undone entries matching its `rootEntryId` are applied. This is actually correct behavior, but worth being aware of.

**5. No cleanup of old `bit-by-bit-init` data** — Multiple calls to `/bit-by-bit start` would leave old init entries in the session. The code only uses the last one (reverse scan), so this isn't a bug, but it does mean old entries accumulate.

**6. `extraction.ts` depends on `@earendil-works/pi-ai` directly** — Uses `complete()` and types from `pi-ai`. This is listed as an available import in the docs, so this is fine. Just noting it as a coupling point.

#### Suggestions

**7. `handleOff` doesn't reset `insideBbb` or `currentTaskIndex`** (`commands/off.ts`)

When the user pauses with `/bit-by-bit off`, `state.active` is set to false but `insideBbb` and `currentTaskIndex` remain unchanged. This is fine because `onBeforeAgentStart` and `onTurnEnd` check `state.active`, but it means `formatStatus()` returns `undefined` when paused, which clears the status bar entirely. This is intentional (per the code), but consider showing \"bit-by-bit: paused\" in the status bar instead so the user knows the mode is available.

**8. `formatStatus` uses `process.stdout.columns`** (`status.ts:13`)

```typescript
const cols = process.stdout.columns ?? 80;
```

This works in interactive mode but will be `undefined` in JSON/print mode. The `?? 80` fallback handles it, but it's slightly inconsistent with the rest of the code that checks `ctx.hasUI`.

**9. Missing `session_shutdown` handler** — The extension registers `session_start` but not `session_shutdown`. If the extension held resources that needed cleanup ( timers, file handles, etc.), this would be a gap. Currently it's fine since state is purely in-memory and reconstructed on load.

**10. `handleWrite` ignores `_pi` parameter** (`commands/write.ts:7`)

The `_pi` parameter is unused. The write operation uses `ctx.ui.custom()` and `ctx.modelRegistry` directly instead. This is fine — just a dead parameter.

**11. Test helpers have two separate `createMockPi` implementations** — `__tests__/helpers.ts` and `commands/__tests__/helpers.ts` have duplicated mock logic. The commands version is more complete (includes `bitByBitExtension(pi)` call). Consider consolidating into a shared test utility.

**12. `parseTaskJson` has a subtle edge case** (`extraction.ts:44-46`)

```typescript
if (e instanceof SyntaxError) {
  // Not raw JSON — try stripping markdown fence
} else {
  throw e;
}
```

If `doParse` throws a `SyntaxError` from inside `JSON.parse`, it falls through to the fence-stripping path — correct. But if `doParse`'s `filter`/validation logic throws a `TypeError` (e.g., `parsed.filter is not a function` because the JSON isn't an array), it re-throws. However, the actual guard is `if (!Array.isArray(parsed)) throw new Error('Not an array')`, so `TypeError` from `.filter` shouldn't occur. The error handling is correct, just subtle.

---

### Compliance with Pi Extension Patterns

| Pattern | Status | Notes |
|---------|--------|-------|
| Event registration | ✅ | Uses `pi.on()` for all required lifecycle events |
| `pi.registerCommand` | ✅ | With description, handler, and autocomplete |
| `pi.appendEntry` | ✅ | For non-LLM state (init, branch, done, etc.) |
| `pi.sendMessage` | ✅ | With `triggerTurn: false` for task markers |
| `pi.setLabel` | ✅ | For branch identification |
| `ctx.navigateTree` | ✅ | With `{ summarize: false }` |
| `ctx.waitForIdle()` | ✅ | Before all command operations |
| `BorderedLoader` | ✅ | Follows TUI pattern for async ops |
| `SelectList` + `DynamicBorder` | ✅ | Follows recommended Pattern 1 |
| State reconstruction on `session_start` | ✅ | Robust replay logic |
| `context` hook for message filtering | ✅ | Proper non-destructive filtering |
| `before_agent_start` for context injection | ✅ | Returns `{ message }` correctly |
| TypeBox for tool params | N/A | No custom tools registered |
| `ctx.ui.setStatus` | ✅ | For footer status indicator |
| Theme usage | ✅ | `theme.fg()`, `theme.bold()` used correctly |

---

### Verdict

This is a **high-quality extension** that correctly follows pi's extension API patterns and conventions. The architecture is clean, the dual-message scheme is well-designed, and the test coverage is comprehensive. No critical bugs found. The issues above are minor — mostly suggestions for robustness, documentation, or code hygiene. The main risk item is the timestamp-based leaf resolution in `findBranchInSubtree`, which works in practice but rests on an unspoken assumption about timestamp monotonicity.