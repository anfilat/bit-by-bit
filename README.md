# bit-by-bit

A [Pi](https://github.com/earendil-works/pi) extension for step-by-step task management.

When an LLM produces a long list — review feedback, plan items, a set of ideas — it's hard to handle all at once.
This extension splits such a list into individual tasks and lets you focus on one at a time.
You can switch between tasks and mark them done — each one lives in its own branch,
so the assistant only works on the current task without being distracted by the rest.

## Install

```bash
pi install npm:@anfilat/bit-by-bit
```

## Usage

1. Ask the LLM to produce a numbered list — a review, a plan, a set of issues, anything with distinct items.
2. Run `/bit-by-bit` — the extension extracts each item into a separate task and navigates to the first one.
3. Work on the task. When done, use `/bit-by-bit done` to mark it done and `/bit-by-bit next` to move to next one.

Tasks normally run one at a time, but you can also select several and work on them as a group
in a single shared branch (see [Task groups](#task-groups)).

### Commands

| Command | Description |
|---------|-------------|
| `/bit-by-bit` | Extract tasks from last assistant message, start first task |
| `/bit-by-bit start 2,3,5` | Extract tasks and start the given ones as a group (also `2-4`, `2-4,7`) |
| `/bit-by-bit list` | Show task list, switch to chosen task(s) — `space` marks, `enter` confirms |
| `/bit-by-bit next` | Go to next task (after the whole group when on a group branch) |
| `/bit-by-bit prev` | Go to previous task |
| `/bit-by-bit done` | Mark current task(s) as done |
| `/bit-by-bit undone` | Unmark current task(s) |
| `/bit-by-bit write` | Write a task document to `bit-by-bit/` directory, so you can shelve it for later |
| `/bit-by-bit off` | Pause bit-by-bit mode |
| `/bit-by-bit resume` | Resume after pause |

### Status bar

When active, the status bar shows:

```
bit-by-bit: 3/12(✓2) | ✗ ▸ Fix null pointer in UserService
```

- `3/12` — current task / total (a group shows `3,5/12`)
- `✓2` — tasks marked done
- `✗` or `✓` — current task status (`✓` only when every task of the group is done)
- ` +1` after the title — the group continues with one more task beyond the shown one

If you navigate outside the task branches (via `/tree`), it shows:

```
bit-by-bit: 12(✓2) | ⚠ Outside task area
```

## How it works

1. **Extraction** — `/bit-by-bit` calls the current model to parse the last assistant message into items.
2. **Branching** — Each task gets its own branch forked from the current point in the session tree.
3. **Context isolation** — On every turn, the extension injects a context message telling the assistant to focus only on the current task.
4. **Persistence** — All state (tasks, done/off/resume markers, branch mappings) is stored in the session tree as custom entries. Full state reconstruction happens on session restore.
5. **Shelving tasks** — `/bit-by-bit write` generates a markdown document describing the current task, so you can set it aside and come back to it later.

## Task groups

Sometimes several tasks belong together — e.g. three items touching the same file. You can work on them
in one branch with a combined context:

- `/bit-by-bit start 2,3` or `/bit-by-bit start 2-4` — start a group right away (also mixed: `2-4,7`).
- `/bit-by-bit list` — press `space` to mark tasks (`a` — all, `i` — invert), then `enter`.
  Enter without marks still selects the single task under the cursor.

On a group branch the assistant receives all task descriptions at once, the status bar shows
`bit-by-bit: 2,3/8(✓1) | ✗ ▸ Add tests +1`, and `/bit-by-bit done` marks the whole group done.
`next` jumps past the group to the following task. Re-selecting the same set returns to the
existing group branch.

## License

MIT
