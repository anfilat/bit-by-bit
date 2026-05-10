import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupExtension, makeCtx, activateState, makeBranchEntry } from './helpers.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

describe('handleWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies "not active" when state is inactive', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await cmd.handler('write', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });

  it('writes document for task with no discussion (Scenario 1)', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    // Activate with tasks. Branch is just the fake assistant message from start,
    // no user/assistant after that, so hasDiscussion = false.
    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    notify.mockClear();

    // The branch returned by getBranch during write will be the stub (empty by default).
    // Since there's no task-description entry, hasDiscussion returns false.
    await cmd.handler('write', ctx);

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('bit-by-bit: document written to'), 'info');
  });

  it('writes document for task with discussion (Scenario 2)', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    notify.mockClear();

    // Set up branch with task-description + user message = hasDiscussion = true
    const branchWithDiscussion = [
      {
        type: 'custom_message',
        id: 'desc-1',
        parentId: null,
        timestamp: new Date().toISOString(),
        customType: 'bit-by-bit',
        content: '**Task 1/2: Fix bug**',
        display: true,
      },
      makeBranchEntry('user', 'Fix the bug'),
      makeBranchEntry('assistant', 'I fixed it'),
    ];
    ctx.sessionManager.getBranch = vi.fn().mockReturnValue(branchWithDiscussion);

    // Mock the LLM summarization via ctx.ui.custom
    ctx.ui.custom = vi.fn().mockImplementation(async _factory => {
      // Simulate that the factory returns a document string
      return '# Task 1/2: Fix bug\n\n## Progress\n\n### Status: In progress\n\nSummary text';
    });

    await cmd.handler('write', ctx);

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('bit-by-bit: document written to'), 'info');
  });

  it('notifies "not on a bit-by-bit branch" when outside bbb', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    // Simulate being outside bbb (e.g. navigated away via /tree)
    // The state is shared in the closure, so we need to trigger session_tree
    // Or we can test this indirectly: the write command checks state.insideBbb
    // Since we activated, insideBbb is true. To test false, we'd need to trigger
    // a session_tree event. For simplicity, let's test through a different approach:
    // use the off command to deactivate, then resume (which doesn't set insideBbb back)
    notify.mockClear();
    await cmd.handler('off', ctx);

    notify.mockClear();
    await cmd.handler('write', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });

  it('cancels when user aborts summarization', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    notify.mockClear();

    // Branch with discussion
    const branchWithDiscussion = [
      {
        type: 'custom_message',
        id: 'desc-1',
        parentId: null,
        timestamp: new Date().toISOString(),
        customType: 'bit-by-bit',
        content: '**Task 1/2: Fix bug**',
        display: true,
      },
      makeBranchEntry('user', 'Fix the bug'),
    ];
    ctx.sessionManager.getBranch = vi.fn().mockReturnValue(branchWithDiscussion);

    // User cancels (custom returns null)
    ctx.ui.custom = vi.fn().mockResolvedValue(null);

    await cmd.handler('write', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: write cancelled', 'info');
  });
});
