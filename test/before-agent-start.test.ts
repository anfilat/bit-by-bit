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
    currentTaskIndexes: [0],
    groupBranchLeafIds: new Map(),
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

    const state = makeState({ currentTaskIndexes: [0] });
    activateState(pi, state);

    const handler = getHandler(pi, 'before_agent_start');
    const result = handler({} as BeforeAgentStartEvent);

    expect(result).toBeDefined();
    expect(result.message).toBeDefined();
    expect(result.message.customType).toBe('bit-by-bit-context');
    expect(result.message.display).toBe(false);
    expect(result.message.content).toBe(
      '[bit-by-bit] You are working on a single task from a larger list.\nAll user messages on this branch refer exclusively to this task. When the user says "re-check", "fix", "explain" etc — they mean THIS task only, not the full list.\n\nTasks from this list are worked on one at a time \u2014 not necessarily in order \u2014 in the same repository. Other tasks from the list may already be completed by now, so the current code is NOT the code from when this list was written. Existing edits, modified files and git changes from those tasks are expected — do not be surprised by them and do not treat them as a conflict. Verify the actual state of the code (read files, git status / git diff) before making assumptions from the task description — parts of the work may already be implemented.\n\n## Task: Fix null pointer\n\nFix the NPE in UserService'
    );
  });

  it('returns context for second task when currentTaskIndexes is [1]', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ currentTaskIndexes: [1] });
    activateState(pi, state);

    const handler = getHandler(pi, 'before_agent_start');
    const result = handler({} as BeforeAgentStartEvent);

    expect(result.message.content).toBe(
      '[bit-by-bit] You are working on a single task from a larger list.\nAll user messages on this branch refer exclusively to this task. When the user says "re-check", "fix", "explain" etc — they mean THIS task only, not the full list.\n\nTasks from this list are worked on one at a time \u2014 not necessarily in order \u2014 in the same repository. Other tasks from the list may already be completed by now, so the current code is NOT the code from when this list was written. Existing edits, modified files and git changes from those tasks are expected — do not be surprised by them and do not treat them as a conflict. Verify the actual state of the code (read files, git status / git diff) before making assumptions from the task description — parts of the work may already be implemented.\n\n## Task: Add tests\n\nWrite unit tests for UserService'
    );
  });

  it('lists already completed tasks when earlier tasks are marked done', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({
      currentTaskIndexes: [1],
      groupBranchLeafIds: new Map(),
      tasks: [
        { index: 0, title: 'Fix null pointer', description: 'Fix the NPE in UserService', done: true },
        { index: 1, title: 'Add tests', description: 'Write unit tests for UserService', done: false },
      ],
    });
    activateState(pi, state);

    const handler = getHandler(pi, 'before_agent_start');
    const result = handler({} as BeforeAgentStartEvent);

    expect(result.message.content).toBe(
      '[bit-by-bit] You are working on a single task from a larger list.\nAll user messages on this branch refer exclusively to this task. When the user says "re-check", "fix", "explain" etc — they mean THIS task only, not the full list.\n\nTasks from this list are worked on one at a time \u2014 not necessarily in order \u2014 in the same repository. Other tasks from the list may already be completed by now, so the current code is NOT the code from when this list was written. Existing edits, modified files and git changes from those tasks are expected — do not be surprised by them and do not treat them as a conflict. Verify the actual state of the code (read files, git status / git diff) before making assumptions from the task description — parts of the work may already be implemented.\n\nAlready completed tasks (their changes are expected in the code):\n1. Fix null pointer\n\n## Task: Add tests\n\nWrite unit tests for UserService'
    );
  });
  it('returns group context with per-task sections for a multi-task group', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({
      currentTaskIndexes: [0, 1],
      groupBranchLeafIds: new Map(),
    });
    activateState(pi, state);

    const handler = getHandler(pi, 'before_agent_start');
    const result = handler({} as BeforeAgentStartEvent);

    expect(result.message.content).toContain(
      '[bit-by-bit] You are working on a selected group of tasks (2 of them) from a larger list.'
    );
    expect(result.message.content).toContain(
      'All user messages on this branch refer exclusively to THIS group of tasks.'
    );
    expect(result.message.content).toContain('## Tasks 1,2 of 2');
    expect(result.message.content).toContain('### Task 1: Fix null pointer\n\nFix the NPE in UserService');
    expect(result.message.content).toContain('### Task 2: Add tests\n\nWrite unit tests for UserService');
  });
});
