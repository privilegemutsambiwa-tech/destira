import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated, createSessionUser } from "./replitAuth";
import { hashPassword, verifyPassword } from "./password";
import { supabaseAuthClient } from "./supabase";
import type { User } from "@shared/models/auth";
import * as referrals from "../../referrals";
import { storage } from "../../storage";
import { generateOpaqueToken, hashOpaqueToken } from "../../admin/crypto";
import { sendViaResend, resendConfigured } from "../../email/resend";

// A profile only counts as onboarded once the mandatory matching fields —
// gender and who they're seeking — are actually filled in. Used to decide
// whether a Google sign-in should land on Discover or get routed back into
// profile setup first.
async function checkIsOnboarded(userId: string): Promise<boolean> {
  const profile = await storage.getProfile(userId);
  return !!profile?.gender && Array.isArray(profile.seekingGenders) && profile.seekingGenders.length > 0;
}

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

// Same shape, separate budget — a forgot-password spam risk (repeatedly
// emailing someone else's inbox) is different from a login brute-force one,
// so it gets its own counter rather than sharing loginAttempts' budget.
const resetRequests = new Map<string, { count: number; firstAttempt: number }>();
const MAX_RESET_REQUESTS = 3;
const RESET_WINDOW_MS = 60 * 60 * 1000;

function resetRequestAllowed(key: string): boolean {
  const entry = resetRequests.get(key);
  if (!entry || Date.now() - entry.firstAttempt > RESET_WINDOW_MS) {
    resetRequests.set(key, { count: 1, firstAttempt: Date.now() });
    return true;
  }
  if (entry.count >= MAX_RESET_REQUESTS) return false;
  entry.count += 1;
  return true;
}

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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

      storage.startTrialSubscription(user.id).catch((err) => {
        console.error("[signup] failed to start trial subscription:", err);
      });

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

      const profile = await storage.getProfile(user.id);
      if (profile?.moderationStatus === "banned" || profile?.moderationStatus === "suspended") {
        return res.status(403).json({
          message: profile.moderationStatus === "banned"
            ? "This account has been removed for violating our terms."
            : "This account is temporarily suspended.",
        });
      }

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

  // Always the same generic response regardless of whether the email is
  // registered, has a password at all (a Google-only account has none to
  // reset), or the send actually succeeded — never confirm/deny an email's
  // existence to an unauthenticated caller. The real outcome is only
  // observable by the person who controls that inbox.
  app.post("/api/auth/forgot-password", async (req, res) => {
    const GENERIC = { message: "If that email has an account, we've sent a reset link." };
    try {
      const { email } = req.body || {};
      if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
        return res.status(400).json({ message: "Enter a valid email address" });
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!resetRequestAllowed(normalizedEmail)) {
        // Still generic — a 429 here would itself confirm the email exists
        // to an attacker probing which addresses are registered.
        return res.json(GENERIC);
      }

      const user = await authStorage.getUserByEmail(normalizedEmail);
      if (user?.passwordHash) {
        const { raw, hash } = generateOpaqueToken();
        await authStorage.createPasswordResetToken(user.id, hash, new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS));
        const resetUrl = `${process.env.PUBLIC_APP_URL || "http://localhost:5000"}/reset-password?token=${raw}`;
        if (resendConfigured()) {
          sendViaResend({
            to: normalizedEmail,
            subject: "Reset your Destira password",
            text: `Someone (hopefully you) asked to reset your Destira password.\n\n${resetUrl}\n\nThis link works once and expires in an hour. If you didn't ask for this, ignore this email — your password hasn't changed.`,
          }).catch((e) => console.error("[forgot-password] send failed:", e));
        } else {
          console.log(`[forgot-password] (no-op, RESEND_API_KEY not set) reset link for ${normalizedEmail}: ${resetUrl}`);
        }
      }
      res.json(GENERIC);
    } catch (error) {
      console.error("Forgot-password error:", error);
      // Even a server error stays generic on this endpoint.
      res.json(GENERIC);
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body || {};
      if (typeof token !== "string" || !token) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const row = await authStorage.getPasswordResetTokenByHash(hashOpaqueToken(token));
      if (!row || row.usedAt || row.expiresAt < new Date()) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }
      await authStorage.markPasswordResetTokenUsed(row.id);
      const passwordHash = await hashPassword(password);
      await authStorage.updateUser(row.userId, { passwordHash });
      clearAttempts((await authStorage.getUser(row.userId))?.email?.toLowerCase() || "");
      res.json({ success: true });
    } catch (error) {
      console.error("Reset-password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
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
        storage.startTrialSubscription(user.id).catch((err) => {
          console.error("[google-callback] failed to start trial subscription:", err);
        });
      }

      const profile = await storage.getProfile(user.id);
      if (profile?.moderationStatus === "banned" || profile?.moderationStatus === "suspended") {
        return res.status(403).json({
          message: profile.moderationStatus === "banned"
            ? "This account has been removed for violating our terms."
            : "This account is temporarily suspended.",
        });
      }

      const isOnboarded = await checkIsOnboarded(user.id);

      req.login(createSessionUser(user), (err: any) => {
        if (err) {
          console.error("[google-callback] req.login failed:", err);
          return res.status(500).json({ message: "Signed in with Google, but session setup failed." });
        }
        res.json({ ...sanitizeUser(user), isOnboarded });
      });
    } catch (error) {
      console.error("Google callback error:", error);
      res.status(500).json({ message: "Google sign-in failed" });
    }
  });
}
