import { describe, it, expect, vi } from 'vitest';
import { formatTaskItems } from '../../src/commands/choose.js';
import { setupExtension, makeCtx, activateState } from './helpers.js';
import type { BitByBitState } from '../../src/types.js';
import { MESSAGE_TYPE } from '../../src/constants.js';

describe('formatTaskItems', () => {
  function makeState(tasks: { title: string; done: boolean }[], currentIndex: number): BitByBitState {
    return {
      initialized: true,
      active: true,
      insideBbb: true,
      skipSessionTree: false,
      rootEntryId: 'root',
      currentTaskIndex: currentIndex,
      tasks: tasks.map((t, i) => ({
        index: i,
        title: t.title,
        description: `Desc ${i + 1}`,
        done: t.done,
      })),
    };
  }

  it('formats 3 tasks with first current and second done', () => {
    const state = makeState(
      [
        { title: 'Fix null pointer', done: false },
        { title: 'Add tests', done: true },
        { title: 'Refactor module', done: false },
      ],
      0
    );

    const result = formatTaskItems(state);

    expect(result).toEqual([
      { value: '0', label: '✗ 1. Fix null pointer ←' },
      { value: '1', label: '✓ 2. Add tests' },
      { value: '2', label: '✗ 3. Refactor module' },
    ]);
  });

  it('formats all tasks as done', () => {
    const state = makeState(
      [
        { title: 'Task A', done: true },
        { title: 'Task B', done: true },
      ],
      1
    );

    const result = formatTaskItems(state);

    expect(result).toEqual([
      { value: '0', label: '✓ 1. Task A' },
      { value: '1', label: '✓ 2. Task B ←' },
    ]);
  });

  it('formats current task as done with both ✓ and ←', () => {
    const state = makeState(
      [
        { title: 'Task A', done: false },
        { title: 'Task B', done: true },
      ],
      1
    );

    const result = formatTaskItems(state);

    expect(result[1].label).toBe('✓ 2. Task B ←');
  });

  it('uses task index as value', () => {
    const state = makeState(
      [
        { title: 'Task A', done: false },
        { title: 'Task B', done: false },
      ],
      0
    );

    const result = formatTaskItems(state);

    expect(result.map(i => i.value)).toEqual(['0', '1']);
  });

  it('hides current marker when insideBbb is false', () => {
    const state = makeState(
      [
        { title: 'Task A', done: false },
        { title: 'Task B', done: false },
      ],
      0
    );
    state.insideBbb = false;

    const result = formatTaskItems(state);

    expect(result[0].label).toBe('✗ 1. Task A');
    expect(result[1].label).toBe('✗ 2. Task B');
  });
});

describe('handleChoose', () => {
  it('notifies "not active" when state is inactive', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await cmd.handler('choose', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });

  it('does nothing when user cancels select', async () => {
    const { cmd, notify, appendEntry, sendMessage } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    // Use fresh ctx for choose to avoid navigateTree calls from activateState
    const ctx2 = makeCtx({ notify });
    ctx2.ui.custom = vi.fn().mockResolvedValue(null);

    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();

    await cmd.handler('choose', ctx2);

    // No branch creation, no navigation, no notify about switching
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(ctx2.navigateTree).not.toHaveBeenCalled();
  });

  it('notifies "already on this task" when choosing current task and insideBbb', async () => {
    const { cmd, notify, appendEntry, sendMessage } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    // custom returns index of current task (0) — must be set AFTER activateState
    ctx.ui.custom = vi.fn().mockResolvedValue('0');

    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();

    await cmd.handler('choose', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: already on this task', 'info');
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it('allows selecting same currentTaskIndex when insideBbb is false', async () => {
    const { cmd, notify, appendEntry, sendMessage, pi } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    // Trigger session_tree with an outside leaf to set insideBbb=false
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

    // Choose task A (index 0) — same as currentTaskIndex, but insideBbb is false
    const ctx2 = makeCtx({ notify });
    ctx2.ui.custom = vi.fn().mockResolvedValue('0');
    ctx2.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });

    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();

    await cmd.handler('choose', ctx2);

    // Should NOT say "already on this task" — should switch
    expect(notify).not.toHaveBeenCalledWith('bit-by-bit: already on this task', 'info');
    expect(ctx2.navigateTree).toHaveBeenCalled();
  });

  it('switches to existing branch when choosing a visited task', async () => {
    const { cmd, notify, appendEntry, sendMessage } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
      { title: 'Task C', description: 'Desc C' },
    ]);

    // Navigate to task B to give it a branchLeafId
    ctx.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-b');
    await cmd.handler('next', ctx);

    // Navigate back to task A
    const ctx2 = makeCtx({ notify });
    ctx2.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });
    await cmd.handler('prev', ctx2);

    // Now choose task B (index 1) — it has branchLeafId 'leaf-b'
    const ctx3 = makeCtx({ notify });
    ctx3.ui.custom = vi.fn().mockResolvedValue('1');
    ctx3.navigateTree = vi.fn().mockResolvedValue({ cancelled: false });

    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();

    await cmd.handler('choose', ctx3);

    // Should navigate to existing branch, not create new
    expect(ctx3.navigateTree).toHaveBeenCalledWith('leaf-b', { summarize: false });
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('bit-by-bit: switched to task 2', 'info');
  });

  it('creates new branch when choosing unvisited task', async () => {
    const { cmd, notify, appendEntry, sendMessage, setLabel } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
      { title: 'Task C', description: 'Desc C' },
    ]);

    // choose task C (index 2)
    const ctx2 = makeCtx({ notify });
    ctx2.ui.custom = vi.fn().mockResolvedValue('2');
    ctx2.sessionManager.getLeafId = vi.fn().mockReturnValue('leaf-c');

    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();
    setLabel.mockClear();

    await cmd.handler('choose', ctx2);

    // Should navigate to root first
    expect(ctx2.navigateTree).toHaveBeenCalledWith('leaf-root', { summarize: false });

    // Should create branch entry
    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-branch', {
      rootEntryId: 'leaf-root',
      taskIndex: 2,
    });

    // Should send task description
    expect(sendMessage).toHaveBeenCalledWith(
      {
        customType: MESSAGE_TYPE.TASK_DESCRIPTION,
        content: '**Task 3/3: Task C**\n\nDesc C',
        display: true,
      },
      { triggerTurn: false }
    );

    // Should set label
    expect(setLabel).toHaveBeenCalledWith('leaf-c', expect.stringContaining('bbb:3:'));

    expect(notify).toHaveBeenCalledWith('bit-by-bit: switched to task 3', 'info');
  });

  it('does not update currentTaskIndex when navigateTree is cancelled', async () => {
    const { cmd, notify, appendEntry, sendMessage } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Task A', description: 'Desc A' },
      { title: 'Task B', description: 'Desc B' },
    ]);

    // Choose task B (index 1) — unvisited, so it tries to create a new branch
    const ctx2 = makeCtx({ notify });
    ctx2.ui.custom = vi.fn().mockResolvedValue('1');
    ctx2.navigateTree = vi.fn().mockResolvedValue({ cancelled: true });

    notify.mockClear();
    appendEntry.mockClear();
    sendMessage.mockClear();

    await cmd.handler('choose', ctx2);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: navigation cancelled', 'info');
    // Should NOT have created branch or sent message
    expect(appendEntry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith('bit-by-bit: switched to task 2', 'info');
  });
});
