import type { CustomMessageEntry, SessionEntry, SessionMessageEntry } from '@earendil-works/pi-coding-agent';
import { complete, type Model, type AssistantMessage } from '@earendil-works/pi-ai';
import type { PiModelAuthResult, Task } from './types.js';
import { MESSAGE_TYPE } from './constants.js';

// ─── Slug helper ────────────────────────────────────────────────────────────

export const MAX_SLUG_LENGTH = 60;

// Characters unsafe across common filesystems (Linux, macOS, Windows)
// oxlint-disable-next-line no-control-regex
const UNSAFE_FS_CHARS = /[/\\:*?"<>|\x00-\x1F]/g;

export function slugify(text: string): string {
  return (
    text
      // Remove filesystem-unsafe characters
      .replace(UNSAFE_FS_CHARS, '')
      // Replace whitespace sequences with a single hyphen
      .replace(/\s+/g, '-')
      // Truncate to max length
      .slice(0, MAX_SLUG_LENGTH)
      // Strip leading/trailing hyphens (after truncation to avoid trailing hyphen)
      .replace(/^-+|-+$/g, '')
  );
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Check whether a branch contains user/assistant messages after the
 * bit-by-bit task-description message, indicating the user has already
 * worked on this task (Scenario 2). Returns false when the branch only
 * has the task description (Scenario 1 — no discussion).
 */
export function hasDiscussion(branch: SessionEntry[]): boolean {
  let afterDescription = false;
  for (const entry of branch) {
    if (entry.type === 'custom_message') {
      const ce = entry as CustomMessageEntry;
      if (ce.customType === MESSAGE_TYPE.TASK_DESCRIPTION) {
        afterDescription = true;
        continue;
      }
    }
    if (afterDescription && entry.type === 'message') {
      const msg = (entry as SessionMessageEntry).message;
      if (msg?.role === 'user' || msg?.role === 'assistant') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Format branch messages into a plain-text conversation suitable for
 * LLM summarization. Only messages after the task-description are included.
 * Custom messages from the extension are filtered out. Long tool results are
 * truncated to 500 chars.
 */
export function formatBranchConversation(branch: SessionEntry[]): string {
  let afterDescription = false;
  const lines: string[] = [];

  for (const entry of branch) {
    if (entry.type === 'custom_message') {
      const ce = entry as CustomMessageEntry;
      if (ce.customType === MESSAGE_TYPE.TASK_DESCRIPTION) {
        afterDescription = true;
        continue;
      }
    }

    if (!afterDescription || entry.type !== 'message') continue;
    const msg = (entry as SessionMessageEntry).message;

    // Skip custom-role messages (e.g. compactionSummary, branchSummary)
    if (msg.role === 'custom') continue;

    if (msg.role === 'user') {
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('\n')
            : '';
      lines.push(`User: ${text}`);
    } else if (msg.role === 'assistant') {
      const text = Array.isArray(msg.content)
        ? msg.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n')
        : '';
      if (text) lines.push(`Assistant: ${text}`);
      const toolCalls = Array.isArray(msg.content)
        ? msg.content.filter((c): c is Extract<typeof c, { type: 'toolCall' }> => c.type === 'toolCall')
        : [];
      for (const tc of toolCalls) {
        lines.push(`Tool call: ${tc.name}(${JSON.stringify(tc.arguments)})`);
      }
    } else if (msg.role === 'toolResult') {
      const text = Array.isArray(msg.content)
        ? msg.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n')
        : '';
      const truncated = text.length > 500 ? text.slice(0, 500) + '...' : text;
      lines.push(`Tool result (${msg.toolName}): ${truncated}`);
    }
  }

  return lines.join('\n\n');
}

const SUMMARIZATION_PROMPT = `You are summarizing progress on a code task.
Given the task description and the conversation below, produce a concise summary covering:

1. Approach — What approach was taken?
2. Key Decisions — Important technical decisions made
3. Changes Made — Files modified and what changed
4. Current State — Is the work complete, in progress, or blocked? What remains?

Preserve all technical details needed to continue the work in a new session.
Use plain text, not markdown headers.`;

/**
 * Build the markdown document for Scenario 1 — no discussion (the task has
 * not been worked on yet, so no LLM summarization is needed).
 */
export function buildDocumentNoDiscussion(task: Task): string {
  return [`# ${task.title}`, '', '## Task', '', task.description].join('\n');
}

/**
 * Build the markdown document for Scenario 2 — there is a conversation on
 * the branch. Calls `complete()` to summarize the progress.
 */
export async function buildDocumentWithDiscussion(
  model: Model<any>,
  auth: PiModelAuthResult,
  task: Task,
  branch: SessionEntry[],
  signal?: AbortSignal
): Promise<string> {
  if (!auth.ok) {
    throw new Error(auth.error);
  }
  if (!auth.apiKey) {
    throw new Error(`No API key for ${model.provider}`);
  }

  const conversationText = formatBranchConversation(branch);

  const systemPrompt = `${SUMMARIZATION_PROMPT}\n\nTask: ${task.title}\n${task.description}`;
  const userMessage = {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: conversationText }],
    timestamp: Date.now(),
  };

  const response: AssistantMessage = await complete(
    model,
    { systemPrompt, messages: [userMessage] },
    { apiKey: auth.apiKey, headers: auth.headers, signal }
  );

  if (response.stopReason === 'aborted') {
    throw new Error('Summarization cancelled');
  }

  const summary = response.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('');

  return [`# ${task.title}`, '', '## Task', '', task.description, '', '## Summary', '', summary].join('\n');
}

/**
 * Generate the filename for the document: `<yyyy-mm-dd-hh-mm>-<slug>.md`
 */
export function buildFileName(task: Task, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const prefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const slug = slugify(task.title);
  return `${prefix}-${slug}.md`;
}
