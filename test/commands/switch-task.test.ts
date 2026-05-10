import { describe, it, expect, vi } from 'vitest';
import { formatLabel, switchToTask } from '../../src/commands/switch-task.js';
import type { Task, BitByBitState } from '../../src/types.js';
import { makeCtx, setupExtension, type MockCtx } from './helpers.js';

describe('formatLabel', () => {
  it('formats undone task label', () => {
    const task: Task = {
      index: 0,
      title: 'Fix null pointer in UserService',
      description: 'desc',
      done: false,
    };
    expect(formatLabel(task)).toBe('bbb:1:Fix null pointer in UserService');
  });

  it('truncates long title to ~40 characters', () => {
    const task: Task = {
      index: 0,
      title: 'A'.repeat(100),
      description: 'desc',
      done: false,
    };
    const result = formatLabel(task);
    // "bbb:1:" is 6 chars, total should be ~46 (6 + 40)
    expect(result).toBe('bbb:1:' + 'A'.repeat(40));
    expect(result.length).toBe(46);
  });
});

describe('switchToTask', () => {
  function makeState(tasks: Task[] = []): BitByBitState {
    return {
      initialized: true,
      active: true,
      insideBbb: true,
      skipSessionTree: false,
      rootEntryId: 'leaf-root',
      currentTaskIndex: 0,
      tasks,
    };
  }

  it('returns false and does not create branch when navigateTree is cancelled (new branch)', async () => {
    const { pi, appendEntry, sendMessage, setLabel } = setupExtension();
    const ctx: MockCtx = makeCtx();
    ctx.navigateTree = vi.fn().mockResolvedValue({ cancelled: true });

    const state = makeState([
      { index: 0, title: 'Task A', description: 'Desc A', done: false },
      { index: 1, title: 'Task B', description: 'Desc B', done: false },
    ]);

    const result = await switchToTask(state, 1, ctx, pi);

    expect(result).toBe(false);
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(setLabel).not.toHaveBeenCalled();
    expect(state.tasks[1].branchLeafId).toBeUndefined();
  });

  it('returns false when navigateTree is cancelled (existing branch)', async () => {
    const { pi, appendEntry, sendMessage } = setupExtension();
    const ctx: MockCtx = makeCtx();
    ctx.navigateTree = vi.fn().mockResolvedValue({ cancelled: true });

    const state = makeState([
      { index: 0, title: 'Task A', description: 'Desc A', done: false, branchLeafId: 'leaf-a' },
      { index: 1, title: 'Task B', description: 'Desc B', done: false, branchLeafId: 'leaf-b' },
    ]);

    const result = await switchToTask(state, 1, ctx, pi);

    expect(result).toBe(false);
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('returns true and creates branch when navigateTree succeeds (new branch)', async () => {
    const { pi, appendEntry, sendMessage } = setupExtension();
    const ctx: MockCtx = makeCtx();
    ctx.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });
    ctx.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-new');

    const state = makeState([
      { index: 0, title: 'Task A', description: 'Desc A', done: false },
      { index: 1, title: 'Task B', description: 'Desc B', done: false },
    ]);

    const result = await switchToTask(state, 1, ctx, pi);

    expect(result).toBe(true);
    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-branch', {
      rootEntryId: 'leaf-root',
      taskIndex: 1,
    });
    expect(sendMessage).toHaveBeenCalled();
    expect(state.tasks[1].branchLeafId).toBe('leaf-new');
  });

  it('returns true when navigateTree succeeds (existing branch)', async () => {
    const { pi, appendEntry, sendMessage } = setupExtension();
    const ctx: MockCtx = makeCtx();
    ctx.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });

    const state = makeState([
      { index: 0, title: 'Task A', description: 'Desc A', done: false, branchLeafId: 'leaf-a' },
      { index: 1, title: 'Task B', description: 'Desc B', done: false, branchLeafId: 'leaf-b' },
    ]);

    const result = await switchToTask(state, 1, ctx, pi);

    expect(result).toBe(true);
    expect(ctx.navigateTree).toHaveBeenCalledWith('leaf-b', { summarize: false });
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
