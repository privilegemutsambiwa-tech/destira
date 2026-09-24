# Running Destira locally (off Replit)

Destira was built for Replit (Replit Auth, Replit-managed Postgres, the Replit
Stripe connector, a Vertex AI service account). This setup removes those
platform dependencies so it boots on a plain machine with just Node.

## Quick start

```bash
npm install
npm run db:push      # create/update the schema in the embedded DB
npm run dev          # http://localhost:5000
```

Open http://localhost:5000, then **Sign up** (`/signup`) to create an account
with email + password, or **Log in** (`/login`) if you already have one.
Accounts persist in `./.localdb/`.

## What changed

| Area | Before (Replit) | Now (local) |
| --- | --- | --- |
| **Database** | Replit/Supabase Postgres via `DATABASE_URL` | Embedded **PGlite** (`@electric-sql/pglite`) when `DATABASE_URL` is unset — no install, no daemon, data in `./.localdb/`. Set `DATABASE_URL` (Render's managed Postgres, Supabase, etc.) to use a real Postgres instead, same as before — `server/db.ts`, `drizzle.config.ts` switch on whether it's set. |
| **Auth** | Replit Auth (OIDC via `openid-client`) | Real email/password auth: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/logout`. scrypt password hashing (`server/replit_integrations/auth/password.ts`), `users.password_hash` column. Same exports (`setupAuth`, `isAuthenticated`) and same `req.user.claims.sub` shape, so route code is unchanged. Legacy `/api/login` now redirects to the `/login` page. |
| **Sessions** | Postgres via `connect-pg-simple` | In-memory `memorystore`; cookie `secure` only in production |
| **Stripe** | Auto-init on boot via Replit connector | Skipped unless `ENABLE_STRIPE=1`. Billing routes error until configured. |
| **AI Twin** | Google Vertex AI, service account from `GOOGLE_VERTEX_SA_JSON` | Hive Models' OpenAI-compatible endpoint routed to DeepSeek, key from `DEEPSEEK_API_KEY`. Optional. Without it, AI Twin endpoints return canned fallback text (they already had try/catch fallbacks). |
| **Listen host** | `0.0.0.0` + `reusePort` | Dev binds `::` (dual-stack) so both `localhost` and `127.0.0.1` work; `reusePort` dropped on Windows (caused a libuv assert). Override with `HOST`. |
| **Config** | Replit-injected env | `.env` (git-ignored), loaded via `tsx --env-file`. |

## Config (`.env`)

Created for you, git-ignored. Defaults work out of the box. Optional:

- `HOST=127.0.0.1` — restrict the bind address.
- `ENABLE_STRIPE=1` + the Replit Stripe connector env — turn billing back on.
- `DEEPSEEK_API_KEY=...` — real AI Twin responses via Hive Models (DeepSeek).
- `PAYNOW_INTEGRATION_ID` / `PAYNOW_INTEGRATION_KEY` / `PAYNOW_RESULT_URL` /
  `PAYNOW_RETURN_URL` — real Paynow (EcoCash/OneMoney/InnBucks/card) payments.
  See "Payments" below.

## Payments

`PAYMENTS_MOCK=1` (the local default) runs `server/payments/mock.ts` — every
plan purchase "settles" after `PAYMENTS_MOCK_DELAY_MS` with no real gateway
call. The outcome is keyed off the last 4 digits of the phone number you type
in for a wallet method (EcoCash/OneMoney/InnBucks), so every UI state is
reachable without merchant creds:

- ends `0000` → declined
- ends `1111` → insufficient balance
- ends `9999` → prompt expires
- anything else → paid

To go live: get an integration ID + key from paynow.co.zw (Merchant ->
Integration Settings), set the four `PAYNOW_*` vars above, and drop
`PAYMENTS_MOCK` (or set it to `0`). `PAYNOW_RESULT_URL` must be a publicly
reachable URL — Paynow calls it server-to-server to confirm a payment, which
is what actually activates a subscription (`server/payments/index.ts`); the
client polling `/api/payments/:id` is a convenience, never the source of
truth.

## Reset the database

```bash
rm -rf .localdb && npm run db:push
```

## Isolated QA database (never touches production)

`.env` in this repo is configured to point `DATABASE_URL` at the real
production Supabase database (see its own comments) — convenient for
checking real reports/behavior, but that means `npm run dev` + manual
testing is happening against live user data. For anything that pokes at
data (reproducing a bug, a QA sweep, seeded fake profiles), use the
separate local-only setup instead:

```bash
npm run db:push:local   # create the schema in ./.localdb-dev (PGlite, on disk, no network)
npm run seed:local      # seed 4 log-in-able test accounts (one per tier) + 40 fake candidate profiles
npm run dev:local       # http://localhost:5001, reads .env.dev — no DATABASE_URL, so it's structurally
                         # impossible for this to reach Supabase no matter what runs against it
```

Test accounts (password `Testing123!` for all): `free@local.test`,
`spark@local.test`, `flame@local.test`, `ember@local.test` — one per tier,
each with a different gender/seekingGenders so Discover/matching has
something to actually match against. `scripts/seed-local-dev.ts` is
idempotent (safe to re-run) and easy to extend — add more candidates, an
event, a group, etc. as new features need fixtures.

`.env.dev` is git-ignored (like `.env`) and not committed — see
`drizzle.dev.config.ts` for why the schema push uses `--config` instead of
just relying on `PGLITE_DATA_DIR` in the env: drizzle-kit auto-loads the
plain `.env` file itself and that silently wins over a shell-exported
override.

## Windows note

`npm run dev` spawns `tsx` as a child; `Ctrl-C` in the terminal stops both, but
killing the `npm` process alone can orphan the `node` child still holding port
5000. If a restart says the port is busy, kill the stray PID:
`netstat -ano | findstr :5000` then `taskkill /PID <pid> /F`.

## Restoring Replit auth

The original OIDC implementation is in git history for
`server/replit_integrations/auth/replitAuth.ts`.

## Admin console

Entirely separate from member auth — own session cookie, own 2FA, no link
from the member app. Sign up a normal account first, **stop the dev server**
(PGlite is single-writer — running this alongside a live server produced a
stale read in testing), then:

```bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_ROLE=owner npm run seed:admin
```

Restart the server and open `/console`. First login forces TOTP enrolment —
scan the QR code with any authenticator app. `ADMIN_SESSION_SECRET` /
`ADMIN_TOTP_ENC_KEY` in `.env` need real random values before this holds
anyone's data in production. `npm run check:admin-routes` fails the build if
a route under `/api/admin` is ever registered without going through
`requireAdmin()` — see `server/admin/auth.ts`.
