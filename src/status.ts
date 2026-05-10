import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { BitByBitState } from './types.js';

export function formatStatus(state: BitByBitState): string | undefined {
  if (!state.active) return undefined;

  const done = state.tasks.filter(t => t.done).length;
  const total = state.tasks.length;

  if (!state.insideBbb) {
    return `bit-by-bit: ${total}(✓${done}) | ⚠ Outside task area`;
  }

  const current = state.tasks[state.currentTaskIndex];
  const prefix = `bit-by-bit: ${state.currentTaskIndex + 1}/${total}(✓${done}) | ${current?.done ? '✓' : '✗'} ▸ `;
  const maxTitleLen = 30;
  const cols = process.stdout.columns ?? 80;
  const available = Math.min(maxTitleLen, Math.max(0, cols - prefix.length - 2));
  const rawTitle = current?.title ?? '?';
  const title = rawTitle.length > available ? rawTitle.slice(0, available - 1) + '…' : rawTitle;
  return `${prefix}${title}`;
}

export function updateStatus(state: BitByBitState, ctx: ExtensionContext): void {
  if (!state.initialized) {
    ctx.ui.setStatus('bit-by-bit', undefined);
    return;
  }
  const text = formatStatus(state);
  ctx.ui.setStatus('bit-by-bit', text);
}
