import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { DynamicBorder } from '@earendil-works/pi-coding-agent';
import { Container, type SelectItem, SelectList, Text } from '@earendil-works/pi-tui';
import type { BitByBitState } from '../types.js';
import { formatNumbers, normalizeIndexes, sameTaskSet } from '../task-group.js';
import { updateStatus } from '../status.js';
import { switchToTasks } from './switch-task.js';
import { guard } from './guard.js';

/**
 * Format task list as SelectItem[] for display in SelectList.
 * value is the task index as a string; label shows checkbox, status and current marker.
 */
export function formatTaskItems(state: BitByBitState, marked: ReadonlySet<number> = new Set()): SelectItem[] {
  return state.tasks.map((task, i) => {
    const mark = task.done ? '✓' : '✗';
    const box = marked.has(i) ? '[x]' : '[ ]';
    const current = state.insideBbb && state.currentTaskIndexes.includes(i) ? ' ←' : '';
    return {
      value: String(i),
      label: `${box} ${mark} ${i + 1}. ${task.title}${current}`,
    };
  });
}

export async function handleList(state: BitByBitState, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
  if (!(await guard(state, ctx))) return;

  // Multi-select list: space marks a task, enter confirms.
  // Enter with no marks = classic single selection of the row under the cursor.
  const selection = await ctx.ui.custom<number[] | null>((tui, theme, _kb, done) => {
    const marked = new Set<number>();
    let cursorIndex = state.insideBbb && state.currentTaskIndexes.length > 0 ? state.currentTaskIndexes[0] : 0;

    // SelectList has no multi-select support, so the whole list is rebuilt
    // (with updated checkbox labels) whenever the mark set changes.
    let ui: { container: Container; selectList: SelectList };

    const build = () => {
      const container = new Container();
      container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));
      container.addChild(new Text(theme.fg('accent', theme.bold('Select task(s):')), 1, 0));

      const items = formatTaskItems(state, marked);
      const selectList = new SelectList(items, Math.min(items.length, 15), {
        selectedPrefix: (t: string) => theme.fg('accent', t),
        selectedText: (t: string) => theme.fg('accent', t),
        description: (t: string) => theme.fg('muted', t),
        scrollInfo: (t: string) => theme.fg('dim', t),
        noMatch: (t: string) => theme.fg('warning', t),
      });

      selectList.setSelectedIndex(cursorIndex);
      selectList.onSelectionChange = (item: SelectItem) => {
        const idx = parseInt(item.value, 10);
        if (!isNaN(idx)) cursorIndex = idx;
      };
      selectList.onSelect = (item: SelectItem) => {
        const idx = parseInt(item.value, 10);
        done(marked.size > 0 ? [...marked] : [idx]);
      };
      selectList.onCancel = () => done(null);

      container.addChild(selectList);

      const hint =
        marked.size > 0
          ? `marked: ${marked.size} (tasks ${formatNumbers([...marked])}) — enter starts group`
          : '↑↓ navigate • space mark • a all • i invert • enter select • esc cancel';
      container.addChild(new Text(theme.fg('dim', hint)));
      container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));

      return { container, selectList };
    };

    ui = build();

    return {
      render(width: number) {
        return ui.container.render(width);
      },
      invalidate() {
        ui.container.invalidate();
      },
      handleInput(data: string) {
        if (data === ' ') {
          if (marked.has(cursorIndex)) marked.delete(cursorIndex);
          else marked.add(cursorIndex);
          ui = build();
        } else if (data === 'a') {
          state.tasks.forEach((_, i) => marked.add(i));
          ui = build();
        } else if (data === 'i') {
          state.tasks.forEach((_, i) => {
            if (marked.has(i)) marked.delete(i);
            else marked.add(i);
          });
          ui = build();
        } else {
          ui.selectList.handleInput(data);
        }
        tui.requestRender();
      },
    };
  });

  // User cancelled
  if (selection === null) return;

  const indexes = normalizeIndexes(selection).filter(i => i >= 0 && i < state.tasks.length);
  if (indexes.length === 0) return;

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
