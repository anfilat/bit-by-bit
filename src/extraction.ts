import type { Model } from '@earendil-works/pi-ai';
import type { PiModelAuthResult } from './types.js';
import { callLlm } from './llm.js';

export const EXTRACTION_PROMPT = `You are a structured item parser. Extract ONLY the primary content items — specific findings, issues, tasks, suggestions, or distinct topics that can be acted on independently.

Output ONLY a valid JSON array (no markdown fences). Each element:
{
  "title": "short title (one line)",
  "description": "the original text of the item, copied verbatim"
}

Rules for description:
- Copy the ORIGINAL text word-for-word — do not summarize, rephrase, or shorten.
- Keep the original item numbering prefix (e.g. "1.", "2.") if present — do not strip it.
- Preserve all markdown formatting (headings, bullet lists, bold, inline code, code blocks, etc.).
- You MUST produce valid JSON: escape all double quotes as \\", backslashes as \\\\, and use \\n for newlines.
- Never include raw triple-backtick fences inside a JSON string; represent code blocks using indentation or inline code instead.

WHAT TO EXTRACT:
- Each numbered/bulleted list item that describes a specific finding, issue, task, suggestion, or distinct topic.
- Each row in a data table that describes a specific finding or issue. The "title" should be the finding summary; the "description" should include all cell contents.
- Standalone paragraphs that list additional items not covered elsewhere (e.g. "Plus N additional notes: ...").

ABSOLUTE RULE — numbered list completeness:
If the text has a numbered sequence (1., 2., 3., ... or #### 1., #### 2., #### 3., ...) you MUST extract EVERY item in that sequence. Do not skip any numbered item — even if it concludes with "OK", "this is fine", "not a real issue", "correct", or similar. A reviewer noting "this is correct" is still a distinct observation.

DO NOT EXTRACT from these specific patterns — they are meta-commentary, not primary items:
- Entire sections with \u2705 in the header or explicitly about praising good work (e.g. "\u2705 What went well"). This applies to WHOLE SECTIONS, not to individual numbered items within a review — those must still be extracted.
- Overall assessments, ratings, or introductory paragraphs that give a general impression before the detailed items begin.
- Compliance or verification tables where every row is just a feature name and a \u2705 checkmark.
- Summary tables, recap sections, or priority tables at the end of the text that restate items already detailed above.
- Sections titled "Recommended actions", "Next steps", "Synthesis", "Fixes worth doing now", or "Defer" — these consolidate items already listed.
- Section headers or dividers without substantive content.

DEDUPLICATION: after extracting, remove any item that describes the same finding or issue as another already-extracted item. When two items cover the same issue, keep only the more detailed version (usually from the earlier section) and discard the shorter recap.

If no items found — output [].`;

function doParse(text: string): { title: string; description: string }[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('Not an array');

  return parsed.filter((item: any) => typeof item.title === 'string' && typeof item.description === 'string');
}

export function parseTaskJson(raw: string): { title: string; description: string }[] {
  const text = raw.trim();

  // 1. Try direct JSON parse (no fences)
  try {
    return doParse(text);
  } catch (e) {
    // Re-throw semantic errors ("Not an array") - only retry on syntax errors
    if (e instanceof SyntaxError) {
      // Not raw JSON - try stripping markdown fence
    } else {
      throw e;
    }
  }

  // 2. Strip outermost fence using greedy match.
  //    Greedy [\s\S]* captures up to the LAST ``` - avoids cutting at inner code blocks.
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*)\n?```/);
  if (fenceMatch) {
    return doParse(fenceMatch[1].trim());
  }

  throw new SyntaxError('No valid JSON found in assistant response');
}

export async function extractTasks(
  model: Model<any>,
  auth: PiModelAuthResult,
  text: string,
  signal?: AbortSignal
): Promise<{ title: string; description: string }[]> {
  const responseText = await callLlm(model, auth, EXTRACTION_PROMPT, text, 'Extraction cancelled', signal);
  return parseTaskJson(responseText);
}
