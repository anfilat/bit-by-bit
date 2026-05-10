import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { BorderedLoader } from '@earendil-works/pi-coding-agent';
import type { BitByBitState } from '../types.js';
import { hasDiscussion, buildDocumentNoDiscussion, buildDocumentWithDiscussion, buildFileName } from '../write.js';
import { guard } from './guard.js';

export async function handleWrite(
  state: BitByBitState,
  ctx: ExtensionCommandContext,
  _pi: ExtensionAPI
): Promise<void> {
  if (!(await guard(state, ctx, { requireInsideBbb: true }))) return;

  const task = state.tasks[state.currentTaskIndex];
  const branch = ctx.sessionManager.getBranch();

  let document: string;

  if (!hasDiscussion(branch)) {
    document = buildDocumentNoDiscussion(task);
  } else {
    if (!ctx.model) {
      ctx.ui.notify('bit-by-bit: no model selected', 'error');
      return;
    }

    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const loader = new BorderedLoader(tui, theme, `Summarizing progress using ${ctx.model!.id}...`);
      loader.onAbort = () => done(null);

      const doSummarize = async () => {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
        return buildDocumentWithDiscussion(ctx.model!, auth, task, branch, loader.signal);
      };

      doSummarize()
        .then(done)
        .catch(err => {
          const message = err instanceof Error ? err.message : String(err);
          ctx.ui.notify(`Summarization failed: ${message}`, 'error');
          done(null);
        });

      return loader;
    });

    if (result === null) {
      ctx.ui.notify('bit-by-bit: write cancelled', 'info');
      return;
    }
    document = result;
  }

  // Write file
  const fileName = buildFileName(task);
  const dir = resolve(ctx.cwd, 'bit-by-bit');
  await mkdir(dir, { recursive: true });
  const filePath = resolve(dir, fileName);
  await writeFile(filePath, document, 'utf-8');

  ctx.ui.notify(`bit-by-bit: document written to bit-by-bit/${fileName}`, 'info');
}
