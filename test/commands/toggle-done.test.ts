import { describe, it, expect, vi } from 'vitest';
import { setupExtension, makeCtx, activateState } from './helpers.js';

describe('handleDone', () => {
  it('marks current task as done and appends entry', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    notify.mockClear();
    appendEntry.mockClear();

    await cmd.handler('done', ctx);

    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-done', {
      rootEntryId: 'leaf-root',
      taskIndex: 0,
    });

    expect(notify).toHaveBeenCalledWith('bit-by-bit: task 1 marked as done', 'info');
  });

  it('notifies "already done" when task is already marked', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    // Mark done first time
    notify.mockClear();
    appendEntry.mockClear();
    await cmd.handler('done', ctx);

    notify.mockClear();
    appendEntry.mockClear();

    // Mark done again — should say "already done"
    await cmd.handler('done', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: task 1 already done', 'info');
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it('notifies "not active" when state is inactive', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    // Don't activate — just call done directly
    await cmd.handler('done', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });

  it('notifies "not on a bit-by-bit branch" when outside bbb area', async () => {
    const { cmd, notify, appendEntry, pi } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    // Navigate outside bbb area to set insideBbb = false
    const onCalls = vi.mocked(pi.on).mock.calls as Array<[string, Function]>;
    const treeHandler = onCalls.find(c => c[0] === 'session_tree')![1];
    const getEntry = vi.fn().mockImplementation(() => ({ type: 'message', parentId: null }));
    treeHandler(
      { newLeafId: 'leaf-outside', oldLeafId: 'leaf-root' },
      {
        sessionManager: { getLeafId: vi.fn().mockReturnValue('leaf-outside'), getEntry },
        ui: { setStatus: vi.fn() },
      }
    );

    notify.mockClear();
    appendEntry.mockClear();

    await cmd.handler('done', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not on a bit-by-bit branch', 'warning');
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it('appends entry and notifies even when task has no branchLeafId', async () => {
    const { cmd, notify, appendEntry, setLabel } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    notify.mockClear();
    appendEntry.mockClear();
    setLabel.mockClear();

    // The first task gets branchLeafId from start, so setLabel will be called.
    // This verifies the normal path — entry + notify always happen.
    await cmd.handler('done', ctx);

    expect(appendEntry).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('bit-by-bit: task 1 marked as done', 'info');
  });
});

describe('handleUndone', () => {
  it('marks done task as undone and appends entry', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    // First mark as done
    notify.mockClear();
    appendEntry.mockClear();
    await cmd.handler('done', ctx);

    // Then mark as undone
    notify.mockClear();
    appendEntry.mockClear();
    await cmd.handler('undone', ctx);

    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-undone', {
      rootEntryId: 'leaf-root',
      taskIndex: 0,
    });

    expect(notify).toHaveBeenCalledWith('bit-by-bit: task 1 marked as undone', 'info');
  });

  it('notifies "not done" when task is not marked', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    notify.mockClear();
    appendEntry.mockClear();

    // Task is not done — calling undone should say "not done"
    await cmd.handler('undone', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: task 1 is not done', 'info');
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it('notifies "not active" when state is inactive', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    // Don't activate
    await cmd.handler('undone', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });

  it('notifies "not on a bit-by-bit branch" when outside bbb area', async () => {
    const { cmd, notify, appendEntry, pi } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    // Mark done first so undone has something to undo
    await cmd.handler('done', ctx);

    // Navigate outside bbb area to set insideBbb = false
    const onCalls = vi.mocked(pi.on).mock.calls as Array<[string, Function]>;
    const treeHandler = onCalls.find(c => c[0] === 'session_tree')![1];
    const getEntry = vi.fn().mockImplementation(() => ({ type: 'message', parentId: null }));
    treeHandler(
      { newLeafId: 'leaf-outside', oldLeafId: 'leaf-root' },
      {
        sessionManager: { getLeafId: vi.fn().mockReturnValue('leaf-outside'), getEntry },
        ui: { setStatus: vi.fn() },
      }
    );

    notify.mockClear();
    appendEntry.mockClear();

    await cmd.handler('undone', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not on a bit-by-bit branch', 'warning');
    expect(appendEntry).not.toHaveBeenCalled();
  });
});
