# AGENTS.md

## Project

**bit-by-bit** — a [Pi](https://github.com/earendil-works/pi) extension for step-by-step task management. It extracts numbered/bulleted items from LLM output and works on them one at a time in isolated session tree branches.

- **Tests:** `npm test` (runs `vitest run`). Tests live in `test/`. Test framework: **vitest 4.x** (ESM-native, zero config). Config in `vitest.config.ts`.
- **ESM only** (`"type": "module"` in `package.json`). Import paths need `.js` extensions (e.g. `./state.js`).
- **TypeScript:** `npx tsc --noEmit` for type checking. Config in `tsconfig.json` (strict mode, ES2022 / Node16).
- **Peer dependencies** (not bundled): `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@sinclair/typebox`.
- **Formatting:** `npm run format` (runs `oxfmt` on `src/` and `test/`). Config in `.oxfmtrc.json`.
- **Linting:** `npm run lint` (runs `oxlint` on `src/`). No separate config file — uses defaults.

## Architecture

### Source (`src/`)

| File | Purpose |
|------|---------|
| `index.ts` | Entry point — registers `/bit-by-bit` command and event hooks |
| `types.ts` | Shared types: `Task`, `BitByBitState`, extracted pi types |
| `constants.ts` | Entry types (`bit-by-bit-init`, etc.) and message types |
| `extraction.ts` | LLM-based task extraction from text, JSON parsing |
| `branching.ts` | Walking session tree to find which task a leaf belongs to |
| `state.ts` | `reconstructState` — rebuilds in-memory state from persisted entries |
| `status.ts` | Status bar formatting and updates |
| `write.ts` | Progress document generation (fast path + LLM-summarized path) |
| `commands/start.ts` | Extract tasks from last assistant message, start first |
| `commands/choose.ts` | Show task list with SelectList, switch to chosen |
| `commands/next-prev.ts` | Navigate to next/previous task |
| `commands/switch-task.ts` | Core navigation — fork branches, send task description |
| `commands/toggle-done.ts` | Mark/unmark task as done |
| `commands/off.ts` | Pause bit-by-bit mode |
| `commands/resume.ts` | Resume after pause |
| `commands/guard.ts` | Common preamble for command handlers (wait for idle, validate state) |
| `commands/write.ts` | Write progress document to `bit-by-bit/` directory |

### Commands

| Command | Description |
|---------|-------------|
| `/bit-by-bit` (or `start`) | Extract tasks from last assistant message, start first task |
| `/bit-by-bit choose` | Show task list, switch to chosen task |
| `/bit-by-bit next` | Go to next task |
| `/bit-by-bit prev` | Go to previous task |
| `/bit-by-bit done` | Mark current task as done |
| `/bit-by-bit undone` | Unmark current task |
| `/bit-by-bit write` | Create progress document in `bit-by-bit/` directory |
| `/bit-by-bit off` | Pause bit-by-bit mode |
| `/bit-by-bit resume` | Resume after pause |

### Hooks

`session_start`, `before_agent_start`, `context`, `turn_end`, `session_tree`.

### Dual-message scheme

- **TASK_DESCRIPTION** (display: true, filtered from LLM context) — visible in TUI, removed by the `context` hook.
- **CONTEXT** (display: false, injected via `before_agent_start`) — sent to LLM on every turn, not shown to user.

### Tests (`test/`)

| Path | Tests |
|------|-------|
| `test/*.test.ts` | Unit tests for modules (extraction, branching, state, status, write, etc.) |
| `test/integration.test.ts` | Extension registration, command dispatch |
| `test/commands/*.test.ts` | Command handler tests with mock contexts |

### Extraction check (`extraction-check/`)

Standalone tool for comparing extraction prompt results against reference outputs:

```bash
npm run extraction:compare          # compare current vs reference
npm run extraction:update           # overwrite reference with current results
```

## Code Style (`.oxfmtrc.json`)

| Setting | Value |
|---------|-------|
| Indent | 2 spaces, no tabs |
| Semicolons | always |
| Quotes | single (double in JSX) |
| Trailing commas | es5 (arrays/objects, not function params) |
| Arrow parens | avoid (omit when single param) |
| Bracket spacing | `import { x } from …` (spaces inside braces) |
| Print width | 120 |
| Line endings | LF (`\n`) |
