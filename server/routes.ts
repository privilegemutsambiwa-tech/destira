import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // Application Routes

  // Profiles
  app.get(api.profiles.me.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    res.json(profile);
  });

  app.post(api.profiles.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = api.profiles.create.input.parse(req.body);
      const userId = (req.user as any).claims.sub;
      // Ensure userId matches
      if (input.userId && input.userId !== userId) {
          return res.status(403).json({ message: "Cannot create profile for another user" });
      }
      // Force userId
      const profileData = { ...input, userId };
      
      const profile = await storage.createProfile(profileData);
      res.status(201).json(profile);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.put(api.profiles.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).claims.sub;
    // Check if updating own profile
    if (req.params.userId !== userId) return res.sendStatus(403);

    try {
      const input = api.profiles.update.input.parse(req.body);
      const updated = await storage.updateProfile(userId, input);
      res.json(updated);
    } catch (err) {
        res.status(500).json({ message: "Error updating profile" });
    }
  });

  app.get(api.profiles.get.path, async (req, res) => {
      const profile = await storage.getProfile(req.params.userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      res.json(profile);
  });

  // Generate Twin Persona (Simple simulation)
  app.post(api.profiles.generateTwin.path, async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const { answers } = req.body;
      
      // Call OpenAI to generate a persona summary
      try {
          const response = await openai.chat.completions.create({
              model: "gpt-5.1",
              messages: [
                  { role: "system", content: "You are an expert profiler. Create a dating persona summary based on the user's answers." },
                  { role: "user", content: JSON.stringify(answers) }
              ]
          });
          const twinPersona = response.choices[0].message.content || "A mysterious persona.";
          res.json({ twinPersona });
      } catch (e) {
          res.status(500).json({ message: "Failed to generate twin" });
      }
  });


  // Interviews / Chat with Twin
  app.post(api.interviews.start.path, async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const userId = (req.user as any).claims.sub;
      const { targetId } = req.body;
      const interview = await storage.createInterview(userId, targetId);
      res.status(201).json(interview);
  });

  app.post(api.interviews.chat.path, async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const { message } = req.body;
      const interviewId = parseInt(req.params.id);
      
      const interview = await storage.getInterview(interviewId);
      if (!interview) return res.status(404).json({ message: "Interview not found" });

      const targetProfile = await storage.getProfile(interview.targetId);
      if (!targetProfile) return res.status(404).json({ message: "Target profile not found" });

      // Retrieve transcript history (simulated for now)
      // In a real app, append to interview.transcript
      
      try {
          const completion = await openai.chat.completions.create({
              model: "gpt-5.1",
              messages: [
                  { role: "system", content: `You are an AI Twin for ${targetProfile.displayName}. Your persona is: ${targetProfile.twinPersona || "Friendly and open"}. Answer the user's questions as if you are ${targetProfile.displayName}.` },
                  { role: "user", content: message }
              ]
          });
          
          const response = completion.choices[0].message.content || "...";
          res.json({ response });
      } catch (e) {
          res.status(500).json({ message: "AI Twin error" });
      }
  });
  
  // Seed data function
  async function seed() {
      const groups = await storage.getGroups();
      if (groups.length === 0) {
          // Add seed groups
          // storage.createGroup... (need to implement in storage if needed)
      }
  }
  
  // We can seed on start if needed, but skipping for now to keep it simple.

  return httpServer;
}
