import type { ModelRegistry } from '@earendil-works/pi-coding-agent';
import type { Model, AssistantMessage } from '@earendil-works/pi-ai';

/**
 * Call the LLM with a system prompt and user text.
 * Constructs the message, calls modelRegistry.complete() (auth is resolved
 * at request time by the registry), checks for abort, and extracts the text response.
 */
export async function callLlm(
  model: Model<any>,
  modelRegistry: ModelRegistry,
  systemPrompt: string,
  userText: string,
  abortedMessage: string,
  signal?: AbortSignal
): Promise<string> {
  const userMessage = {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: userText }],
    timestamp: Date.now(),
  };

  const response: AssistantMessage = await modelRegistry.complete(
    model,
    { systemPrompt, messages: [userMessage] },
    { signal }
  );

  if (response.stopReason === 'aborted') {
    throw new Error(abortedMessage);
  }

  return response.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('');
}
