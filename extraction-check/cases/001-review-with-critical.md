Now I have a comprehensive understanding of the entire extension. Let me compile the review.

---

## Review of `extensions/bit-by-bit/`

### Overall Assessment: **Well-architected, tests pass, types check.** A few issues and suggestions below.

---

### ✅ What's done correctly

1. **Extension structure** — Directory with `index.ts` entry point is the correct pattern for multi-file extensions. Auto-discovered from `./extensions` in `package.json`.

2. **Event subscription** — All 5 events (`session_start`, `before_agent_start`, `context`, `turn_end`, `session_tree`) are correctly subscribed via `pi.on()`. Handlers are properly thin adapters.

3. **Command registration** — `/bit-by-bit` with subcommands, autocomplete, and proper argument parsing. Pattern matches the pi docs.

4. **State persistence** — Uses `pi.appendEntry()` for init/branch/done/undone/off/resume entries, and reconstructs from session history on `session_start`. This is the recommended pattern.

5. **Session tree navigation** — Uses `ctx.navigateTree()` for branching, `pi.setLabel()` for bookmarks, `pi.sendMessage()` for task descriptions. All correct per the API.

6. **Context filtering** — `context` event filters out `TASK_DESCRIPTION` messages to avoid polluting LLM context. Correct.

7. **Branch tracking** — `branchLeafId` saved in `turn_end` and restored from tree structure in `reconstructState`. Solid.

8. **Extraction** — Uses `complete()` from `@earendil-works/pi-ai` directly with proper auth, signal, and error handling. The `BorderedLoader` with abort support is correct.

9. **Tests** — 148 tests, all passing. Good coverage of state reconstruction, branching, command parsing, event handlers, and edge cases. Uses real `SessionManager.inMemory()` for integration tests.

10. **TypeScript** — `tsc --noEmit` passes clean. Types are well-defined, with utility types derived from actual pi APIs.

---

### 🔴 Issues (should fix)

#### 1. `context` handler doesn't return `{ messages }` when nothing is filtered

In `index.ts` → `onContext`:
```ts
function onContext(state: BitByBitState, event: ContextEvent) {
  if (!state.initialized) return;
  // ...
  return { messages: filtered };
}
```
When `!state.initialized`, it returns `undefined`, which is fine (pi keeps messages unchanged). But when `state.initialized` is true and there are no `TASK_DESCRIPTION` messages, it still returns a new `{ messages }` array with the same contents. This is **wasteful but not a bug** — pi handles it correctly. Still, it would be cleaner to return `undefined` when no filtering occurred:

```ts
const hasTaskDesc = event.messages.some(
  msg => msg.role === 'custom' && msg.customType === MESSAGE_TYPE.TASK_DESCRIPTION
);
if (!hasTaskDesc) return;
```

#### 2. `handleOff` doesn't update `insideBbb` or save current task's `branchLeafId`

When `off` is called while `insideBbb` is true, the current task's `branchLeafId` isn't updated to the current leaf. If the user does work after `/bit-by-bit off` and then resumes, the task will navigate back to the old `branchLeafId`, losing the post-off work that was still in the task's subtree.

#### 3. `handleResume` doesn't handle the case where `state.tasks` is empty

If somehow `tasks` is empty (shouldn't happen but defensive coding), `state.currentTaskIndex = taskIndex` from `findTaskByLeaf` would be `0`, and subsequent status formatting would access `state.tasks[0]` which could be undefined.

---

### 🟡 Warnings (should consider)

#### 4. `switchToTask` — `task.branchLeafId` set with non-null assertion

```ts
task.branchLeafId = ctx.sessionManager.getLeafId()!;
```
The `!` assertion could fail if `getLeafId()` returns `null` (e.g., empty session). The code above does check `if (leafId)` for the `appendEntry`/`setLabel` calls, but then still sets `branchLeafId` with `!`. Should use the same `leafId` variable:

```ts
const leafId = ctx.sessionManager.getLeafId();
if (leafId) {
  pi.appendEntry(...);
  pi.setLabel(leafId, formatLabel(task));
  task.branchLeafId = leafId;
}
```

#### 5. `handleSelect` — fragile index parsing from formatted string

```ts
const match = selected.match(/^\\S\\s+(\\d+)\\./);
```
This parses the task index from the formatted display string like `\"✗ 1. Title ←\"`. If `formatTaskList` changes format, this breaks silently. Consider returning structured data or using the array index directly via `items.indexOf(selected)`.

#### 6. `reconstructState` scans all entries linearly

For long sessions with many entries, scanning from the end to find the last init entry, then scanning all entries for done/undone/off/resume is O(n). This is fine for typical sessions but worth noting.

#### 7. `findBranchInSubtree` uses timestamp comparison for leafId

```ts
if (entry.timestamp >= latestTs) {
  latestTs = entry.timestamp;
  latestId = entry.id;
}
```
Timestamps are `string` (ISO format), so lexicographic comparison works correctly for ISO 8601. ✅ But if `timestamp` is ever a `number`, string comparison would be wrong. The type in `SessionTreeNode` is `string`, so this is fine for now.

#### 8. `handleWrite` is a stub

The `/bit-by-bit write` command just shows \"not implemented yet\". This is documented in `AGENTS.md` as 🔲. Not a bug, just incomplete.

---

### 💡 Suggestions (nice to have)

#### 9. Custom message renderer for `MESSAGE_TYPE.TASK_DESCRIPTION`

The extension sends messages with `customType: 'bit-by-bit'` but doesn't register a `registerMessageRenderer()`. This means task descriptions will use default rendering. A custom renderer could show a styled task header with index/total.

#### 10. No `session_shutdown` cleanup

The extension doesn't subscribe to `session_shutdown`. Since state is fully in-memory and reconstructed from entries, this isn't strictly needed, but it's good practice per the docs.

#### 11. `before_agent_start` doesn't use `event.systemPrompt`

The handler returns a `message` but doesn't modify the system prompt. This is fine — the injected message approach works. But using `systemPrompt` modification would be more reliable for ensuring the LLM always sees the task context, even after compaction.

#### 12. `promptSnippet` / `promptGuidelines` not applicable

Since this extension registers a command (not a tool), these don't apply. Just noting it for completeness.

---

### Summary

| Category | Verdict |
|----------|---------|
| Extension registration | ✅ Correct |
| Event handlers | ✅ Correct |
| State persistence & reconstruction | ✅ Solid |
| Command handlers | ✅ Correct |
| Session tree navigation | ✅ Correct |
| LLM extraction | ✅ Correct |
| Tests (148 passing) | ✅ Good coverage |
| TypeScript | ✅ Clean |
| **Issues** | 2 non-critical bugs (#2, #4), 1 minor design gap (#1) |
| **Stub** | `write` command not implemented (documented) |