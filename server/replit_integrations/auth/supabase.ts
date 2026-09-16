import { createClient } from "@supabase/supabase-js";

// Same project as the client (client/src/lib/supabase.ts) — reads the same
// VITE_-prefixed vars from the shared .env (server loads it via
// `tsx --env-file=.env`, no separate server-only copy needed since the anon
// key is public-safe by design). Used only to verify the access token a
// Google sign-in hands back (GET /auth/v1/user), not to issue sessions —
// this app's own sessions are the existing express-session/passport setup.
const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

export const supabaseAuthClient = url && anonKey ? createClient(url, anonKey) : null;
