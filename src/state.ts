import type { CustomEntry } from '@earendil-works/pi-coding-agent';
import type {
  PiReadonlySessionManager,
  BitByBitState,
  BitByBitInitData,
  BitByBitEntryData,
  PiSessionTreeNode,
} from './types.js';
import { ENTRY_TYPE } from './constants.js';
import { findBranchInSubtree, findTaskByLeaf } from './branching.js';

export function reconstructState(sm: PiReadonlySessionManager): BitByBitState | null {
  const entries = sm.getEntries();

  // Find last init entry (and its index)
  let initData: BitByBitInitData | null = null;
  let lastInitIndex = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type === 'custom' && e.customType === ENTRY_TYPE.INIT) {
      initData = e.data as BitByBitInitData;
      lastInitIndex = i;
      break;
    }
  }
  if (!initData) return null;

  const { rootEntryId, tasks } = initData;

  // Apply done/undone/off/resume entries after the last init for this rootEntryId
  let active = true;
  for (let i = lastInitIndex + 1; i < entries.length; i++) {
    const e = entries[i];
    if (e.type !== 'custom') continue;
    const ce = e as CustomEntry;
    const data = ce.data as BitByBitEntryData | undefined;
    if (data?.rootEntryId !== rootEntryId) continue;

    switch (ce.customType) {
      case ENTRY_TYPE.DONE:
        if (data.taskIndex !== undefined && data.taskIndex >= 0 && data.taskIndex < tasks.length)
          tasks[data.taskIndex].done = true;
        break;
      case ENTRY_TYPE.UNDONE:
        if (data.taskIndex !== undefined && data.taskIndex >= 0 && data.taskIndex < tasks.length)
          tasks[data.taskIndex].done = false;
        break;
      case ENTRY_TYPE.OFF:
        active = false;
        break;
      case ENTRY_TYPE.RESUME:
        active = true;
        break;
    }
  }

  // Compute branchLeafId for each task by traversing tree children of rootEntryId
  const rootChildren = findTreeNode(sm.getTree(), rootEntryId)?.children ?? [];
  for (const child of rootChildren) {
    const result = findBranchInSubtree(child, rootEntryId);
    if (result && result.taskIndex >= 0 && result.taskIndex < tasks.length) {
      tasks[result.taskIndex].branchLeafId = result.leafId;
    }
  }

  // Compute currentTaskIndex and insideBbb from the current leaf
  const state: BitByBitState = {
    initialized: true,
    active,
    insideBbb: false,
    skipSessionTree: false,
    rootEntryId,
    currentTaskIndex: 0,
    tasks,
  };

  const currentLeafId = sm.getLeafId();
  if (currentLeafId) {
    const taskOnCurrentBranch = findTaskByLeaf(state, currentLeafId, sm);
    if (taskOnCurrentBranch !== null) {
      state.insideBbb = true;
      state.currentTaskIndex = taskOnCurrentBranch;
    }
  }

  return state;
}

/** Find a tree node by entry id, searching depth-first. */
function findTreeNode(nodes: PiSessionTreeNode[], targetId: string): PiSessionTreeNode | null {
  for (const node of nodes) {
    if (node.entry.id === targetId) return node;
    const found = findTreeNode(node.children, targetId);
    if (found) return found;
  }
  return null;
}
