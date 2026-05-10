import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@earendil-works/pi-ai', () => ({
  complete: vi.fn(),
}));

import { complete } from '@earendil-works/pi-ai';
import { extractTasks } from '../src/extraction.js';
import type { AssistantMessage, Model } from '@earendil-works/pi-ai';

function makeResponse(text: string, stopReason: AssistantMessage['stopReason'] = 'stop'): AssistantMessage {
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

describe('extractTasks', () => {
  beforeEach(() => {
    vi.mocked(complete).mockReset();
  });

  it('extracts tasks from valid JSON response', async () => {
    vi.mocked(complete).mockResolvedValue(makeResponse('[{"title":"Fix bug","description":"Fix NPE in UserService"}]'));

    const tasks = await extractTasks(fakeModel, { ok: true, apiKey: 'key' }, 'some text');
    expect(tasks).toEqual([{ title: 'Fix bug', description: 'Fix NPE in UserService' }]);
  });

  it('returns empty array when complete returns empty JSON array', async () => {
    vi.mocked(complete).mockResolvedValue(makeResponse('[]'));

    const tasks = await extractTasks(fakeModel, { ok: true, apiKey: 'key' }, 'some text');
    expect(tasks).toEqual([]);
  });

  it('parses JSON wrapped in markdown fence from complete response', async () => {
    vi.mocked(complete).mockResolvedValue(makeResponse('```json\n[{"title":"A","description":"B"}]\n```'));

    const tasks = await extractTasks(fakeModel, { ok: true, apiKey: 'key' }, 'some text');
    expect(tasks).toEqual([{ title: 'A', description: 'B' }]);
  });

  it('propagates error from complete', async () => {
    vi.mocked(complete).mockRejectedValue(new Error('Network error'));

    await expect(extractTasks(fakeModel, { ok: true, apiKey: 'key' }, 'some text')).rejects.toThrow('Network error');
  });

  it('throws when auth.ok is false', async () => {
    await expect(extractTasks(fakeModel, { ok: false, error: 'Auth failed' }, 'some text')).rejects.toThrow(
      'Auth failed'
    );
  });

  it('throws when apiKey is undefined', async () => {
    await expect(extractTasks(fakeModel, { ok: true }, 'some text')).rejects.toThrow('No API key for openai');
  });

  it('throws ExtractionCancelled when stopReason is aborted', async () => {
    vi.mocked(complete).mockResolvedValue(makeResponse('[]', 'aborted'));

    await expect(extractTasks(fakeModel, { ok: true, apiKey: 'key' }, 'some text')).rejects.toThrow(
      'Extraction cancelled'
    );
  });
});
