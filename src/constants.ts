export const ENTRY_TYPE = {
  INIT: 'bit-by-bit-init',
  BRANCH: 'bit-by-bit-branch',
  DONE: 'bit-by-bit-done',
  UNDONE: 'bit-by-bit-undone',
  OFF: 'bit-by-bit-off',
  RESUME: 'bit-by-bit-resume',
} as const;

/**
 * Custom message types used for the dual-message task context scheme.
 *
 * Two message types serve complementary roles:
 *
 *   TASK_DESCRIPTION (display: true, filtered from LLM context)
 *     - Persisted in the session tree as a visible marker for each task branch.
 *     - Shown to the user in TUI so they can see which task they are on.
 *     - Removed from LLM context by the `context` hook so the assistant never sees raw task markers.
 *     - Created in switchToTask() via pi.sendMessage({ triggerTurn: false }).
 *
 *   CONTEXT (display: false, injected via before_agent_start)
 *     - NOT shown to the user, but IS sent to the LLM on every turn.
 *     - Contains the focused task instruction telling the assistant to work only on the current task.
 *     - Injected as a before_agent_start return value, so it participates in LLM context.
 *     - Not filtered by the `context` hook (it is not a TASK_DESCRIPTION).
 *
 * This split ensures the user sees clean task headers in the chat while the LLM receives
 * a focused instruction without the noise of all other task markers.
 */
export const MESSAGE_TYPE = {
  TASK_DESCRIPTION: 'bit-by-bit',
  CONTEXT: 'bit-by-bit-context',
} as const;
