import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI, ContextEvent } from '@earendil-works/pi-coding-agent';
import type { BitByBitState } from '../src/types.js';
import bitByBitExtension from '../src/index.js';
import { createMockPi } from './helpers.js';
import { MESSAGE_TYPE } from '../src/constants.js';

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
    tasks: [{ index: 0, title: 'Task 1', description: 'Desc 1', done: false }],
    ...overrides,
  };
}

function activateState(pi: ExtensionAPI, state: BitByBitState) {
  mockReconstructState.mockReturnValue(state);
  const sessionStartHandler = getHandler(pi, 'session_start');
  const sessionCtx = {
    sessionManager: { getEntries: vi.fn(), getLeafId: vi.fn(), getTree: vi.fn(() => []) },
    ui: { notify: vi.fn(), setStatus: vi.fn(), select: vi.fn() },
  };
  sessionStartHandler({}, sessionCtx);
}

describe('context handler', () => {
  it('does not filter when no task-description messages are present', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState();
    activateState(pi, state);

    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    const handler = getHandler(pi, 'context');
    const result = handler({ messages } as unknown as ContextEvent);

    expect(result.messages).toHaveLength(2);
    expect(result.messages).toEqual(messages);
  });

  it('filters out task-description messages', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState();
    activateState(pi, state);

    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'custom', customType: MESSAGE_TYPE.TASK_DESCRIPTION, content: 'Task desc', display: true },
      { role: 'assistant', content: 'Response' },
    ];

    const handler = getHandler(pi, 'context');
    const result = handler({ messages } as unknown as ContextEvent);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual(messages[0]);
    expect(result.messages[1]).toEqual(messages[2]);
  });

  it('filters only task-description, keeps other custom messages', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState();
    activateState(pi, state);

    const messages = [
      { role: 'custom', customType: MESSAGE_TYPE.CONTEXT, content: 'context msg', display: false },
      { role: 'custom', customType: MESSAGE_TYPE.TASK_DESCRIPTION, content: 'Task desc', display: true },
      { role: 'custom', customType: 'other-type', content: 'other', display: true },
    ];

    const handler = getHandler(pi, 'context');
    const result = handler({ messages } as unknown as ContextEvent);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual(messages[0]);
    expect(result.messages[1]).toEqual(messages[2]);
  });

  it('filters task-description even when state is not active', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const state = makeState({ active: false });
    activateState(pi, state);

    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'custom', customType: MESSAGE_TYPE.TASK_DESCRIPTION, content: 'Task desc', display: true },
    ];

    const handler = getHandler(pi, 'context');
    const result = handler({ messages } as unknown as ContextEvent);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual(messages[0]);
  });
});
