import type { CustomEntry, SessionEntry } from '@earendil-works/pi-coding-agent';
import type { BitByBitState, BitByBitEntryData, PiReadonlySessionManager, PiSessionTreeNode } from './types.js';
import { ENTRY_TYPE } from './constants.js';

/**
 * Try to extract the task group from a ENTRY_TYPE.BRANCH entry matching rootEntryId.
 * Reads the modern `taskIndexes` array, falling back to the legacy single `taskIndex`.
 * Returns null if the entry is not a matching branch marker.
 */
function parseBranchEntry(entry: SessionEntry, rootEntryId: string): number[] | null {
  if (entry.type !== 'custom') return null;
  const { customType, data } = entry as CustomEntry;
  if (customType !== ENTRY_TYPE.BRANCH) return null;

  const entryData = data as BitByBitEntryData;
  if (entryData?.rootEntryId !== rootEntryId) return null;

  if (Array.isArray(entryData.taskIndexes) && entryData.taskIndexes.length > 0) {
    return entryData.taskIndexes;
  }
  if (typeof entryData.taskIndex === 'number') {
    return [entryData.taskIndex];
  }
  return null;
}

/**
 * Find which task group a leaf entry belongs to by walking up via parentId
 * looking for a ENTRY_TYPE.BRANCH custom entry with matching rootEntryId.
 *
 * Returns task indexes if found, null if the leaf is outside bit-by-bit area.
 */
export function findTaskByLeaf(state: BitByBitState, leafId: string, sm: PiReadonlySessionManager): number[] | null {
  let currentId: string | null = leafId;
  while (currentId) {
    const entry = sm.getEntry(currentId);
    if (!entry) break;

    const taskIndexes = parseBranchEntry(entry, state.rootEntryId);
    if (taskIndexes !== null) return taskIndexes;

    if (currentId === state.rootEntryId) break;
    currentId = entry.parentId;
  }
  return null;
}

/**
 * Search a subtree (PiSessionTreeNode) for a ENTRY_TYPE.BRANCH entry
 * belonging to a specific rootEntryId.
 *
 * Returns { taskIndexes, leafId } if found, null otherwise.
 * leafId is the entry with the latest timestamp in the subtree.
 */
export function findBranchInSubtree(
  node: PiSessionTreeNode,
  rootEntryId: string
): { taskIndexes: number[]; leafId: string } | null {
  let taskIndexes: number[] | null = null;
  let latestId: string = node.entry.id;
  let latestTs: string = node.entry.timestamp;

  const stack: PiSessionTreeNode[] = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entry = current.entry;

    const found = parseBranchEntry(entry, rootEntryId);
    if (found !== null) taskIndexes = found;

    if (entry.timestamp >= latestTs) {
      latestTs = entry.timestamp;
      latestId = entry.id;
    }

    for (const child of current.children) {
      stack.push(child);
    }
  }

  return taskIndexes !== null ? { taskIndexes, leafId: latestId } : null;
}
