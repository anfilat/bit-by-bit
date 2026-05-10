import { describe, it, expect, vi } from 'vitest';
import { setupExtension, makeCtx, makeBranchEntry } from './helpers.js';
import { MESSAGE_TYPE } from '../../src/constants.js';

describe('handleStart', () => {
  it('notifies "already active" when state is already active', async () => {
    const { cmd, notify } = setupExtension();

    // First: start successfully
    const ctx1 = makeCtx({
      notify,
      branchEntries: [makeBranchEntry('assistant', 'Review text')],
    });
    ctx1.ui.custom = vi.fn().mockResolvedValue([
      { title: 'Fix bug', description: 'Fix the null pointer' },
      { title: 'Add tests', description: 'Add unit tests' },
    ]);

    await cmd.handler('', ctx1);

    notify.mockClear();

    // Second call — should say "already active"
    const ctx2 = makeCtx({ notify });
    await cmd.handler('', ctx2);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: already active', 'info');
  });

  it('notifies "no model selected" when model is undefined', async () => {
    const { cmd, notify } = setupExtension();

    const ctx = makeCtx({
      notify,
      branchEntries: [makeBranchEntry('assistant', 'some text')],
      model: undefined,
    });

    await cmd.handler('', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: no model selected', 'error');
  });

  it('notifies "no assistant message found" when branch has no assistant messages', async () => {
    const { cmd, notify } = setupExtension();

    const ctx = makeCtx({
      notify,
      branchEntries: [makeBranchEntry('user', 'hello')],
    });

    await cmd.handler('', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: no assistant message found', 'error');
  });

  it('notifies "no assistant message found" when branch is empty', async () => {
    const { cmd, notify } = setupExtension();

    const ctx = makeCtx({ notify, branchEntries: [] });

    await cmd.handler('', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: no assistant message found', 'error');
  });

  it('notifies "cancelled" when extraction returns null (user cancelled)', async () => {
    const { cmd, notify } = setupExtension();

    const ctx = makeCtx({
      notify,
      branchEntries: [makeBranchEntry('assistant', 'Review text')],
    });
    // custom() returns null by default (cancelled)

    await cmd.handler('', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: cancelled', 'info');
  });

  it('notifies "no tasks found" when extraction returns empty array', async () => {
    const { cmd, notify } = setupExtension();

    const ctx = makeCtx({
      notify,
      branchEntries: [makeBranchEntry('assistant', 'No issues found')],
    });
    ctx.ui.custom = vi.fn().mockResolvedValue([]);

    await cmd.handler('', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: no tasks found in the message', 'error');
  });

  it('notifies "only one task" when extraction returns single task', async () => {
    const { cmd, notify } = setupExtension();

    const ctx = makeCtx({
      notify,
      branchEntries: [makeBranchEntry('assistant', 'One issue: fix bug')],
    });
    ctx.ui.custom = vi.fn().mockResolvedValue([{ title: 'Fix bug', description: 'Fix NPE' }]);

    await cmd.handler('', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: only one task found, nothing to split', 'warning');
  });

  it('successfully initializes with multiple tasks', async () => {
    const { cmd, pi, notify, appendEntry, sendMessage, setStatus } = setupExtension();

    const tasks = [
      { title: 'Fix null pointer', description: 'Fix NPE in UserService.java:42' },
      { title: 'Add validation', description: 'Add email validation in registration' },
      { title: 'Refactor error handling', description: 'Centralize error handling' },
    ];

    const ctx = makeCtx({
      notify,
      branchEntries: [makeBranchEntry('assistant', 'Here is the code review...')],
      leafId: 'leaf-abc',
    });
    ctx.ui.setStatus = setStatus as typeof ctx.ui.setStatus;
    ctx.ui.custom = vi.fn().mockResolvedValue(tasks);

    await cmd.handler('', ctx);

    // Should NOT show error notifications
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('error'), 'error');
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('no model'), 'error');
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('cancelled'), 'info');

    // Should have recorded init entry (1st call) and branch entry (2nd call)
    expect(appendEntry).toHaveBeenCalledTimes(2);
    expect(appendEntry).toHaveBeenNthCalledWith(1, 'bit-by-bit-init', {
      rootEntryId: 'leaf-abc',
      tasks: tasks.map((t, i) => ({
        index: i,
        title: t.title,
        description: t.description,
        done: false,
        ...(i === 0 ? { branchLeafId: 'leaf-abc' } : {}),
      })),
    });
    expect(appendEntry).toHaveBeenNthCalledWith(2, 'bit-by-bit-branch', {
      rootEntryId: 'leaf-abc',
      taskIndex: 0,
    });

    // Should have set label on the leaf
    expect(pi.setLabel).toHaveBeenCalledWith('leaf-abc', expect.stringContaining('bbb:1:'));

    // Should have navigated to root
    expect(ctx.navigateTree).toHaveBeenCalledWith('leaf-abc', { summarize: false });

    // Should have sent task description message
    expect(sendMessage).toHaveBeenCalledWith(
      {
        customType: MESSAGE_TYPE.TASK_DESCRIPTION,
        content: '**Task 1/3: Fix null pointer**\n\nFix NPE in UserService.java:42',
        display: true,
      },
      { triggerTurn: false }
    );

    // Should have updated status
    expect(setStatus).toHaveBeenCalled();

    // Success notification
    expect(notify).toHaveBeenCalledWith('bit-by-bit: 3 tasks extracted, starting task 1', 'info');
  });

  it('notifies "navigation cancelled" and does not activate state when navigateTree is cancelled', async () => {
    const { cmd, notify, appendEntry, sendMessage, setLabel, setStatus } = setupExtension();

    const tasks = [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ];

    const ctx = makeCtx({
      notify,
      branchEntries: [makeBranchEntry('assistant', 'Review text')],
      leafId: 'leaf-root',
    });
    ctx.ui.custom = vi.fn().mockResolvedValue(tasks);
    ctx.navigateTree = vi.fn().mockResolvedValue({ cancelled: true });
    ctx.ui.setStatus = setStatus as typeof ctx.ui.setStatus;

    await cmd.handler('', ctx);

    // Should have recorded init entry but NOT branch entry
    expect(appendEntry).toHaveBeenCalledTimes(1);
    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-init', expect.anything());

    // Should NOT have sent message, set label, or updated status
    expect(sendMessage).not.toHaveBeenCalled();
    expect(setLabel).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();

    // Should notify cancellation
    expect(notify).toHaveBeenCalledWith('bit-by-bit: navigation cancelled', 'info');
    // Should NOT show success message
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('tasks extracted'), 'info');
  });
});
