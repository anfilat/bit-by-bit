# bit-by-bit

A [Pi](https://github.com/earendil-works/pi) extension for step-by-step task management.

Splits an LLM response into individual tasks and works on them one at a time in isolated session tree branches. Each task gets its own context — the assistant only sees the current task, not the full list.

## Install

```bash
pi install git:github.com/anfilat/bit-by-bit
```

Or try without installing:

```bash
pi -e git:github.com/anfilat/bit-by-bit
```

## Usage

1. Ask the LLM to produce a numbered list — a review, a plan, a set of issues, anything with distinct items.
2. Run `/bit-by-bit` — the extension extracts each item into a separate task and navigates to the first one.
3. Work on the task. When done, use `/bit-by-bit next` or `/bit-by-bit done` to move on.

### Commands

| Command | Description |
|---------|-------------|
| `/bit-by-bit` | Extract tasks from last assistant message, start first task |
| `/bit-by-bit choose` | Show task list, switch to chosen task |
| `/bit-by-bit next` | Go to next task |
| `/bit-by-bit prev` | Go to previous task |
| `/bit-by-bit done` | Mark current task as done |
| `/bit-by-bit undone` | Unmark current task |
| `/bit-by-bit write` | Write progress document to `bit-by-bit/` directory |
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

1. **Extraction** — `/bit-by-bit` calls the current model to parse the last assistant message into structured `{ title, description }` items.
2. **Branching** — Each task gets its own branch forked from the current point in the session tree. The extension records a `bit-by-bit-branch` marker in each branch so it can reconstruct state on session reload.
3. **Context isolation** — On every turn, a `before_agent_start` hook injects a context message telling the assistant to focus only on the current task. The `context` hook strips task-description markers from LLM input.
4. **Persistence** — All state (tasks, done/off/resume markers, branch mappings) is stored in the session tree as custom entries. Full state reconstruction happens on session restore.
5. **Progress documents** — `/bit-by-bit write` generates a markdown file per task. If the task branch has no discussion, it writes the task description. If there's a conversation, it summarizes it using the current model.

## Development

```bash
npm install
npm test           # vitest run
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint src/
npm run format     # oxfmt src/ test/
```

Extraction prompt regression testing:

```bash
npm run extraction:compare   # compare against reference
npm run extraction:update    # update reference files
```

## License

MIT
