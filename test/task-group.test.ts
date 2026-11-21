import { describe, it, expect } from 'vitest';
import { formatNumbers, groupKey, normalizeIndexes, parseTaskSelection, sameTaskSet } from '../src/task-group.js';

describe('normalizeIndexes', () => {
  it('sorts and dedupes', () => {
    expect(normalizeIndexes([3, 1, 2, 1])).toEqual([1, 2, 3]);
  });

  it('returns empty for empty input', () => {
    expect(normalizeIndexes([])).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [2, 0];
    normalizeIndexes(input);
    expect(input).toEqual([2, 0]);
  });
});

describe('groupKey', () => {
  it('uses 1-based numbers joined with +', () => {
    expect(groupKey([1, 0, 2])).toBe('1+2+3');
  });

  it('single task key has no separator', () => {
    expect(groupKey([4])).toBe('5');
  });
});

describe('formatNumbers', () => {
  it('formats sorted 1-based numbers', () => {
    expect(formatNumbers([2, 0])).toBe('1,3');
  });

  it('empty input gives empty string', () => {
    expect(formatNumbers([])).toBe('');
  });
});

describe('sameTaskSet', () => {
  it('matches regardless of order', () => {
    expect(sameTaskSet([2, 0], [0, 2])).toBe(true);
  });

  it('differs on extra element', () => {
    expect(sameTaskSet([0, 1], [0, 1, 2])).toBe(false);
  });

  it('differs on different element', () => {
    expect(sameTaskSet([0, 1], [0, 2])).toBe(false);
  });
});

describe('parseTaskSelection', () => {
  it('parses single number', () => {
    expect(parseTaskSelection('2')).toEqual([1]);
  });

  it('parses comma-separated list', () => {
    expect(parseTaskSelection('2,3,5')).toEqual([1, 2, 4]);
  });

  it('parses inclusive range', () => {
    expect(parseTaskSelection('2-4')).toEqual([1, 2, 3]);
  });

  it('parses mixed list and range', () => {
    expect(parseTaskSelection('2-4,7')).toEqual([1, 2, 3, 6]);
  });

  it('dedupes and sorts', () => {
    expect(parseTaskSelection('5,2,3,2')).toEqual([1, 2, 4]);
  });

  it('tolerates whitespace', () => {
    expect(parseTaskSelection(' 2 , 3 ')).toEqual([1, 2]);
    expect(parseTaskSelection('2 - 4')).toEqual([1, 2, 3]);
  });

  it('rejects empty spec', () => {
    expect(parseTaskSelection('')).toBeNull();
    expect(parseTaskSelection('   ')).toBeNull();
  });

  it('rejects zero and negative numbers', () => {
    expect(parseTaskSelection('0')).toBeNull();
    expect(parseTaskSelection('-1')).toBeNull(); // not a range: parsed as garbage
  });

  it('rejects reversed range', () => {
    expect(parseTaskSelection('4-2')).toBeNull();
  });

  it('rejects non-numeric parts', () => {
    expect(parseTaskSelection('abc')).toBeNull();
    expect(parseTaskSelection('2,x')).toBeNull();
  });

  it('rejects trailing comma', () => {
    expect(parseTaskSelection('2,')).toBeNull();
  });
});
