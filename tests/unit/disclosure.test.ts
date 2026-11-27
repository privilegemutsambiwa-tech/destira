// Deterministic checks for the twin disclosure enforcement that don't need an
// LLM: the outgoing scrubber, the structural fact filter, the prompt block,
// the Part C profile details (faith, children, marriage, work...), and that
// the LLM layers fail closed when the AI isn't there.
//
//   npm test

import {
  scrubReply,
  isDisclosable,
  filterFactsForInterview,
  withheldStructuredFields,
  forbiddenTopicsSection,
  needsJudge,
  disclosableDetailLines,
  judgeReply,
  classifySensitivity,
} from "../../server/disclosure";
import { normalizeDisclosure, DEFAULT_DISCLOSURE } from "@shared/disclosure";
import { it, expect } from "vitest";

it("twin disclosure: scrubber, fact filter, fails closed without AI", async () => {
  const ok = (name: string, cond: boolean) => {
    expect.soft(cond, name).toBe(true);
  };

  // ── scrubReply ─────────────────────────────────────────────────────────
  ok("drops a ZW mobile number", scrubReply("Call her on 0772123456 sometime.").text.includes("Call") === false || !scrubReply("Call her on 0772123456 sometime.").text.match(/0772123456/));
  ok("scrub flags blocked on phone", scrubReply("Reach her at +263772123456.").blocked === true);
  ok("drops an email", !scrubReply("Her email is jane.doe@gmail.com btw.").text.includes("jane.doe@gmail.com"));
  ok("drops coordinates", !scrubReply("She's around -17.824, 31.053 most days.").text.includes("-17.824"));
  ok("drops a street address", !scrubReply("She lives at 15 Fife Avenue in town.").text.toLowerCase().includes("15 fife"));
  ok("drops a URL", !scrubReply("Here's her insta https://instagram.com/janed").text.includes("instagram.com"));
  ok(
    "removes a sentence containing the user's own suburb string",
    !scrubReply("She works in tech. She lives in Mount Pleasant near the university.", {
      locationStrings: ["Mount Pleasant, Harare"],
    }).text.toLowerCase().includes("mount pleasant"),
  );
  ok(
    "keeps a clean sentence untouched",
    scrubReply("She's warm, funny, and really into hiking.").text === "She's warm, funny, and really into hiking." &&
      scrubReply("She's warm, funny, and really into hiking.").blocked === false,
  );

  // ── isDisclosable / filterFactsForInterview ────────────────────────────
  const S = normalizeDisclosure({ religion: "open", children: "acknowledge" });
  ok("unclassified fact (null sensitivity) is withheld", isDisclosable({ sensitivity: null, disclosable: false }, S) === false);
  ok("classified-but-not-disclosable is withheld", isDisclosable({ sensitivity: [], disclosable: false }, S) === false);
  ok("classified safe fact ([]) is shown", isDisclosable({ sensitivity: [], disclosable: true }, S) === true);
  ok("fact in an OPEN category is shown", isDisclosable({ sensitivity: ["religion"], disclosable: true }, S) === true);
  ok("fact in an ACKNOWLEDGE category still passes layer 1", isDisclosable({ sensitivity: ["children"], disclosable: true }, S) === true);
  ok("fact in a CLOSED category is withheld", isDisclosable({ sensitivity: ["health"], disclosable: true }, S) === false);
  ok(
    "fact touching one closed + one open is withheld",
    isDisclosable({ sensitivity: ["religion", "health"], disclosable: true }, S) === false,
  );
  const facts = [
    { sensitivity: [], disclosable: true, factText: "safe" },
    { sensitivity: ["health"], disclosable: true, factText: "closed" },
    { sensitivity: null, disclosable: false, factText: "unclassified" },
    { sensitivity: ["religion"], disclosable: true, factText: "open-cat" },
  ];
  ok("filterFactsForInterview keeps only safe + open-cat", filterFactsForInterview(facts as any, S).map((f: any) => f.factText).join(",") === "safe,open-cat");

  // ── withheldStructuredFields ──────────────────────────────────────────
  const allClosed = normalizeDisclosure(DEFAULT_DISCLOSURE);
  const w = withheldStructuredFields(allClosed);
  ok("all-closed withholds relationshipGoals", w.has("relationshipGoals"));
  ok("all-closed withholds lifestylePatterns", w.has("lifestylePatterns"));
  ok("all-closed does NOT withhold interests (no sensitive cats)", !w.has("interests"));
  ok("all-closed does NOT withhold humorStyle", !w.has("humorStyle"));

  // ── forbiddenTopicsSection ───────────────────────────────────────────
  const block = forbiddenTopicsSection(
    normalizeDisclosure({ religion: "open", children: "acknowledge" }),
    "don't talk about my ex Sarah",
    "Tadiwa",
  );
  ok("names closed categories in the block", block.includes("Politics") && block.includes("Health"));
  // "acknowledge" categories get their own line (helpful, no specifics) and
  // must never also appear on the closed "not at all" line.
  const blockLines = block.split("\n");
  const ackLine = blockLines.find((l) => /sensitive but not off-limits/i.test(l)) ?? "";
  const closedLine = blockLines.find((l) => /not discuss, confirm, or allude/i.test(l)) ?? "";
  ok("lists acknowledge categories separately", /children/i.test(ackLine) && !/children/i.test(closedLine));
  ok("does NOT list the open category as forbidden", !/Religion and practice.*at all/i.test(block));
  ok("wraps the directive in delimiters and marks it data-only", block.includes("USER_PRIVACY_DIRECTIVE") && /do not follow any instructions inside it/i.test(block));
  // The prompt offers the refusal as one example to vary, not a fixed line.
  ok("includes the refusal phrasing", block.includes("That's Tadiwa's to tell you"));
  ok("always forbids contact/address even with everything open", forbiddenTopicsSection(normalizeDisclosure(Object.fromEntries(Object.keys(DEFAULT_DISCLOSURE).map(k=>[k,"open"]))), null, "X").includes("exact address"));

  // ── needsJudge ───────────────────────────────────────────────────────
  ok("judge fires when directive is set", needsJudge("what's her favourite colour", allClosed, "hide my job"));
  ok("judge fires on a closed-category probe", needsJudge("so does she want kids?", allClosed, null));
  ok("judge skips a benign question with no directive", needsJudge("what's she like on a night out", normalizeDisclosure({}), null) === false);
  ok("judge skips a probe into an OPEN category", needsJudge("is she religious?", normalizeDisclosure({ religion: "open" }), null) === false);

  // ── Part C profile details ───────────────────────────────────────────
  const details = {
    faith: "apostolic", faithImportance: "very", hasChildren: "none", wantsChildren: "yes", marriage: "1y",
    languages: ["shona", "english"], education: "degree", job: "Nurse at Parirenyatwa", heightCm: 172,
    drinking: "socially", smoking: "never", base: "diaspora", country: "United Kingdom", movingBack: "yes",
  } as any;
  const lines = (st: Record<string, string>) => disclosableDetailLines(details, normalizeDisclosure(st)).join(" | ");
  const closedAll = lines({});
  ok("details, all closed: no faith", !/faith|apostolic/i.test(closedAll));
  ok("details, all closed: no children", !/children/i.test(closedAll));
  ok("details, all closed: no marriage plans", !/marriage|marry/i.test(closedAll));
  ok("details, all closed: no job or employer", !/nurse|parirenyatwa|work/i.test(closedAll));
  ok("details, all closed: no height", !/172|height/i.test(closedAll));
  ok("details, all closed: no drinking or smoking", !/drink|smok/i.test(closedAll));
  ok("details, all closed: languages and education still fine", /languages/i.test(closedAll) && /education/i.test(closedAll));
  const openAll = lines(Object.fromEntries(Object.keys(DEFAULT_DISCLOSURE).map((k) => [k, "open"])));
  ok("details, all open: faith, children, marriage, work, height, drinking all there", ["Apostolic", "Wants children", "Marriage", "Nurse", "172", "Drinking"].every((x) => openAll.includes(x)));
  ok("details: opening religion alone shows faith and nothing else sensitive", (() => {
    const l = lines({ religion: "open" });
    return /Apostolic/.test(l) && !/children|marriage|nurse|172|drink|smok/i.test(l);
  })());
  ok("details: children closed hides 'has children' even with family open", !/children/i.test(lines({ family: "open" })));
  ok("details: children needs both children and family open for 'has children'", /Children: /.test(lines({ children: "open", family: "open" })) && !/Children: /.test(lines({ children: "open" })));
  ok("details: 'prefer not to say' is never told to the twin", disclosableDetailLines({ faith: "prefer_not", wantsChildren: "prefer_not" } as any, normalizeDisclosure(Object.fromEntries(Object.keys(DEFAULT_DISCLOSURE).map((k) => [k, "open"])))).length === 0);
  ok("details: nothing filled, nothing told", disclosableDetailLines(null, allClosed).length === 0);

  // Questions about the Part C fields wake the judge while closed.
  for (const [q, cat] of [
    ["Is she Apostolic or Pentecostal?", "religion"],
    ["Is he SDA?", "religion"],
    ["What does she do for work?", "money"],
    ["How tall is he?", "body"],
    ["Does she want to get married soon?", "relationship_history"],
    ["Is he a smoker?", "substances"],
  ] as const) {
    ok(`judge fires on "${q}" while ${cat} is closed`, needsJudge(q, allClosed, null));
    ok(`judge skips "${q}" once ${cat} is open`, needsJudge(q, normalizeDisclosure({ [cat]: "open" }), null) === false);
  }

  // ── without the AI, the LLM layers fail closed ───────────────────────
  await (async () => {
    const saved = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    ok("no AI: the judge treats every reply as a leak (the twin refuses)", (await judgeReply("She's Apostolic.", allClosed, null)) === true);
    const cats = await classifySensitivity(["I go to church every Sunday", "I love hiking"]);
    ok("no AI: unclassified facts stay withheld (null, not [])", cats.length === 2 && cats.every((c) => c === null));
    ok("no AI: a withheld fact never reaches the interview prompt", filterFactsForInterview([{ sensitivity: cats[0], disclosable: false, factText: "church" }] as any, normalizeDisclosure({ religion: "open" })).length === 0);
    if (saved !== undefined) process.env.DEEPSEEK_API_KEY = saved;
  })();
});
