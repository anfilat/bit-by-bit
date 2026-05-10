#!/usr/bin/env node

/**
 * Extraction prompt comparison tool.
 *
 * Usage:
 *   node --experimental-strip-types extensions/bit-by-bit/extraction-check/compare.ts
 *     --compare    Compare current extraction results against reference (default)
 *     --update     Overwrite reference files with current extraction results
 *     <number>     Run only for the case whose filename starts with this number
 *
 * Uses the default model from pi settings (~/.pi/agent/settings.json)
 * and API keys from pi auth (~/.pi/agent/auth.json).
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthStorage, ModelRegistry, SettingsManager } from '@earendil-works/pi-coding-agent';
import { getModel } from '@earendil-works/pi-ai';
import { extractTasks, EXTRACTION_PROMPT } from '../src/extraction.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(__dirname, 'cases');

interface ExtractedTask {
  title: string;
  description: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function red(s: string) {
  return `\x1b[31m${s}\x1b[0m`;
}
function green(s: string) {
  return `\x1b[32m${s}\x1b[0m`;
}
function yellow(s: string) {
  return `\x1b[33m${s}\x1b[0m`;
}
function dim(s: string) {
  return `\x1b[2m${s}\x1b[0m`;
}
function bold(s: string) {
  return `\x1b[1m${s}\x1b[0m`;
}

function formatItem(item: ExtractedTask, prefix: string): string[] {
  const lines: string[] = [];
  lines.push(`    ${prefix} title: ${item.title}`);
  for (const line of item.description.split('\n')) {
    lines.push(`    ${prefix}   ${line}`);
  }
  return lines;
}

function taskDiff(ref: ExtractedTask, cur: ExtractedTask): string[] {
  const lines: string[] = [];
  if (ref.title !== cur.title) {
    lines.push(`    title: ${red(`- ${ref.title}`)}`);
    lines.push(`    title: ${green(`+ ${cur.title}`)}`);
  }
  if (ref.description !== cur.description) {
    lines.push(`    description:`);
    lines.push(...formatItem(ref, red('-')).slice(1));
    lines.push(...formatItem(cur, green('+')).slice(1));
  }
  return lines;
}

// ── Load cases ───────────────────────────────────────────────────────────────

async function loadCases(
  filterPrefix?: string
): Promise<{ name: string; input: string; reference?: ExtractedTask[] }[]> {
  let files = (await readdir(CASES_DIR)).filter(f => f.endsWith('.md')).sort();
  if (filterPrefix !== undefined) {
    files = files.filter(f => f.startsWith(filterPrefix));
  }
  const cases = [];

  for (const file of files) {
    const content = await readFile(join(CASES_DIR, file), 'utf-8');
    const name = file.replace(/\.md$/, '');
    cases.push({ name, input: content, reference: undefined });
  }

  // Load reference JSON files (same name, .json extension)
  for (const c of cases) {
    const refPath = join(CASES_DIR, `${c.name}.json`);
    try {
      const raw = await readFile(refPath, 'utf-8');
      const data = JSON.parse(raw);
      c.reference = data.reference;
    } catch {
      // No reference file yet
    }
  }

  return cases;
}

async function saveReference(name: string, tasks: ExtractedTask[]): Promise<void> {
  const refPath = join(CASES_DIR, `${name}.json`);
  const data = { reference: tasks };
  await writeFile(refPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ── Setup model + auth ───────────────────────────────────────────────────────

async function setup() {
  const agentDir = resolve(process.env.HOME || '~', '.pi', 'agent');
  const settingsManager = SettingsManager.create(process.cwd(), agentDir);
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  const provider = settingsManager.getDefaultProvider();
  const modelId = settingsManager.getDefaultModel();

  if (!provider || !modelId) {
    console.error(red('Error: defaultProvider or defaultModel not set in pi settings.'));
    console.error(dim(`  Run 'pi' and check ~/.pi/agent/settings.json`));
    process.exit(1);
  }

  // Try custom model first, then built-in
  const model = modelRegistry.find(provider, modelId) ?? getModel(provider as any, modelId as any);
  if (!model) {
    console.error(red(`Error: model not found: ${provider}/${modelId}`));
    process.exit(1);
  }

  const auth = await modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    console.error(red(`Error: auth failed: ${auth.error}`));
    process.exit(1);
  }

  console.log(dim(`Model: ${model.provider}/${model.id}`));
  console.log(dim(`Prompt: EXTRACTION_PROMPT (${EXTRACTION_PROMPT.length} chars)`));
  console.log();

  return { model, auth };
}

// ── Compare ──────────────────────────────────────────────────────────────────

async function compareMode(filterPrefix?: string) {
  const cases = await loadCases(filterPrefix);
  if (cases.length === 0) {
    console.error(red('No .md case files found in ' + CASES_DIR + (filterPrefix ? ` matching "${filterPrefix}"` : '')));
    process.exit(1);
  }

  const { model, auth } = await setup();

  let totalMatch = 0;
  let totalMismatch = 0;
  let totalNoRef = 0;

  for (const c of cases) {
    process.stdout.write(bold(c.name));

    let tasks: ExtractedTask[];
    try {
      tasks = await extractTasks(model, auth, c.input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` ${red('ERROR')}`);
      console.log(`  ${red(msg)}`);
      totalMismatch++;
      continue;
    }

    if (!c.reference) {
      console.log(` ${yellow('NO REFERENCE')} — extracted ${tasks.length} items`);
      totalNoRef++;
      continue;
    }

    const countMatch = tasks.length === c.reference.length;
    const countLabel = countMatch
      ? green(`✓ ${tasks.length} items`)
      : red(`✗ ${tasks.length} items (expected ${c.reference.length})`);

    if (!countMatch) {
      console.log(` ${countLabel}`);
      // Print all items when count differs
      const maxLen = Math.max(c.reference.length, tasks.length);
      for (let i = 0; i < maxLen; i++) {
        const refItem = c.reference[i];
        const curItem = tasks[i];
        if (refItem && curItem) {
          const diff = taskDiff(refItem, curItem);
          if (diff.length > 0) {
            console.log(`  [${i + 1}]`);
            diff.forEach(d => console.log(d));
          } else {
            console.log(`  [${i + 1}] ${green('✓')}`);
          }
        } else if (refItem) {
          console.log(`  [${i + 1}] ${red('removed')}`);
          formatItem(refItem, red('-')).forEach(d => console.log(`  ${d}`));
        } else {
          console.log(`  [${i + 1}] ${green('added')}`);
          formatItem(curItem, green('+')).forEach(d => console.log(`  ${d}`));
        }
      }
      totalMismatch++;
    } else {
      // Compare content
      let contentMatch = true;
      const details: string[] = [];
      for (let i = 0; i < tasks.length; i++) {
        const diff = taskDiff(c.reference[i], tasks[i]);
        if (diff.length > 0) {
          contentMatch = false;
          details.push(`  [${i + 1}]`);
          details.push(...diff);
        }
      }

      if (contentMatch) {
        console.log(` ${green('✓ MATCH')} ${tasks.length} items`);
        totalMatch++;
      } else {
        console.log(` ${yellow('✗ CONTENT DIFF')} ${tasks.length} items`);
        details.forEach(d => console.log(d));
        totalMismatch++;
      }
    }
  }

  console.log();
  console.log(bold('Summary:'));
  console.log(
    `  ${green(`${totalMatch} match`)}, ${red(`${totalMismatch} mismatch`)}, ${yellow(`${totalNoRef} no reference`)}`
  );
  console.log(`  Total: ${cases.length} cases`);
}

// ── Update ───────────────────────────────────────────────────────────────────

async function updateMode(filterPrefix?: string) {
  const cases = await loadCases(filterPrefix);
  if (cases.length === 0) {
    console.error(red('No .md case files found in ' + CASES_DIR + (filterPrefix ? ` matching "${filterPrefix}"` : '')));
    process.exit(1);
  }

  const { model, auth } = await setup();

  let updated = 0;

  for (const c of cases) {
    process.stdout.write(bold(c.name));

    let tasks: ExtractedTask[];
    try {
      tasks = await extractTasks(model, auth, c.input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` ${red('ERROR')}: ${msg}`);
      continue;
    }

    await saveReference(c.name, tasks);
    console.log(` ${green('→ saved')} ${tasks.length} items`);
    updated++;
  }

  console.log();
  console.log(bold(`Updated ${updated}/${cases.length} reference files.`));
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isUpdate = args.includes('--update');
const positional = args.filter(a => !a.startsWith('--'));
const filterPrefix = positional[0]; // e.g. "003" to run only 003-synthesis-table.md

if (isUpdate) {
  updateMode(filterPrefix).catch(err => {
    console.error(red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
} else {
  compareMode(filterPrefix).catch(err => {
    console.error(red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
}
