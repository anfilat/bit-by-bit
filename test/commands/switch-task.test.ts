import { describe, it, expect, vi } from 'vitest';
import { formatLabel, formatTaskDescription, switchToTasks } from '../../src/commands/switch-task.js';
import type { Task, BitByBitState } from '../../src/types.js';
import { makeCtx, setupExtension, type MockCtx } from './helpers.js';

function makeTask(index: number, title: string, over: Partial<Task> = {}): Task {
  return { index, title, description: `Desc ${index + 1}`, done: false, ...over };
}

function makeState(tasks: Task[] = [], currentTaskIndexes: number[] = []): BitByBitState {
  return {
    initialized: true,
    active: true,
    insideBbb: true,
    skipSessionTree: false,
    rootEntryId: 'leaf-root',
    currentTaskIndexes,
    tasks,
    groupBranchLeafIds: new Map(),
  };
}

describe('formatLabel', () => {
  it('formats single task label', () => {
    expect(formatLabel([makeTask(0, 'Fix null pointer in UserService')])).toBe('bbb:1:Fix null pointer in UserService');
  });

  it('truncates long title to ~40 characters', () => {
    const result = formatLabel([makeTask(0, 'A'.repeat(100))]);
    // "bbb:1:" is 6 chars, total should be ~46 (6 + 40)
    expect(result).toBe('bbb:1:' + 'A'.repeat(40));
    expect(result.length).toBe(46);
  });

  it('formats group label with joined numbers and first title', () => {
    const tasks = [makeTask(1, 'Task B'), makeTask(2, 'Task C')];
    expect(formatLabel(tasks)).toBe('bbb:2+3:Task B');
  });
});

describe('formatTaskDescription', () => {
  it('keeps historical single-task format', () => {
    const task = makeTask(2, 'Task C');
    expect(formatTaskDescription([task], 8)).toBe('**Task 3/8: Task C**\n\nDesc 3');
  });

  it('formats group description with per-task sections', () => {
    const tasks = [makeTask(1, 'Task B'), makeTask(2, 'Task C')];
    expect(formatTaskDescription(tasks, 8)).toBe(
      '**Tasks 2,3/8**\n\n### Task 2: Task B\n\nDesc 2\n\n### Task 3: Task C\n\nDesc 3'
    );
  });
});

describe('switchToTasks', () => {
  it('returns false and does not create branch when navigateTree is cancelled (new branch)', async () => {
    const { pi, appendEntry, sendMessage, setLabel } = setupExtension();
    const ctx: MockCtx = makeCtx();
    ctx.navigateTree = vi.fn().mockResolvedValue({ cancelled: true });

    const state = makeState([makeTask(0, 'Task A'), makeTask(1, 'Task B')]);

    const result = await switchToTasks(state, [1], ctx, pi);

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
      makeTask(0, 'Task A', { branchLeafId: 'leaf-a' }),
      makeTask(1, 'Task B', { branchLeafId: 'leaf-b' }),
    ]);

    const result = await switchToTasks(state, [1], ctx, pi);

    expect(result).toBe(false);
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('returns false for empty selection', async () => {
    const { pi, appendEntry } = setupExtension();
    const ctx: MockCtx = makeCtx();

    const state = makeState([makeTask(0, 'Task A')]);
    const result = await switchToTasks(state, [], ctx, pi);

    expect(result).toBe(false);
    expect(appendEntry).not.toHaveBeenCalled();
    expect(ctx.navigateTree).not.toHaveBeenCalled();
  });

  it('returns true and creates branch when navigateTree succeeds (new branch)', async () => {
    const { pi, appendEntry, sendMessage } = setupExtension();
    const ctx: MockCtx = makeCtx();
    ctx.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });
    ctx.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-new');

    const state = makeState([makeTask(0, 'Task A'), makeTask(1, 'Task B')]);

    const result = await switchToTasks(state, [1], ctx, pi);

    expect(result).toBe(true);
    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-branch', {
      rootEntryId: 'leaf-root',
      taskIndexes: [1],
    });
    expect(sendMessage).toHaveBeenCalled();
    expect(state.tasks[1].branchLeafId).toBe('leaf-new');
  });

  it('returns true when navigateTree succeeds (existing branch)', async () => {
    const { pi, appendEntry, sendMessage } = setupExtension();
    const ctx: MockCtx = makeCtx();
    ctx.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });

    const state = makeState([
      makeTask(0, 'Task A', { branchLeafId: 'leaf-a' }),
      makeTask(1, 'Task B', { branchLeafId: 'leaf-b' }),
    ]);

    const result = await switchToTasks(state, [1], ctx, pi);

    expect(result).toBe(true);
    expect(ctx.navigateTree).toHaveBeenCalledWith('leaf-b', { summarize: false });
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('creates a group branch with taskIndexes payload and group label', async () => {
    const { pi, appendEntry, sendMessage, setLabel } = setupExtension();
    const ctx: MockCtx = makeCtx();
    ctx.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });
    ctx.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-group');

    const state = makeState([makeTask(0, 'Task A'), makeTask(1, 'Task B'), makeTask(2, 'Task C')]);

    const result = await switchToTasks(state, [2, 1], ctx, pi);

    expect(result).toBe(true);
    // Indexes are normalized (sorted, unique)
    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-branch', {
      rootEntryId: 'leaf-root',
      taskIndexes: [1, 2],
    });
    expect(sendMessage).toHaveBeenCalledWith(
      {
        customType: 'bit-by-bit',
        content: '**Tasks 2,3/3**\n\n### Task 2: Task B\n\nDesc 2\n\n### Task 3: Task C\n\nDesc 3',
        display: true,
      },
      { triggerTurn: false }
    );
    expect(setLabel).toHaveBeenCalledWith('leaf-group', 'bbb:2+3:Task B');
    // Group leaf recorded under canonical key, not on individual tasks
    expect(state.groupBranchLeafIds.get('2+3')).toBe('leaf-group');
    expect(state.tasks[1].branchLeafId).toBeUndefined();
    expect(state.tasks[2].branchLeafId).toBeUndefined();
  });

  it('navigates to existing group branch on re-selection', async () => {
    const { pi, appendEntry, sendMessage } = setupExtension();
    const ctx: MockCtx = makeCtx();
    ctx.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });

    const state = makeState([makeTask(0, 'Task A'), makeTask(1, 'Task B')]);
    state.groupBranchLeafIds.set('1+2', 'leaf-group');

    const result = await switchToTasks(state, [1, 0], ctx, pi);

    expect(result).toBe(true);
    expect(ctx.navigateTree).toHaveBeenCalledWith('leaf-group', { summarize: false });
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
