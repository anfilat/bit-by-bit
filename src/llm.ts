import { complete, type Model, type AssistantMessage } from '@earendil-works/pi-ai';
import type { PiModelAuthResult } from './types.js';

/**
 * Call the LLM with a system prompt and user text.
 * Validates auth, constructs the message, calls complete(), checks for abort,
 * and extracts the text response.
 */
export async function callLlm(
  model: Model<any>,
  auth: PiModelAuthResult,
  systemPrompt: string,
  userText: string,
  abortedMessage: string,
  signal?: AbortSignal
): Promise<string> {
  if (!auth.ok) {
    throw new Error(auth.error);
  }
  if (!auth.apiKey) {
    throw new Error(`No API key for ${model.provider}`);
  }

  const userMessage = {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: userText }],
    timestamp: Date.now(),
  };

  const response: AssistantMessage = await complete(
    model,
    { systemPrompt, messages: [userMessage] },
    { apiKey: auth.apiKey, headers: auth.headers, signal }
  );

  if (response.stopReason === 'aborted') {
    throw new Error(abortedMessage);
  }

  return response.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('');
}
