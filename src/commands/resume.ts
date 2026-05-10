import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { ENTRY_TYPE } from '../constants.js';
import type { BitByBitState } from '../types.js';
import { findTaskByLeaf } from '../branching.js';
import { updateStatus } from '../status.js';
import { guard } from './guard.js';

export async function handleResume(
  state: BitByBitState,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI
): Promise<void> {
  if (!(await guard(state, ctx, { requirePaused: true }))) {
    return;
  }

  state.active = true;

  // Determine whether we're inside a task branch or outside
  state.insideBbb = false;
  const leafId = ctx.sessionManager.getLeafId();
  if (leafId) {
    const taskIndex = findTaskByLeaf(state, leafId, ctx.sessionManager);
    if (taskIndex !== null) {
      state.insideBbb = true;
      state.currentTaskIndex = taskIndex;
    }
  }

  pi.appendEntry(ENTRY_TYPE.RESUME, {
    rootEntryId: state.rootEntryId,
  });

  updateStatus(state, ctx);

  ctx.ui.notify('bit-by-bit: resumed', 'info');
}
