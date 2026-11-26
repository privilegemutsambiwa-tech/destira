import OpenAI from "openai";
import { logLlmCall } from "./admin/llm-log";

// Single shared LLM client. Hive Models' OpenAI-compatible endpoint, routed
// to DeepSeek. Credentials come from DEEPSEEK_API_KEY; without it every call
// throws AiUnavailableError straight away (no network round trip) and each
// caller answers with its canned fallback instead.
export const ai = new OpenAI({
  baseURL: "https://api-cdn.thehive.ai/api/v3",
  apiKey: process.env.DEEPSEEK_API_KEY || "unset",
  defaultHeaders: { Accept: "text/event-stream" },
});

export const AI_MODEL = "deepseek-ai/deepseek-v4.1-flash";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface CompletionUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
}

/** Thrown before any request when no provider key is configured. */
export class AiUnavailableError extends Error {
  constructor() {
    super("AI provider not configured");
    this.name = "AiUnavailableError";
  }
}

export function aiConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY?.trim();
}

// Every reply on Destira is short: chat lines, a bio, a small JSON object.
// The cap stops a runaway generation from costing (and taking) ten times
// what the feature needs.
export const MAX_TOKENS_CAP = 1200;
const DEFAULT_MAX_TOKENS = 600;
const TIMEOUT_MS = 45_000;

type Opts = {
  maxTokens?: number;
  json?: boolean;
  presencePenalty?: number;
  frequencyPenalty?: number;
  /** Feature name for the LLM log (cost and latency per feature). */
  feature?: string;
  userId?: string | null;
};

async function openStream(messages: ChatMessage[], opts: Opts) {
  if (!aiConfigured()) throw new AiUnavailableError();
  return ai.chat.completions.create(
    {
      model: AI_MODEL,
      messages,
      max_tokens: Math.min(opts.maxTokens ?? DEFAULT_MAX_TOKENS, MAX_TOKENS_CAP),
      presence_penalty: opts.presencePenalty,
      frequency_penalty: opts.frequencyPenalty,
      response_format: opts.json ? { type: "json_object" } : undefined,
      stream: true,
    },
    { timeout: TIMEOUT_MS },
  );
}

function record(opts: Opts, messages: ChatMessage[], text: string, usage: CompletionUsage | undefined, started: number, outcome: "ok" | "error") {
  if (!opts.feature) return;
  // A call refused before anything came back (bad key, provider down) costs
  // nothing, so it's logged with zero tokens rather than an estimate.
  const refused = outcome === "error" && !text && !usage;
  logLlmCall({
    callType: opts.feature,
    userId: opts.userId ?? null,
    usageMetadata: refused ? { promptTokenCount: 0, candidatesTokenCount: 0 } : usage,
    fallbackInputText: messages.map((m) => m.content).join("\n"),
    fallbackOutputText: text,
    latencyMs: Date.now() - started,
    outcome,
  }).catch(() => {});
}

// Hive's /chat/completions endpoint requires stream: true — it 500s on a
// plain (non-streaming) request. Callers that just want a finished string
// (not an SSE relay to their own client) go through this: it streams from
// Hive and buffers the deltas into one result.
export async function completeText(messages: ChatMessage[], opts: Opts = {}): Promise<{ text: string; usage?: CompletionUsage }> {
  return streamText(messages, opts);
}

/** Streams a reply, handing each piece to onDelta as it arrives (for SSE
 *  relays), and returns the whole text. Logs latency, tokens and cost under
 *  opts.feature; a failure is logged too, then rethrown for the caller's
 *  fallback. A missing key is not logged: no call was made. */
export async function streamText(
  messages: ChatMessage[],
  opts: Opts = {},
  onDelta?: (piece: string) => void,
): Promise<{ text: string; usage?: CompletionUsage }> {
  const started = Date.now();
  let text = "";
  let usage: CompletionUsage | undefined;
  try {
    const stream = await openStream(messages, opts);
    for await (const chunk of stream) {
      const piece = chunk.choices[0]?.delta?.content || "";
      if (piece) {
        text += piece;
        onDelta?.(piece);
      }
      if (chunk.usage) {
        usage = { promptTokenCount: chunk.usage.prompt_tokens, candidatesTokenCount: chunk.usage.completion_tokens };
      }
    }
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) record(opts, messages, text, usage, started, "error");
    throw e;
  }
  record(opts, messages, text, usage, started, "ok");
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

/** The no-AI version of "refine": tidies spacing, capitalises the first
 *  letter and closes the last sentence. Never changes the words. */
export function tidyText(raw: string): string {
  let s = raw.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/ ([,.!?])/g, "$1").trim();
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
  s = s.replace(/\bi\b/g, "I");
  if (s && !/[.!?…)"'”\p{Emoji_Presentation}]$/u.test(s)) s += ".";
  return s;
}
