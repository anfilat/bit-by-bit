import { describe, it, expect, vi } from 'vitest';
import { setupExtension, makeCtx, activateState } from './helpers.js';

describe('handleOff', () => {
  it('deactivates active state and appends off entry', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    notify.mockClear();
    appendEntry.mockClear();

    await cmd.handler('off', ctx);

    // Entry persisted
    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-off', {
      rootEntryId: 'leaf-root',
    });

    // Status bar cleared
    expect(ctx.ui.setStatus).toHaveBeenCalledWith('bit-by-bit', undefined);

    // User notified
    expect(notify).toHaveBeenCalledWith('bit-by-bit: stopped', 'info');
  });

  it('notifies "not active" when state is inactive', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    // Don't activate — just call off
    await cmd.handler('off', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });
});

describe('handleResume', () => {
  it('resumes and sets insideBbb=true when on a task branch', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    // Stop first
    notify.mockClear();
    appendEntry.mockClear();
    await cmd.handler('off', ctx);

    // Mock getEntry so findTaskByLeaf finds the branch entry for task 0
    ctx.sessionManager.getEntry = vi.fn().mockImplementation((id: string) => {
      if (id === 'leaf-root') {
        return {
          type: 'custom',
          customType: 'bit-by-bit-branch',
          data: { rootEntryId: 'leaf-root', taskIndex: 0 },
          id,
          parentId: null,
          timestamp: new Date().toISOString(),
        };
      }
      return null;
    });

    // Now resume
    notify.mockClear();
    appendEntry.mockClear();

    await cmd.handler('resume', ctx);

    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-resume', {
      rootEntryId: 'leaf-root',
    });

    // Status bar shows task (insideBbb = true)
    expect(ctx.ui.setStatus).toHaveBeenCalledWith('bit-by-bit', expect.stringContaining('Fix bug'));
    expect(notify).toHaveBeenCalledWith('bit-by-bit: resumed', 'info');
  });

  it('resumes and sets insideBbb=false when outside task branches', async () => {
    const { cmd, notify, appendEntry } = setupExtension();
    const ctx = makeCtx({ notify, leafId: 'leaf-somewhere-else' });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    // Stop first
    notify.mockClear();
    appendEntry.mockClear();
    await cmd.handler('off', ctx);

    // getEntry returns nothing related to bbb — leaf is outside
    ctx.sessionManager.getEntry = vi.fn().mockReturnValue(null);

    // Now resume
    notify.mockClear();
    appendEntry.mockClear();

    await cmd.handler('resume', ctx);

    expect(appendEntry).toHaveBeenCalledWith('bit-by-bit-resume', {
      rootEntryId: 'leaf-root',
    });

    // Status bar shows outside
    expect(ctx.ui.setStatus).toHaveBeenCalledWith('bit-by-bit', expect.stringContaining('Outside'));
    expect(notify).toHaveBeenCalledWith('bit-by-bit: resumed', 'info');
  });

  it('notifies "not paused" when state is active', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    await activateState(cmd, ctx, [
      { title: 'Fix bug', description: 'Fix NPE' },
      { title: 'Add tests', description: 'Unit tests' },
    ]);

    notify.mockClear();

    // State is active, not paused — resume should warn
    await cmd.handler('resume', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not paused', 'warning');
  });

  it('notifies "not active" when state was never initialized', async () => {
    const { cmd, notify } = setupExtension();
    const ctx = makeCtx({ notify });

    // Never activated — no state at all
    await cmd.handler('resume', ctx);

    expect(notify).toHaveBeenCalledWith('bit-by-bit: not active', 'warning');
  });
});
