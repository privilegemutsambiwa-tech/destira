// Scam signals in member messages (docs/destira-3-upgrade-prompt.md Part B).
// Pure and shared: the server uses it to flag senders for the console's Risk
// queue; the chat screen uses it on messages it receives to show the reader a
// safety tip. Nothing here blocks or deletes a message.
//
// Kept deliberately narrow so ordinary chat doesn't trip it: money words only
// count together with an ask ("send me", "lend me", "nditumire"), and a phone
// number or "WhatsApp" is only a tip for the reader, never a flag on its own.

export type RiskKind =
  | "money_request" // asking for money, airtime, EcoCash, bundles, gift cards
  | "investment" // crypto / forex / "guaranteed returns" pitches
  | "scam_script" // soldier abroad, oil rig, customs fee, inheritance...
  | "transactional" // sugar daddy / blesser / allowance
  | "off_platform"; // phone number, WhatsApp, Telegram early in a chat

export type RiskSeverity = "low" | "medium" | "high";

export interface RiskHit {
  kind: RiskKind;
  severity: RiskSeverity;
  /** The words that matched, with a little context, for the reviewer. */
  snippet: string;
}

const MONEY =
  /\b(eco ?cash|one ?money|inn ?bucks|airtime|data bundles?|bundles|mukuru|western union|world ?remit|money ?gram|gift ?cards?|itunes|google play cards?|steam cards?|bitcoin|btc|usdt|crypto|mari|money|cash|fees?|rent|transport money|fare)\b|\$\s?\d+|\b\d+\s?(usd|us dollars|dollars|bucks|rand|zar)\b/i;
const ASK =
  /\b(send me|send it|can you send|could you send|please send|lend me|loan me|borrow|help me with|i need|i urgently need|top me up|top up my|buy me|pay (for|my)|transfer (to|me)|nditumire(i|wo)?|ndibatsire(i|wo)?|ndikweretese(i|wo)?|ndipe(i|wo)?|ndokumbira(wo)?|ndiitire(wo)?)\b/i;
const INVESTMENT =
  /\b(investment (opportunity|platform|plan)|invest with me|trading platform|guaranteed (profits?|returns?)|double your money|forex trading|binary options?|crypto trading|mining pool|profit daily|daily profits?)\b/i;
const SCRIPT =
  /\b(peace ?keeping|deployed (in|to|abroad)|army (doctor|general|captain)|oil rig|offshore (engineer|platform|job)|un mission|inheritance|consignment|(package|parcel|box) (is )?(stuck|held|seized)|customs (fee|clearance|duty)|clearance fee|diplomat(ic)? (bag|box))\b/i;
const TRANSACTIONAL = /\b(sugar ?(daddy|mummy|mommy|baby)|blesser|blessee|monthly allowance|allowance of|spoil you financially|i will pay you(?! back)|pay you to)\b/i;
const PHONE = /(\+?263[\s-]?7[1378]\d|\b07[1378]\d)[\s-]?\d{3}[\s-]?\d{3,4}\b|\+\d[\d\s-]{9,15}\d/;
const OFF_APP = /\b(whatsapp|whats app|watsapp|wa\.me|telegram|signal app|imo app|my number is|call me on|text me on|inbox me on|add me on)\b/i;

function snippet(text: string, m: RegExpExecArray | null): string {
  if (!m) return text.slice(0, 120);
  const start = Math.max(0, m.index - 50);
  const end = Math.min(text.length, m.index + m[0].length + 50);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** Every signal in one message, most serious first. */
export function detectRisks(text: string | null | undefined): RiskHit[] {
  if (!text || typeof text !== "string") return [];
  const t = text.slice(0, 4000);
  const hits: RiskHit[] = [];
  const money = MONEY.exec(t);
  const ask = ASK.exec(t);
  if (money && ask) hits.push({ kind: "money_request", severity: "high", snippet: snippet(t, money) });
  const inv = INVESTMENT.exec(t);
  if (inv) hits.push({ kind: "investment", severity: "medium", snippet: snippet(t, inv) });
  const scr = SCRIPT.exec(t);
  if (scr) hits.push({ kind: "scam_script", severity: "medium", snippet: snippet(t, scr) });
  const tr = TRANSACTIONAL.exec(t);
  if (tr) hits.push({ kind: "transactional", severity: "medium", snippet: snippet(t, tr) });
  const off = PHONE.exec(t) ?? OFF_APP.exec(t);
  if (off) hits.push({ kind: "off_platform", severity: "low", snippet: snippet(t, off) });
  return hits;
}

/** What the person reading the message is told. One tip per kind. */
export const RISK_TIP: Record<RiskKind, string> = {
  money_request:
    "Never send money, airtime, bundles or EcoCash to someone you haven't met, whatever the reason. If they keep asking, report them.",
  investment:
    "Nobody genuine on a dating app offers you an investment or trading plan. This is how many scams start. Please report it.",
  scam_script:
    "Stories about being stuck abroad, a parcel held at customs or an inheritance are common scams. Don't send money or personal details.",
  transactional:
    "Offers of money or an allowance in return for a relationship aren't allowed on Destira. You can report this.",
  off_platform:
    "Moving to WhatsApp or sharing numbers early? Take your time. Scammers often ask to leave the app quickly, before anyone can report them.",
};

export const RISK_LABEL: Record<RiskKind | "like_burst" | "duplicate_photo" | "banned_device" | "auto_hold" | "profile_text", string> = {
  money_request: "Asked for money",
  investment: "Investment pitch",
  scam_script: "Known scam story",
  transactional: "Offered money for a relationship",
  off_platform: "Moving off the app",
  like_burst: "Liking in bulk",
  duplicate_photo: "Same photo as another account",
  banned_device: "Signed up on a banned member's phone",
  auto_hold: "Held automatically",
  profile_text: "Risky words on their profile",
};

const ORDER: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
export function worstRisk(hits: RiskHit[]): RiskHit | null {
  return [...hits].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])[0] ?? null;
}
