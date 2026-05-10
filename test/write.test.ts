import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@earendil-works/pi-ai', () => ({
  complete: vi.fn(),
}));

import { complete } from '@earendil-works/pi-ai';
import type { AssistantMessage, Model } from '@earendil-works/pi-ai';
import {
  hasDiscussion,
  formatBranchConversation,
  buildDocumentNoDiscussion,
  buildDocumentWithDiscussion,
  buildFileName,
  slugify,
  MAX_SLUG_LENGTH,
} from '../src/write.js';
import type { Task } from '../src/types.js';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMessageEntry(role: string, content: any[], overrides: Record<string, any> = {}) {
  return {
    type: 'message' as const,
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    parentId: null as string | null,
    timestamp: new Date().toISOString(),
    message: { role, content, ...overrides },
  } as unknown as SessionEntry;
}

function makeTaskDescEntry() {
  return {
    type: 'custom_message' as const,
    id: 'desc-1',
    parentId: null as string | null,
    timestamp: new Date().toISOString(),
    customType: 'bit-by-bit',
    content: '**Task 1/2: Fix bug**',
    display: true,
  } as unknown as SessionEntry;
}

function makeAssistantResponse(text: string, stopReason: AssistantMessage['stopReason'] = 'stop'): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
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
    stopReason,
    timestamp: Date.now(),
  };
}

const fakeModel = {
  id: 'test',
  name: 'Test',
  api: 'openai-completions',
  provider: 'openai',
  baseUrl: '',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 4096,
} as Model<'openai-completions'>;

const fakeAuth = { ok: true as const, apiKey: 'test-key' };

const fakeTask: Task = {
  index: 0,
  title: 'Fix null pointer in UserService',
  description: 'Fix NPE in UserService.java line 42.',
  done: false,
};

// ─── hasDiscussion ───────────────────────────────────────────────────────────

describe('hasDiscussion', () => {
  it('returns false when branch has no entries', () => {
    expect(hasDiscussion([])).toBe(false);
  });

  it('returns false when branch has only task-description', () => {
    expect(hasDiscussion([makeTaskDescEntry()])).toBe(false);
  });

  it('returns false when branch has entries before task-description but none after', () => {
    const entries = [
      makeMessageEntry('user', [{ type: 'text', text: 'Review code' }]),
      makeMessageEntry('assistant', [{ type: 'text', text: 'Review results...' }]),
      makeTaskDescEntry(),
    ];
    expect(hasDiscussion(entries)).toBe(false);
  });

  it('returns true when branch has user message after task-description', () => {
    const entries = [makeTaskDescEntry(), makeMessageEntry('user', [{ type: 'text', text: 'Fix the bug' }])];
    expect(hasDiscussion(entries)).toBe(true);
  });

  it('returns true when branch has assistant message after task-description', () => {
    const entries = [makeTaskDescEntry(), makeMessageEntry('assistant', [{ type: 'text', text: 'I fixed it' }])];
    expect(hasDiscussion(entries)).toBe(true);
  });

  it('returns false when branch has no task-description at all', () => {
    const entries = [
      makeMessageEntry('user', [{ type: 'text', text: 'Hello' }]),
      makeMessageEntry('assistant', [{ type: 'text', text: 'Hi' }]),
    ];
    expect(hasDiscussion(entries)).toBe(false);
  });

  it('ignores toolResult and other roles after task-description', () => {
    const entries = [makeTaskDescEntry(), makeMessageEntry('toolResult', [{ type: 'text', text: 'result' }])];
    expect(hasDiscussion(entries)).toBe(false);
  });
});

// ─── formatBranchConversation ───────────────────────────────────────────────

describe('formatBranchConversation', () => {
  it('returns empty string when no entries after task-description', () => {
    expect(formatBranchConversation([makeTaskDescEntry()])).toBe('');
  });

  it('formats user and assistant messages', () => {
    const entries = [
      makeTaskDescEntry(),
      makeMessageEntry('user', [{ type: 'text', text: 'Fix the bug' }]),
      makeMessageEntry('assistant', [{ type: 'text', text: 'I fixed it' }]),
    ];
    const result = formatBranchConversation(entries);
    expect(result).toContain('User: Fix the bug');
    expect(result).toContain('Assistant: I fixed it');
  });

  it('filters out custom messages from the extension', () => {
    const entries = [
      makeTaskDescEntry(),
      makeMessageEntry('user', [{ type: 'text', text: 'Fix the bug' }]),
      {
        type: 'custom_message' as const,
        id: 'ctx-1',
        parentId: null as string | null,
        timestamp: new Date().toISOString(),
        customType: 'bit-by-bit-context',
        content: 'context',
        display: false,
      } as unknown as SessionEntry,
      makeMessageEntry('assistant', [{ type: 'text', text: 'I fixed it' }]),
    ];
    const result = formatBranchConversation(entries);
    expect(result).not.toContain('bit-by-bit-context');
    expect(result).toContain('User: Fix the bug');
    expect(result).toContain('Assistant: I fixed it');
  });

  it('truncates long tool results to 500 chars', () => {
    const longText = 'x'.repeat(600);
    const entries = [
      makeTaskDescEntry(),
      makeMessageEntry('assistant', [{ type: 'toolCall', name: 'read', arguments: { path: 'file.ts' } }]),
      makeMessageEntry('toolResult', [{ type: 'text', text: longText }], { toolName: 'read' }),
    ];
    const result = formatBranchConversation(entries);
    expect(result).toContain('Tool result (read): ' + 'x'.repeat(500) + '...');
    expect(result).not.toContain(longText);
  });

  it('formats tool calls with name and arguments', () => {
    const entries = [
      makeTaskDescEntry(),
      makeMessageEntry('assistant', [
        { type: 'text', text: 'Reading file...' },
        { type: 'toolCall', name: 'read', arguments: { path: 'src/index.ts' } },
      ]),
    ];
    const result = formatBranchConversation(entries);
    expect(result).toContain('Tool call: read({"path":"src/index.ts"})');
  });

  it('skips entries before task-description', () => {
    const entries = [
      makeMessageEntry('user', [{ type: 'text', text: 'Before desc' }]),
      makeTaskDescEntry(),
      makeMessageEntry('user', [{ type: 'text', text: 'After desc' }]),
    ];
    const result = formatBranchConversation(entries);
    expect(result).not.toContain('Before desc');
    expect(result).toContain('After desc');
  });
});

// ─── buildDocumentNoDiscussion ───────────────────────────────────────────────

describe('buildDocumentNoDiscussion', () => {
  it('builds document with "Not started" for undone task', () => {
    const doc = buildDocumentNoDiscussion(fakeTask);
    expect(doc).toContain('# Fix null pointer in UserService');
    expect(doc).toContain('## Task');
    expect(doc).toContain('Fix NPE in UserService.java line 42.');
    expect(doc).not.toContain('## Summary');
  });

  it('builds document for done task', () => {
    const doneTask: Task = { ...fakeTask, done: true };
    const doc = buildDocumentNoDiscussion(doneTask);
    expect(doc).toContain('# Fix null pointer in UserService');
    expect(doc).not.toContain('## Progress');
  });
});

// ─── buildDocumentWithDiscussion ─────────────────────────────────────────────

describe('buildDocumentWithDiscussion', () => {
  beforeEach(() => {
    vi.mocked(complete).mockReset();
  });

  it('builds document with summary from LLM', async () => {
    vi.mocked(complete).mockResolvedValue(
      makeAssistantResponse('Added null check in UserService.getUser(). Files modified: UserService.java')
    );

    const branch = [
      makeTaskDescEntry(),
      makeMessageEntry('user', [{ type: 'text', text: 'Fix the bug' }]),
      makeMessageEntry('assistant', [{ type: 'text', text: 'I fixed it' }]),
    ];

    const doc = await buildDocumentWithDiscussion(fakeModel, fakeAuth, fakeTask, branch);

    expect(doc).toContain('# Fix null pointer in UserService');
    expect(doc).toContain('## Task');
    expect(doc).toContain('Fix NPE in UserService.java line 42.');
    expect(doc).toContain('## Summary');
    expect(doc).toContain('Added null check in UserService.getUser()');
  });

  it('builds document for done task', async () => {
    vi.mocked(complete).mockResolvedValue(makeAssistantResponse('Summary'));

    const doneTask: Task = { ...fakeTask, done: true };
    const doc = await buildDocumentWithDiscussion(fakeModel, fakeAuth, doneTask, []);
    expect(doc).not.toContain('## Progress');
  });

  it('throws when auth.ok is false', async () => {
    await expect(
      buildDocumentWithDiscussion(fakeModel, { ok: false, error: 'Auth failed' }, fakeTask, [])
    ).rejects.toThrow('Auth failed');
  });

  it('throws when apiKey is undefined', async () => {
    await expect(buildDocumentWithDiscussion(fakeModel, { ok: true }, fakeTask, [])).rejects.toThrow(
      'No API key for openai'
    );
  });

  it('throws when response is aborted', async () => {
    vi.mocked(complete).mockResolvedValue(makeAssistantResponse('partial...', 'aborted'));

    await expect(buildDocumentWithDiscussion(fakeModel, fakeAuth, fakeTask, [])).rejects.toThrow(
      'Summarization cancelled'
    );
  });

  it('propagates errors from complete', async () => {
    vi.mocked(complete).mockRejectedValue(new Error('Network error'));

    await expect(buildDocumentWithDiscussion(fakeModel, fakeAuth, fakeTask, [])).rejects.toThrow('Network error');
  });

  it('calls complete with summarization prompt containing task info', async () => {
    vi.mocked(complete).mockResolvedValue(makeAssistantResponse('Summary'));

    await buildDocumentWithDiscussion(fakeModel, fakeAuth, fakeTask, []);

    expect(complete).toHaveBeenCalledOnce();
    const call = vi.mocked(complete).mock.calls[0];
    const options = call[1];

    // systemPrompt should contain task title and description
    expect(options.systemPrompt).toContain('Fix null pointer in UserService');
    expect(options.systemPrompt).toContain('Fix NPE in UserService.java line 42.');
  });
});

// ─── buildFileName ───────────────────────────────────────────────────────────

describe('buildFileName', () => {
  it('generates filename with date prefix and slugified title', () => {
    const now = new Date(2026, 4, 8, 14, 30); // 2026-05-08 14:30
    const fileName = buildFileName(fakeTask, now);
    expect(fileName).toBe('2026-05-08-14-30-Fix-null-pointer-in-UserService.md');
  });

  it('slugifies special characters', () => {
    const task: Task = { ...fakeTask, title: 'Fix: bug in /api/users' };
    const now = new Date(2026, 0, 1, 9, 5);
    const fileName = buildFileName(task, now);
    // slugify removes unsafe chars (:/) and replaces whitespace with hyphens
    expect(fileName).toBe('2026-01-01-09-05-Fix-bug-in-apiusers.md');
  });
});

// ─── slugify ────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('Fix null pointer in UserService')).toBe('Fix-null-pointer-in-UserService');
  });

  it('removes filesystem-unsafe characters', () => {
    expect(slugify('Hello/World: test? "no" <yes>')).toBe('HelloWorld-test-no-yes');
  });

  it('handles multiple spaces', () => {
    expect(slugify('a   b')).toBe('a-b');
  });

  it('handles leading/trailing spaces', () => {
    expect(slugify('  hello world  ')).toBe('hello-world');
  });

  it('preserves unicode characters', () => {
    expect(slugify('Привет мир')).toBe('Привет-мир');
    expect(slugify('日本語テスト')).toBe('日本語テスト');
  });

  it('truncates long strings to reasonable length', () => {
    const long = 'a'.repeat(100);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not leave trailing hyphen after truncation', () => {
    // "x-x-x-...-x-" sliced at MAX_SLUG_LENGTH ends with hyphen → should be stripped
    const truncated = slugify('x '.repeat(50));
    expect(truncated).not.toMatch(/-$/);
    expect(truncated).not.toMatch(/^-/);
    expect(truncated.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles string with only unsafe characters', () => {
    expect(slugify('/:*?"<>|')).toBe('');
  });
});
