# VibeFlow - AI-Powered Dating App

## Overview
VibeFlow is a personality-first dating platform that uses AI Twins to facilitate meaningful connections. Instead of swiping on photos, users complete a "Soul-Mapping" questionnaire, which generates an AI Twin persona that represents them in conversations with potential matches.

## Architecture
- **Frontend**: React + Vite + TypeScript, wouter routing, TanStack Query, shadcn/ui, Tailwind CSS, Framer Motion
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon via Replit)
- **AI**: OpenAI (via Replit AI Integrations) - model: openai/gpt-4o-mini
- **Auth**: Replit Auth (OIDC)

## Key Features
1. **Soul-Mapping Onboarding** - 10-question personality interview with privacy toggle
2. **AI Twin Generation** - OpenAI creates a persona from user's answers
3. **Discovery Feed** - Browse profiles of other users (real DB data, not mock)
4. **AI Twin Interview** - Chat with someone's AI Twin before connecting (with chat history persistence)
5. **Match Request/Accept** - Send and respond to match requests
6. **Direct Chat** - Real-time messaging after matching
7. **Serendipity Lounge** - Interest-based group chats with anonymous nicknames
8. **Profile** - View personality traits, AI Twin status, privacy settings

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
    Matches.tsx        - Match requests (pending/accepted), chat links
    DirectChat.tsx     - 1-on-1 messaging with matched users
    Lounge.tsx         - Group chat rooms with anonymous nicknames
    Profile.tsx        - User profile with VPP traits and AI Twin status
  hooks/
    use-auth.ts        - Replit Auth hook
    use-profiles.ts    - Profile CRUD hooks
    use-interactions.ts - Matches, interviews, messages, groups hooks
  components/
    layout-shell.tsx   - Desktop sidebar + mobile bottom nav
    ui/                - shadcn components

server/
  routes.ts            - All API endpoints
  storage.ts           - Database CRUD operations (IStorage interface)
  db.ts                - Drizzle database connection

shared/
  schema.ts            - Drizzle schema (profiles, matches, interviews, groups, direct_messages, group_messages)
  routes.ts            - API route type definitions
  models/
    auth.ts            - Users & sessions tables (Replit Auth)
    chat.ts            - Conversations & messages tables
```

## Database Tables
- `users` - Replit Auth managed
- `sessions` - Replit Auth managed
- `profiles` - User profiles with VPP data, twin persona, privacy settings
- `matches` - Match requests (pending/matched/rejected)
- `interviews` - AI Twin interview sessions with transcript history
- `groups` - Interest-based chat groups
- `group_members` - Group membership with anonymous nicknames
- `direct_messages` - 1-on-1 chat messages between matched users
- `group_messages` - Group chat messages

## Demo Data
- 5 demo users with complete profiles and AI Twin personas are seeded on startup
- 5 interest-based groups are created automatically

## Recent Changes (Feb 2026)
- Expanded from skeleton to fully functional MVP
- Added 10-question onboarding with privacy toggle
- Real discovery feed using database profiles (replaced mock data)
- AI Twin interview with persistent chat history
- Match request/accept/reject flow
- Direct messaging between matched users
- Serendipity Lounge with group chat and anonymous nicknames
- Demo data seeding on startup
