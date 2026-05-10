import { vi } from 'vitest';
import type { ExtensionAPI, RegisteredCommand } from '@earendil-works/pi-coding-agent';

/**
 * Create a mock ExtensionAPI for testing.
 * Returns both the pi mock and a map of registered commands (captured from `registerCommand` calls).
 */
export function createMockPi(): {
  pi: ExtensionAPI;
  registeredCommands: Map<string, Omit<RegisteredCommand, 'name' | 'sourceInfo'>>;
} {
  const registeredCommands = new Map<string, Omit<RegisteredCommand, 'name' | 'sourceInfo'>>();

  const pi = {
    registerCommand(name: string, options: Omit<RegisteredCommand, 'name' | 'sourceInfo'>) {
      registeredCommands.set(name, options);
    },
    on: vi.fn(),
    registerTool: vi.fn(),
    registerShortcut: vi.fn(),
    registerFlag: vi.fn(),
    getFlag: vi.fn(),
    registerMessageRenderer: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    appendEntry: vi.fn(),
    setSessionName: vi.fn(),
    getSessionName: vi.fn(),
    setLabel: vi.fn(),
    exec: vi.fn(),
    getActiveTools: vi.fn(() => []),
    getAllTools: vi.fn(() => []),
    setActiveTools: vi.fn(),
    getCommands: vi.fn(() => []),
    setModel: vi.fn(),
    getThinkingLevel: vi.fn(),
    setThinkingLevel: vi.fn(),
    registerProvider: vi.fn(),
    unregisterProvider: vi.fn(),
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  } as unknown as ExtensionAPI;

  return { pi, registeredCommands };
}
