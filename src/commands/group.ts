import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { BitByBitState } from '../types.js';
import { parseTaskSelection } from '../task-group.js';
import { guard } from './guard.js';
import { switchSelection } from './switch-task.js';

/**
 * /bit-by-bit group <selection> — switch to a task group directly,
 * like list without showing the list.
 * Selection spec: "2", "2,3", "2-4", "2-4,7".
 */
export async function handleGroup(
  state: BitByBitState,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  args = ''
): Promise<void> {
  if (!(await guard(state, ctx))) return;

  const spec = args.trim();
  if (spec === '') {
    ctx.ui.notify('bit-by-bit: usage: group <selection> — e.g. "2,3" or "2-4"', 'error');
    return;
  }

  const selection = parseTaskSelection(spec);
  if (!selection) {
    ctx.ui.notify('bit-by-bit: invalid task selection — use e.g. "2,3" or "2-4"', 'error');
    return;
  }

  // Validate selection bounds against the existing task list
  const outOfRange = selection.filter(i => i >= state.tasks.length);
  if (outOfRange.length > 0) {
    const bad = outOfRange.map(i => i + 1).join(',');
    ctx.ui.notify(
      `bit-by-bit: task${outOfRange.length > 1 ? 's' : ''} ${bad} do${outOfRange.length > 1 ? '' : 'es'} not exist (1..${state.tasks.length})`,
      'error'
    );
    return;
  }

  await switchSelection(state, selection, ctx, pi);
}
