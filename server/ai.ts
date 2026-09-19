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
  opts: { maxTokens?: number; json?: boolean; presencePenalty?: number; frequencyPenalty?: number } = {},
): Promise<{ text: string; usage?: CompletionUsage }> {
  const stream = await ai.chat.completions.create({
    model: AI_MODEL,
    messages,
    max_tokens: opts.maxTokens,
    presence_penalty: opts.presencePenalty,
    frequency_penalty: opts.frequencyPenalty,
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

const WRAPPER_PREFIXES = [
  /^(sure[,!]?\s*)?here'?s (your |the )?(refined|polished|revised) (text|version|bio|answer)[:\-]?\s*/i,
  /^(refined|polished|revised) (text|version)[:\-]?\s*/i,
];
const MATCHING_QUOTES: Record<string, string> = { '"': '"', "'": "'", "“": "”", "‘": "’" };

// Models wrap output in quotes, "Here's your refined text:", or a markdown
// fence despite being told not to. Strip that here rather than trusting the
// prompt.
export function stripAiWrapper(raw: string): string {
  let out = raw.trim();
  out = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  for (const re of WRAPPER_PREFIXES) out = out.replace(re, "");
  out = out.trim();
  if (out.length >= 2 && MATCHING_QUOTES[out[0]] === out[out.length - 1]) {
    out = out.slice(1, -1).trim();
  }
  return out;
}
