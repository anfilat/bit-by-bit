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

### Commands

| Command | Description |
|---------|-------------|
| `/bit-by-bit` | Extract tasks from last assistant message, start first task |
| `/bit-by-bit choose` | Show task list, switch to chosen task |
| `/bit-by-bit next` | Go to next task |
| `/bit-by-bit prev` | Go to previous task |
| `/bit-by-bit done` | Mark current task as done |
| `/bit-by-bit undone` | Unmark current task |
| `/bit-by-bit write` | Write a task document to `bit-by-bit/` directory, so you can shelve it for later |
| `/bit-by-bit off` | Pause bit-by-bit mode |
| `/bit-by-bit resume` | Resume after pause |

### Status bar

When active, the status bar shows:

```
bit-by-bit: 3/12(✓2) | ✗ ▸ Fix null pointer in UserService
```

- `3/12` — current task / total
- `✓2` — tasks marked done
- `✗` or `✓` — current task status

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

## License

MIT
