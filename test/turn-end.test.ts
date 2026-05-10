import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI, ExtensionCommandContext, TurnEndEvent } from '@earendil-works/pi-coding-agent';
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
      { index: 0, title: 'Task 1', description: 'Desc 1', done: false },
      { index: 1, title: 'Task 2', description: 'Desc 2', done: false },
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

describe('turn_end handler', () => {
  it('does nothing when insideBbb is false', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ insideBbb: false });
    activateState(pi, state);

    const getLeafId = vi.fn(() => 'leaf-abc');
    const ctx = {
      sessionManager: { getLeafId },
    } as unknown as ExtensionCommandContext;

    const handler = getHandler(pi, 'turn_end');
    handler({} as TurnEndEvent, ctx);

    expect(getLeafId).not.toHaveBeenCalled();
  });

  it('does nothing when active is false', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ active: false });
    activateState(pi, state);

    const getLeafId = vi.fn(() => 'leaf-abc');
    const ctx = {
      sessionManager: { getLeafId },
    } as unknown as ExtensionCommandContext;

    const handler = getHandler(pi, 'turn_end');
    handler({} as TurnEndEvent, ctx);

    expect(getLeafId).not.toHaveBeenCalled();
  });

  it('updates branchLeafId to current leaf when insideBbb is true', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ insideBbb: true, currentTaskIndex: 0 });
    activateState(pi, state);

    const getLeafId = vi.fn(() => 'leaf-new');
    const ctx = {
      sessionManager: { getLeafId },
    } as unknown as ExtensionCommandContext;

    const handler = getHandler(pi, 'turn_end');
    handler({} as TurnEndEvent, ctx);

    expect(getLeafId).toHaveBeenCalled();
    expect(state.tasks[0].branchLeafId).toBe('leaf-new');
  });

  it('updates branchLeafId for the correct task based on currentTaskIndex', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ insideBbb: true, currentTaskIndex: 1 });
    activateState(pi, state);

    const getLeafId = vi.fn(() => 'leaf-for-task-2');
    const ctx = {
      sessionManager: { getLeafId },
    } as unknown as ExtensionCommandContext;

    const handler = getHandler(pi, 'turn_end');
    handler({} as TurnEndEvent, ctx);

    expect(state.tasks[1].branchLeafId).toBe('leaf-for-task-2');
    // Task 0 should remain untouched
    expect(state.tasks[0].branchLeafId).toBeUndefined();
  });
});
