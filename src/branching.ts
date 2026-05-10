import type { CustomEntry, SessionEntry } from '@earendil-works/pi-coding-agent';
import type { BitByBitState, BitByBitEntryData, PiReadonlySessionManager, PiSessionTreeNode } from './types.js';
import { ENTRY_TYPE } from './constants.js';

/**
 * Try to extract taskIndex from a ENTRY_TYPE.BRANCH entry matching rootEntryId.
 * Returns null if the entry is not a matching branch marker.
 */
function parseBranchEntry(entry: SessionEntry, rootEntryId: string): number | null {
  if (entry.type !== 'custom') return null;
  const { customType, data } = entry as CustomEntry;
  if (customType !== ENTRY_TYPE.BRANCH) return null;

  const entryData = data as BitByBitEntryData;
  if (entryData?.rootEntryId !== rootEntryId) return null;

  return entryData.taskIndex ?? null;
}

/**
 * Find which task a leaf entry belongs to by walking up via parentId
 * looking for a ENTRY_TYPE.BRANCH custom entry with matching rootEntryId.
 *
 * Returns taskIndex if found, null if the leaf is outside bit-by-bit area.
 */
export function findTaskByLeaf(state: BitByBitState, leafId: string, sm: PiReadonlySessionManager): number | null {
  let currentId: string | null = leafId;
  while (currentId) {
    const entry = sm.getEntry(currentId);
    if (!entry) break;

    const taskIndex = parseBranchEntry(entry, state.rootEntryId);
    if (taskIndex !== null) return taskIndex;

    if (currentId === state.rootEntryId) break;
    currentId = entry.parentId;
  }
  return null;
}

/**
 * Search a subtree (PiSessionTreeNode) for a ENTRY_TYPE.BRANCH entry
 * belonging to a specific rootEntryId.
 *
 * Returns { taskIndex, leafId } if found, null otherwise.
 * leafId is the entry with the latest timestamp in the subtree.
 */
export function findBranchInSubtree(
  node: PiSessionTreeNode,
  rootEntryId: string
): { taskIndex: number; leafId: string } | null {
  let taskIndex: number | null = null;
  let latestId: string = node.entry.id;
  let latestTs: string = node.entry.timestamp;

  const stack: PiSessionTreeNode[] = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entry = current.entry;

    const found = parseBranchEntry(entry, rootEntryId);
    if (found !== null) taskIndex = found;

    if (entry.timestamp >= latestTs) {
      latestTs = entry.timestamp;
      latestId = entry.id;
    }

    for (const child of current.children) {
      stack.push(child);
    }
  }

  return taskIndex !== null ? { taskIndex, leafId: latestId } : null;
}
