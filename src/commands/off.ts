import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { ENTRY_TYPE } from '../constants.js';
import type { BitByBitState } from '../types.js';
import { guard } from './guard.js';

export async function handleOff(state: BitByBitState, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
  if (!(await guard(state, ctx))) return;

  state.active = false;

  pi.appendEntry(ENTRY_TYPE.OFF, {
    rootEntryId: state.rootEntryId,
  });

  ctx.ui.setStatus('bit-by-bit', undefined);

  ctx.ui.notify('bit-by-bit: stopped', 'info');
}
