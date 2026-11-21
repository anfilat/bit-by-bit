import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { BorderedLoader } from '@earendil-works/pi-coding-agent';
import { extractTasks } from '../extraction.js';
import { ENTRY_TYPE } from '../constants.js';
import type { BitByBitState, Task } from '../types.js';
import { formatNumbers, parseTaskSelection } from '../task-group.js';
import { updateStatus } from '../status.js';
import { switchToTasks } from './switch-task.js';

export async function handleStart(
  state: BitByBitState,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  args = ''
): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify('bit-by-bit requires interactive mode', 'error');
    return;
  }

  // 1. Already active?
  if (state.initialized && state.active) {
    ctx.ui.notify('bit-by-bit: already active', 'info');
    return;
  }

  // 2. Parse task selection args ("2,3", "2-4", default: first task)
  const selection = args.trim() === '' ? [0] : parseTaskSelection(args);
  if (!selection) {
    ctx.ui.notify('bit-by-bit: invalid task selection — use e.g. "2,3" or "2-4"', 'error');
    return;
  }

  // 3. Model required
  if (!ctx.model) {
    ctx.ui.notify('bit-by-bit: no model selected', 'error');
    return;
  }

  // 4. Find last assistant message on current branch
  const branch = ctx.sessionManager.getBranch();
  let lastAssistantText: string | undefined;

  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type === 'message') {
      const msg = entry.message;
      if ('role' in msg && msg.role === 'assistant') {
        const textParts = msg.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map(c => c.text);
        if (textParts.length > 0) {
          lastAssistantText = textParts.join('\n');
          break;
        }
      }
    }
  }

  if (!lastAssistantText) {
    ctx.ui.notify('bit-by-bit: no assistant message found', 'error');
    return;
  }

  // 5. Extract tasks with loader UI
  const tasks = await ctx.ui.custom<{ title: string; description: string }[] | null>((tui, theme, _kb, done) => {
    const loader = new BorderedLoader(tui, theme, `Extracting tasks using ${ctx.model!.id}...`);
    loader.onAbort = () => done(null);

    const doExtract = async () => {
      return extractTasks(ctx.model!, ctx.modelRegistry, lastAssistantText!, loader.signal);
    };

    doExtract()
      .then(done)
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Extraction failed: ${message}`, 'error');
        done(null);
      });

    return loader;
  });

  // 6. Cancelled
  if (tasks === null) {
    ctx.ui.notify('bit-by-bit: cancelled', 'info');
    return;
  }

  // 7. Validate results
  if (tasks.length === 0) {
    ctx.ui.notify('bit-by-bit: no tasks found in the message', 'error');
    return;
  }

  if (tasks.length === 1) {
    ctx.ui.notify('bit-by-bit: only one task found, nothing to split', 'warning');
    return;
  }

  // 8. Validate selection bounds against the extracted task count
  const outOfRange = selection.filter(i => i >= tasks.length);
  if (outOfRange.length > 0) {
    const bad = outOfRange.map(i => i + 1).join(',');
    ctx.ui.notify(
      `bit-by-bit: task${outOfRange.length > 1 ? 's' : ''} ${bad} do${outOfRange.length > 1 ? '' : 'es'} not exist (1..${tasks.length})`,
      'error'
    );
    return;
  }

  // 9. Determine rootEntryId (current leaf)
  const rootEntryId = ctx.sessionManager.getLeafId();
  if (!rootEntryId) {
    ctx.ui.notify('bit-by-bit: no active leaf entry', 'error');
    return;
  }

  // 10. Build task objects
  const taskObjects: Task[] = tasks.map((t, i) => ({
    index: i,
    title: t.title,
    description: t.description,
    done: false,
  }));

  // 11. Persist init entry
  pi.appendEntry(ENTRY_TYPE.INIT, {
    rootEntryId,
    tasks: taskObjects,
  });

  // 12. Set state needed by switchToTasks
  state.rootEntryId = rootEntryId;
  state.tasks = taskObjects;
  state.groupBranchLeafIds = new Map();

  // 13. Navigate to the selected task group (creates branch from root)
  const navigated = await switchToTasks(state, selection, ctx, pi);
  if (!navigated) {
    ctx.ui.notify('bit-by-bit: navigation cancelled', 'info');
    return;
  }

  // 14. Mark as active only after successful navigation
  state.initialized = true;
  state.active = true;
  state.insideBbb = true;
  state.currentTaskIndexes = selection;

  // 15. Update status
  updateStatus(state, ctx);

  const startLabel = selection.length > 1 ? `tasks ${formatNumbers(selection)}` : `task ${selection[0] + 1}`;
  ctx.ui.notify(`bit-by-bit: ${state.tasks.length} tasks extracted, starting ${startLabel}`, 'info');
}
