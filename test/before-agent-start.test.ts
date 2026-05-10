import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI, BeforeAgentStartEvent } from '@earendil-works/pi-coding-agent';
import type { BitByBitState } from '../src/types.js';
import bitByBitExtension from '../src/index.js';
import { createMockPi } from './helpers.js';

vi.mock('../src/state.js', () => ({
  reconstructState: vi.fn(),
}));

import { reconstructState } from '../src/state.js';

const mockReconstructState = vi.mocked(reconstructState);

/** Extract an event handler registered by the extension via pi.on. */
function getHandler(pi: ExtensionAPI, event: string) {
  const calls = vi.mocked(pi.on).mock.calls;
  const call = calls.find(c => c[0] === event);
  return call![1] as (...args: any[]) => any;
}

function makeState(overrides: Partial<BitByBitState> = {}): BitByBitState {
  return {
    initialized: true,
    active: true,
    insideBbb: true,
    skipSessionTree: false,
    rootEntryId: 'root-1',
    currentTaskIndex: 0,
    tasks: [
      { index: 0, title: 'Fix null pointer', description: 'Fix the NPE in UserService', done: false },
      { index: 1, title: 'Add tests', description: 'Write unit tests for UserService', done: false },
    ],
    ...overrides,
  };
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

describe('before_agent_start handler', () => {
  it('returns undefined when active is false', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ active: false });
    activateState(pi, state);

    const handler = getHandler(pi, 'before_agent_start');
    const result = handler({} as BeforeAgentStartEvent);

    expect(result).toBeUndefined();
  });

  it('returns undefined when insideBbb is false', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ insideBbb: false });
    activateState(pi, state);

    const handler = getHandler(pi, 'before_agent_start');
    const result = handler({} as BeforeAgentStartEvent);

    expect(result).toBeUndefined();
  });

  it('returns context message with correct format when active and insideBbb', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ currentTaskIndex: 0 });
    activateState(pi, state);

    const handler = getHandler(pi, 'before_agent_start');
    const result = handler({} as BeforeAgentStartEvent);

    expect(result).toBeDefined();
    expect(result.message).toBeDefined();
    expect(result.message.customType).toBe('bit-by-bit-context');
    expect(result.message.display).toBe(false);
    expect(result.message.content).toBe(
      '[bit-by-bit] You are working on a single task from a larger list.\nAll user messages on this branch refer exclusively to this task. When the user says "re-check", "fix", "explain" etc — they mean THIS task only, not the full list.\n\n## Task: Fix null pointer\n\nFix the NPE in UserService'
    );
  });

  it('returns context for second task when currentTaskIndex is 1', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ currentTaskIndex: 1 });
    activateState(pi, state);

    const handler = getHandler(pi, 'before_agent_start');
    const result = handler({} as BeforeAgentStartEvent);

    expect(result.message.content).toBe(
      '[bit-by-bit] You are working on a single task from a larger list.\nAll user messages on this branch refer exclusively to this task. When the user says "re-check", "fix", "explain" etc — they mean THIS task only, not the full list.\n\n## Task: Add tests\n\nWrite unit tests for UserService'
    );
  });
});
