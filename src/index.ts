/**
 * bit-by-bit Extension
 *
 * Step-by-step task management extracted from LLM messages.
 * Each task gets its own branch in the session tree for context isolation.
 *
 * Usage:
 *   /bit-by-bit           — extract tasks from last assistant message, start first
 *   /bit-by-bit start 2,3 — extract tasks, start the given ones as a group (also "2-4", "2-4,7")
 *   /bit-by-bit list      — show task list, switch to selected (space marks several, enter confirms)
 *   /bit-by-bit next      — go to next task (after the whole group when on a group branch)
 *   /bit-by-bit prev      — go to previous task
 *   /bit-by-bit done      — mark current task(s) as done
 *   /bit-by-bit undone    — unmark current task(s)
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
import { groupKey } from './task-group.js';
import { updateStatus } from './status.js';
import { findTaskByLeaf } from './branching.js';

import { handleStart } from './commands/start.js';
import { handleList } from './commands/list.js';
import { handleNext, handlePrev } from './commands/next-prev.js';
import { handleDone, handleUndone } from './commands/toggle-done.js';
import { handleWrite } from './commands/write.js';
import { handleOff } from './commands/off.js';
import { handleResume } from './commands/resume.js';

// ─── Subcommand parsing ────────────────────────────────────────────────────

const SUBCOMMANDS = ['start', 'list', 'next', 'prev', 'done', 'undone', 'write', 'off', 'resume'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

function parseSubcommand(args: string): { sub: Subcommand; rest: string } | null {
  const trimmed = args.trim();
  if (trimmed === '') return { sub: 'start', rest: '' };
  const spaceIdx = trimmed.search(/\s/);
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  if ((SUBCOMMANDS as readonly string[]).includes(head)) {
    return { sub: head as Subcommand, rest };
  }
  return null;
}

// ─── Handler dispatch ──────────────────────────────────────────────────────

type HandlerFn = (state: BitByBitState, ctx: ExtensionCommandContext, pi: ExtensionAPI, args?: string) => Promise<void>;

const HANDLERS: Record<Subcommand, HandlerFn> = {
  start: handleStart,
  list: handleList,
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
  try {
    const restored = reconstructState(ctx.sessionManager);
    if (restored) {
      Object.assign(state, restored);
    }
  } catch {}
  updateStatus(state, ctx);
}

// Injects a CONTEXT message into the LLM context on every turn (display: false, not shown in TUI).
// This is the LLM-facing half of the dual-message scheme — see MESSAGE_TYPE docs in constants.ts.
function onBeforeAgentStart(state: BitByBitState) {
  if (!state.initialized || !state.active || !state.insideBbb) return;

  const currentTasks = state.currentTaskIndexes.map(i => state.tasks[i]).filter(Boolean);
  if (currentTasks.length === 0) return;
  const isGroup = currentTasks.length > 1;

  // Tasks are solved one at a time or in small groups (not necessarily in order) in one repo, so
  // the code the task list was written against has usually changed by the time a task starts.
  // Warn the assistant about prior work to keep it from being surprised by existing edits,
  // and list tasks marked done.
  const doneTasks = state.tasks.filter(t => t.done);
  const doneTasksSection = doneTasks.length
    ? `\nAlready completed tasks (their changes are expected in the code):\n${doneTasks.map(t => `${t.index + 1}. ${t.title}`).join('\n')}\n`
    : '';

  const intro = isGroup
    ? `[bit-by-bit] You are working on a selected group of tasks (${currentTasks.length} of them) from a larger list.
All user messages on this branch refer exclusively to THIS group of tasks. When the user says "re-check", "fix", "explain" etc — they mean THESE tasks only, not the full list.`
    : `[bit-by-bit] You are working on a single task from a larger list.
All user messages on this branch refer exclusively to this task. When the user says "re-check", "fix", "explain" etc — they mean THIS task only, not the full list.`;

  const taskSection = isGroup
    ? `## Tasks ${currentTasks.map(t => t.index + 1).join(',')} of ${state.tasks.length}\n\n${currentTasks
        .map(t => `### Task ${t.index + 1}: ${t.title}\n\n${t.description}`)
        .join('\n\n')}`
    : `## Task: ${currentTasks[0].title}\n\n${currentTasks[0].description}`;

  const content = `${intro}

Tasks from this list are worked on one at a time — not necessarily in order — in the same repository. Other tasks from the list may already be completed by now, so the current code is NOT the code from when this list was written. Existing edits, modified files and git changes from those tasks are expected — do not be surprised by them and do not treat them as a conflict. Verify the actual state of the code (read files, git status / git diff) before making assumptions from the task description — parts of the work may already be implemented.
${doneTasksSection}
${taskSection}`;

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

  const leafId = ctx.sessionManager.getLeafId();
  if (!leafId) return;

  recordCurrentBranchLeaf(state, leafId);
}

/** Save the current leaf as the group branch leaf (single task → task.branchLeafId). */
function recordCurrentBranchLeaf(state: BitByBitState, leafId: string): void {
  const indexes = state.currentTaskIndexes;
  if (indexes.length === 1) {
    const task = state.tasks[indexes[0]];
    if (task) task.branchLeafId = leafId;
  } else if (indexes.length > 1) {
    state.groupBranchLeafIds.set(groupKey(indexes), leafId);
  }
}

function onSessionTree(state: BitByBitState, event: SessionTreeEvent, ctx: ExtensionContext): void {
  if (!state.initialized || !state.active) return;
  if (state.skipSessionTree) return;

  // Save the current leaf of the task group being left — ONLY if we're in bbb zone.
  // If user is already outside, the current leaf doesn't belong to any task,
  // overwriting branch leaves would be incorrect.
  if (state.insideBbb) {
    const indexes = state.currentTaskIndexes;
    const leafId = ctx.sessionManager.getLeafId();
    if (leafId) {
      if (indexes.length === 1) {
        const currentTask = state.tasks[indexes[0]];
        if (currentTask?.branchLeafId) currentTask.branchLeafId = leafId;
      } else if (indexes.length > 1 && state.groupBranchLeafIds.has(groupKey(indexes))) {
        state.groupBranchLeafIds.set(groupKey(indexes), leafId);
      }
    }
  }

  const newLeafId = event.newLeafId;
  if (!newLeafId) {
    // Navigated to an invalid position — treat as outside
    state.insideBbb = false;
    updateStatus(state, ctx);
    return;
  }

  const taskIndexes = findTaskByLeaf(state, newLeafId, ctx.sessionManager);
  if (taskIndexes !== null) {
    state.insideBbb = true;
    state.currentTaskIndexes = taskIndexes;
  } else {
    state.insideBbb = false;
    // currentTaskIndexes is not changed — preserves last selection
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
    currentTaskIndexes: [],
    tasks: [],
    groupBranchLeafIds: new Map(),
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
      const parsed = parseSubcommand(args);
      if (!parsed) {
        ctx.ui.notify(
          `Unknown subcommand: "${args.trim().split(/\s/)[0]}". Available: ${[...SUBCOMMANDS].join(', ')}`,
          'warning'
        );
        return;
      }
      try {
        await HANDLERS[parsed.sub](state, ctx, pi, parsed.rest);
      } catch (err) {
        ctx.ui.notify(`bit-by-bit: unexpected error — ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
  });

  pi.on('session_start', (_event, ctx) => onSessionStart(state, ctx));
  pi.on('before_agent_start', () => onBeforeAgentStart(state));
  pi.on('context', event => onContext(state, event));
  pi.on('turn_end', (_event, ctx) => onTurnEnd(state, ctx));
  pi.on('session_tree', (event, ctx) => onSessionTree(state, event, ctx));
}
