import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { ENTRY_TYPE, MESSAGE_TYPE } from '../constants.js';
import type { BitByBitState } from '../types.js';

const MAX_TITLE_IN_LABEL = 40;

export function formatLabel(task: { index: number; title: string }): string {
  const truncated = task.title.length > MAX_TITLE_IN_LABEL ? task.title.slice(0, MAX_TITLE_IN_LABEL) : task.title;
  return `bbb:${task.index + 1}:${truncated}`;
}

/**
 * Navigate to a task's branch.
 *
 * - If the task was visited before (has branchLeafId), navigates to the existing branch.
 * - Otherwise creates a new branch from root: navigates, sends task description,
 *   records a BRANCH entry, and sets the branch label.
 */
export async function switchToTask(
  state: BitByBitState,
  taskIndex: number,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI
): Promise<boolean> {
  state.skipSessionTree = true;
  try {
    const task = state.tasks[taskIndex];
    const total = state.tasks.length;

    if (task.branchLeafId) {
      const result = await ctx.navigateTree(task.branchLeafId, { summarize: false });
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
        content: `**Task ${taskIndex + 1}/${total}: ${task.title}**\n\n${task.description}`,
        display: true,
      },
      { triggerTurn: false }
    );

    const leafId = ctx.sessionManager.getLeafId();
    if (leafId) {
      pi.appendEntry(ENTRY_TYPE.BRANCH, {
        rootEntryId: state.rootEntryId,
        taskIndex,
      });
      pi.setLabel(leafId, formatLabel(task));
    }
    const branchLeafId = ctx.sessionManager.getLeafId();
    if (branchLeafId) {
      task.branchLeafId = branchLeafId;
    }
    return true;
  } finally {
    state.skipSessionTree = false;
  }
}
