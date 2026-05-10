import { describe, it, expect } from 'vitest';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { reconstructState } from '../src/state.js';
import { ENTRY_TYPE } from '../src/constants.js';

function makeTasks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    title: `Task ${i + 1}`,
    description: `Description for task ${i + 1}`,
    done: false,
  }));
}

function initEntry(sm: SessionManager, rootEntryId: string, tasks: ReturnType<typeof makeTasks>) {
  sm.appendCustomEntry(ENTRY_TYPE.INIT, {
    rootEntryId,
    tasks,
  });
}

function doneEntry(sm: SessionManager, rootEntryId: string, taskIndex: number) {
  sm.appendCustomEntry(ENTRY_TYPE.DONE, { rootEntryId, taskIndex });
}

function undoneEntry(sm: SessionManager, rootEntryId: string, taskIndex: number) {
  sm.appendCustomEntry(ENTRY_TYPE.UNDONE, { rootEntryId, taskIndex });
}

function offEntry(sm: SessionManager, rootEntryId: string) {
  sm.appendCustomEntry(ENTRY_TYPE.OFF, { rootEntryId });
}

function resumeEntry(sm: SessionManager, rootEntryId: string) {
  sm.appendCustomEntry(ENTRY_TYPE.RESUME, { rootEntryId });
}

/**
 * Helper: append a user message.
 */
function userMsg(sm: SessionManager, text: string): string {
  return sm.appendMessage({ role: 'user', content: text, timestamp: Date.now() });
}

/**
 * Helper: append an assistant message.
 * Uses `as any` because AssistantMessage requires many fields
 * (api, provider, model, usage, stopReason) that are irrelevant for tree tests.
 */
function assistantMsg(sm: SessionManager, text: string): string {
  return sm.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'chat',
    provider: 'test',
    model: 'test',
    usage: { inputTokens: 0, outputTokens: 0 },
    stopReason: 'stop',
    timestamp: Date.now(),
  } as any);
}

/**
 * Helper: build a tree with two task branches from rootEntryId.
 *
 * Structure:
 *   rootEntryId
 *     ├── initEntry (linear continuation)
 *     ├── task0User → branch0 → task0Assistant
 *     └── task1User → branch1 → task1Assistant
 *
 * After building, the current leaf is on task1's branch.
 */
function buildTwoBranchTree(sm: SessionManager, rootEntryId: string) {
  // Append init entry (linear continuation from rootEntryId)
  const tasks = makeTasks(2);
  initEntry(sm, rootEntryId, tasks);

  // --- Task 0 branch ---
  sm.branch(rootEntryId);
  const task0User = userMsg(sm, 'Task 0 description');
  sm.appendCustomEntry(ENTRY_TYPE.BRANCH, { rootEntryId, taskIndex: 0 });
  const task0Assistant = assistantMsg(sm, 'Working on task 0...');

  // --- Task 1 branch ---
  sm.branch(rootEntryId);
  const task1User = userMsg(sm, 'Task 1 description');
  sm.appendCustomEntry(ENTRY_TYPE.BRANCH, { rootEntryId, taskIndex: 1 });
  const task1Assistant = assistantMsg(sm, 'Working on task 1...');

  return { tasks, task0User, task0Assistant, task1User, task1Assistant };
}

describe('reconstructState', () => {
  it('returns null when no init entry exists', () => {
    const sm = SessionManager.inMemory();
    const state = reconstructState(sm);
    expect(state).toBeNull();
  });

  it('restores tasks from init entry with active=true', () => {
    const sm = SessionManager.inMemory();
    const tasks = makeTasks(3);
    initEntry(sm, 'root-1', tasks);

    const state = reconstructState(sm)!;
    expect(state.initialized).toBe(true);
    expect(state.active).toBe(true);
    expect(state.rootEntryId).toBe('root-1');
    expect(state.tasks).toHaveLength(3);
    expect(state.tasks[0].title).toBe('Task 1');
    expect(state.tasks[0].done).toBe(false);
  });

  it('applies done entry', () => {
    const sm = SessionManager.inMemory();
    const tasks = makeTasks(3);
    initEntry(sm, 'root-1', tasks);
    doneEntry(sm, 'root-1', 0);

    const state = reconstructState(sm)!;
    expect(state.tasks[0].done).toBe(true);
    expect(state.tasks[1].done).toBe(false);
  });

  it('applies done, undone, and another done in order', () => {
    const sm = SessionManager.inMemory();
    const tasks = makeTasks(3);
    initEntry(sm, 'root-1', tasks);
    doneEntry(sm, 'root-1', 0);
    undoneEntry(sm, 'root-1', 0);
    doneEntry(sm, 'root-1', 1);

    const state = reconstructState(sm)!;
    expect(state.tasks[0].done).toBe(false);
    expect(state.tasks[1].done).toBe(true);
    expect(state.tasks[2].done).toBe(false);
  });

  it('sets active=false after off entry', () => {
    const sm = SessionManager.inMemory();
    const tasks = makeTasks(2);
    initEntry(sm, 'root-1', tasks);
    offEntry(sm, 'root-1');

    const state = reconstructState(sm)!;
    expect(state.active).toBe(false);
  });

  it('sets active=true after off then resume', () => {
    const sm = SessionManager.inMemory();
    const tasks = makeTasks(2);
    initEntry(sm, 'root-1', tasks);
    offEntry(sm, 'root-1');
    resumeEntry(sm, 'root-1');

    const state = reconstructState(sm)!;
    expect(state.active).toBe(true);
  });

  it('uses last value when multiple off entries', () => {
    const sm = SessionManager.inMemory();
    const tasks = makeTasks(2);
    initEntry(sm, 'root-1', tasks);
    offEntry(sm, 'root-1');
    offEntry(sm, 'root-1');

    const state = reconstructState(sm)!;
    expect(state.active).toBe(false);
  });

  it('picks the last init entry when multiple exist', () => {
    const sm = SessionManager.inMemory();
    const tasks1 = makeTasks(2);
    const tasks2 = makeTasks(5);
    initEntry(sm, 'root-1', tasks1);
    initEntry(sm, 'root-2', tasks2);

    const state = reconstructState(sm)!;
    expect(state.rootEntryId).toBe('root-2');
    expect(state.tasks).toHaveLength(5);
  });

  it('ignores entries from a different rootEntryId', () => {
    const sm = SessionManager.inMemory();
    const tasks1 = makeTasks(2);
    const tasks2 = makeTasks(3);
    initEntry(sm, 'root-1', tasks1);
    initEntry(sm, 'root-2', tasks2);
    // This done is for root-1, should be ignored since last init is root-2
    doneEntry(sm, 'root-1', 0);

    const state = reconstructState(sm)!;
    expect(state.rootEntryId).toBe('root-2');
    expect(state.tasks[0].done).toBe(false);
  });

  it('computes branchLeafId for each task from tree branches', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'Here is a review...');
    const { task0Assistant, task1Assistant } = buildTwoBranchTree(sm, rootEntryId);

    const state = reconstructState(sm)!;
    expect(state).not.toBeNull();
    expect(state.tasks[0].branchLeafId).toBe(task0Assistant);
    expect(state.tasks[1].branchLeafId).toBe(task1Assistant);
  });

  it('sets currentTaskIndex when current leaf is on a task branch', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'Here is a review...');
    const { task1Assistant } = buildTwoBranchTree(sm, rootEntryId);

    // After buildTwoBranchTree, the current leaf is on task1's branch
    expect(sm.getLeafId()).toBe(task1Assistant);

    const state = reconstructState(sm)!;
    expect(state.insideBbb).toBe(true);
    expect(state.currentTaskIndex).toBe(1);
  });

  it('sets insideBbb=false when current leaf is outside task area', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'Here is a review...');
    buildTwoBranchTree(sm, rootEntryId);

    // Navigate outside bit-by-bit — branch from root (first user message),
    // which is above rootEntryId
    const entries = sm.getEntries();
    const firstEntry = entries[0]; // first user message, parent of rootEntryId
    sm.branch(firstEntry.id);
    const outsideLeaf = userMsg(sm, 'I am outside bit-by-bit');
    expect(sm.getLeafId()).toBe(outsideLeaf);

    const state = reconstructState(sm)!;
    expect(state.insideBbb).toBe(false);
    expect(state.currentTaskIndex).toBe(0); // default, not changed
  });

  it('fully reconstructs state with branches, done entries, and current task', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'Here is a review...');
    const { task0Assistant } = buildTwoBranchTree(sm, rootEntryId);

    // Mark task 0 as done — appends to current leaf (on task 1's branch),
    // so it becomes the new deepest entry of task 1's subtree.
    doneEntry(sm, rootEntryId, 0);

    const state = reconstructState(sm)!;
    // Tasks reconstructed
    expect(state.active).toBe(true);
    expect(state.tasks).toHaveLength(2);
    // Done status preserved
    expect(state.tasks[0].done).toBe(true);
    expect(state.tasks[1].done).toBe(false);
    // branchLeafId computed — task 0 unchanged, task 1 updated (includes done entry)
    expect(state.tasks[0].branchLeafId).toBe(task0Assistant);
    expect(state.tasks[1].branchLeafId).toBeDefined();
    // Current leaf is on task 1's branch
    expect(state.insideBbb).toBe(true);
    expect(state.currentTaskIndex).toBe(1);
  });

  it('returns insideBbb=false and branchLeafId=undefined when no tree exists', () => {
    const sm = SessionManager.inMemory();
    const tasks = makeTasks(3);
    initEntry(sm, 'root-1', tasks);
    // No real tree — rootEntryId is a plain string, not a real entry

    const state = reconstructState(sm)!;
    expect(state.insideBbb).toBe(false);
    expect(state.currentTaskIndex).toBe(0);
    expect(state.tasks[0].branchLeafId).toBeUndefined();
    expect(state.tasks[1].branchLeafId).toBeUndefined();
    expect(state.tasks[2].branchLeafId).toBeUndefined();
  });

  it('ignores done entry with missing taskIndex', () => {
    const sm = SessionManager.inMemory();
    const tasks = makeTasks(2);
    initEntry(sm, 'root-1', tasks);
    // Done entry without taskIndex — should not crash, should not flip any done flag
    sm.appendCustomEntry(ENTRY_TYPE.DONE, { rootEntryId: 'root-1' });

    const state = reconstructState(sm)!;
    expect(state.tasks[0].done).toBe(false);
    expect(state.tasks[1].done).toBe(false);
  });

  it('computes branchLeafId only for tasks that have a branch', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'Review');
    const tasks = makeTasks(3);
    initEntry(sm, rootEntryId, tasks);

    // Only create a branch for task 0
    sm.branch(rootEntryId);
    userMsg(sm, 'Task 0 description');
    sm.appendCustomEntry(ENTRY_TYPE.BRANCH, { rootEntryId, taskIndex: 0 });
    const task0Leaf = assistantMsg(sm, 'Working on task 0...');

    const state = reconstructState(sm)!;
    expect(state.tasks[0].branchLeafId).toBe(task0Leaf);
    expect(state.tasks[1].branchLeafId).toBeUndefined();
    expect(state.tasks[2].branchLeafId).toBeUndefined();
    // Current leaf is on task 0's branch
    expect(state.insideBbb).toBe(true);
    expect(state.currentTaskIndex).toBe(0);
  });

  it('preserves tree branches when active=false after off', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'Review');
    const { task0Assistant } = buildTwoBranchTree(sm, rootEntryId);

    // Stop bit-by-bit — done entries go onto the current leaf (task 1 branch)
    offEntry(sm, rootEntryId);

    const state = reconstructState(sm)!;
    expect(state.active).toBe(false);
    // branchLeafId still computed even when inactive
    expect(state.tasks[0].branchLeafId).toBe(task0Assistant);
    expect(state.tasks[1].branchLeafId).toBeDefined();
    // Current leaf is on task 1's branch (off entry is a child of task1's last entry)
    expect(state.insideBbb).toBe(true);
    expect(state.currentTaskIndex).toBe(1);
  });

  it('reconstructs tree branches from last init when multiple inits exist', () => {
    const sm = SessionManager.inMemory();

    // First init — with a real tree
    const rootEntryId1 = assistantMsg(sm, 'First review');
    const tasks1 = makeTasks(2);
    initEntry(sm, rootEntryId1, tasks1);
    sm.branch(rootEntryId1);
    userMsg(sm, 'Old task 0');
    sm.appendCustomEntry(ENTRY_TYPE.BRANCH, { rootEntryId: rootEntryId1, taskIndex: 0 });
    assistantMsg(sm, 'Old response');

    // Second init — new tree, should be used instead
    const rootEntryId2 = assistantMsg(sm, 'Second review');
    const tasks2 = makeTasks(2);
    initEntry(sm, rootEntryId2, tasks2);
    sm.branch(rootEntryId2);
    userMsg(sm, 'New task 0');
    sm.appendCustomEntry(ENTRY_TYPE.BRANCH, { rootEntryId: rootEntryId2, taskIndex: 0 });
    const newTask0Leaf = assistantMsg(sm, 'New response');

    const state = reconstructState(sm)!;
    expect(state.rootEntryId).toBe(rootEntryId2);
    expect(state.tasks[0].branchLeafId).toBe(newTask0Leaf);
    expect(state.tasks[1].branchLeafId).toBeUndefined();
    expect(state.insideBbb).toBe(true);
    expect(state.currentTaskIndex).toBe(0);
  });

  it('ignores done entry with out-of-bounds taskIndex', () => {
    const sm = SessionManager.inMemory();
    const tasks = makeTasks(2);
    initEntry(sm, 'root-1', tasks);
    doneEntry(sm, 'root-1', 99);

    const state = reconstructState(sm)!;
    expect(state.tasks[0].done).toBe(false);
    expect(state.tasks[1].done).toBe(false);
  });

  it('ignores undone entry with out-of-bounds taskIndex', () => {
    const sm = SessionManager.inMemory();
    const tasks = makeTasks(2);
    initEntry(sm, 'root-1', tasks);
    undoneEntry(sm, 'root-1', 99);

    const state = reconstructState(sm)!;
    expect(state.tasks[0].done).toBe(false);
    expect(state.tasks[1].done).toBe(false);
  });

  it('ignores stale done/off entries from a previous init with the same rootEntryId', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'Review');

    // First bit-by-bit session on rootEntryId
    const tasks1 = makeTasks(2);
    initEntry(sm, rootEntryId, tasks1);
    doneEntry(sm, rootEntryId, 0); // mark task 0 done
    offEntry(sm, rootEntryId); // deactivate

    // Second bit-by-bit session on the same rootEntryId
    const tasks2 = makeTasks(3);
    initEntry(sm, rootEntryId, tasks2);

    const state = reconstructState(sm)!;
    expect(state.rootEntryId).toBe(rootEntryId);
    expect(state.tasks).toHaveLength(3);
    // Stale done from first session must NOT leak into the new session
    expect(state.tasks[0].done).toBe(false);
    expect(state.tasks[1].done).toBe(false);
    expect(state.tasks[2].done).toBe(false);
    // Stale off from first session must NOT deactivate the new session
    expect(state.active).toBe(true);
  });
});
