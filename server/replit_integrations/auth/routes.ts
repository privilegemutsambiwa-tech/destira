import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated, createSessionUser } from "./replitAuth";
import { hashPassword, verifyPassword } from "./password";
import { supabaseAuthClient } from "./supabase";
import type { User } from "@shared/models/auth";
import * as referrals from "../../referrals";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// No cookie-parser in the app — pull one cookie value straight off the header.
function readCookie(req: any, name: string): string | null {
  const raw = req.headers?.cookie;
  if (typeof raw !== "string") return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function sanitizeUser(user: User) {
  const { passwordHash, ...safe } = user as User & { passwordHash?: string | null };
  return safe;
}

// Basic brute-force guard: too many failed attempts for one email locks it
// out for a window, regardless of which password is tried next.
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function isLockedOut(key: string): boolean {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(key: string) {
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() - entry.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: Date.now() });
  } else {
    entry.count += 1;
  }
}

function clearAttempts(key: string) {
  loginAttempts.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts.entries()) {
    if (now - entry.firstAttempt > ATTEMPT_WINDOW_MS) loginAttempts.delete(key);
  }
}, 5 * 60 * 1000);

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/auth/signup", async (req: any, res) => {
    try {
      const { email, password, name } = req.body || {};
      if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalizedEmail)) {
        return res.status(400).json({ message: "Enter a valid email address" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const existing = await authStorage.getUserByEmail(normalizedEmail);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      let firstName: string | undefined;
      let lastName: string | undefined;
      if (typeof name === "string" && name.trim()) {
        const parts = name.trim().split(/\s+/);
        firstName = parts.shift();
        lastName = parts.length ? parts.join(" ") : undefined;
      }

      const passwordHash = await hashPassword(password);
      let user: User;
      try {
        user = await authStorage.createUser({
          email: normalizedEmail,
          passwordHash,
          firstName,
          lastName,
        });
      } catch (err: any) {
        // Race with another signup for the same email between the check
        // above and the insert — the unique index on users.email is the
        // real guard.
        if (err?.code === "23505") {
          return res.status(409).json({ message: "An account with this email already exists" });
        }
        throw err;
      }

      req.login(createSessionUser(user), (err: any) => {
        if (err) {
          console.error("[signup] req.login failed:", err);
          return res.status(500).json({ message: "Account created, but sign-in failed. Please log in." });
        }
        // Attribute a referral if the visitor arrived via ?ref=CODE.
        const refCode = readCookie(req, "vf_ref");
        if (refCode) {
          referrals
            .attachReferral(user.id, refCode)
            .then((r) => { if (r.ok) return referrals.checkQualification(user.id); })
            .catch(() => {});
          res.setHeader("Set-Cookie", "vf_ref=; Path=/; Max-Age=0; SameSite=Lax");
        }
        res.status(201).json(sanitizeUser(user));
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req: any, res) => {
    try {
      const { email, password } = req.body || {};
      if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const normalizedEmail = email.trim().toLowerCase();

      if (isLockedOut(normalizedEmail)) {
        return res.status(429).json({ message: "Too many attempts. Try again in a few minutes." });
      }

      const user = await authStorage.getUserByEmail(normalizedEmail);
      const valid = user ? await verifyPassword(password, user.passwordHash) : false;
      if (!user || !valid) {
        recordFailedAttempt(normalizedEmail);
        return res.status(401).json({ message: "Invalid email or password" });
      }

      clearAttempts(normalizedEmail);
      req.login(createSessionUser(user), (err: any) => {
        if (err) {
          console.error("[login] req.login failed:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        res.json(sanitizeUser(user));
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Failed to log in" });
    }
  });

  // Completes a Google sign-in: the client already ran Supabase's OAuth
  // flow and got a Supabase session back. Here we verify that session's
  // access token against Supabase (proves it's real, not just any string
  // the client sent), then create-or-link our own user record by email and
  // establish our own session cookie exactly like /login and /signup do.
  app.post("/api/auth/google-callback", async (req: any, res) => {
    try {
      const { access_token } = req.body || {};
      if (typeof access_token !== "string" || !access_token) {
        return res.status(400).json({ message: "Missing access token" });
      }
      if (!supabaseAuthClient) {
        return res.status(500).json({ message: "Google sign-in is not configured" });
      }

      const { data, error } = await supabaseAuthClient.auth.getUser(access_token);
      if (error || !data?.user?.email) {
        return res.status(401).json({ message: "Could not verify Google sign-in" });
      }

      const normalizedEmail = data.user.email.trim().toLowerCase();
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
      const avatarUrl = typeof meta.avatar_url === "string" ? meta.avatar_url : typeof meta.picture === "string" ? meta.picture : undefined;

      let firstName: string | undefined;
      let lastName: string | undefined;
      if (fullName.trim()) {
        const parts = fullName.trim().split(/\s+/);
        firstName = parts.shift();
        lastName = parts.length ? parts.join(" ") : undefined;
      }

      let user = await authStorage.getUserByEmail(normalizedEmail);
      if (user) {
        if (avatarUrl && !user.profileImageUrl) {
          user = await authStorage.updateUser(user.id, { profileImageUrl: avatarUrl });
        }
      } else {
        user = await authStorage.createUser({
          email: normalizedEmail,
          firstName,
          lastName,
          profileImageUrl: avatarUrl,
        });
      }

      req.login(createSessionUser(user), (err: any) => {
        if (err) {
          console.error("[google-callback] req.login failed:", err);
          return res.status(500).json({ message: "Signed in with Google, but session setup failed." });
        }
        res.json(sanitizeUser(user));
      });
    } catch (error) {
      console.error("Google callback error:", error);
      res.status(500).json({ message: "Google sign-in failed" });
    }
  });
}
