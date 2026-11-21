import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { BitByBitState } from '../types.js';
import { updateStatus } from '../status.js';
import { switchToTasks } from './switch-task.js';
import { guard } from './guard.js';

export function resolveNextTask(state: BitByBitState): number | null {
  if (state.currentTaskIndexes.length === 0) return null;
  const last = Math.max(...state.currentTaskIndexes);
  const next = last + 1;
  if (next >= state.tasks.length) return null;
  return next;
}

export function resolvePrevTask(state: BitByBitState): number | null {
  if (state.currentTaskIndexes.length === 0) return null;
  const first = Math.min(...state.currentTaskIndexes);
  const prev = first - 1;
  if (prev < 0) return null;
  return prev;
}

const BOUNDARY_MSG = {
  next: 'already on last task',
  prev: 'already on first task',
} as const;

async function navigateAdjacent(
  state: BitByBitState,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  direction: 'next' | 'prev'
): Promise<void> {
  if (!(await guard(state, ctx))) return;

  const targetIndex = direction === 'next' ? resolveNextTask(state) : resolvePrevTask(state);
  if (targetIndex === null) {
    ctx.ui.notify(`bit-by-bit: ${BOUNDARY_MSG[direction]}`, 'info');
    return;
  }

  // next/prev always land on a single task right after/before the current group
  const navigated = await switchToTasks(state, [targetIndex], ctx, pi);
  if (!navigated) {
    ctx.ui.notify('bit-by-bit: navigation cancelled', 'info');
    return;
  }

  state.currentTaskIndexes = [targetIndex];
  state.insideBbb = true;

  updateStatus(state, ctx);
  ctx.ui.notify(`bit-by-bit: switched to task ${targetIndex + 1}`, 'info');
}

export async function handleNext(state: BitByBitState, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
  return navigateAdjacent(state, ctx, pi, 'next');
}

export async function handlePrev(state: BitByBitState, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
  return navigateAdjacent(state, ctx, pi, 'prev');
}
