# Destira - AI-Powered Dating App

## Overview
Destira is a personality-first dating platform that uses AI Twins to facilitate meaningful connections. Instead of swiping on photos, users complete a "Soul-Mapping" questionnaire, which generates an AI Twin persona that represents them in conversations with potential matches.

## Design System — SEE `docs/redesign-handoff.md` (canonical)

The redesigned dark editorial system is the source of truth. The purple/Inter
system described below is **legacy** and being removed screen by screen; do not
build to it.

Current tokens (`tailwind.config.ts` → `theme.extend.colors.vf`):
- ink `#0C0910` · surface `#14101C` · surface2 `#161220` · line `rgba(255,255,255,.09)`
- text `#F5F0EA` · muted `#A79FB4` · faint `#7E7690`
- ember `#FF6B4A` (the only primary accent) · mint `#8FE3C7` (AI-twin layer ONLY) · gold `#E9C46A` (Ember-tier only)
- Instrument Serif 400 for headlines and every number · DM Sans body · DM Mono `.16em` uppercase labels
- Label-led, not icon-led. No emoji. No purple `#7C3AED`. No Inter.

### Legacy (being retired)
- ~~Background #0F0F14 · Card #1A1A24 · Border #2E2E42 · Inter · linear-gradient(135deg,#7C3AED,#EC4899)~~
- **Story rings**: animated conic-gradient border via `.story-ring-active` CSS class (still in use)

## Architecture
- **Frontend**: React + Vite + TypeScript, wouter routing, TanStack Query, shadcn/ui, Tailwind CSS, Framer Motion
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon via Replit) + Stripe schema (managed by stripe-replit-sync)
- **AI**: DeepSeek (deepseek-ai/deepseek-v4.1-flash) via Hive Models' OpenAI-compatible endpoint (https://api-cdn.thehive.ai/api/v3), used for chat, extraction, and profile generation. Credentials from DEEPSEEK_API_KEY secret
- **Auth**: Replit Auth (OIDC)
- **Payments**: Stripe (via Replit Stripe Integration + stripe-replit-sync)

## Key Features
1. **Soul-Mapping Onboarding** - 10-question personality interview with privacy toggle; answers are automatically seeded into Twin memory facts and `twinQuestionsAnswered` is set to 10
2. **AI Twin Generation** - Gemini creates a persona from user's answers
3. **Discovery Feed** - Browse profiles of other users (real DB data, not mock); daily like limits enforced (Free: 5/day, Plus: 50/day, VIP: unlimited) with upgrade prompt modal
4. **AI Twin Interview** - Chat with someone's AI Twin before connecting (with chat history persistence)
5. **Match Request/Accept** - Send and respond to match requests with soft-delete and unmatch
6. **Direct Chat** - Real-time messaging after matching
7. **Serendipity Lounge** - Interest-based group chats with admin roles, privacy modes, invite links, join requests, moderation
8. **Profile** - Photo management, public/private toggle, AI-generated summaries, subscription badge
9. **Chat with Own Twin** - Self-reflection conversations with memory persistence
10. **Plans / Billing** - Tiered subscriptions (Free / Spark $4.99 / Flame $9.99 / Ember $19.99), single source of truth in `shared/entitlements.ts`. Canonical pricing screen is `/plans` (redesigned); `/billing` and `/upgrade` redirect there. Payment via Paynow (EcoCash wallet + EcoCash Visa) first, Stripe (card) second — see `server/payments/`. NOTE: `Billing.tsx` / `Upgrade.tsx` are still the legacy purple pages until Phase 2 lands.
11. **Settings** - Full settings system with inline sub-panels: Twin Tone, Location Preferences (slider), Age Range (slider), Block List (backend), Data & Privacy (export + delete), Profile Verification selfie flow, Manage Billing, Help Center FAQ, Contact Us form, Terms of Service, Privacy Policy, Clear Twin Memory (2-step confirm), Delete Account (type DELETE)

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
- `twin_profiles_structured` - Structured personality data (values, interests, goals, tone profile, etc.)
- `twin_memory_facts` - Extracted conversation facts with sources and expiry
- `twin_memory_summary` - Rolling conversation summary per user
- `questions` - 100 personality questions across 9 categories with weights
- `user_answers` - User's answers to questions with privacy toggle
- `question_schedule` - Tracks asked/skipped questions with reschedule
- `audit_logs` - Compliance/debugging log for all AI interactions
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

## Design System: "Romantic Modern" (RETIRED — do not use)
Superseded by the redesigned editorial system (`docs/redesign-handoff.md`).
Retained here only so old references in components are recognisable while they're
migrated. `btn-press` is the one micro-interaction still in use.

## Image Upload Pipeline
- Multer-based upload: POST /api/uploads/image (5MB limit, JPEG/PNG/WebP/GIF)
- Files stored in `/uploads` directory (local filesystem)
- Static serving via Express: `/uploads/*`
- PhotoManagementDialog: upload/delete/set-cover, up to 6 photos
- Privacy: GET /api/photos/:userId requires auth; private profiles return empty array for other users

## Recent Changes (Feb 22, 2026)
- **Brand mark**: the two-ring "Overlap" device — ember ring (human) over mint ring (AI twin), lens lit where they cross. Components in `client/src/components/brand/logo.tsx` (`DestiraMark` / `DestiraWordmark` / `DestiraLockup`); assets in `client/public/brand/destira-*`. The mark is unchanged from the VibeFlow era — only the name and filenames changed.
- **Romantic Theme**: Red-tinted CSS color tokens, romantic couple stock images in `attached_assets/images/`
- **Global Navigation**: Back/Forward arrows added to layout-shell header (mobile + desktop)
- **Instagram Stories**: Full stories system with 24-hour expiry, story viewer (tap navigation, auto-advance, like, comment with owner-only visibility), stories carousel on Discover page. DB: stories, storyMedia, storyLikes, storyComments, storyViews tables. API: /api/stories/feed (enriched), /api/stories CRUD, view/like/comment endpoints
- **Facebook-Style Profile**: Cover photo header, circular avatar overlay, 6 photo thumbnails, About Me only (no AI Summary display), Twin Intelligence progress bar with motivational messages
- **Upgrade Page**: `/upgrade` route with Tinder-style subscription cards (1 Week $4.99, 1 Month $19.99, 6 Months $54), plans editable in DB `plans` table, Stripe checkout
- **AI Twin Improvements**: Shorter 1-3 sentence responses, human-like chat prompts, interview prompts enforce natural conversation, quick reply deduplication fix
- **Likes Paywall**: Blurred photos with CSS blur for free tier, upgrade links point to /upgrade
- **Rate Limiting**: In-memory rate limiter for AI chat endpoints (10 requests/minute per user)
- **Security**: PII detection, PRIVACY_GUARDRAIL in all AI prompts, audit logging, rate limiting

## Changes (Feb 19, 2026)
- **AI Twin System Upgrade**: Comprehensive overhaul of AI Twin functionality:
  - **SSE Streaming**: POST /api/twin/chat and /api/interviews/:id/chat now support `stream: true` for real-time token-by-token rendering via Server-Sent Events (typing/delta/done/quick_replies events)
  - **Two-Layer Memory**: Structured profile (twin_profiles_structured) + conversational facts (twin_memory_facts) + rolling summary (twin_memory_summary). extractMemoryAfterChat() runs asynchronously every 6 messages
  - **100 Questions System**: 100 questions across 9 categories (values, relationships, lifestyle, communication, personality, emotions, goals, compatibility, fun) auto-seeded at startup. GET /api/questions/next with intelligent category-gap selection, POST /api/questions/:id/answer and /skip. Questions naturally injected into Twin Chat (30% chance)
  - **AI Profile Generation**: POST /api/ai/profile/generate-about-me and /generate-summary with PII detection. Preview/edit/regenerate/approve UI flow on Profile page
  - **Privacy & Safety**: PRIVACY_GUARDRAIL prompt injected in all AI calls, detectPII() strips emails/phones/addresses/SSNs from all AI outputs, audit logging for all AI interactions
  - **Twin Tone Adaptation**: tone_style, verbosity_level, emoji_usage, formality_level stored in structured profile, dynamically injected into prompts. Tone Settings dialog on Profile page
  - **Structured Profile Extraction**: POST /api/twin/extract-profile analyzes onboarding + question answers to extract top_values, relationship_goals, boundaries, humor_style, communication_style, attachment_style, interests, lifestyle_patterns, desired_partner_traits
  - **Enhanced Frontend**: TwinChat.tsx with streaming UI (typing dots animation, token-by-token rendering, quick reply chips, collapsible memory panel), InterviewChat.tsx with streaming, Profile.tsx with Twin Intelligence section and Tone Settings
- **Chat Hub**: Unified chat list replacing "Interviews" page. GET /api/chat/threads aggregates match chats + AI Twin interviews. Filter tabs (All/Matches/AI Twin), search bar, last message preview, relative timestamps, "Chat with My Twin" pinned card
- **Likes Screen**: Tinder-style paywall replacing "Matches" page. GET /api/likes/incoming returns incoming likes with blur for free tier. Blurred photos + hidden names for free users, clear view for Plus/VIP. POST /api/likes/:matchId/like-back for mutual matching
- **Lounge Groups redesign**: WhatsApp-style group list with GET /api/lounge/groups. Filter pills (All/Joined/Popular/New), search bar, last message preview with nickname, relative timestamps, circular group photos
- **Navigation renamed**: "Interviews" → "Chat", "Matches" → "Likes" across sidebar and bottom nav
- **Tinder-style Profile redesign**: Circular avatar header, verification badge, Edit Profile dialog, completion bar (weighted scoring engine), improvement task cards, quick action tiles (Super Match/Boosts/Subscription), tier comparison sidebar (Free/Plus/VIP), personality highlight chips
- **WhatsApp-style Group Info redesign**: Circular group photo header, action row (Add Members/Search/Mute), description + rules editor (admin-only), media module, starred messages module, granular admin settings (permissions toggles for send/edit/add), enhanced sorted member list with role badges
- **Starred messages feature**: Star/unstar messages in GroupChat popover, starred messages stored in starredMessages table, viewable on GroupInfo page, isStarred field in enriched messages endpoint
- **Profile completion engine**: Backend scoring (bio 20%, photos 25%, onboarding 25%, verification 15%, AI summary 15%), recalculated on GET /api/profiles/me/completion
- **Group settings API**: PATCH /api/groups/:id/settings for admin-only permission management (rulesText, canMembersEditInfo, canMembersSendMessages, canMembersAddOthers, postingPermission, mediaPermission)

## Earlier Changes (Feb 2026)
- "Romantic Modern" design system with semantic color tokens and micro-interactions
- Hero banner on Landing page with stock images and gradient overlay
- Redesigned Lounge cards with AvatarStack, category tags, privacy badges
- Complete image upload pipeline with multer backend and PhotoManagementDialog
- Photo privacy: auth-gated photo access, private profiles hide photos
- Full Stripe billing integration with real checkout flow
- WhatsApp-like group features (admin roles, privacy modes, invite links, join requests, moderation)
- Profile photo management with public/private toggle
- AI Twin self-chat with memory persistence
- Match soft-delete and unmatch functionality
- AI-generated profile summaries
- Subscription tier comparison (Free/Plus/VIP)
