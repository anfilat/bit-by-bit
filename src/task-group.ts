/**
 * Pure helpers for task groups: canonical keys, normalization,
 * number formatting and command-argument parsing.
 */

/** Sorted unique copy of task indexes. */
export function normalizeIndexes(indexes: number[]): number[] {
  return [...new Set(indexes)].sort((a, b) => a - b);
}

/** Canonical key for a task group, e.g. [2, 0, 1] → "0+1+2". */
export function groupKey(indexes: number[]): string {
  return normalizeIndexes(indexes)
    .map(i => i + 1)
    .join('+');
}

/** Human-readable 1-based task numbers, e.g. [1, 2] → "2,3". Empty → "". */
export function formatNumbers(indexes: number[]): string {
  return normalizeIndexes(indexes)
    .map(i => i + 1)
    .join(',');
}

/**
 * Check whether two index sets contain the same tasks (order-insensitive).
 */
export function sameTaskSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = normalizeIndexes(a);
  const sortedB = normalizeIndexes(b);
  return sortedA.every((v, i) => v === sortedB[i]);
}

/**
 * Parse a task selection spec: "2", "2,3,5", "2-4", "2-4,7".
 * Numbers are 1-based; ranges are inclusive. Duplicates are removed,
 * result is sorted. Whitespace around parts is tolerated.
 *
 * Returns 0-based indexes, or null when the spec is syntactically invalid.
 * Bounds against the actual task count are validated by the caller.
 */
export function parseTaskSelection(spec: string): number[] | null {
  const trimmed = spec.trim();
  if (trimmed === '') return null;

  const indexes: number[] = [];
  for (const part of trimmed.split(',')) {
    const token = part.trim();
    if (token === '') return null;

    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1], 10);
      const to = parseInt(rangeMatch[2], 10);
      if (from < 1 || to < 1 || from > to) return null;
      for (let i = from; i <= to; i++) indexes.push(i - 1);
      continue;
    }

    if (!/^\d+$/.test(token)) return null;
    const n = parseInt(token, 10);
    if (n < 1) return null;
    indexes.push(n - 1);
  }

  if (indexes.length === 0) return null;
  return normalizeIndexes(indexes);
}
