import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { BorderedLoader } from '@earendil-works/pi-coding-agent';
import { extractTasks } from '../extraction.js';
import { ENTRY_TYPE } from '../constants.js';
import type { BitByBitState, Task } from '../types.js';
import { updateStatus } from '../status.js';
import { switchToTask } from './switch-task.js';

export async function handleStart(state: BitByBitState, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify('bit-by-bit requires interactive mode', 'error');
    return;
  }

  // 1. Already active?
  if (state.initialized && state.active) {
    ctx.ui.notify('bit-by-bit: already active', 'info');
    return;
  }

  // 2. Model required
  if (!ctx.model) {
    ctx.ui.notify('bit-by-bit: no model selected', 'error');
    return;
  }

  // 3. Find last assistant message on current branch
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

  // 4. Extract tasks with loader UI
  const tasks = await ctx.ui.custom<{ title: string; description: string }[] | null>((tui, theme, _kb, done) => {
    const loader = new BorderedLoader(tui, theme, `Extracting tasks using ${ctx.model!.id}...`);
    loader.onAbort = () => done(null);

    const doExtract = async () => {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
      return extractTasks(ctx.model!, auth, lastAssistantText!, loader.signal);
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

  // 5. Cancelled
  if (tasks === null) {
    ctx.ui.notify('bit-by-bit: cancelled', 'info');
    return;
  }

  // 6. Validate results
  if (tasks.length === 0) {
    ctx.ui.notify('bit-by-bit: no tasks found in the message', 'error');
    return;
  }

  if (tasks.length === 1) {
    ctx.ui.notify('bit-by-bit: only one task found, nothing to split', 'warning');
    return;
  }

  // 7. Determine rootEntryId (current leaf)
  const rootEntryId = ctx.sessionManager.getLeafId();
  if (!rootEntryId) {
    ctx.ui.notify('bit-by-bit: no active leaf entry', 'error');
    return;
  }

  // 8. Build task objects
  const taskObjects: Task[] = tasks.map((t, i) => ({
    index: i,
    title: t.title,
    description: t.description,
    done: false,
  }));

  // 9. Persist init entry
  pi.appendEntry(ENTRY_TYPE.INIT, {
    rootEntryId,
    tasks: taskObjects,
  });

  // 10. Set state needed by switchToTask
  state.rootEntryId = rootEntryId;
  state.tasks = taskObjects;

  // 11. Navigate to first task (creates branch from root)
  const navigated = await switchToTask(state, 0, ctx, pi);
  if (!navigated) {
    ctx.ui.notify('bit-by-bit: navigation cancelled', 'info');
    return;
  }

  // 12. Mark as active only after successful navigation
  state.initialized = true;
  state.active = true;
  state.insideBbb = true;
  state.currentTaskIndex = 0;

  // 13. Update status
  updateStatus(state, ctx);

  ctx.ui.notify(`bit-by-bit: ${state.tasks.length} tasks extracted, starting task 1`, 'info');
}
