/**
 * bit-by-bit Extension
 *
 * Step-by-step task management extracted from LLM messages.
 * Each task gets its own branch in the session tree for context isolation.
 *
 * Usage:
 *   /bit-by-bit           — extract tasks from last assistant message, start first
 *   /bit-by-bit choose    — show task list, switch to selected
 *   /bit-by-bit next      — go to next task
 *   /bit-by-bit prev      — go to previous task
 *   /bit-by-bit done      — mark current task as done
 *   /bit-by-bit undone    — unmark current task
 *   /bit-by-bit write     — create progress document
 *   /bit-by-bit off       — pause bit-by-bit
 *   /bit-by-bit resume    — resume after pause
 */

import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  SessionTreeEvent,
} from '@earendil-works/pi-coding-agent';
import { reconstructState } from './state.js';
import { MESSAGE_TYPE } from './constants.js';
import type { BitByBitState } from './types.js';
import { updateStatus } from './status.js';
import { findTaskByLeaf } from './branching.js';

import { handleStart } from './commands/start.js';
import { handleChoose } from './commands/choose.js';
import { handleNext, handlePrev } from './commands/next-prev.js';
import { handleDone, handleUndone } from './commands/toggle-done.js';
import { handleWrite } from './commands/write.js';
import { handleOff } from './commands/off.js';
import { handleResume } from './commands/resume.js';

// ─── Subcommand parsing ────────────────────────────────────────────────────

const SUBCOMMANDS = ['start', 'choose', 'next', 'prev', 'done', 'undone', 'write', 'off', 'resume'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

function parseSubcommand(args: string): Subcommand | null {
  const trimmed = args.trim();
  if (trimmed === '') return 'start';
  if ((SUBCOMMANDS as readonly string[]).includes(trimmed)) {
    return trimmed as Subcommand;
  }
  return null;
}

// ─── Handler dispatch ──────────────────────────────────────────────────────

type HandlerFn = (state: BitByBitState, ctx: ExtensionCommandContext, pi: ExtensionAPI) => Promise<void>;

const HANDLERS: Record<Subcommand, HandlerFn> = {
  start: handleStart,
  choose: handleChoose,
  next: handleNext,
  prev: handlePrev,
  done: handleDone,
  undone: handleUndone,
  write: handleWrite,
  off: handleOff,
  resume: handleResume,
};

// ─── Event handlers ─────────────────────────────────────────────────────────

function onSessionStart(state: BitByBitState, ctx: ExtensionContext): void {
  const restored = reconstructState(ctx.sessionManager);
  if (!restored) {
    state.initialized = false;
    updateStatus(state, ctx);
    return;
  }
  Object.assign(state, restored);
  updateStatus(state, ctx);
}

// Injects a CONTEXT message into the LLM context on every turn (display: false, not shown in TUI).
// This is the LLM-facing half of the dual-message scheme — see MESSAGE_TYPE docs in constants.ts.
function onBeforeAgentStart(state: BitByBitState) {
  if (!state.initialized || !state.active || !state.insideBbb) return;

  const task = state.tasks[state.currentTaskIndex];
  const content = `[bit-by-bit] You are working on a single task from a larger list.\nAll user messages on this branch refer exclusively to this task. When the user says "re-check", "fix", "explain" etc — they mean THIS task only, not the full list.\n\n## Task: ${task.title}\n\n${task.description}`;

  return {
    message: {
      customType: MESSAGE_TYPE.CONTEXT,
      content,
      display: false,
    },
  };
}

// Removes TASK_DESCRIPTION messages from LLM context (the user-facing half of the
// dual-message scheme). These are visible in TUI but should not be sent to the assistant —
// the assistant receives focused context via the CONTEXT message from before_agent_start instead.
// See MESSAGE_TYPE docs in constants.ts for the full picture.
function onContext(state: BitByBitState, event: ContextEvent) {
  if (!state.initialized) return;

  const filtered = event.messages.filter(msg => {
    if (msg.role === 'custom') {
      return msg.customType !== MESSAGE_TYPE.TASK_DESCRIPTION;
    }
    return true;
  });

  return { messages: filtered };
}

function onTurnEnd(state: BitByBitState, ctx: ExtensionContext): void {
  if (!state.initialized || !state.active || !state.insideBbb) return;

  const task = state.tasks[state.currentTaskIndex];
  const leafId = ctx.sessionManager.getLeafId();
  if (!leafId) return;

  task.branchLeafId = leafId;
}

function onSessionTree(state: BitByBitState, event: SessionTreeEvent, ctx: ExtensionContext): void {
  if (!state.initialized || !state.active) return;
  if (state.skipSessionTree) return;

  // Save the current leaf of the task being left — ONLY if we're in bbb zone.
  // If user is already outside, the current leaf doesn't belong to any task,
  // overwriting branchLeafId would be incorrect.
  if (state.insideBbb) {
    const currentTask = state.tasks[state.currentTaskIndex];
    if (currentTask?.branchLeafId) {
      const leafId = ctx.sessionManager.getLeafId();
      if (leafId) currentTask.branchLeafId = leafId;
    }
  }

  const newLeafId = event.newLeafId;
  if (!newLeafId) {
    // Navigated to an invalid position — treat as outside
    state.insideBbb = false;
    updateStatus(state, ctx);
    return;
  }

  const taskIndex = findTaskByLeaf(state, newLeafId, ctx.sessionManager);
  if (taskIndex !== null) {
    state.insideBbb = true;
    state.currentTaskIndex = taskIndex;
  } else {
    state.insideBbb = false;
    // currentTaskIndex is not changed — preserves last selection
  }

  updateStatus(state, ctx);
}

// ─── Extension entry point ──────────────────────────────────────────────────

export default function bitByBitExtension(pi: ExtensionAPI) {
  const state: BitByBitState = {
    initialized: false,
    active: false,
    insideBbb: false,
    skipSessionTree: false,
    rootEntryId: '',
    currentTaskIndex: 0,
    tasks: [],
  };

  pi.registerCommand('bit-by-bit', {
    description: 'Step-by-step task management (bit-by-bit)',
    getArgumentCompletions(prefix: string) {
      const items = [...SUBCOMMANDS]
        .filter(s => s.startsWith(prefix.toLowerCase()))
        .map(s => ({
          value: s,
          label: s,
        }));
      return items.length > 0 ? items : null;
    },
    async handler(args: string, ctx: ExtensionCommandContext) {
      const sub = parseSubcommand(args);
      if (!sub) {
        ctx.ui.notify(`Unknown subcommand: "${args.trim()}". Available: ${[...SUBCOMMANDS].join(', ')}`, 'warning');
        return;
      }
      await HANDLERS[sub](state, ctx, pi);
    },
  });

  pi.on('session_start', (_event, ctx) => onSessionStart(state, ctx));
  pi.on('before_agent_start', () => onBeforeAgentStart(state));
  pi.on('context', event => onContext(state, event));
  pi.on('turn_end', (_event, ctx) => onTurnEnd(state, ctx));
  pi.on('session_tree', (event, ctx) => onSessionTree(state, event, ctx));
}
