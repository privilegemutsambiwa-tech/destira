// Group games engine: the poll pattern (server/storage.ts's createPoll/
// getPoll/votePoll), generalized to support a reveal MOMENT and, for some
// kinds, a hidden answer. A game is a groupMessages row (contentType:
// "game") pointing at a groupGames row; players upsert into
// groupGameResponses; this file is the ONLY place config/response payloads
// are interpreted, sanitized, or scored — no other module should read
// groupGames.config or groupGameResponses.response directly.
import { db } from "./db";
import {
  groupGames, groupGameResponses, groupMessages, groupMembers,
  type GroupGame, type GroupGameResponse, type GroupGameKind,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { storage } from "./storage";
import {
  WOULD_YOU_RATHER_BANK, THIS_OR_THAT_BANK, NEVER_HAVE_I_EVER_BANK,
  MOST_LIKELY_TO_BANK, TRIVIA_BANK, CATEGORY_SPRINT_BANK,
  EMOJI_CHARADES_BANK, ICEBREAKER_BANK,
} from "./group-game-content";

export class GameNotFoundError extends Error {
  constructor() { super("Game not found"); }
}
export class NotGroupMemberError extends Error {
  constructor() { super("Must be a member of this group"); }
}
export class GameNotActiveError extends Error {
  constructor() { super("This round is already over"); }
}
export class NotEligibleError extends Error {
  constructor(msg = "You're not part of this round") { super(msg); }
}
export class InvalidSetupError extends Error {
  constructor(msg: string) { super(msg); }
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickMany<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}
function norm(s: string): string {
  return s.trim().toLowerCase();
}

interface MemberRef { userId: string; nickname: string }
interface BuildCtx { starterId: string; members: MemberRef[] }
type Responses = { userId: string; nickname: string; response: any }[];

interface GameDefinition {
  label: string;
  blurb: string;
  needsSetup: boolean;
  buildConfig(setup: any, ctx: BuildCtx): any;
  // Whether config carries a field that must be hidden from players pre-reveal.
  hasSecret: boolean;
  // If hasSecret, does the person who started the round already know it
  // (they authored it) — true for two_truths/emoji_charades, false for
  // trivia (nobody in the group authored those questions).
  starterKnowsSecret: boolean;
  sanitizeConfig(config: any, revealed: boolean): any;
  // Does the starter also submit a response (play), or only set the round up?
  starterParticipates: boolean;
  revealMode: "all-responded" | "timer" | "manual-or-timer" | "never-gated";
  timerMs?: number;
  computeResults(config: any, responses: Responses): any;
}

const DEFINITIONS: Record<GroupGameKind, GameDefinition> = {
  two_truths_one_lie: {
    label: "Two Truths and a Lie",
    blurb: "Write 3 statements about yourself — everyone guesses the lie.",
    needsSetup: true,
    starterKnowsSecret: true,
    hasSecret: true,
    starterParticipates: false,
    revealMode: "all-responded",
    buildConfig(setup) {
      const statements: unknown = setup?.statements;
      const lieIndex: unknown = setup?.lieIndex;
      if (!Array.isArray(statements) || statements.length !== 3 || statements.some((s) => typeof s !== "string" || !s.trim())) {
        throw new InvalidSetupError("Write exactly 3 non-empty statements.");
      }
      if (lieIndex !== 0 && lieIndex !== 1 && lieIndex !== 2) {
        throw new InvalidSetupError("Pick which statement (0, 1 or 2) is the lie.");
      }
      return { statements: statements.map((s: string) => s.trim().slice(0, 200)), lieIndex };
    },
    sanitizeConfig(config, revealed) {
      return revealed ? config : { statements: config.statements };
    },
    computeResults(config, responses) {
      const correctGuessers = responses.filter((r) => r.response?.guessIndex === config.lieIndex).map((r) => r.nickname);
      return { lieIndex: config.lieIndex, correctGuessers, guesses: responses.map((r) => ({ nickname: r.nickname, guessIndex: r.response?.guessIndex })) };
    },
  },

  would_you_rather: {
    label: "Would You Rather",
    blurb: "Pick two options — everyone votes A or B.",
    needsSetup: false,
    starterKnowsSecret: false,
    hasSecret: false,
    starterParticipates: true,
    revealMode: "all-responded",
    buildConfig(setup) {
      if (setup?.a && setup?.b) return { a: String(setup.a).slice(0, 140), b: String(setup.b).slice(0, 140) };
      return pick(WOULD_YOU_RATHER_BANK);
    },
    sanitizeConfig(config) { return config; },
    computeResults(config, responses) {
      const aCount = responses.filter((r) => r.response?.choice === "a").length;
      const bCount = responses.filter((r) => r.response?.choice === "b").length;
      const total = aCount + bCount || 1;
      return { aCount, bCount, aPct: Math.round((aCount / total) * 100), bPct: Math.round((bCount / total) * 100) };
    },
  },

  this_or_that: {
    label: "This or That",
    blurb: "A rapid-fire burst of 5 either/or picks.",
    needsSetup: false,
    starterKnowsSecret: false,
    hasSecret: false,
    starterParticipates: true,
    revealMode: "all-responded",
    buildConfig() {
      return { pairs: pickMany(THIS_OR_THAT_BANK, 5) };
    },
    sanitizeConfig(config) { return config; },
    computeResults(config, responses) {
      const pairs = config.pairs as { a: string; b: string }[];
      return pairs.map((p, i) => {
        const aCount = responses.filter((r) => r.response?.choices?.[i] === "a").length;
        const bCount = responses.filter((r) => r.response?.choices?.[i] === "b").length;
        return { ...p, aCount, bCount };
      });
    },
  },

  never_have_i_ever: {
    label: "Never Have I Ever",
    blurb: "One statement — everyone says whether they have or haven't.",
    needsSetup: false,
    starterKnowsSecret: false,
    hasSecret: false,
    starterParticipates: true,
    revealMode: "timer",
    timerMs: 10 * 60 * 1000,
    buildConfig(setup) {
      if (typeof setup?.statement === "string" && setup.statement.trim()) return { statement: setup.statement.trim().slice(0, 200) };
      return { statement: pick(NEVER_HAVE_I_EVER_BANK) };
    },
    sanitizeConfig(config) { return config; },
    computeResults(config, responses) {
      const haveCount = responses.filter((r) => r.response?.choice === "have").length;
      const haventCount = responses.filter((r) => r.response?.choice === "havent").length;
      return { haveCount, haventCount };
    },
  },

  most_likely_to: {
    label: "Most Likely To",
    blurb: "Vote for the group member who fits a (curated, friendly) prompt.",
    needsSetup: true,
    starterKnowsSecret: false,
    hasSecret: false,
    starterParticipates: true,
    revealMode: "all-responded",
    buildConfig(setup, ctx) {
      const idx = setup?.promptIndex;
      // Deliberately ignores any client-supplied prompt TEXT — this kind
      // only ever uses the curated bank, never a free-text prompt, so a
      // player can't turn it into something unkind (see plan's guardrail).
      if (typeof idx !== "number" || idx < 0 || idx >= MOST_LIKELY_TO_BANK.length) {
        throw new InvalidSetupError("Pick a prompt from the list.");
      }
      return { prompt: MOST_LIKELY_TO_BANK[idx], candidates: ctx.members.filter((m) => m.userId !== ctx.starterId) };
    },
    sanitizeConfig(config) { return config; },
    computeResults(config, responses) {
      const counts = new Map<string, number>();
      for (const r of responses) {
        const target = r.response?.targetUserId;
        if (typeof target === "string") counts.set(target, (counts.get(target) ?? 0) + 1);
      }
      const candidates = config.candidates as MemberRef[];
      const tally = candidates.map((c) => ({ userId: c.userId, nickname: c.nickname, votes: counts.get(c.userId) ?? 0 }));
      tally.sort((a, b) => b.votes - a.votes);
      const winner = tally.length && tally[0].votes > 0 ? tally[0] : null;
      return { winner, tally };
    },
  },

  trivia_round: {
    label: "Trivia Round",
    blurb: "5 quick multiple-choice questions, scored.",
    needsSetup: false,
    starterKnowsSecret: false, // nobody in the group authored these — hidden from everyone, including the starter
    hasSecret: true,
    starterParticipates: true,
    revealMode: "all-responded",
    timerMs: 3 * 60 * 1000,
    buildConfig() {
      return { questions: pickMany(TRIVIA_BANK, 5) };
    },
    sanitizeConfig(config, revealed) {
      if (revealed) return config;
      return { questions: config.questions.map((q: any) => ({ question: q.question, options: q.options })) };
    },
    computeResults(config, responses) {
      const correctIndexes = config.questions.map((q: any) => q.correctIndex);
      const scores = responses.map((r) => {
        const answers: number[] = Array.isArray(r.response?.answers) ? r.response.answers : [];
        const score = correctIndexes.filter((ci: number, i: number) => answers[i] === ci).length;
        return { userId: r.userId, nickname: r.nickname, score };
      });
      scores.sort((a, b) => b.score - a.score);
      return { correctIndexes, scores };
    },
  },

  category_sprint: {
    label: "Category Sprint",
    blurb: "Name as many things as you can in a category before time's up.",
    needsSetup: false,
    starterKnowsSecret: false,
    hasSecret: false,
    starterParticipates: true,
    revealMode: "timer",
    // A true per-player "90s from when THEY open it" timer needs realtime
    // infra this app doesn't have; simplified to one shared round window
    // from when the round is posted, which is a fair approximation at this
    // app's scale and traffic pattern (see plan's realtime-infra note).
    timerMs: 90 * 1000,
    buildConfig() {
      return { category: pick(CATEGORY_SPRINT_BANK) };
    },
    sanitizeConfig(config) { return config; },
    computeResults(_config, responses) {
      const itemsByUser = responses.map((r) => ({
        userId: r.userId,
        nickname: r.nickname,
        items: (Array.isArray(r.response?.items) ? r.response.items : []).map((i: string) => String(i).trim()).filter(Boolean),
      }));
      const countAcrossOthers = (userId: string, item: string) =>
        itemsByUser.filter((u) => u.userId !== userId).some((u) => u.items.some((i) => norm(i) === norm(item)));
      const leaderboard = itemsByUser
        .map((u) => ({
          userId: u.userId,
          nickname: u.nickname,
          items: u.items,
          uniqueCount: u.items.filter((i) => !countAcrossOthers(u.userId, i)).length,
        }))
        .sort((a, b) => b.uniqueCount - a.uniqueCount);
      return { leaderboard };
    },
  },

  emoji_charades: {
    label: "Emoji Charades",
    blurb: "Act out a movie/show/phrase in emoji — others guess.",
    needsSetup: true,
    starterKnowsSecret: true,
    hasSecret: true,
    starterParticipates: false,
    revealMode: "manual-or-timer",
    timerMs: 10 * 60 * 1000,
    buildConfig(setup) {
      if (setup?.fromBank) return pick(EMOJI_CHARADES_BANK);
      const emoji = typeof setup?.emoji === "string" ? setup.emoji.trim().slice(0, 40) : "";
      const answer = typeof setup?.answer === "string" ? setup.answer.trim().slice(0, 100) : "";
      if (!emoji || !answer) throw new InvalidSetupError("Give an emoji clue and an answer.");
      return { emoji, answer };
    },
    sanitizeConfig(config, revealed) {
      return revealed ? config : { emoji: config.emoji };
    },
    computeResults(config, responses) {
      const correct = responses.filter((r) => typeof r.response?.guess === "string" && norm(r.response.guess) === norm(config.answer));
      return {
        answer: config.answer,
        correctGuessers: correct.map((r) => r.nickname),
        allGuesses: responses.map((r) => ({ nickname: r.nickname, guess: r.response?.guess })),
      };
    },
  },

  icebreaker_roulette: {
    label: "Icebreaker Roulette",
    blurb: "One fun prompt — no scoring, just conversation.",
    needsSetup: false,
    starterKnowsSecret: false,
    hasSecret: false,
    starterParticipates: true,
    revealMode: "never-gated", // responses are visible as they arrive — see getGameState
    buildConfig() {
      return { prompt: pick(ICEBREAKER_BANK) };
    },
    sanitizeConfig(config) { return config; },
    computeResults() { return null; },
  },
};

export function listGameKinds() {
  return (Object.keys(DEFINITIONS) as GroupGameKind[]).map((kind) => ({
    kind,
    label: DEFINITIONS[kind].label,
    blurb: DEFINITIONS[kind].blurb,
    needsSetup: DEFINITIONS[kind].needsSetup,
  }));
}

// Static bank previews the client needs to build a setup form (e.g. the
// Most Likely To prompt picker, the "start from the bank" option for kinds
// that allow either a bank pick or a custom one).
export function getBankPreview(kind: GroupGameKind) {
  switch (kind) {
    case "most_likely_to": return MOST_LIKELY_TO_BANK.map((prompt, promptIndex) => ({ promptIndex, prompt }));
    case "emoji_charades": return EMOJI_CHARADES_BANK.map((e) => ({ emoji: e.emoji }));
    default: return null;
  }
}

async function requireMember(groupId: number, userId: string): Promise<MemberRef> {
  const member = await storage.getGroupMember(groupId, userId);
  if (!member) throw new NotGroupMemberError();
  return { userId, nickname: member.nickname || "Someone" };
}

export async function createGame(groupId: number, userId: string, kind: GroupGameKind, setup: any): Promise<GroupGame> {
  const def = DEFINITIONS[kind];
  if (!def) throw new InvalidSetupError("Unknown game.");
  const starter = await requireMember(groupId, userId);
  const memberRows = await storage.getGroupMembers(groupId);
  const members: MemberRef[] = memberRows.map((m) => ({ userId: m.userId, nickname: m.nickname || "Someone" }));

  const config = def.buildConfig(setup, { starterId: userId, members });
  const revealAt = def.revealMode === "timer" || def.revealMode === "manual-or-timer"
    ? new Date(Date.now() + (def.timerMs ?? 5 * 60 * 1000))
    : null;

  const [msg] = await db.insert(groupMessages).values({
    groupId,
    userId,
    nickname: starter.nickname,
    content: def.label,
    contentType: "game",
  }).returning();

  const [game] = await db.insert(groupGames).values({
    groupId,
    messageId: msg.id,
    kind,
    startedBy: userId,
    config,
    revealAt,
  }).returning();

  return game;
}

function eligibleCount(def: GameDefinition, members: MemberRef[], startedBy: string): number {
  return def.starterParticipates ? members.length : Math.max(members.length - 1, 0);
}

async function maybeReveal(game: GroupGame): Promise<GroupGame> {
  if (game.status === "revealed") return game;
  const def = DEFINITIONS[game.kind as GroupGameKind];
  if (!def) return game;

  const memberRows = await storage.getGroupMembers(game.groupId);
  const members: MemberRef[] = memberRows.map((m) => ({ userId: m.userId, nickname: m.nickname || "Someone" }));
  const responses = await db.select().from(groupGameResponses).where(eq(groupGameResponses.gameId, game.id));

  const allResponded = responses.length >= eligibleCount(def, members, game.startedBy);
  const timerPassed = game.revealAt != null && game.revealAt.getTime() <= Date.now();

  const shouldReveal =
    def.revealMode === "all-responded" ? allResponded :
    def.revealMode === "timer" ? (allResponded || timerPassed) :
    def.revealMode === "manual-or-timer" ? timerPassed :
    false; // "never-gated" kinds don't have a reveal moment

  if (!shouldReveal) return game;

  const withNicknames: Responses = responses.map((r) => ({ userId: r.userId, nickname: r.nickname, response: r.response }));
  const results = def.computeResults(game.config, withNicknames);
  const [updated] = await db.update(groupGames)
    .set({ status: "revealed", results, revealedAt: new Date() })
    .where(eq(groupGames.id, game.id))
    .returning();
  return updated;
}

export async function submitResponse(gameId: number, userId: string, response: any): Promise<GroupGame> {
  const [game] = await db.select().from(groupGames).where(eq(groupGames.id, gameId));
  if (!game) throw new GameNotFoundError();
  const def = DEFINITIONS[game.kind as GroupGameKind];
  if (!def) throw new GameNotFoundError();
  if (game.status !== "active") throw new GameNotActiveError();

  const member = await storage.getGroupMember(game.groupId, userId);
  if (!member) throw new NotGroupMemberError();
  if (!def.starterParticipates && userId === game.startedBy) throw new NotEligibleError("The round's host doesn't also play this one.");

  await db.insert(groupGameResponses)
    .values({ gameId, userId, nickname: member.nickname || "Someone", response })
    .onConflictDoUpdate({ target: [groupGameResponses.gameId, groupGameResponses.userId], set: { response } });

  return maybeReveal(game);
}

// Starter-only early reveal, for kinds where guesses can keep trickling in
// with no natural "everyone's answered" moment (emoji_charades).
export async function revealNow(gameId: number, userId: string): Promise<GroupGame> {
  const [game] = await db.select().from(groupGames).where(eq(groupGames.id, gameId));
  if (!game) throw new GameNotFoundError();
  if (game.startedBy !== userId) throw new NotEligibleError("Only whoever started this round can reveal it early.");
  if (game.status === "revealed") return game;
  const def = DEFINITIONS[game.kind as GroupGameKind];
  const responses = await db.select().from(groupGameResponses).where(eq(groupGameResponses.gameId, game.id));
  const withNicknames: Responses = responses.map((r) => ({ userId: r.userId, nickname: r.nickname, response: r.response }));
  const results = def.computeResults(game.config, withNicknames);
  const [updated] = await db.update(groupGames)
    .set({ status: "revealed", results, revealedAt: new Date() })
    .where(eq(groupGames.id, gameId))
    .returning();
  return updated;
}

export interface GameStateView {
  id: number;
  groupId: number;
  kind: GroupGameKind;
  label: string;
  startedBy: string;
  status: string;
  config: any;
  myResponse: any | null;
  responseCount: number;
  eligibleCount: number;
  results: any | null;
  canRevealEarly: boolean;
}

export async function getGameState(gameId: number, viewerId: string): Promise<GameStateView> {
  let [game] = await db.select().from(groupGames).where(eq(groupGames.id, gameId));
  if (!game) throw new GameNotFoundError();
  const member = await storage.getGroupMember(game.groupId, viewerId);
  if (!member) throw new NotGroupMemberError();

  game = await maybeReveal(game);
  const def = DEFINITIONS[game.kind as GroupGameKind];
  const revealed = game.status === "revealed";
  const showLive = def.revealMode === "never-gated";

  const responses = await db.select().from(groupGameResponses).where(eq(groupGameResponses.gameId, game.id));
  const mine = responses.find((r) => r.userId === viewerId);

  const memberRows = await storage.getGroupMembers(game.groupId);
  const members: MemberRef[] = memberRows.map((m) => ({ userId: m.userId, nickname: m.nickname || "Someone" }));

  const starterSeesSecret = def.starterKnowsSecret && viewerId === game.startedBy;
  const sanitizedConfig = def.sanitizeConfig(game.config, revealed || starterSeesSecret);

  return {
    id: game.id,
    groupId: game.groupId,
    kind: game.kind as GroupGameKind,
    label: def.label,
    startedBy: game.startedBy,
    status: game.status,
    config: sanitizedConfig,
    myResponse: mine?.response ?? null,
    responseCount: responses.length,
    eligibleCount: eligibleCount(def, members, game.startedBy),
    results: revealed ? game.results : showLive ? { live: responses.map((r) => ({ nickname: r.nickname, response: r.response })) } : null,
    canRevealEarly: def.revealMode === "manual-or-timer" && viewerId === game.startedBy && !revealed,
  };
}

export async function getGameByMessageId(messageId: number, viewerId: string): Promise<GameStateView | undefined> {
  const [game] = await db.select().from(groupGames).where(eq(groupGames.messageId, messageId));
  if (!game) return undefined;
  return getGameState(game.id, viewerId);
}
