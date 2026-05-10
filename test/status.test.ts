import { describe, it, expect } from 'vitest';
import { formatStatus } from '../src/status.js';
import type { BitByBitState, Task } from '../src/types.js';

describe('formatStatus', () => {
  it('returns undefined when inactive', () => {
    const state = { active: false } as BitByBitState;
    expect(formatStatus(state)).toBeUndefined();
  });

  it('shows outside task area warning when active but outside bbb', () => {
    const state: BitByBitState = {
      initialized: true,
      active: true,
      insideBbb: false,
      skipSessionTree: false,
      rootEntryId: 'r1',
      currentTaskIndex: 0,
      tasks: [
        { index: 0, title: 'Fix bug', description: 'desc', done: false },
        { index: 1, title: 'Add test', description: 'desc', done: true },
      ],
    };
    const result = formatStatus(state);
    expect(result).toContain('⚠ Outside task area');
    expect(result).toContain('2(✓1)');
  });

  it('shows current undone task with cross marker', () => {
    const state: BitByBitState = {
      initialized: true,
      active: true,
      insideBbb: true,
      skipSessionTree: false,
      rootEntryId: 'r1',
      currentTaskIndex: 1,
      tasks: [
        { index: 0, title: 'Fix bug', description: 'desc', done: true },
        { index: 1, title: 'Add test', description: 'desc', done: false },
        { index: 2, title: 'Refactor', description: 'desc', done: false },
        { index: 3, title: 'Docs', description: 'desc', done: false },
        { index: 4, title: 'Deploy', description: 'desc', done: false },
      ],
    };
    const result = formatStatus(state);
    expect(result).toBe('bit-by-bit: 2/5(✓1) | ✗ ▸ Add test');
  });

  it('shows all done with current task marker', () => {
    const tasks: Task[] = [
      { index: 0, title: 'A', description: 'd', done: true },
      { index: 1, title: 'B', description: 'd', done: true },
      { index: 2, title: 'C', description: 'd', done: true },
      { index: 3, title: 'D', description: 'd', done: true },
      { index: 4, title: 'E', description: 'd', done: true },
    ];
    const state: BitByBitState = {
      initialized: true,
      active: true,
      insideBbb: true,
      skipSessionTree: false,
      rootEntryId: 'r1',
      currentTaskIndex: 2,
      tasks,
    };
    const result = formatStatus(state);
    expect(result).toBe('bit-by-bit: 3/5(✓5) | ✓ ▸ C');
  });

  it('shows checkmark when current task is done', () => {
    const state: BitByBitState = {
      initialized: true,
      active: true,
      insideBbb: true,
      skipSessionTree: false,
      rootEntryId: 'r1',
      currentTaskIndex: 0,
      tasks: [
        { index: 0, title: 'Fix bug', description: 'desc', done: true },
        { index: 1, title: 'Add test', description: 'desc', done: false },
      ],
    };
    const result = formatStatus(state);
    expect(result).toBe('bit-by-bit: 1/2(✓1) | ✓ ▸ Fix bug');
  });
});
