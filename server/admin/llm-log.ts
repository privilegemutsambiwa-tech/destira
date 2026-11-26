// Best-effort LLM spend logging, one row per call, named by feature. Every
// call through server/ai.ts that passes `feature` lands here with its
// latency and whether it worked; the console's AI spend tile breaks it down
// per feature.
//
// Cost is ESTIMATED: from the response's usage when the SDK returns one,
// else a rough chars/4 approximation, always at the published per-token
// rate in DEEPSEEK_*_PER_1M_TOKENS_USD (defaults below). Every number this
// produces downstream is labelled "estimated" — never presented as a bill.
import { db } from "../db";
import { llmCallLog } from "@shared/schema";

const INPUT_PER_1M = Number(process.env.DEEPSEEK_INPUT_PER_1M_TOKENS_USD || "0.075");
const OUTPUT_PER_1M = Number(process.env.DEEPSEEK_OUTPUT_PER_1M_TOKENS_USD || "0.30");

export async function logLlmCall(opts: {
  callType: string;
  userId?: string | null;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } | null;
  fallbackInputText?: string;
  fallbackOutputText?: string;
  /** Wall time of the call, start to last token. */
  latencyMs?: number;
  /** "ok", or "error" when the provider failed and the feature fell back. */
  outcome?: "ok" | "error";
}) {
  try {
    let tokensIn = opts.usageMetadata?.promptTokenCount;
    let tokensOut = opts.usageMetadata?.candidatesTokenCount;
    if (tokensIn == null && opts.fallbackInputText) tokensIn = Math.ceil(opts.fallbackInputText.length / 4);
    if (tokensOut == null && opts.fallbackOutputText) tokensOut = Math.ceil(opts.fallbackOutputText.length / 4);

    const costUsd = ((tokensIn ?? 0) / 1_000_000) * INPUT_PER_1M + ((tokensOut ?? 0) / 1_000_000) * OUTPUT_PER_1M;

    await db.insert(llmCallLog).values({
      callType: opts.callType,
      userId: opts.userId ?? null,
      tokensIn: tokensIn ?? null,
      tokensOut: tokensOut ?? null,
      costUsd: costUsd.toFixed(6),
      latencyMs: opts.latencyMs ?? null,
      outcome: opts.outcome ?? "ok",
    });
  } catch (e) {
    console.error("[llm-log] failed to write:", e);
  }
}
