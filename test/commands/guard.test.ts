import { describe, it, expect, vi } from 'vitest';
import { waitForAgentIdle } from '../../src/commands/guard.js';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

function makeCtx(isIdle: boolean) {
  return {
    isIdle: vi.fn(() => isIdle),
    waitForIdle: vi.fn(() => Promise.resolve()),
    ui: { notify: vi.fn() },
  } as unknown as ExtensionCommandContext;
}

describe('waitForAgentIdle', () => {
  it('does not notify when agent is already idle', async () => {
    const ctx = makeCtx(true);
    await waitForAgentIdle(ctx);
    expect(ctx.ui.notify).not.toHaveBeenCalled();
    expect(ctx.waitForIdle).toHaveBeenCalled();
  });

  it('notifies and waits when agent is busy', async () => {
    const ctx = makeCtx(false);
    await waitForAgentIdle(ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith('bit-by-bit: waiting for agent to finish...', 'info');
    expect(ctx.waitForIdle).toHaveBeenCalled();
  });
});
