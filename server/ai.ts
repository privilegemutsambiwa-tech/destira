import OpenAI from "openai";

// Single shared LLM client. Hive Models' OpenAI-compatible endpoint, routed
// to DeepSeek. Credentials come from DEEPSEEK_API_KEY; without it, calls
// throw and callers fall back to canned behaviour.
export const ai = new OpenAI({
  baseURL: "https://api.thehive.ai/api/v3/",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export const AI_MODEL = "deepseek-ai/deepseek-v4.1-flash";
