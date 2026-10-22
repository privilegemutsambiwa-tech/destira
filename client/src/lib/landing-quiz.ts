// The homepage's "meet your twin" quiz: three of the real onboarding
// questions (server/seed-questions.ts, matched by orderIndex), so a visitor's
// taps aren't a gimmick. They're kept on the device and saved as real answers
// the first time Onboarding loads after sign-up. Option text must match the
// seed exactly; Onboarding skips anything that no longer does.

export interface QuizQuestion {
  orderIndex: number;
  prompt: string;
  options: { value: string; label: string; trait: string }[];
}

export const LANDING_QUIZ: QuizQuestion[] = [
  {
    orderIndex: 31,
    prompt: "Your ideal weekend?",
    options: [
      { value: "Outdoors and moving — hikes, sport, sun", label: "Outdoors and moving", trait: "spends weekends outdoors and on the move" },
      { value: "Home, slow, and unbothered", label: "Home, slow, unbothered", trait: "protects slow, unbothered weekends at home" },
      { value: "Out with people I love", label: "Out with my people", trait: "spends weekends with the people they love" },
      { value: "Exploring something new in the city", label: "Exploring somewhere new", trait: "uses weekends to find something new in the city" },
    ],
  },
  {
    orderIndex: 17,
    prompt: "A perfect ordinary Tuesday night together?",
    options: [
      { value: "Cooking together, no occasion needed", label: "Cooking together", trait: "thinks cooking together is a perfectly good date" },
      { value: "Deep talk, phones down", label: "Deep talk, phones down", trait: "wants real conversation with the phones down" },
      { value: "A show we're both actually into", label: "A show we both love", trait: "wants a show you're both actually into" },
      { value: "Catching up on each other's day", label: "Hearing about each other's day", trait: "wants to hear about your day, properly" },
    ],
  },
  {
    orderIndex: 43,
    prompt: "Something bothers you. What do you do?",
    options: [
      { value: "Right away — I need the air clear", label: "Say it straight away", trait: "says what's on their mind straight away" },
      { value: "I sit with it, then raise it calmly", label: "Sit with it, then raise it calmly", trait: "thinks it through, then raises it calmly" },
      { value: "I process alone first — I don't always raise it", label: "Process alone first", trait: "needs a little time alone before the talk" },
      { value: "Depends entirely on what it is", label: "Depends what it is", trait: "reads the situation before raising anything" },
    ],
  },
];

/** What the twin would look for, from the conflict answer. */
const LOOKS_FOR: Record<string, string> = {
  "Right away — I need the air clear": "someone who won't take directness personally",
  "I sit with it, then raise it calmly": "someone patient enough to wait for the right moment",
  "I process alone first — I don't always raise it": "someone who gives you room before the conversation",
  "Depends entirely on what it is": "someone easy to read and easy to talk to",
};

export type QuizAnswers = Record<number, string>; // orderIndex -> option value

/** The twin's first note about the visitor, in plain words. */
export function twinNote(answers: QuizAnswers): { about: string; looksFor: string } {
  const traits = LANDING_QUIZ.map((q) => q.options.find((o) => o.value === answers[q.orderIndex])?.trait).filter(Boolean) as string[];
  const about =
    traits.length === 3
      ? `Someone who ${traits[0]}, ${traits[1]}, and ${traits[2]}.`
      : traits.length
        ? `Someone who ${traits.join(" and ")}.`
        : "";
  const looksFor = LOOKS_FOR[answers[43]] ?? "someone who fits how you actually live";
  return { about, looksFor };
}

const KEY = "destira.landingQuiz";

export function saveQuizAnswers(answers: QuizAnswers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    /* storage blocked: the answers just won't carry over */
  }
}

export function takeQuizAnswers(): QuizAnswers | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as QuizAnswers) : null;
  } catch {
    return null;
  }
}
