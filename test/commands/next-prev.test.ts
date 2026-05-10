import { describe, it, expect, vi } from 'vitest';
import { resolveNextTask, resolvePrevTask } from '../../src/commands/next-prev.js';
import { setupExtension, makeCtx, activateState, type MockCtx } from './helpers.js';
import type { BitByBitState } from '../../src/types.js';
import { MESSAGE_TYPE } from '../../src/constants.js';

describe('resolveNextTask', () => {
  function makeState(index: number, total: number): BitByBitState {
    return {
      initialized: true,
      active: true,
      insideBbb: true,
      skipSessionTree: false,
      rootEntryId: 'root',
      currentTaskIndex: index,
      tasks: Array.from({ length: total }, (_, i) => ({
        index: i,
        title: `Task ${i + 1}`,
        description: `Desc ${i + 1}`,
        done: false,
      })),
    };
  }

  it('returns next index when not on last task', () => {
    expect(resolveNextTask(makeState(0, 3))).toBe(1);
  });

  it('returns null when on last task', () => {
    expect(resolveNextTask(makeState(2, 3))).toBeNull();
  });

  it('returns next index when on middle task', () => {
    expect(resolveNextTask(makeState(1, 3))).toBe(2);
  });

  it('returns null with single task', () => {
    expect(resolveNextTask(makeState(0, 1))).toBeNull();
  });
});

describe('resolvePrevTask', () => {
  function makeState(index: number, total: number): BitByBitState {
    return {
      initialized: true,
      active: true,
      insideBbb: true,
      skipSessionTree: false,
      rootEntryId: 'root',
      currentTaskIndex: index,
      tasks: Array.from({ length: total }, (_, i) => ({
        index: i,
        title: `Task ${i + 1}`,
        description: `Desc ${i + 1}`,
        done: false,
      })),
    };
  }

  it('returns previous index when not on first task', () => {
    expect(resolvePrevTask(makeState(1, 3))).toBe(0);
  });

  it('returns null when on first task', () => {
    expect(resolvePrevTask(makeState(0, 3))).toBeNull();
  });

  it('returns previous index when on last task', () => {
    expect(resolvePrevTask(makeState(2, 3))).toBe(1);
  });

  it('returns null with single task', () => {
    expect(resolvePrevTask(makeState(0, 1))).toBeNull();
  });
});

describe('handleNext', () => {
  it('notifies "not active" when state is inactive', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await cmd.handler('next', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });

  it('notifies "already on last task" at boundary', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    notify.mockClear();

    // Go to last task (index 1) then try next
    await cmd.handler('next', ctx);
    notify.mockClear();

    await cmd.handler('next', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: already on last task', 'info');
  });

  it('switches to next task and creates new branch', async () => {
    const { cmd, notify, appendEntry, sendMessage, setLabel } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
      { title: 'Task C', description: 'Desc C' },
    ]);

    // After activateState, getLeafId returns 'leaf-root'.
    // For the new branch, simulate navigateTree creating a new leaf.
    ctx.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-new');

    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();
    setLabel.mockClear();

    await cmd.handler('next', ctx);

    // Should navigate to root first
    expect(ctx.navigateTree).toHaveBeenCalledWith('leaf-root', { summarize: false });

    // Should create branch entry for task 2 (index 1)
    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-branch', {
      rootEntryId: 'leaf-root',
      taskIndex: 1,
    });

    // Should send task description
    expect(sendMessage).toHaveBeenCalledWith(
      {
        customType: MESSAGE_TYPE.TASK_DESCRIPTION,
        content: '**Task 2/3: Task B**\n\nDesc B',
        display: true,
      },
      { triggerTurn: false }
    );

    // Should set label on the new leaf
    expect(setLabel).toHaveBeenCalledWith('leaf-new', expect.stringContaining('bbb:2:'));

    // Should notify
    expect(notify).toHaveBeenCalledWith('bit-by-bit: switched to task 2', 'info');
  });

  it('navigates to existing branch when task was visited before', async () => {
    const { cmd, notify, appendEntry, sendMessage } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    // Go to task 2 — creates branch with leaf 'leaf-b'
    ctx.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-b');
    await cmd.handler('next', ctx);

    // Now go back to task 1
    const ctx2 = makeCtx({ notify });
    // Task 1 has branchLeafId = 'leaf-root' from activateState
    ctx2.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });
    await cmd.handler('prev', ctx2);

    // Now go next again — should navigate to existing branch of task B (leaf-b)
    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();
    const ctx3: MockCtx = makeCtx({ notify });
    ctx3.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });

    await cmd.handler('next', ctx3);

    // Should NOT create a new branch entry or send message
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();

    // Should navigate to the existing branchLeafId of task B
    expect(ctx3.navigateTree).toHaveBeenCalledWith('leaf-b', { summarize: false });
    expect(notify).toHaveBeenCalledWith('bit-by-bit: switched to task 2', 'info');
  });

  it('does not update currentTaskIndex when navigateTree is cancelled', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    notify.mockClear();
    const ctx2: MockCtx = makeCtx({ notify });
    ctx2.navigateTree = vi.fn().mockResolvedValue({ cancelled: true });

    await cmd.handler('next', ctx2);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: navigation cancelled', 'info');
    // Should NOT have switched to task 2
    expect(notify).not.toHaveBeenCalledWith('bit-by-bit: switched to task 2', 'info');
  });
});

describe('handlePrev', () => {
  it('notifies "not active" when state is inactive', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await cmd.handler('prev', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });

  it('notifies "already on first task" at boundary', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    notify.mockClear();

    // Already on first task (index 0)
    await cmd.handler('prev', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: already on first task', 'info');
  });

  it('navigates to existing branch when going back to visited task', async () => {
    const { cmd, notify, appendEntry, sendMessage } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
      { title: 'Task C', description: 'Desc C' },
    ]);

    // Go to task 2
    ctx.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-b');
    await cmd.handler('next', ctx);

    // Go to task 3
    ctx.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-c');
    await cmd.handler('next', ctx);

    // Now go back to task 2 (has branchLeafId = 'leaf-b')
    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();
    const ctx2 = makeCtx({ notify });
    ctx2.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });

    await cmd.handler('prev', ctx2);

    // Should navigate to existing branch, not create new entry
    expect(ctx2.navigateTree).toHaveBeenCalledWith('leaf-b', { summarize: false });
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('bit-by-bit: switched to task 2', 'info');
  });
});
