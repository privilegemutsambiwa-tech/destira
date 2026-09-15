import OpenAI from "openai";

// Single shared LLM client. Hive Models' OpenAI-compatible endpoint, routed
// to DeepSeek. Credentials come from DEEPSEEK_API_KEY; without it, calls
// throw and callers fall back to canned behaviour.
export const ai = new OpenAI({
  baseURL: "https://api-cdn.thehive.ai/api/v3",
  apiKey: process.env.DEEPSEEK_API_KEY,
  defaultHeaders: { Accept: "text/event-stream" },
});

export const AI_MODEL = "deepseek-ai/deepseek-v4.1-flash";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface CompletionUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
}

// Hive's /chat/completions endpoint requires stream: true — it 500s on a
// plain (non-streaming) request. Callers that just want a finished string
// (not an SSE relay to their own client) go through this: it streams from
// Hive and buffers the deltas into one result.
export async function completeText(
  messages: ChatMessage[],
  opts: { maxTokens?: number; json?: boolean } = {},
): Promise<{ text: string; usage?: CompletionUsage }> {
  const stream = await ai.chat.completions.create({
    model: AI_MODEL,
    messages,
    max_tokens: opts.maxTokens,
    response_format: opts.json ? { type: "json_object" } : undefined,
    stream: true,
  });

  let text = "";
  let usage: CompletionUsage | undefined;
  for await (const chunk of stream) {
    text += chunk.choices[0]?.delta?.content || "";
    if (chunk.usage) {
      usage = { promptTokenCount: chunk.usage.prompt_tokens, candidatesTokenCount: chunk.usage.completion_tokens };
    }
  }
  return { text, usage };
}
