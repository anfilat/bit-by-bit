import { describe, it, expect } from 'vitest';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import type { BitByBitState, PiSessionTreeNode } from '../src/types.js';
import { ENTRY_TYPE } from '../src/constants.js';
import { findTaskByLeaf, findBranchInSubtree } from '../src/branching.js';

/**
 * Helper: create a minimal BitByBitState for testing.
 */
function makeState(rootEntryId: string): BitByBitState {
  return {
    initialized: true,
    active: true,
    insideBbb: true,
    skipSessionTree: false,
    rootEntryId,
    currentTaskIndex: 0,
    tasks: [
      { index: 0, title: 'Task 1', description: 'Desc 1', done: false },
      { index: 1, title: 'Task 2', description: 'Desc 2', done: false },
    ],
  };
}

/**
 * Helper: append a user message to the session.
 */
function userMsg(sm: SessionManager, text: string): string {
  return sm.appendMessage({ role: 'user', content: text, timestamp: Date.now() });
}

/**
 * Helper: append an assistant message to the session.
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
 * Helper: find a tree node by entry id.
 */
function findTreeNodeById(nodes: PiSessionTreeNode[], targetId: string): PiSessionTreeNode | null {
  for (const node of nodes) {
    if (node.entry.id === targetId) return node;
    const found = findTreeNodeById(node.children, targetId);
    if (found) return found;
  }
  return null;
}

/**
 * Helper: build a tree with two task branches from a common rootEntryId.
 *
 * Structure:
 *   rootEntryId
 *     ├── initEntry (linear continuation, no branch)
 *     ├── task0User → branch0 → task0Assistant
 *     └── task1User → branch1 → task1Assistant
 *
 * Returns the key entry IDs.
 */
function buildTwoBranchTree(sm: SessionManager) {
  // Linear prefix
  const rootId = userMsg(sm, 'initial user message');
  const rootEntryId = assistantMsg(sm, 'Here is a review with 2 issues...');

  // Linear continuation (init entry)
  sm.appendCustomEntry(ENTRY_TYPE.INIT, {
    rootEntryId,
    tasks: [
      { index: 0, title: 'Task 1', description: 'Desc 1' },
      { index: 1, title: 'Task 2', description: 'Desc 2' },
    ],
  });

  // --- Task 0 branch ---
  sm.branch(rootEntryId);
  const task0User = userMsg(sm, 'Task 0 description');
  sm.appendCustomEntry(ENTRY_TYPE.BRANCH, {
    rootEntryId,
    taskIndex: 0,
  });
  const task0Assistant = assistantMsg(sm, 'Working on task 0...');

  // --- Task 1 branch ---
  sm.branch(rootEntryId);
  const task1User = userMsg(sm, 'Task 1 description');
  sm.appendCustomEntry(ENTRY_TYPE.BRANCH, {
    rootEntryId,
    taskIndex: 1,
  });
  const task1Assistant = assistantMsg(sm, 'Working on task 1...');

  return {
    rootId,
    rootEntryId,
    task0User,
    task0Assistant,
    task1User,
    task1Assistant,
  };
}

// ─── findTaskByLeaf ──────────────────────────────────────────────────────────

describe('findTaskByLeaf', () => {
  it('returns taskIndex when leaf is on a branch with bit-by-bit-branch', () => {
    const sm = SessionManager.inMemory();
    const { rootEntryId, task0Assistant } = buildTwoBranchTree(sm);
    const state = makeState(rootEntryId);

    const result = findTaskByLeaf(state, task0Assistant, sm);
    expect(result).toBe(0);
  });

  it('returns null when leaf is on a branch without bit-by-bit-branch', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'assistant');

    // Branch from root, but no bit-by-bit-branch entry
    sm.branch(rootEntryId);
    const someLeaf = userMsg(sm, 'just a message, no branch marker');

    const state = makeState(rootEntryId);
    const result = findTaskByLeaf(state, someLeaf, sm);
    expect(result).toBeNull();
  });

  it('returns null when leaf is outside bit-by-bit (at root, above rootEntryId)', () => {
    const sm = SessionManager.inMemory();
    const { rootId, rootEntryId } = buildTwoBranchTree(sm);
    const state = makeState(rootEntryId);

    // rootId is the first entry, above rootEntryId
    const result = findTaskByLeaf(state, rootId, sm);
    expect(result).toBeNull();
  });

  it('returns null when leaf is on linear continuation (no branch marker in path)', () => {
    const sm = SessionManager.inMemory();
    const { rootEntryId } = buildTwoBranchTree(sm);
    const state = makeState(rootEntryId);

    // The init entry is on the linear continuation from rootEntryId
    // Walking up from it hits rootEntryId before any branch marker
    const entries = sm.getEntries();
    const initEntry = entries.find(e => e.type === 'custom' && e.customType === ENTRY_TYPE.INIT);
    expect(initEntry).toBeDefined();

    const result = findTaskByLeaf(state, initEntry!.id, sm);
    expect(result).toBeNull();
  });

  it('finds branch when leaf is in the middle of a branch (not on branch entry itself)', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'review');

    // Create a longer branch with multiple messages after the branch marker
    sm.branch(rootEntryId);
    userMsg(sm, 'Task 0 description');
    sm.appendCustomEntry(ENTRY_TYPE.BRANCH, {
      rootEntryId,
      taskIndex: 0,
    });
    assistantMsg(sm, 'First response');
    const midUserMsg = userMsg(sm, 'Follow-up prompt');
    assistantMsg(sm, 'Second response');

    const state = makeState(rootEntryId);
    // Test with the middle user message (above branch entry, still in subtree)
    const result = findTaskByLeaf(state, midUserMsg, sm);
    expect(result).toBe(0);
  });

  it('returns correct taskIndex for second branch', () => {
    const sm = SessionManager.inMemory();
    const { rootEntryId, task1Assistant } = buildTwoBranchTree(sm);
    const state = makeState(rootEntryId);

    const result = findTaskByLeaf(state, task1Assistant, sm);
    expect(result).toBe(1);
  });

  it('returns null when leaf is the rootEntryId itself', () => {
    const sm = SessionManager.inMemory();
    const { rootEntryId } = buildTwoBranchTree(sm);
    const state = makeState(rootEntryId);

    const result = findTaskByLeaf(state, rootEntryId, sm);
    expect(result).toBeNull();
  });
});

// ─── findBranchInSubtree ─────────────────────────────────────────────────────

describe('findBranchInSubtree', () => {
  it('returns { taskIndex, leafId } for subtree with branch entry', () => {
    const sm = SessionManager.inMemory();
    const { rootEntryId, task0User, task0Assistant } = buildTwoBranchTree(sm);

    const tree = sm.getTree();
    const node = findTreeNodeById(tree, task0User);
    expect(node).toBeDefined();

    const result = findBranchInSubtree(node!, rootEntryId);
    expect(result).not.toBeNull();
    expect(result!.taskIndex).toBe(0);
    expect(result!.leafId).toBe(task0Assistant);
  });

  it('returns null for subtree without branch entry', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'review');

    // Create a branch without bit-by-bit-branch entry
    sm.branch(rootEntryId);
    const someEntry = userMsg(sm, 'message without branch marker');
    assistantMsg(sm, 'response');

    const tree = sm.getTree();
    const node = findTreeNodeById(tree, someEntry);
    expect(node).toBeDefined();

    const result = findBranchInSubtree(node!, rootEntryId);
    expect(result).toBeNull();
  });

  it('returns null for init entry subtree (linear continuation)', () => {
    const sm = SessionManager.inMemory();
    const { rootEntryId } = buildTwoBranchTree(sm);

    // The init entry is a direct child of rootEntryId (linear continuation)
    const rootChildren = findTreeNodeById(sm.getTree(), rootEntryId)?.children ?? [];
    const initNode = rootChildren.find(
      (c: PiSessionTreeNode) => c.entry.type === 'custom' && c.entry.customType === ENTRY_TYPE.INIT
    );
    expect(initNode).toBeDefined();

    const result = findBranchInSubtree(initNode!, rootEntryId);
    expect(result).toBeNull();
  });

  it('two branches from same root do not interfere with each other', () => {
    const sm = SessionManager.inMemory();
    const { rootEntryId, task0User, task1User, task0Assistant, task1Assistant } = buildTwoBranchTree(sm);

    const tree = sm.getTree();
    const node0 = findTreeNodeById(tree, task0User);
    const node1 = findTreeNodeById(tree, task1User);

    const result0 = findBranchInSubtree(node0!, rootEntryId);
    const result1 = findBranchInSubtree(node1!, rootEntryId);

    expect(result0).not.toBeNull();
    expect(result0!.taskIndex).toBe(0);
    expect(result0!.leafId).toBe(task0Assistant);

    expect(result1).not.toBeNull();
    expect(result1!.taskIndex).toBe(1);
    expect(result1!.leafId).toBe(task1Assistant);
  });

  it('returns leafId at the latest entry in subtree', () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'review');

    // Create a branch with multiple levels
    sm.branch(rootEntryId);
    const taskStart = userMsg(sm, 'Task start');
    sm.appendCustomEntry(ENTRY_TYPE.BRANCH, {
      rootEntryId,
      taskIndex: 0,
    });
    assistantMsg(sm, 'Response 1');
    userMsg(sm, 'Follow-up');
    const latestEntry = assistantMsg(sm, 'Response 2');

    const tree = sm.getTree();
    const node = findTreeNodeById(tree, taskStart);
    expect(node).toBeDefined();

    const result = findBranchInSubtree(node!, rootEntryId);
    expect(result).not.toBeNull();
    expect(result!.leafId).toBe(latestEntry);
  });

  it('finds branch entry when subtree has sub-branches', async () => {
    const sm = SessionManager.inMemory();
    const rootEntryId = assistantMsg(sm, 'review');

    // Main task branch
    sm.branch(rootEntryId);
    const taskStart = userMsg(sm, 'Task start');
    sm.appendCustomEntry(ENTRY_TYPE.BRANCH, {
      rootEntryId,
      taskIndex: 0,
    });
    const resp1 = assistantMsg(sm, 'Response 1');
    userMsg(sm, 'Follow-up');
    assistantMsg(sm, 'Response 2');

    // Sub-branch from an earlier point (user navigated via /tree)
    sm.branch(resp1);
    userMsg(sm, 'Alternative follow-up');
    // Ensure distinct timestamp so the latest entry wins reliably
    await new Promise(r => setTimeout(r, 2));
    const altResp = assistantMsg(sm, 'Alternative response');

    const tree = sm.getTree();
    const node = findTreeNodeById(tree, taskStart);
    expect(node).toBeDefined();

    const result = findBranchInSubtree(node!, rootEntryId);
    expect(result).not.toBeNull();
    expect(result!.taskIndex).toBe(0);
    expect(result!.leafId).toBe(altResp);
  });
});
