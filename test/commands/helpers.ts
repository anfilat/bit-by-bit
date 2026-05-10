import { vi } from 'vitest';
import type { ExtensionAPI, RegisteredCommand, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai';
import bitByBitExtension from '../../src/index.js';

// ─── Shared constants ───────────────────────────────────────────────────────

export const fakeModel = {
  id: 'test-model',
  name: 'Test Model',
  api: 'openai-completions',
  provider: 'openai',
  baseUrl: '',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 4096,
} as unknown as Model<'openai-completions'>;

// ─── Branch entry factories ─────────────────────────────────────────────────

export function makeBranchEntry(role: 'assistant' | 'user', text: string) {
  const message =
    role === 'assistant'
      ? {
          role: 'assistant' as const,
          content: [{ type: 'text' as const, text }],
          api: 'openai-completions',
          provider: 'openai',
          model: 'test-model',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop' as const,
          timestamp: Date.now(),
        }
      : {
          role: 'user' as const,
          content: [{ type: 'text' as const, text }],
          timestamp: Date.now(),
        };
  return {
    type: 'message' as const,
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    parentId: null,
    timestamp: new Date().toISOString(),
    message,
  };
}

// ─── Extension setup ────────────────────────────────────────────────────────

export interface SetupResult {
  cmd: Omit<RegisteredCommand, 'name' | 'sourceInfo'>;
  pi: ExtensionAPI;
  notify: ReturnType<typeof vi.fn>;
  appendEntry: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  setLabel: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
}

/**
 * Create a fresh extension instance with its own isolated state.
 * Each call registers a new extension with its own mock pi.
 */
export function setupExtension(): SetupResult {
  const notify = vi.fn();
  const appendEntry = vi.fn();
  const sendMessage = vi.fn();
  const setLabel = vi.fn();
  const setStatus = vi.fn();

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
    sendMessage,
    sendUserMessage: vi.fn(),
    appendEntry,
    setSessionName: vi.fn(),
    getSessionName: vi.fn(),
    setLabel,
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

  bitByBitExtension(pi);

  const cmd = registeredCommands.get('bit-by-bit')!;

  return { cmd, pi, notify, appendEntry, sendMessage, setLabel, setStatus };
}

// ─── Context factory ────────────────────────────────────────────────────────

interface MakeCtxOverrides {
  notify?: ReturnType<typeof vi.fn>;
  branchEntries?: any[];
  leafId?: string;
  model?: Model<'openai-completions'> | undefined;
}

/**
 * Mock context that exposes mutable vi.fn() fields.
 * Extends ExtensionCommandContext with intersection types so assignment works without `as any`.
 */
export type MockCtx = ExtensionCommandContext & {
  sessionManager: ExtensionCommandContext['sessionManager'] & {
    getBranch: ReturnType<typeof vi.fn>;
    getLeafId: ReturnType<typeof vi.fn>;
  };
  ui: ExtensionCommandContext['ui'] & {
    custom: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };
  navigateTree: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock context.
 * By default includes fakeModel, empty branch, and 'leaf-123' leaf.
 */
export function makeCtx(overrides: MakeCtxOverrides = {}): MockCtx {
  const branchEntries = overrides.branchEntries ?? [];
  const leafId = overrides.leafId ?? 'leaf-123';

  return {
    ui: {
      notify: overrides.notify ?? vi.fn(),
      setStatus: vi.fn(),
      custom: vi.fn().mockImplementation(async () => null),
      select: vi.fn().mockResolvedValue(undefined),
    },
    hasUI: true,
    cwd: '/test',
    sessionManager: {
      getBranch: vi.fn().mockReturnValue(branchEntries),
      getLeafId: vi.fn().mockReturnValue(leafId),
      getEntries: vi.fn().mockReturnValue([]),
      getTree: vi.fn().mockReturnValue([]),
    },
    modelRegistry: {
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({
        ok: true,
        apiKey: 'test-key',
        headers: {},
      }),
    },
    model: 'model' in overrides ? overrides.model : fakeModel,
    isIdle: vi.fn(() => true),
    waitForIdle: vi.fn(() => Promise.resolve()),
    signal: undefined as AbortSignal | undefined,
    abort: vi.fn(),
    hasPendingMessages: vi.fn(() => false),
    navigateTree: vi.fn().mockResolvedValue({ cancelled: false }),
  } as unknown as MockCtx;
}

// ─── State activation helper ────────────────────────────────────────────────

/**
 * Run /bit-by-bit start with the given tasks to activate the extension state.
 * Wires up branch, leafId, and custom() mock on the given ctx.
 */
export async function activateState(
  cmd: Omit<RegisteredCommand, 'name' | 'sourceInfo'>,
  ctx: MockCtx,
  tasks: { title: string; description: string }[],
  leafId = 'leaf-root'
) {
  ctx.sessionManager.getBranch = vi.fn().mockReturnValue([makeBranchEntry('assistant', 'Code review results...')]);
  ctx.sessionManager.getLeafId = vi.fn().mockReturnValue(leafId);
  ctx.ui.custom = vi.fn().mockResolvedValue(tasks);

  await cmd.handler('', ctx);
}
