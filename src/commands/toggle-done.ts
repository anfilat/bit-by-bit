import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { ENTRY_TYPE } from '../constants.js';
import type { BitByBitState } from '../types.js';
import { formatNumbers } from '../task-group.js';
import { updateStatus } from '../status.js';
import { guard } from './guard.js';

async function toggleDone(
  state: BitByBitState,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  direction: 'done' | 'undone'
): Promise<void> {
  if (!(await guard(state, ctx, { requireInsideBbb: true }))) return;

  const indexes = state.currentTaskIndexes;
  const label = indexes.length > 1 ? `tasks ${formatNumbers(indexes)}` : `task ${formatNumbers(indexes)}`;

  if (direction === 'done') {
    const pending = indexes.filter(i => !state.tasks[i].done);
    if (pending.length === 0) {
      ctx.ui.notify(`bit-by-bit: ${label} already done`, 'info');
      return;
    }
    for (const i of pending) {
      state.tasks[i].done = true;
      pi.appendEntry(ENTRY_TYPE.DONE, {
        rootEntryId: state.rootEntryId,
        taskIndex: i,
      });
    }
  } else {
    const doneIndexes = indexes.filter(i => state.tasks[i].done);
    if (doneIndexes.length === 0) {
      ctx.ui.notify(`bit-by-bit: ${label} is not done`, 'info');
      return;
    }
    for (const i of doneIndexes) {
      state.tasks[i].done = false;
      pi.appendEntry(ENTRY_TYPE.UNDONE, {
        rootEntryId: state.rootEntryId,
        taskIndex: i,
      });
    }
  }

  updateStatus(state, ctx);

  ctx.ui.notify(`bit-by-bit: ${label} marked as ${direction === 'done' ? 'done' : 'undone'}`, 'info');
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
