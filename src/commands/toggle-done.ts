import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { ENTRY_TYPE } from '../constants.js';
import type { BitByBitState } from '../types.js';
import { updateStatus } from '../status.js';
import { guard } from './guard.js';

async function toggleDone(
  state: BitByBitState,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  direction: 'done' | 'undone'
): Promise<void> {
  if (!(await guard(state, ctx, { requireInsideBbb: true }))) return;

  const taskIndex = state.currentTaskIndex;
  const task = state.tasks[taskIndex];

  if (direction === 'done') {
    if (task.done) {
      ctx.ui.notify(`bit-by-bit: task ${taskIndex + 1} already done`, 'info');
      return;
    }
    task.done = true;
  } else {
    if (!task.done) {
      ctx.ui.notify(`bit-by-bit: task ${taskIndex + 1} is not done`, 'info');
      return;
    }
    task.done = false;
  }

  pi.appendEntry(direction === 'done' ? ENTRY_TYPE.DONE : ENTRY_TYPE.UNDONE, {
    rootEntryId: state.rootEntryId,
    taskIndex,
  });

  updateStatus(state, ctx);

  ctx.ui.notify(`bit-by-bit: task ${taskIndex + 1} marked as ${direction === 'done' ? 'done' : 'undone'}`, 'info');
}

export async function handleDone(state: BitByBitState, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
  return toggleDone(state, ctx, pi, 'done');
}

export async function handleUndone(
  state: BitByBitState,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI
): Promise<void> {
  return toggleDone(state, ctx, pi, 'undone');
}
