import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { DynamicBorder } from '@earendil-works/pi-coding-agent';
import { Container, type SelectItem, SelectList, Text } from '@earendil-works/pi-tui';
import type { BitByBitState } from '../types.js';
import { updateStatus } from '../status.js';
import { switchToTask } from './switch-task.js';
import { guard } from './guard.js';

/**
 * Format task list as SelectItem[] for display in SelectList.
 * value is the task index as a string, label shows status and current marker.
 */
export function formatTaskItems(state: BitByBitState): SelectItem[] {
  return state.tasks.map((task, i) => {
    const mark = task.done ? '✓' : '✗';
    const current = state.insideBbb && i === state.currentTaskIndex ? ' ←' : '';
    return {
      value: String(i),
      label: `${mark} ${i + 1}. ${task.title}${current}`,
    };
  });
}

export async function handleChoose(
  state: BitByBitState,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI
): Promise<void> {
  if (!(await guard(state, ctx))) return;

  const items = formatTaskItems(state);

  const selected = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));
    container.addChild(new Text(theme.fg('accent', theme.bold('Select task:')), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, 15), {
      selectedPrefix: (t: string) => theme.fg('accent', t),
      selectedText: (t: string) => theme.fg('accent', t),
      description: (t: string) => theme.fg('muted', t),
      scrollInfo: (t: string) => theme.fg('dim', t),
      noMatch: (t: string) => theme.fg('warning', t),
    });

    if (state.insideBbb) {
      selectList.setSelectedIndex(state.currentTaskIndex);
    }
    selectList.onSelect = (item: SelectItem) => done(item.value);
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(new Text(theme.fg('dim', '↑↓ navigate • enter select • esc cancel')));
    container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));

    return {
      render(width: number) {
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
      handleInput(data: string) {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });

  // User cancelled
  if (selected === null) return;

  const selectedIndex = parseInt(selected, 10);
  if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= state.tasks.length) return;

  // Already on this task (only when inside a task branch)
  if (state.insideBbb && selectedIndex === state.currentTaskIndex) {
    ctx.ui.notify('bit-by-bit: already on this task', 'info');
    return;
  }

  const navigated = await switchToTask(state, selectedIndex, ctx, pi);
  if (!navigated) {
    ctx.ui.notify('bit-by-bit: navigation cancelled', 'info');
    return;
  }

  state.currentTaskIndex = selectedIndex;
  state.insideBbb = true;

  updateStatus(state, ctx);
  ctx.ui.notify(`bit-by-bit: switched to task ${selectedIndex + 1}`, 'info');
}
