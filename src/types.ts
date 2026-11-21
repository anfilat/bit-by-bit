import type { ExtensionContext, SessionManager } from '@earendil-works/pi-coding-agent';

export interface Task {
  index: number;
  title: string;
  description: string;
  done: boolean;
  branchLeafId?: string;
}

export interface BitByBitState {
  initialized: boolean;
  active: boolean;
  insideBbb: boolean;
  skipSessionTree: boolean;
  rootEntryId: string;
  /** Indexes of the task group the current branch works on. Single task = one element. */
  currentTaskIndexes: number[];
  tasks: Task[];
  /** Latest leaf id per multi-task group branch, keyed by canonical group key ("1+2"). */
  groupBranchLeafIds: Map<string, string>;
}

/** Common data shape shared by all bit-by-bit custom entries. */
export interface BitByBitEntryData {
  rootEntryId?: string;
  /** Legacy single-task marker (pre group support). */
  taskIndex?: number;
  /** All task indexes this entry applies to. Supersedes taskIndex; single task = one element. */
  taskIndexes?: number[];
}

export interface BitByBitInitData {
  rootEntryId: string;
  tasks: Task[];
}

// Extracted from pi internals because ReadonlySessionManager is not exported directly.
export type PiReadonlySessionManager = ExtensionContext['sessionManager'];

// Extracted from pi internals because the tree node type is not exported directly.
export type PiSessionTreeNode = ReturnType<SessionManager['getTree']>[number];
