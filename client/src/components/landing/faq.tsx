// Landing: questions people ask.

import type React from "react";
import { ChevronDown } from "lucide-react";

// ── 9 · FAQ ──────────────────────────────────────────────────────────

export const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is Destira free?",
    a: "Yes, joining is free: your twin, Discover, matches, chat, the Lounge and free events. Paid plans add extras such as reading full twin transcripts and hosting your own events. They're paid upfront and never renew on their own.",
  },
  {
    q: "Will the AI pretend to be me?",
    a: "No. Your twin never messages anyone as you and never agrees to a date for you. It only answers questions about you, only on topics you've switched on, and you can change those any time.",
  },
  {
    q: "What is an AI twin, exactly?",
    a: "A private assistant that learns from your answers to a few questions. When someone is curious about you, they ask your twin instead of starting with a cold “hey”. It also talks to other members' twins to find people you'd get on with.",
  },
  {
    q: "Who is on Destira?",
    a: "Adults (18+) who want to actually meet people. Destira started in Harare, Zimbabwe, and anyone can join from anywhere.",
  },
  {
    q: "Do I need photos to start?",
    a: "No. You can join, answer your twin's questions and look around first. Adding photos later helps people say yes.",
  },
  {
    q: "Is my information safe?",
    a: (
      <>
        We never sell your data. You decide what your twin may discuss, you can block or report anyone, and you can download or
        delete everything from Settings.{" "}
        <a href="/privacy" className="text-vf-ember underline underline-offset-2">
          Read the privacy policy
        </a>
        .
      </>
    ),
  },
];

export function FaqItem({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <details className="group border-b border-vf-line py-1 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex items-center justify-between gap-4 cursor-pointer list-none py-4 text-[16.5px] font-medium text-vf-text">
        {q}
        <ChevronDown className="w-5 h-5 shrink-0 text-vf-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-5 -mt-1 text-[15px] leading-[1.65] text-vf-muted max-w-[62ch]">{a}</div>
    </details>
  );
}
