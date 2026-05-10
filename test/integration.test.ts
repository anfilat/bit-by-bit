import { describe, it, expect, vi } from 'vitest';
import bitByBitExtension from '../src/index.js';
import { createMockPi } from './helpers.js';

describe('bit-by-bit extension integration', () => {
  it('registers the /bit-by-bit command', () => {
    const { pi, registeredCommands } = createMockPi();
    bitByBitExtension(pi);

    expect(registeredCommands.has('bit-by-bit')).toBe(true);

    const cmd = registeredCommands.get('bit-by-bit')!;
    expect(cmd.description).toBeDefined();
    expect(typeof cmd.handler).toBe('function');
    expect(typeof cmd.getArgumentCompletions).toBe('function');
  });

  it('provides autocomplete for valid subcommands', () => {
    const { pi, registeredCommands } = createMockPi();
    bitByBitExtension(pi);

    const cmd = registeredCommands.get('bit-by-bit')!;

    // All subcommands
    const all = cmd.getArgumentCompletions!('') as any[];
    expect(all).not.toBeNull();
    expect(all!.map((i: any) => i.value).sort()).toEqual(
      ['start', 'choose', 'next', 'prev', 'done', 'undone', 'write', 'off', 'resume'].sort()
    );

    // Filtered by prefix
    const nextItems = cmd.getArgumentCompletions!('n') as any[];
    expect(nextItems).not.toBeNull();
    expect(nextItems!.map((i: any) => i.value)).toEqual(['next']);

    // No match
    const noMatch = cmd.getArgumentCompletions!('xyz');
    expect(noMatch).toBeNull();
  });

  it('registers event handlers for session lifecycle', () => {
    const { pi } = createMockPi();
    bitByBitExtension(pi);

    // Required event handlers per design — pi.on called for each
    const onCalls = vi.mocked(pi.on).mock.calls.map(c => c[0]);
    expect(onCalls).toContain('session_start');
    expect(onCalls).toContain('before_agent_start');
    expect(onCalls).toContain('context');
    expect(onCalls).toContain('turn_end');
    expect(onCalls).toContain('session_tree');
  });

  it('shows warning for unknown subcommand', async () => {
    const { pi, registeredCommands } = createMockPi();
    bitByBitExtension(pi);

    const cmd = registeredCommands.get('bit-by-bit')!;
    const notify = vi.fn();
    const ctx = { ui: { notify } } as any;

    await cmd.handler('unknown', ctx);

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Unknown subcommand'), 'warning');
  });
});
