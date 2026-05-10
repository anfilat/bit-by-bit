import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
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
  return call![1] as (...args: any[]) => void;
}

function makeSessionCtx() {
  return {
    sessionManager: { getEntries: vi.fn(), getLeafId: vi.fn(), getTree: vi.fn(() => []) },
    ui: { notify: vi.fn(), setStatus: vi.fn(), select: vi.fn() },
  };
}

describe('session_start handler', () => {
  it('clears state and status bar when no init entry is found', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    mockReconstructState.mockReturnValue(null);

    const ctx = makeSessionCtx();
    const handler = getHandler(pi, 'session_start');
    handler({}, ctx);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith('bit-by-bit', undefined);
  });

  it('restores state and updates status bar when init entry is found', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    const restoredState: BitByBitState = {
      initialized: true,
      active: true,
      insideBbb: true,
      skipSessionTree: false,
      rootEntryId: 'root-1',
      currentTaskIndex: 0,
      tasks: [
        { index: 0, title: 'Task 1', description: 'Desc 1', done: false },
        { index: 1, title: 'Task 2', description: 'Desc 2', done: true },
      ],
    };
    mockReconstructState.mockReturnValue(restoredState);

    const ctx = makeSessionCtx();
    const handler = getHandler(pi, 'session_start');
    handler({}, ctx);

    // Status bar should be updated with the restored state's status text
    expect(ctx.ui.setStatus).toHaveBeenCalledWith('bit-by-bit', expect.any(String));
    const statusArg = ctx.ui.setStatus.mock.calls[0][1] as string;
    expect(statusArg).toContain('Task 1');
    expect(statusArg).toContain('1/2');
  });

  it('calls reconstructState with the session manager', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    mockReconstructState.mockReturnValue(null);

    const ctx = makeSessionCtx();
    const handler = getHandler(pi, 'session_start');
    handler({}, ctx);

    expect(mockReconstructState).toHaveBeenCalledWith(ctx.sessionManager);
  });
});
