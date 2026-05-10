import { describe, it, expect } from 'vitest';
import { parseTaskJson } from '../src/extraction.js';

describe('parseTaskJson', () => {
  it('parses JSON wrapped in markdown fence', () => {
    const input = '```json\n[{"title":"A","description":"B"}]\n```';
    const result = parseTaskJson(input);
    expect(result).toEqual([{ title: 'A', description: 'B' }]);
  });

  it('parses fenced JSON containing inner code blocks (greedy fence match)', () => {
    // Simulates a assistant response where the JSON string values contain ``` code fences.
    // The non-greedy regex would incorrectly cut at the inner ```, greedy captures the full array.
    //
    // Raw assistant bytes (conceptually):
    //   ```json\n[{"title":"stub","description":"see ```ts\ncode here\n``` after"}]\n```
    //
    // In the JSON string value, \n is the two-char JSON escape (backslash + n).
    // The ``` inside the description are literal backtick characters in the JSON.
    // Newlines between fence markers and content are real newlines.
    const raw = '```json\n[{"title":"stub","description":"see ```ts\\ncode here\\n``` after"}]\n```';
    const result = parseTaskJson(raw);
    expect(result).toEqual([{ title: 'stub', description: 'see ```ts\ncode here\n``` after' }]);
  });

  it('parses raw JSON without fence', () => {
    const input = '[{"title":"X","description":"Y"}]';
    const result = parseTaskJson(input);
    expect(result).toEqual([{ title: 'X', description: 'Y' }]);
  });

  it('throws when result is not an array', () => {
    const input = '{"error":true}';
    expect(() => parseTaskJson(input)).toThrow('Not an array');
  });

  it('returns empty array for empty JSON array', () => {
    const input = '[]';
    const result = parseTaskJson(input);
    expect(result).toEqual([]);
  });

  it('filters out elements without title or description', () => {
    const input = '[{"title":"X"}]';
    const result = parseTaskJson(input);
    expect(result).toEqual([]);
  });

  it('keeps only valid items from mixed input', () => {
    const input = '[{"title":"A","description":"B"}, {"foo":1}]';
    const result = parseTaskJson(input);
    expect(result).toEqual([{ title: 'A', description: 'B' }]);
  });

  it('throws on invalid JSON', () => {
    const input = 'not json at all';
    expect(() => parseTaskJson(input)).toThrow();
  });
});
