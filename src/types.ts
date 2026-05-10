import type { ExtensionContext, ModelRegistry, SessionManager } from '@earendil-works/pi-coding-agent';

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
  currentTaskIndex: number;
  tasks: Task[];
}

/** Common data shape shared by all bit-by-bit custom entries. */
export interface BitByBitEntryData {
  rootEntryId?: string;
  taskIndex?: number;
}

export interface BitByBitInitData {
  rootEntryId: string;
  tasks: Task[];
}

// Extracted from pi internals because ReadonlySessionManager is not exported directly.
export type PiReadonlySessionManager = ExtensionContext['sessionManager'];

// Extracted from pi internals because the tree node type is not exported directly.
export type PiSessionTreeNode = ReturnType<SessionManager['getTree']>[number];

// Extracted from pi internals because the auth result type is not exported directly.
export type PiModelAuthResult = Awaited<ReturnType<ModelRegistry['getApiKeyAndHeaders']>>;
