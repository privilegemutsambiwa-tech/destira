import { GoogleGenAI } from "@google/genai";

// Single shared Vertex AI client. Credentials come from GOOGLE_VERTEX_SA_JSON;
// without it, calls throw and callers fall back to canned behaviour.
export const ai = new GoogleGenAI({
  vertexai: true,
  project: "gen-lang-client-0303273462",
  location: "us-central1",
});
