import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { BitByBitState } from './types.js';

export function formatStatus(state: BitByBitState): string | undefined {
  if (!state.active) return undefined;

  const done = state.tasks.filter(t => t.done).length;
  const total = state.tasks.length;

  if (!state.insideBbb) {
    return `bit-by-bit: ${total}(✓${done}) | ⚠ Outside task area`;
  }

  const indexes = state.currentTaskIndexes;
  const current = state.tasks[indexes[0]];
  const numbers = indexes.map(i => i + 1).join(',');
  const allDone = indexes.length > 0 && indexes.every(i => state.tasks[i]?.done);
  const groupSuffix = indexes.length > 1 ? ` +${indexes.length - 1}` : '';
  const prefix = `bit-by-bit: ${numbers}/${total}(✓${done}) | ${allDone ? '✓' : '✗'} ▸ `;
  const maxTitleLen = 30;
  const cols = process.stdout.columns ?? 80;
  const available = Math.min(maxTitleLen, Math.max(0, cols - prefix.length - 2));
  const rawTitle = current?.title ?? '?';
  const title =
    rawTitle.length + groupSuffix.length > available
      ? rawTitle.slice(0, Math.max(0, available - groupSuffix.length - 1)) + '…' + groupSuffix
      : rawTitle + groupSuffix;
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
