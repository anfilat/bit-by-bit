import { describe, it, expect, vi } from 'vitest';
import { setupExtension, makeCtx, activateState } from './helpers.js';
import { MESSAGE_TYPE } from '../../src/constants.js';

describe('handleGroup', () => {
  it('notifies "not active" when state is inactive', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await cmd.handler('group 1-2', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });

  it('notifies "not active" when paused (after off)', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);
    await cmd.handler('off', ctx);

    notify.mockClear();
    await cmd.handler('group 1', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });

  it('shows usage error when no selection is given', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    notify.mockClear();
    appendEntry.mockClear();

    await cmd.handler('group', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: usage: group <selection> — e.g. "2,3" or "2-4"', 'error');
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it('notifies invalid selection', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    notify.mockClear();
    await cmd.handler('group abc', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: invalid task selection — use e.g. "2,3" or "2-4"', 'error');
  });

  it('notifies out-of-range tasks', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
      { title: 'Task C', description: 'Desc C' },
    ]);

    notify.mockClear();
    await cmd.handler('group 1-5', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: tasks 4,5 do not exist (1..3)', 'error');
  });

  it('creates a group branch and switches', async () => {
    const { cmd, notify, appendEntry, sendMessage, setLabel } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
      { title: 'Task C', description: 'Desc C' },
    ]);

    const ctx2 = makeCtx({ notify });
    ctx2.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-group');

    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();
    setLabel.mockClear();

    await cmd.handler('group 2-3', ctx2);

    // Creates branch from root
    expect(ctx2.navigateTree).toHaveBeenCalledWith('leaf-root', { summarize: false });

    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-branch', {
      rootEntryId: 'leaf-root',
      taskIndexes: [1, 2],
    });

    expect(sendMessage).toHaveBeenCalledWith(
      {
        customType: MESSAGE_TYPE.TASK_DESCRIPTION,
        content: '**Tasks 2,3/3**\n\n### Task 2: Task B\n\nDesc B\n\n### Task 3: Task C\n\nDesc C',
        display: true,
      },
      { triggerTurn: false }
    );

    expect(setLabel).toHaveBeenCalledWith('leaf-group', 'bbb:2+3:Task B');
    expect(notify).toHaveBeenCalledWith('bit-by-bit: switched to tasks 2,3', 'info');
  });

  it('normalizes unordered overlapping specs', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
      { title: 'Task C', description: 'Desc C' },
    ]);

    const ctx2 = makeCtx({ notify });
    ctx2.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-group');

    appendEntry.mockClear();

    await cmd.handler('group 3,1-2', ctx2);

    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-branch', {
      rootEntryId: 'leaf-root',
      taskIndexes: [0, 1, 2],
    });
    expect(notify).toHaveBeenCalledWith('bit-by-bit: switched to tasks 1,2,3', 'info');
  });

  it('switches to a single task', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    const ctx2 = makeCtx({ notify });
    ctx2.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-b');

    notify.mockClear();

    await cmd.handler('group 2', ctx2);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: switched to task 2', 'info');
  });

  it('notifies "already on this task" for the current single task', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    // After start, current task is 1 (index 0)
    notify.mockClear();
    appendEntry.mockClear();

    await cmd.handler('group 1', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: already on this task', 'info');
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it('notifies "already on these tasks" for the current group', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
      { title: 'Task C', description: 'Desc C' },
    ]);

    // Switch to group 2-3 first
    const ctx2 = makeCtx({ notify });
    ctx2.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-group');
    await cmd.handler('group 2-3', ctx2);

    notify.mockClear();
    appendEntry.mockClear();

    // Same group again, in different order
    await cmd.handler('group 3,2', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: already on these tasks', 'info');
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it('does not switch when navigation is cancelled', async () => {
    const { cmd, notify, appendEntry, sendMessage } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    const ctx2 = makeCtx({ notify });
    ctx2.navigateTree = vi.fn().mockResolvedValue({ cancelled: true });

    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();

    await cmd.handler('group 2', ctx2);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: navigation cancelled', 'info');
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith('bit-by-bit: switched to task 2', 'info');
  });

  it('navigates to an existing group branch without re-creating it', async () => {
    const { cmd, notify, appendEntry, sendMessage } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
      { title: 'Task C', description: 'Desc C' },
    ]);

    // Visit group 2-3
    const ctx2 = makeCtx({ notify });
    ctx2.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-group');
    await cmd.handler('group 2-3', ctx2);

    // Switch away to task 1
    const ctx3 = makeCtx({ notify });
    ctx3.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-a');
    await cmd.handler('group 1', ctx3);

    // Switch back to group 2-3 — must reuse the existing branch
    const ctx4 = makeCtx({ notify });

    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();

    await cmd.handler('group 2-3', ctx4);

    expect(ctx4.navigateTree).toHaveBeenCalledWith('leaf-group', { summarize: false });
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('bit-by-bit: switched to tasks 2,3', 'info');
  });
});
