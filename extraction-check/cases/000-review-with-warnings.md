Here's my review of `extensions/bit-by-bit/`:

---

## Code Review: `extensions/bit-by-bit/`

### Summary

Bit-by-bit is a Pi extension for step-by-step task management extracted from LLM messages. Each task gets its own branch in the session tree for context isolation. The architecture is sound — state is persisted via custom entries and reconstructed on session start, with branching logic for tree navigation. However, **only 1 of 9 commands is implemented**, making this a partial MVP.

---

### 🔴 Critical

**1. `reconstructState` mutates shared entry data (`state.ts:22-30`)**

```ts
const { rootEntryId, sourceMessage, tasks } = initData;
// ...
if (data.taskIndex !== undefined) tasks[data.taskIndex].done = true;
```

`initData` is a direct reference to the entry stored in `SessionManager`. Mutating `tasks[i].done` modifies the stored entry in-place. If the session manager caches entries or reuses them across calls, this causes subtle cross-contamination — calling `reconstructState` twice would apply done/undone entries on top of already-mutated state. Fix: deep-clone `tasks` before mutating:

```ts
const tasks = initData.tasks.map(t => ({ ...t }));
```

**2. `EXTRACTION_PROMPT` is narrowly scoped to code review (`extraction.ts:10-17`)**

```
\"You are a code review result parser. Extract all identified issues from the text.\"
```

The extension's docstring says \"step-by-step task management extracted from LLM messages\" — a general purpose. The prompt will fail or return `[]` for non-review messages (e.g., a planning response listing implementation steps). The prompt should either be generalized or made configurable.

---

### 🟡 Warning

**3. Only `/bit-by-bit start` is implemented — 8 commands are stubs**

`select`, `next`, `prev`, `done`, `undone`, `write`, `off`, `resume` all just show \"not implemented yet\" notifications. This means the extension can extract tasks and enter the first one, but has no navigation, completion, or pause/resume capability. This severely limits the value of the extension.

**4. `onSessionTree` is an empty stub (`index.ts:88-90`)**

```ts
function onSessionTree(_state, _event, _ctx): void {
  // Stub — will be implemented in step 18
}
```

Session tree navigation events are essential for updating `currentTaskIndex` and `insideBbb` when the user manually navigates the tree. Without this, the status bar and task context injection will go stale after any manual navigation.

**5. No error handling around `pi.appendEntry` / `pi.setLabel` calls (`commands/start.ts`)**

These calls hit the session manager and can fail (e.g., invalid entry IDs). If `appendEntry` for the INIT entry succeeds but `setLabel` fails, the extension state is partially written — persisted init entry but no branch marker. The next `reconstructState` call would recover, but the user gets no error feedback.

**6. `parseTaskJson` accepts empty strings as valid title/description (`extraction.ts:24`)**

```ts
typeof item.title === 'string' && typeof item.description === 'string'
```

An item with `{ title: \"\", description: \"\" }` passes validation. Consider also checking `item.title.length > 0`.

**7. `slugify` is defined, tested, but never used (`commands.ts:27-36`)**

Dead code — either remove it or note where it will be used (presumably for branch labels or file names in the `write` command once implemented).

---

### 🟢 Suggestion

**8. `reconstructState` is O(2n) — could be O(n)**

The function iterates all entries to find the last init entry, then iterates all entries *again* to apply done/undone/off/resume. A single reverse pass could collect both in one scan.

**9. Comment step numbers reference a development plan (`commands/start.ts`)**

Comments like `// 4. Extract tasks with loader UI`, `// 11. Navigate to root...` reference a linear step plan. This is fine during development but could be simplified to describe the *what* rather than the step number.

**10. `handleStart` rejects single-task extraction (`commands/start.ts:77-80`)**

```ts
if (tasks.length === 1) {
    ctx.ui.notify('bit-by-bit: only one task found, nothing to split', 'warning');
    return;
}
```

This is opinionated — a user might want to use bit-by-bit even with a single task (for the branch isolation and task context injection). Consider making this a soft prompt rather than a hard block.

**11. `findBranchInSubtree` uses stack-based DFS correctly but `latestId` may be unreliable (`branching.ts:46-51`)**

The function finds the latest entry by comparing ISO timestamp strings lexicographically. This works for ISO 8601, but if two entries have the same timestamp (same millisecond), the result depends on iteration order. Not a real bug, but worth a comment.

---

### Summary of Action Items

| Priority | Issue | File |
|----------|-------|------|
| 🔴 Critical | Mutates shared entry data — deep-clone tasks | `state.ts:22` |
| 🔴 Critical | Extraction prompt hardcoded for code review only | `extraction.ts:10` |
| 🟡 Warning | 8 of 9 commands are unimplemented stubs | `commands/*.ts` |
| 🟡 Warning | `onSessionTree` is empty — state goes stale on navigation | `index.ts:88` |
| 🟡 Warning | No error handling around `appendEntry`/`setLabel` | `commands/start.ts` |
| 🟡 Warning | `parseTaskJson` accepts empty strings | `extraction.ts:24` |
| 🟡 Warning | `slugify` is dead code | `commands.ts:27` |
| 🟢 Suggestion | O(2n) scan could be O(n) | `state.ts` |
| 🟢 Suggestion | Single-task rejection could be a prompt, not a block | `commands/start.ts:77` |
| 🟢 Suggestion | Step-numbered comments reference stale dev plan | `commands/start.ts` |