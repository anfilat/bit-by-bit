import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { ENTRY_TYPE, MESSAGE_TYPE } from '../constants.js';
import type { BitByBitState, Task } from '../types.js';
import { formatNumbers, groupKey, normalizeIndexes, sameTaskSet } from '../task-group.js';
import { updateStatus } from '../status.js';

const MAX_TITLE_IN_LABEL = 40;

/**
 * Branch label for a task group.
 * Single task: `bbb:1:Title`. Group: `bbb:2+3:First title`.
 */
export function formatLabel(tasks: { index: number; title: string }[]): string {
  if (tasks.length === 0) return 'bbb:?';
  const numbers = tasks.map(t => t.index + 1).join('+');
  const first = tasks[0];
  const truncated = first.title.length > MAX_TITLE_IN_LABEL ? first.title.slice(0, MAX_TITLE_IN_LABEL) : first.title;
  return `bbb:${numbers}:${truncated}`;
}

/**
 * TASK_DESCRIPTION content for a task group.
 * Single task keeps the historical format: `**Task 3/8: Title**`.
 * Group: `**Tasks 2,3/8**` followed by a section per task.
 */
export function formatTaskDescription(tasks: Task[], total: number): string {
  if (tasks.length === 1) {
    const task = tasks[0];
    return `**Task ${task.index + 1}/${total}: ${task.title}**\n\n${task.description}`;
  }
  const numbers = tasks.map(t => t.index + 1).join(',');
  const sections = tasks.map(t => `### Task ${t.index + 1}: ${t.title}\n\n${t.description}`).join('\n\n');
  return `**Tasks ${numbers}/${total}**\n\n${sections}`;
}

/** Existing leaf id for a task group, or undefined when not visited before. */
function findExistingLeafId(state: BitByBitState, indexes: number[]): string | undefined {
  if (indexes.length === 1) {
    return state.tasks[indexes[0]]?.branchLeafId;
  }
  return state.groupBranchLeafIds.get(groupKey(indexes));
}

/** Record the leaf id of a freshly created (or re-entered) group branch. */
function recordLeafId(state: BitByBitState, indexes: number[], leafId: string): void {
  if (indexes.length === 1) {
    state.tasks[indexes[0]].branchLeafId = leafId;
  } else {
    state.groupBranchLeafIds.set(groupKey(indexes), leafId);
  }
}

/**
 * Navigate to a task group's branch.
 *
 * - If the group was visited before (single: task.branchLeafId, group: groupBranchLeafIds),
 *   navigates to the existing branch.
 * - Otherwise creates a new branch from root: navigates, sends the task description,
 *   records a BRANCH entry, and sets the branch label.
 */
export async function switchToTasks(
  state: BitByBitState,
  taskIndexes: number[],
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI
): Promise<boolean> {
  const indexes = normalizeIndexes(taskIndexes);
  if (indexes.length === 0) return false;

  state.skipSessionTree = true;
  try {
    const tasks = indexes.map(i => state.tasks[i]);
    const total = state.tasks.length;

    const existingLeafId = findExistingLeafId(state, indexes);
    if (existingLeafId) {
      const result = await ctx.navigateTree(existingLeafId, { summarize: false });
      return !result.cancelled;
    }

    // Create new branch from root
    const navResult = await ctx.navigateTree(state.rootEntryId, { summarize: false });
    if (navResult.cancelled) return false;

    // Send a TASK_DESCRIPTION message: displayed in TUI but filtered from LLM context
    // (see the `context` hook in index.ts). The LLM instead receives a CONTEXT message
    // injected by the `before_agent_start` hook. triggerTurn: false because we only want
    // to record the task marker — the user will send their own prompt when ready.
    pi.sendMessage(
      {
        customType: MESSAGE_TYPE.TASK_DESCRIPTION,
        content: formatTaskDescription(tasks, total),
        display: true,
      },
      { triggerTurn: false }
    );

    const leafId = ctx.sessionManager.getLeafId();
    if (leafId) {
      pi.appendEntry(ENTRY_TYPE.BRANCH, {
        rootEntryId: state.rootEntryId,
        taskIndexes: indexes,
      });
      pi.setLabel(leafId, formatLabel(tasks));
    }
    const branchLeafId = ctx.sessionManager.getLeafId();
    if (branchLeafId) {
      recordLeafId(state, indexes, branchLeafId);
    }
    return true;
  } finally {
    state.skipSessionTree = false;
  }
}

/**
 * Switch to a task selection: skip when already on it, navigate (or create) the
 * branch, then update state and status. Notifies the user about the outcome.
 * Shared by the `list` and `group` commands.
 */
export async function switchSelection(
  state: BitByBitState,
  indexes: number[],
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI
): Promise<void> {
  // Already on this task/group (only when inside a task branch)
  if (state.insideBbb && sameTaskSet(indexes, state.currentTaskIndexes)) {
    const isGroup = indexes.length > 1;
    ctx.ui.notify(`bit-by-bit: already on ${isGroup ? 'these tasks' : 'this task'}`, 'info');
    return;
  }

  const navigated = await switchToTasks(state, indexes, ctx, pi);
  if (!navigated) {
    ctx.ui.notify('bit-by-bit: navigation cancelled', 'info');
    return;
  }

  state.currentTaskIndexes = indexes;
  state.insideBbb = true;

  updateStatus(state, ctx);
  const label = indexes.length > 1 ? `tasks ${formatNumbers(indexes)}` : `task ${formatNumbers(indexes)}`;
  ctx.ui.notify(`bit-by-bit: switched to ${label}`, 'info');
}
