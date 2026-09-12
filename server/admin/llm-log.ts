// Best-effort LLM spend logging. Wraps the handful of highest-volume call
// sites (twin chat, interview chat) — NOT every AI call in routes.ts yet
// (about-me / summary generation, memory extraction, disclosure
// classify/judge are still unlogged). The aggregate daily number this
// produces is real; a per-call-type breakdown is a deliberate v2, not built
// here — see the build report.
//
// Cost is ESTIMATED: from the response's usageMetadata when the SDK returns
// one, else a rough chars/4 approximation, always at the published per-token
// rate in GEMINI_*_PER_1M_TOKENS_USD (defaults below). Every number this
// produces downstream is labelled "estimated" — never presented as a bill.
import { db } from "../db";
import { llmCallLog } from "@shared/schema";

const INPUT_PER_1M = Number(process.env.GEMINI_INPUT_PER_1M_TOKENS_USD || "0.075");
const OUTPUT_PER_1M = Number(process.env.GEMINI_OUTPUT_PER_1M_TOKENS_USD || "0.30");

export async function logLlmCall(opts: {
  callType: string;
  userId?: string | null;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } | null;
  fallbackInputText?: string;
  fallbackOutputText?: string;
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
    });
  } catch (e) {
    console.error("[llm-log] failed to write:", e);
  }
}
