// "Continue with Google", one implementation for every screen that has it.
//
// Website: the usual redirect through Supabase to Google and back to
// /auth/callback (pages/AuthCallback.tsx).
//
// Android app: Android's own account sheet (Credential Manager), the one
// that slides up with the Google accounts already on the phone. One tap, no
// browser, no redirect back into the app to go wrong. Google hands back an
// ID token; Supabase turns it into a session (signInWithIdToken), and our
// server signs the member in from that, exactly as for the website.
//
// Needs, in the Google Cloud project that owns GOOGLE_WEB_CLIENT_ID, an
// "Android" OAuth client for date.destira.app with the SHA-1 of every key
// the app is signed with (upload key, debug key, and Play's app-signing key).
import { SocialLogin } from "@capgo/capacitor-social-login";
import { supabase } from "./supabase";
import { queryClient } from "./queryClient";
import { isNativeApp } from "./native";
import { rememberUser } from "./app-api";
import type { User } from "@shared/models/auth";

/** The "Web application" OAuth client Supabase's Google provider uses. Public. */
const GOOGLE_WEB_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined) ||
  "871506421615-feha8pjj817632oi7al0lgbhuqv06p95.apps.googleusercontent.com";

/** Our server's half: turn a Supabase session into a Destira session. */
export async function finishGoogleSignIn(accessToken: string): Promise<User> {
  const res = await fetch("/api/auth/google-callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new GoogleSignInError("destira", body?.message || `HTTP ${res.status}`);
  }
  const user = (await res.json()) as User;
  if (isNativeApp()) {
    queryClient.clear(); // nothing saved on this phone belongs to the new session
    rememberUser(user);
  }
  queryClient.setQueryData(["/api/auth/user"], user);
  return user;
}

let initialized = false;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class GoogleSignInCancelled extends Error {}

/** Which step failed, and Google's or the server's own words, so the screen
 *  can say what actually went wrong (and a crash report says where). */
export class GoogleSignInError extends Error {
  constructor(public step: "google" | "account" | "destira", detail: string) {
    super(detail);
  }
}

const detailOf = (e: unknown) => String((e as Error)?.message ?? e ?? "").slice(0, 200);

/** Android account sheet → signed in. Resolves with the member; rejects with
 *  GoogleSignInCancelled when they close the sheet. */
async function nativeGoogleSignIn(): Promise<User> {
  if (!initialized) {
    await SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } });
    initialized = true;
  }
  // Google puts the hashed nonce in the token; Supabase is given the raw one
  // and checks they match, so a token can't be replayed.
  const rawNonce = crypto.randomUUID();
  const nonce = await sha256Hex(rawNonce);
  const attempt = async (style: "bottom" | "standard") => {
    const { result } = await SocialLogin.login({
      provider: "google",
      options: { nonce, style, filterByAuthorizedAccounts: false },
    });
    return (result as { idToken?: string | null }).idToken ?? null;
  };
  let idToken: string | null = null;
  try {
    try {
      // The quick sheet with the phone's saved Google accounts...
      idToken = await attempt("bottom");
    } catch (e) {
      // ...and when the phone has none, Google's full screen, where one can
      // be added.
      if (!/no ?credential|no account/i.test(String((e as Error)?.message ?? e))) throw e;
      idToken = await attempt("standard");
    }
  } catch (e) {
    if (/cancel/i.test(detailOf(e))) throw new GoogleSignInCancelled();
    throw new GoogleSignInError("google", detailOf(e));
  }
  if (!idToken) throw new GoogleSignInError("google", "Google didn't return an ID token");
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: rawNonce });
  if (error || !data.session) throw new GoogleSignInError("account", error?.message || "No session");
  return finishGoogleSignIn(data.session.access_token);
}

/** Starts Google sign-in. In the app this completes here and resolves with
 *  the member; on the website the page navigates to Google (and the promise
 *  never matters). */
export async function startGoogleSignIn(): Promise<User | null> {
  if (isNativeApp()) return nativeGoogleSignIn();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
  return null;
}

/** What to tell someone when Google sign-in fails: the step, in plain words,
 *  plus the underlying reason in small print so a screenshot is enough to
 *  find the cause. */
export function googleSignInProblem(e: unknown): string {
  if (e instanceof GoogleSignInError) {
    const where =
      e.step === "google"
        ? "Google didn't sign you in"
        : e.step === "account"
          ? "Google signed you in, but your Destira account didn't open"
          : "Signed in with Google, but Destira couldn't start your session";
    return `${where}. Try again, or use your email. (${e.message})`;
  }
  if (e instanceof TypeError) return "Can't reach Destira right now. Check your connection and try again.";
  return `Couldn't sign in with Google. Try again, or use your email. (${detailOf(e)})`;
}

/** The same for email and password (errors look like "401: Invalid email or password"). */
export function passwordSignInProblem(e: unknown): string {
  const text = detailOf(e);
  const status = Number(text.match(/^(\d{3}):/)?.[1]);
  if (e instanceof TypeError || /failed to fetch|network/i.test(text)) return "Can't reach Destira right now. Check your connection and try again.";
  if (status === 401) return "Email or password is wrong. If you joined with Google, use Continue with Google, or tap Forgot password to set a password.";
  return text.replace(/^\d{3}:\s*/, "") || "Couldn't sign you in. Try again.";
}
