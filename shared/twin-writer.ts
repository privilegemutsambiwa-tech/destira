// The profile writer (Twin Part F3): the twin offers a draft of the words
// on a profile at the moment they're missing. Drafts go into the editor on
// the profile page; nothing is saved until the member presses Save.

export const PROMPT_BANK = [
  "The last thing that made me change my mind",
  "A small thing I'd never compromise on",
  "What I'm actually looking for here",
  "Something I could talk about for an hour",
  "The way to my good side",
  "A quiet Sunday, done right",
  "What my closest friend would warn you about",
  "I get unreasonably excited about",
] as const;

/** The prompt the twin offers to help with first: the easiest to answer
 *  from what it knows. */
export const WRITER_PROMPT = "Something I could talk about for an hour";

export type WriterNeed = "bio" | "prompt";

export interface WriterStatus {
  need: WriterNeed | null;
  /** Profile strength, 0 to 100, from the same tasks as the profile page. */
  score: number;
}

/** Where a draft waits between Twin chat and the profile page's editor. */
export const WRITER_DRAFT_KEY = "vf_writer_draft";
export type WriterDraft = { kind: "bio"; text: string } | { kind: "prompt"; q: string; text: string };
