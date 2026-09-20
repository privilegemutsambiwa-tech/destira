import { db } from "./db";
import { questions } from "@shared/schema";
import { sql } from "drizzle-orm";

// The ten onboarding questions (isOnboardingQuestion: true) are tap-select
// (multiple_choice), not free-text — a blank textarea in a ten-question
// gate was the single biggest source of onboarding drop-off. Their options
// are curated to still give the twin real signal, and three of them
// (orderIndex 17, 53, 81) are meant to be answered as a multi-select in the
// client — see MULTI_SELECT_ORDER_INDEXES in client/src/pages/Onboarding.tsx.
// A live database already seeded before this change needs
// scripts/migrate-onboarding-tap-select.ts run once to pick this up; this
// array only affects a fresh, empty database.
const seedQuestionsData = [
  // ===== VALUES (15) =====
  // orderIndex 1 is tap-select, not free-text — see the note above
  // seedQuestionsData about why the ten onboarding questions favor options
  // over an empty textarea.
  { text: "What's the one value you'd never compromise on, even if it cost you a relationship?", category: "values", answerType: "multiple_choice", options: ["Honesty, even when it costs me", "Loyalty — showing up, no matter what", "Respect, in both directions", "My independence", "Ambition and growth", "Where I come from — family, faith, roots"], weight: 3, orderIndex: 1, isOnboardingQuestion: true },
  { text: "How do you define integrity in your daily life?", category: "values", answerType: "text", weight: 2, orderIndex: 2 },
  { text: "What does loyalty look like to you in a romantic relationship?", category: "values", answerType: "text", weight: 3, orderIndex: 3 },
  { text: "If you had to choose between financial security and doing work you love, which would you pick and why?", category: "values", answerType: "text", weight: 2, orderIndex: 4 },
  { text: "How important is honesty to you, even when the truth might hurt?", category: "values", answerType: "rating", weight: 3, orderIndex: 5 },
  { text: "What causes or social issues do you feel most passionate about?", category: "values", answerType: "text", weight: 1, orderIndex: 6 },
  { text: "How do you feel about giving back to your community or volunteering?", category: "values", answerType: "text", weight: 1, orderIndex: 7 },
  { text: "What role does faith or spirituality play in your life?", category: "values", answerType: "text", weight: 2, orderIndex: 8 },
  { text: "How do you handle situations where your values conflict with someone you care about?", category: "values", answerType: "text", weight: 2, orderIndex: 9 },
  { text: "What did your upbringing teach you about what matters most in life?", category: "values", answerType: "text", weight: 2, orderIndex: 10 },
  { text: "How important is environmental consciousness in your daily choices?", category: "values", answerType: "rating", weight: 1, orderIndex: 11 },
  { text: "What's a belief you held strongly that changed as you got older?", category: "values", answerType: "text", weight: 2, orderIndex: 12 },
  { text: "How do you feel about keeping promises, even small ones?", category: "values", answerType: "text", weight: 2, orderIndex: 13 },
  { text: "What does success mean to you beyond money and career?", category: "values", answerType: "text", weight: 2, orderIndex: 14 },
  { text: "If your partner had a very different political worldview, would that be a deal-breaker?", category: "values", answerType: "multiple_choice", options: ["Absolute deal-breaker", "Depends on the specific issues", "I'd be open to it", "I actually prefer different perspectives"], weight: 2, orderIndex: 15 },

  // ===== RELATIONSHIPS (15) =====
  { text: "What's the most important lesson a past relationship taught you?", category: "relationships", answerType: "multiple_choice", options: ["Say the hard thing before it festers", "Don't disappear into someone else", "Trust is earned in actions, not promises", "I deserve to be chosen, not just liked", "Red flags don't fix themselves", "Compromise isn't the same as losing myself"], weight: 3, orderIndex: 16, isOnboardingQuestion: true },
  // Multi-select in the client, up to 3.
  { text: "What does your ideal relationship look like on a random Tuesday evening?", category: "relationships", answerType: "multiple_choice", options: ["Cooking together, no occasion needed", "Comfortable silence in the same room", "Catching up on each other's day", "A show we're both actually into", "A walk or workout, side by side", "Deep talk, phones down", "Doing our own thing, just near each other"], weight: 2, orderIndex: 17, isOnboardingQuestion: true },
  { text: "How much personal space do you need in a relationship?", category: "relationships", answerType: "multiple_choice", options: ["A lot - I need plenty of alone time", "A healthy amount - some nights apart are good", "Not much - I love being around my partner", "It depends on the phase of the relationship"], weight: 2, orderIndex: 18 },
  { text: "What's an absolute deal-breaker for you in a partner?", category: "relationships", answerType: "text", weight: 3, orderIndex: 19 },
  { text: "How do you show someone you love them on a day-to-day basis?", category: "relationships", answerType: "text", weight: 2, orderIndex: 20 },
  { text: "What's your attachment style and how has it affected your relationships?", category: "relationships", answerType: "multiple_choice", options: ["Secure - I feel comfortable with closeness", "Anxious - I sometimes worry about being abandoned", "Avoidant - I value independence highly", "I'm not sure yet"], weight: 2, orderIndex: 21 },
  { text: "How do you feel about staying friends with exes?", category: "relationships", answerType: "text", weight: 1, orderIndex: 22 },
  { text: "What's the hardest conversation you've ever had to have with a partner?", category: "relationships", answerType: "text", weight: 2, orderIndex: 23 },
  { text: "Do you believe in soulmates, or do you think love is a choice you make every day?", category: "relationships", answerType: "text", weight: 1, orderIndex: 24 },
  { text: "How do you handle jealousy when it comes up?", category: "relationships", answerType: "text", weight: 2, orderIndex: 25 },
  { text: "What role do your friends and family play in your romantic relationships?", category: "relationships", answerType: "text", weight: 2, orderIndex: 26 },
  { text: "How long do you think you should date someone before getting serious?", category: "relationships", answerType: "text", weight: 1, orderIndex: 27 },
  { text: "What's something a partner has done that made you feel truly seen?", category: "relationships", answerType: "text", weight: 2, orderIndex: 28 },
  { text: "How important is physical affection to you in a relationship?", category: "relationships", answerType: "rating", weight: 2, orderIndex: 29 },
  { text: "What does trust look like once it's been broken - can it be rebuilt?", category: "relationships", answerType: "text", weight: 3, orderIndex: 30 },

  // ===== LIFESTYLE (12) =====
  { text: "Describe your ideal weekend - are you out adventuring or recharging at home?", category: "lifestyle", answerType: "multiple_choice", options: ["Outdoors and moving — hikes, sport, sun", "Home, slow, and unbothered", "Out with people I love", "Exploring something new in the city", "Active mornings, quiet nights"], weight: 2, orderIndex: 31, isOnboardingQuestion: true },
  { text: "How important is physical fitness and health in your daily routine?", category: "lifestyle", answerType: "rating", weight: 1, orderIndex: 32 },
  { text: "Are you a morning person or a night owl?", category: "lifestyle", answerType: "multiple_choice", options: ["Early bird - I love mornings", "Night owl - I come alive after dark", "Somewhere in between", "It changes depending on the season"], weight: 1, orderIndex: 33 },
  { text: "How do you feel about pets? Do you have any?", category: "lifestyle", answerType: "text", weight: 1, orderIndex: 34 },
  { text: "What does your work-life balance look like right now, and is it where you want it?", category: "lifestyle", answerType: "text", weight: 2, orderIndex: 35 },
  { text: "How do you like to spend money - are you a saver, spender, or somewhere in between?", category: "lifestyle", answerType: "multiple_choice", options: ["Careful saver - I budget everything", "Balanced - I save but enjoy treats", "Spontaneous spender - life is short", "Investor - I think long-term"], weight: 2, orderIndex: 36 },
  { text: "How often do you drink alcohol or use other substances?", category: "lifestyle", answerType: "multiple_choice", options: ["Never", "Socially / occasionally", "A few times a week", "I prefer not to say"], weight: 2, orderIndex: 37 },
  { text: "Do you see yourself living in a city, suburbs, or somewhere rural long-term?", category: "lifestyle", answerType: "text", weight: 1, orderIndex: 38 },
  { text: "How important is keeping a clean and organized living space to you?", category: "lifestyle", answerType: "rating", weight: 1, orderIndex: 39 },
  { text: "What hobby or passion project are you most excited about right now?", category: "lifestyle", answerType: "text", weight: 1, orderIndex: 40 },
  { text: "How do you feel about cooking? Do you meal-prep or order in?", category: "lifestyle", answerType: "text", weight: 1, orderIndex: 41 },
  { text: "What does a typical weeknight look like for you after work?", category: "lifestyle", answerType: "text", weight: 1, orderIndex: 42 },

  // ===== COMMUNICATION (10) =====
  { text: "When something bothers you in a relationship, do you bring it up right away or sit with it first?", category: "communication", answerType: "multiple_choice", options: ["Right away — I need the air clear", "I sit with it, then raise it calmly", "I process alone first — I don't always raise it", "Depends entirely on what it is"], weight: 3, orderIndex: 43, isOnboardingQuestion: true },
  { text: "How do you prefer to communicate - texting, calls, or face-to-face?", category: "communication", answerType: "multiple_choice", options: ["Texting - I like to think before responding", "Phone calls - I love hearing someone's voice", "Face-to-face - nothing beats in-person", "A mix of everything depending on the situation"], weight: 1, orderIndex: 44 },
  { text: "What does healthy conflict look like to you?", category: "communication", answerType: "text", weight: 3, orderIndex: 45 },
  { text: "How do you react when someone gives you constructive criticism?", category: "communication", answerType: "text", weight: 2, orderIndex: 46 },
  { text: "Do you tend to over-communicate or under-communicate in relationships?", category: "communication", answerType: "text", weight: 2, orderIndex: 47 },
  { text: "How important is it that your partner checks in with you throughout the day?", category: "communication", answerType: "rating", weight: 1, orderIndex: 48 },
  { text: "When you're upset, do you need space or do you want to talk it out immediately?", category: "communication", answerType: "multiple_choice", options: ["I need space to process first", "I want to talk it out right away", "It depends on what I'm upset about", "I tend to shut down and need to be drawn out gently"], weight: 2, orderIndex: 49 },
  { text: "How do you apologize when you've messed up?", category: "communication", answerType: "text", weight: 2, orderIndex: 50 },
  { text: "What's a topic you find hard to talk about but know is important?", category: "communication", answerType: "text", weight: 2, orderIndex: 51 },
  { text: "How do you feel about having difficult conversations over text versus in person?", category: "communication", answerType: "text", weight: 1, orderIndex: 52 },

  // ===== PERSONALITY (10) =====
  // Multi-select in the client, exactly 3.
  { text: "How would your closest friend describe you in three words?", category: "personality", answerType: "multiple_choice", options: ["Loyal", "Funny", "Ambitious", "Calm", "Adventurous", "Thoughtful", "Stubborn", "Warm", "Independent", "Curious", "Reliable", "Bold", "Guarded", "Generous", "Intense", "Easygoing"], weight: 2, orderIndex: 53, isOnboardingQuestion: true },
  { text: "What's a personality trait you're actively working on improving?", category: "personality", answerType: "text", weight: 2, orderIndex: 54 },
  { text: "Are you more introverted or extroverted, and how does that show up in your relationships?", category: "personality", answerType: "text", weight: 2, orderIndex: 55 },
  { text: "What's your biggest strength that you bring to a relationship?", category: "personality", answerType: "text", weight: 2, orderIndex: 56 },
  { text: "What's a quirk about you that people either love or find confusing?", category: "personality", answerType: "text", weight: 1, orderIndex: 57 },
  { text: "How do you handle stress - do you power through, take a break, or lean on others?", category: "personality", answerType: "multiple_choice", options: ["Power through it alone", "Take a break and recharge", "Talk it out with someone I trust", "Exercise or do something physical", "A mix depending on the situation"], weight: 2, orderIndex: 58 },
  { text: "What's something most people get wrong about you at first impression?", category: "personality", answerType: "text", weight: 1, orderIndex: 59 },
  { text: "How competitive are you on a scale of 1-10?", category: "personality", answerType: "rating", weight: 1, orderIndex: 60 },
  { text: "Do you consider yourself more of a thinker or a feeler when making decisions?", category: "personality", answerType: "text", weight: 2, orderIndex: 61 },
  { text: "What's the bravest thing you've ever done?", category: "personality", answerType: "text", weight: 1, orderIndex: 62 },

  // ===== EMOTIONS (10) =====
  { text: "What makes you feel most loved and appreciated?", category: "emotions", answerType: "multiple_choice", options: ["When they remember the small details", "When they show up without being asked", "When they give me room to breathe", "When they take my side, publicly", "When they just say it, out loud"], weight: 3, orderIndex: 63, isOnboardingQuestion: true },
  { text: "How comfortable are you with being vulnerable around a partner?", category: "emotions", answerType: "rating", weight: 3, orderIndex: 64 },
  { text: "What emotion do you find hardest to express?", category: "emotions", answerType: "text", weight: 2, orderIndex: 65 },
  { text: "When was the last time you cried, and what triggered it?", category: "emotions", answerType: "text", weight: 1, orderIndex: 66 },
  { text: "How do you process grief or major disappointments?", category: "emotions", answerType: "text", weight: 2, orderIndex: 67 },
  { text: "What's something that never fails to make you genuinely happy?", category: "emotions", answerType: "text", weight: 1, orderIndex: 68 },
  { text: "How do you support a partner who's going through a tough time?", category: "emotions", answerType: "text", weight: 2, orderIndex: 69 },
  { text: "Do you tend to hold grudges or forgive quickly?", category: "emotions", answerType: "multiple_choice", options: ["I forgive quickly and move on", "I forgive but I don't forget", "It takes me a while to let things go", "It depends on how deep the hurt was"], weight: 2, orderIndex: 70 },
  { text: "What's your emotional love language?", category: "emotions", answerType: "multiple_choice", options: ["Words of affirmation", "Acts of service", "Receiving gifts", "Quality time", "Physical touch"], weight: 3, orderIndex: 71, isOnboardingQuestion: true },
  { text: "How do you recharge emotionally after a draining week?", category: "emotions", answerType: "text", weight: 1, orderIndex: 72 },

  // ===== GOALS (8) =====
  { text: "Where do you see yourself in five years, and does that picture include a partner?", category: "goals", answerType: "multiple_choice", options: ["Yes — building a life with someone", "Hopefully, but I'm not chasing it", "Focused on myself and my career first", "Honestly unsure, and staying open to it"], weight: 3, orderIndex: 73, isOnboardingQuestion: true },
  { text: "Do you want kids someday, and if so, what kind of parent do you want to be?", category: "goals", answerType: "text", weight: 3, orderIndex: 74 },
  { text: "What's a personal goal you're currently chasing?", category: "goals", answerType: "text", weight: 1, orderIndex: 75 },
  { text: "How ambitious are you when it comes to your career?", category: "goals", answerType: "rating", weight: 2, orderIndex: 76 },
  { text: "What's something you want to accomplish before you turn 50?", category: "goals", answerType: "text", weight: 1, orderIndex: 77 },
  { text: "How do you feel about a partner who's more or less ambitious than you?", category: "goals", answerType: "text", weight: 2, orderIndex: 78 },
  { text: "What does financial stability look like to you?", category: "goals", answerType: "text", weight: 2, orderIndex: 79 },
  { text: "If money weren't a factor, what would you spend your life doing?", category: "goals", answerType: "text", weight: 1, orderIndex: 80 },

  // ===== COMPATIBILITY (10) =====
  // Multi-select in the client, exactly 3.
  { text: "What three qualities are non-negotiable in a partner for you?", category: "compatibility", answerType: "multiple_choice", options: ["Kindness", "Honesty", "Ambition", "Sense of humor", "Emotional intelligence", "Independence", "Loyalty", "Confidence", "Curiosity", "Stability", "Adventurousness", "Family-oriented"], weight: 3, orderIndex: 81, isOnboardingQuestion: true },
  { text: "How important is intellectual compatibility to you?", category: "compatibility", answerType: "rating", weight: 2, orderIndex: 82 },
  { text: "Do you prefer someone with similar interests or someone who introduces you to new things?", category: "compatibility", answerType: "multiple_choice", options: ["Similar interests - shared hobbies bring us closer", "Different interests - I love learning new things", "A healthy mix of both", "It doesn't really matter to me"], weight: 1, orderIndex: 83 },
  { text: "How important is physical attraction versus emotional connection for you?", category: "compatibility", answerType: "text", weight: 2, orderIndex: 84 },
  { text: "What's your ideal way to handle finances as a couple?", category: "compatibility", answerType: "multiple_choice", options: ["Fully combined - what's mine is yours", "Partially combined - shared account for bills, separate for personal", "Completely separate - we split everything", "Flexible - depends on the situation"], weight: 2, orderIndex: 85 },
  { text: "How important is it that your partner gets along with your family?", category: "compatibility", answerType: "rating", weight: 2, orderIndex: 86 },
  { text: "What's your stance on sharing passwords and phone access in a relationship?", category: "compatibility", answerType: "text", weight: 1, orderIndex: 87 },
  { text: "How do you feel about long-distance relationships?", category: "compatibility", answerType: "text", weight: 1, orderIndex: 88 },
  { text: "What role should humor play in a relationship?", category: "compatibility", answerType: "text", weight: 1, orderIndex: 89 },
  { text: "How do you feel about your partner having close friends of the gender they're attracted to?", category: "compatibility", answerType: "text", weight: 2, orderIndex: 90 },

  // ===== FUN (10) =====
  { text: "If you could live anywhere in the world for a year, where would you go and why?", category: "fun", answerType: "text", weight: 1, orderIndex: 91 },
  { text: "What's the best meal you've ever had, and what made it so special?", category: "fun", answerType: "text", weight: 1, orderIndex: 92 },
  { text: "What's your go-to karaoke song, guilty pleasure show, or comfort movie?", category: "fun", answerType: "text", weight: 1, orderIndex: 93 },
  { text: "If we went on a first date, what would your ideal plan be?", category: "fun", answerType: "text", weight: 2, orderIndex: 94 },
  { text: "What's the most spontaneous thing you've ever done?", category: "fun", answerType: "text", weight: 1, orderIndex: 95 },
  { text: "What kind of traveler are you?", category: "fun", answerType: "multiple_choice", options: ["Planner - itinerary for every day", "Go with the flow - no plans needed", "Adventure seeker - off the beaten path", "Relaxation focused - beach and spa", "Culture explorer - museums and local food"], weight: 1, orderIndex: 96 },
  { text: "What's a skill you've always wanted to learn but haven't yet?", category: "fun", answerType: "text", weight: 1, orderIndex: 97 },
  { text: "What does a perfect lazy Sunday look like with a partner?", category: "fun", answerType: "text", weight: 1, orderIndex: 98 },
  { text: "If you could have dinner with anyone - living or dead - who would it be and what would you ask?", category: "fun", answerType: "text", weight: 1, orderIndex: 99 },
  { text: "What's the weirdest hill you'll die on?", category: "fun", answerType: "text", weight: 1, orderIndex: 100 },
];

export async function seedQuestions() {
  console.log("Seeding 100 questions...");

  const batchSize = 20;
  for (let i = 0; i < seedQuestionsData.length; i += batchSize) {
    const batch = seedQuestionsData.slice(i, i + batchSize).map((q) => ({
      text: q.text,
      category: q.category,
      answerType: q.answerType,
      options: q.options ?? null,
      isOnboardingQuestion: q.isOnboardingQuestion ?? false,
      weight: q.weight,
      orderIndex: q.orderIndex,
    }));

    await db.insert(questions).values(batch);
  }

  console.log("Successfully seeded all 100 questions!");
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  (async () => {
    try {
      const existing = await db.select({ count: sql<number>`count(*)` }).from(questions);
      const count = Number(existing[0].count);
      if (count > 0) {
        console.log(`Found ${count} existing questions. Skipping seed.`);
        process.exit(0);
      }
      await seedQuestions();
      process.exit(0);
    } catch (err) {
      console.error("Seed failed:", err);
      process.exit(1);
    }
  })();
}
