import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { BitByBitState } from '../types.js';

/**
 * Wait for the agent to finish its current turn before proceeding.
 * Shows a one-time notification if the agent is busy.
 */
export async function waitForAgentIdle(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.isIdle()) {
    ctx.ui.notify('bit-by-bit: waiting for agent to finish...', 'info');
  }
  await ctx.waitForIdle();
}

export interface GuardOptions {
  requireInsideBbb?: boolean;
  requirePaused?: boolean;
}

/**
 * Common preamble for bit-by-bit command handlers.
 * Returns true if execution should continue, false if the handler should return.
 */
export async function guard(
  state: BitByBitState,
  ctx: ExtensionCommandContext,
  options: GuardOptions = {}
): Promise<boolean> {
  if (!ctx.hasUI) {
    ctx.ui.notify('bit-by-bit requires interactive mode', 'error');
    return false;
  }

  await waitForAgentIdle(ctx);

  if (!state.initialized) {
    ctx.ui.notify('bit-by-bit: not active', 'warning');
    return false;
  }

  if (options.requirePaused) {
    if (state.active) {
      ctx.ui.notify('bit-by-bit: not paused', 'warning');
      return false;
    }
  } else if (!state.active) {
    ctx.ui.notify('bit-by-bit: not active', 'warning');
    return false;
  }

  if (options.requireInsideBbb && !state.insideBbb) {
    ctx.ui.notify('bit-by-bit: not on a bit-by-bit branch', 'warning');
    return false;
  }

  return true;
}
