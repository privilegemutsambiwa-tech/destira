# VibeFlow - AI-Powered Dating App

## Overview
VibeFlow is a personality-first dating platform that uses AI Twins to facilitate meaningful connections. Instead of swiping on photos, users complete a "Soul-Mapping" questionnaire, which generates an AI Twin persona that represents them in conversations with potential matches.

## Architecture
- **Frontend**: React + Vite + TypeScript, wouter routing, TanStack Query, shadcn/ui, Tailwind CSS, Framer Motion
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon via Replit) + Stripe schema (managed by stripe-replit-sync)
- **AI**: OpenAI (via Replit AI Integrations) - model: openai/gpt-4o-mini
- **Auth**: Replit Auth (OIDC)
- **Payments**: Stripe (via Replit Stripe Integration + stripe-replit-sync)

## Key Features
1. **Soul-Mapping Onboarding** - 10-question personality interview with privacy toggle
2. **AI Twin Generation** - OpenAI creates a persona from user's answers
3. **Discovery Feed** - Browse profiles of other users (real DB data, not mock)
4. **AI Twin Interview** - Chat with someone's AI Twin before connecting (with chat history persistence)
5. **Match Request/Accept** - Send and respond to match requests with soft-delete and unmatch
6. **Direct Chat** - Real-time messaging after matching
7. **Serendipity Lounge** - Interest-based group chats with admin roles, privacy modes, invite links, join requests, moderation
8. **Profile** - Photo management, public/private toggle, AI-generated summaries, subscription badge
9. **Chat with Own Twin** - Self-reflection conversations with memory persistence
10. **Billing** - Stripe-powered subscription tiers (Free/Plus/VIP) with real checkout

## Project Structure
```
client/src/
  App.tsx              - Router with auth guards
  pages/
    Landing.tsx        - Public landing page with login/demo buttons
    Onboarding.tsx     - 10-question soul-mapping + privacy toggle
    Discover.tsx       - Browse profiles, interview AI twins, send match requests
    InterviewChat.tsx  - Chat with AI Twin (full conversation history)
    Interviews.tsx     - List of active AI Twin interviews
    Matches.tsx        - Match requests (pending/accepted), soft-delete, unmatch
    DirectChat.tsx     - 1-on-1 messaging with matched users
    Lounge.tsx         - Group chats with search, create, admin, privacy modes, invite links
    Profile.tsx        - User profile with photos, AI summaries, visibility toggle
    TwinChat.tsx       - Chat with own AI Twin (memory/learning)
    Billing.tsx        - Stripe subscription tiers with real checkout
  hooks/
    use-auth.ts        - Replit Auth hook
    use-profiles.ts    - Profile CRUD hooks
    use-interactions.ts - Matches, interviews, messages, groups, subscriptions, twin hooks
  components/
    layout-shell.tsx   - Desktop sidebar + mobile bottom nav
    ui/                - shadcn components

server/
  index.ts             - Express app setup, Stripe init (webhook before express.json)
  routes.ts            - All API endpoints
  storage.ts           - Database CRUD operations (IStorage interface, ~40 methods)
  db.ts                - Drizzle database connection
  stripeClient.ts      - Stripe SDK client via Replit connector credentials
  webhookHandlers.ts   - Stripe webhook processing via stripe-replit-sync
  seed-products.ts     - Script to create Stripe subscription products (run manually)

shared/
  schema.ts            - Drizzle schema (all tables below)
  models/
    auth.ts            - Users & sessions tables (Replit Auth)
    chat.ts            - Conversations & messages tables
```

## Database Tables
- `users` - Replit Auth managed
- `sessions` - Replit Auth managed
- `profiles` - User profiles with personality data, twin persona, privacy settings, AI summaries
- `user_photos` - User photo management with ordering
- `matches` - Match requests (pending/matched/rejected/unmatched) with soft-delete per user
- `interviews` - AI Twin interview sessions with transcript history
- `groups` - Interest-based chat groups with privacy modes, admin settings
- `group_members` - Group membership with anonymous nicknames and roles
- `group_join_requests` - Request-to-join flow for private groups
- `group_invite_links` - Token-based invite links with expiry
- `group_moderation_logs` - Admin action audit trail
- `direct_messages` - 1-on-1 chat messages between matched users
- `group_messages` - Group chat messages with admin delete support
- `twin_memory` - AI Twin conversation memory for self-chat
- `twin_notifications` - Proactive twin notifications
- `subscriptions` - User subscription tracking
- `payments` - Payment records
- `entitlements` - Feature entitlements per user
- `stripe.*` - Managed by stripe-replit-sync (products, prices, customers, subscriptions, etc.)

## Stripe Integration
- Products seeded via `npx tsx server/seed-products.ts` (Plus $9.99/mo, VIP $19.99/mo)
- Product data synced to `stripe` schema tables automatically
- Checkout sessions created via POST /api/stripe/checkout
- Customer portal via POST /api/stripe/portal
- Webhooks handled by stripe-replit-sync processWebhook

## Demo Data
- 5 demo users with complete profiles and AI Twin personas are seeded on startup
- 5 interest-based groups are created automatically

## Recent Changes (Feb 2026)
- Full Stripe billing integration with real checkout flow
- WhatsApp-like group features (admin roles, privacy modes, invite links, join requests, moderation)
- Profile photo management with public/private toggle
- AI Twin self-chat with memory persistence
- Match soft-delete and unmatch functionality
- AI-generated profile summaries
- Subscription tier comparison (Free/Plus/VIP)
