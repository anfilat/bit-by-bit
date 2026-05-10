import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI, SessionTreeEvent } from '@earendil-works/pi-coding-agent';
import type { BitByBitState } from '../src/types.js';
import bitByBitExtension from '../src/index.js';
import { createMockPi } from './helpers.js';

vi.mock('../src/state.js', () => ({
  reconstructState: vi.fn(),
}));

import { reconstructState } from '../src/state.js';

const mockReconstructState = vi.mocked(reconstructState);

function makeState(overrides: Partial<BitByBitState> = {}): BitByBitState {
  return {
    initialized: true,
    active: true,
    insideBbb: true,
    skipSessionTree: false,
    rootEntryId: 'root-1',
    currentTaskIndex: 0,
    tasks: [
      { index: 0, title: 'Task 1', description: 'Desc 1', done: false, branchLeafId: 'leaf-task0' },
      { index: 1, title: 'Task 2', description: 'Desc 2', done: false, branchLeafId: 'leaf-task1' },
    ],
    ...overrides,
  };
}

/** Extract an event handler registered by the extension via pi.on. */
function getHandler(pi: ExtensionAPI, event: string) {
  const calls = vi.mocked(pi.on).mock.calls;
  const call = calls.find(c => c[0] === event);
  return call![1] as (...args: any[]) => void;
}

/**
 * Trigger session_start on the extension to populate internal state.
 * Uses mockReconstructState to control the returned state.
 */
function activateState(pi: ExtensionAPI, state: BitByBitState) {
  mockReconstructState.mockReturnValue(state);
  const sessionStartHandler = getHandler(pi, 'session_start');
  const sessionCtx = {
    sessionManager: { getEntries: vi.fn(), getLeafId: vi.fn(), getTree: vi.fn(() => []) },
    ui: { notify: vi.fn(), setStatus: vi.fn(), select: vi.fn() },
  };
  sessionStartHandler({}, sessionCtx);
}

describe('session_tree handler', () => {
  it('does nothing when state is not initialized', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ initialized: false });
    activateState(pi, state);

    const setStatus = vi.fn();
    const ctx = {
      sessionManager: { getLeafId: vi.fn(), getEntry: vi.fn() },
      ui: { setStatus },
    };

    const handler = getHandler(pi, 'session_tree');
    handler({ newLeafId: 'leaf-new', oldLeafId: 'leaf-old' } as SessionTreeEvent, ctx);

    expect(setStatus).not.toHaveBeenCalled();
  });

  it('does nothing when active is false', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ active: false });
    activateState(pi, state);

    const setStatus = vi.fn();
    const ctx = {
      sessionManager: { getLeafId: vi.fn(), getEntry: vi.fn() },
      ui: { setStatus },
    };

    const handler = getHandler(pi, 'session_tree');
    handler({ newLeafId: 'leaf-new', oldLeafId: 'leaf-old' } as SessionTreeEvent, ctx);

    expect(setStatus).not.toHaveBeenCalled();
  });

  it('sets insideBbb=true and updates currentTaskIndex when navigating to a task branch', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ insideBbb: false, currentTaskIndex: 0 });
    activateState(pi, state);

    const setStatus = vi.fn();
    // getEntry returns a branch entry for task 1 when walking up from newLeafId
    const getEntry = vi.fn().mockImplementation((id: string) => {
      if (id === 'leaf-on-task1') {
        return {
          type: 'custom',
          customType: 'bit-by-bit-branch',
          data: { rootEntryId: 'root-1', taskIndex: 1 },
          parentId: 'parent-id',
        };
      }
      if (id === 'parent-id') {
        return { type: 'message', parentId: 'root-1' };
      }
      return { type: 'message', parentId: null };
    });

    const ctx = {
      sessionManager: { getLeafId: vi.fn(), getEntry },
      ui: { setStatus },
    };

    const handler = getHandler(pi, 'session_tree');
    handler({ newLeafId: 'leaf-on-task1', oldLeafId: 'leaf-old' } as SessionTreeEvent, ctx);

    // Verify the status bar shows the new task (Task 2, index 1)
    expect(setStatus).toHaveBeenCalledWith('bit-by-bit', expect.stringContaining('Task 2'));
    // The status should NOT contain "Outside" since we're on a task branch
    const statusText = setStatus.mock.calls[0][1] as string;
    expect(statusText).not.toContain('Outside');
  });

  it('sets insideBbb=false when navigating outside bit-by-bit area', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ insideBbb: true, currentTaskIndex: 0 });
    activateState(pi, state);

    const setStatus = vi.fn();
    // getEntry returns entries with no bit-by-bit-branch marker
    const getEntry = vi.fn().mockImplementation((id: string) => {
      if (id === 'leaf-outside') {
        return { type: 'message', parentId: 'some-other' };
      }
      if (id === 'some-other') {
        return { type: 'message', parentId: null };
      }
      return { type: 'message', parentId: null };
    });

    const ctx = {
      sessionManager: { getLeafId: vi.fn(), getEntry },
      ui: { setStatus },
    };

    const handler = getHandler(pi, 'session_tree');
    handler({ newLeafId: 'leaf-outside', oldLeafId: 'leaf-task0' } as SessionTreeEvent, ctx);

    // Status bar should show "Outside task area"
    expect(setStatus).toHaveBeenCalledWith('bit-by-bit', expect.stringContaining('Outside'));
  });

  it('preserves branchLeafId of current task before navigating away when insideBbb', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ insideBbb: true, currentTaskIndex: 0 });
    activateState(pi, state);

    const setStatus = vi.fn();
    const getLeafId = vi.fn(() => 'current-leaf-before-nav');
    const getEntry = vi.fn().mockImplementation((id: string) => {
      // newLeafId leads outside bbb
      if (id === 'leaf-outside') {
        return { type: 'message', parentId: 'other' };
      }
      return { type: 'message', parentId: null };
    });

    const ctx = {
      sessionManager: { getLeafId, getEntry },
      ui: { setStatus },
    };

    const handler = getHandler(pi, 'session_tree');
    handler({ newLeafId: 'leaf-outside', oldLeafId: 'leaf-task0' } as SessionTreeEvent, ctx);

    // The task being left should have its branchLeafId saved (tasks are shared references)
    expect(state.tasks[0].branchLeafId).toBe('current-leaf-before-nav');
    expect(getLeafId).toHaveBeenCalled();
  });

  it('does not overwrite branchLeafId when insideBbb is false before navigation', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ insideBbb: false, currentTaskIndex: 0 });
    activateState(pi, state);

    const setStatus = vi.fn();
    const getLeafId = vi.fn(() => 'outside-leaf');
    const getEntry = vi.fn().mockImplementation((id: string) => {
      if (id === 'leaf-outside') {
        return { type: 'message', parentId: null };
      }
      return { type: 'message', parentId: null };
    });

    const ctx = {
      sessionManager: { getLeafId, getEntry },
      ui: { setStatus },
    };

    const handler = getHandler(pi, 'session_tree');
    handler({ newLeafId: 'leaf-outside', oldLeafId: 'leaf-old' } as SessionTreeEvent, ctx);

    // branchLeafId should NOT be overwritten since we were outside bbb
    expect(state.tasks[0].branchLeafId).toBe('leaf-task0');
    expect(getLeafId).not.toHaveBeenCalled();
  });

  it('handles null newLeafId by setting insideBbb=false', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ insideBbb: true, currentTaskIndex: 0 });
    activateState(pi, state);

    const setStatus = vi.fn();
    const ctx = {
      sessionManager: { getLeafId: vi.fn(), getEntry: vi.fn() },
      ui: { setStatus },
    };

    const handler = getHandler(pi, 'session_tree');
    handler({ newLeafId: null, oldLeafId: 'leaf-old' } as SessionTreeEvent, ctx);

    // Status bar should show "Outside task area"
    expect(setStatus).toHaveBeenCalledWith('bit-by-bit', expect.stringContaining('Outside'));
  });
});
