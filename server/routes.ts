import type { Express } from "express";
import { type Server } from "http";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { and } from "drizzle-orm";
import { registerGrowthRoutes } from "./growth-routes";
import { registerVideoCallRoutes } from "./video-calls";
import { registerDateSafetyRoutes } from "./date-safety";
import { registerCityPageRoutes } from "./city-pages";
import { withClickReasons } from "./click-reasons";
import * as payments from "./payments";
import * as push from "./push";
import { places } from "@shared/schema";
import { registerAdminConsole } from "./admin";
import { registerVerificationRoutes } from "./verification";
import * as safety from "./safety";
import { registerBillingRoutes } from "./billing";
import { registerCrownRoutes } from "./crown";
import { registerCrownPerkRoutes } from "./crown-perks";
import { registerMatchmakerRoutes } from "./crown-matchmaker";
import { registerCrownTableRoutes } from "./crown-table";
import { registerPurchaseRoutes } from "./purchases";
import { registerDateVoucherRoutes, startDateVoucherSweep } from "./date-vouchers";
import { registerSinglePurchases } from "./single-purchases";
import { registerEventTicketRoutes, startEventTicketSweep } from "./event-tickets";
import { registerTwinCoachRoutes } from "./twin-coach";
import { registerDiscoverPerkRoutes } from "./discover-perks";
import { startMatchStatsSweep } from "./matching";
import { registerDmExtraRoutes } from "./dm-extras";
import { registerDateRoutes, startDateSweeps } from "./dates";
import { registerActivityRoutes } from "./activity";
import { registerFriendRoutes } from "./friends";
import { registerTableRoutes, startTableSweeps } from "./friends/tables";
import { registerCircleRoutes } from "./friends/circles";
import { registerBoardRoutes } from "./friends/board";
import { registerVouchRoutes } from "./friends/vouches";
import { registerWingmanRoutes } from "./friends/wingman";
import { registerLoungeDiscoveryRoutes } from "./lounge-discovery";
import { registerLoungeModerationRoutes } from "./lounge-moderation";
import { registerGameNightRoutes, startGameNightSweep } from "./game-nights";
import { registerRoomVoiceRoutes } from "./room-voice";
import { registerEventDoorRoutes, startClicksSweep } from "./event-door";
import { registerEventExtraRoutes } from "./event-extras";
import { startReminderSweeps } from "./reminders";
import { registerMemberRateLimits } from "./rate-limits";
import * as emailTemplates from "./email/templates";
import { setAdminLockoutHook } from "./admin/auth";
import { trackActivity } from "./admin/activity";
import { requestOutcomeMiddleware } from "./admin/error-rate";
import { getUserId, checkAIRateLimit, upload } from "./routes/shared";
import { registerProfilesRoutes } from "./routes/profiles";
import { registerProximityRoutes } from "./routes/proximity";
import { registerPhotosRoutes } from "./routes/photos";
import { registerMatchesRoutes } from "./routes/matches";
import { registerInterviewsRoutes } from "./routes/interviews";
import { registerTwinRoutes } from "./routes/twin";
import { registerOnboardingRoutes } from "./routes/onboarding";
import { registerMessagesRoutes } from "./routes/messages";
import { registerGroupsRoutes } from "./routes/groups";
import { registerGroupExtrasRoutes } from "./routes/group-extras";
import { registerChatRequestsRoutes } from "./routes/chat-requests";
import { registerPaymentsRoutes } from "./routes/payments";
import { registerInboxRoutes } from "./routes/inbox";
import { registerStoriesRoutes } from "./routes/stories";
import { registerAccountRoutes } from "./routes/account";
import { registerEventsRoutes } from "./routes/events";
import { startBackgroundWork } from "./routes/startup";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  // Ends a banned member's session everywhere; records device ids (server/safety/).
  app.use(safety.sessionGuard());
  // Per member, not per address: many phones share one mobile-network
  // address in Zimbabwe, so an address limit would block innocent people.
  // Likes, messages, posts, reports and the AI (server/rate-limits.ts).
  registerMemberRateLimits(app);
  app.use(trackActivity());
  app.use(requestOutcomeMiddleware());
  registerAuthRoutes(app);
  registerAdminConsole(app);
  setAdminLockoutHook((email, n) => {
    emailTemplates.alertAdminLockout({ email, attempts: n }).catch(() => {});
  });


  // Phase 1 retention: public event teaser + share card, first-day checklist,
  // member email unsubscribe and the member-email sweep.
  registerGrowthRoutes(app, getUserId);
  // "Dating in Harare" pages, robots.txt and sitemap.xml (server/city-pages.ts).
  registerCityPageRoutes(app);
  // Plan reminders, receipts and payment history (server/billing.ts).
  // Before the /api/payments/:id route so "history" isn't taken for an id.
  registerBillingRoutes(app, getUserId);
  // Destira Crown: apply, state, who wears it (server/crown.ts).
  registerCrownRoutes(app, getUserId);
  registerCrownPerkRoutes(app, getUserId);
  registerMatchmakerRoutes(app, getUserId);
  registerCrownTableRoutes(app, getUserId);
  registerPurchaseRoutes(app, getUserId);
  registerDateVoucherRoutes(app, getUserId);
  // One super like, one boost, 24 hours of "see who liked you" (Part G3).
  registerSinglePurchases();
  // Paid event tickets (Part G4).
  registerEventTicketRoutes(app, getUserId);
  // The dating coach in Twin chat (Twin Part F2).
  registerTwinCoachRoutes(app, getUserId, (id) => checkAIRateLimit(id));
  // Rewind, super like and boost (server/discover-perks.ts).
  registerDiscoverPerkRoutes(app, getUserId, withClickReasons);
  // The deck score's daily inputs: reply rates and the popularity cap.
  startMatchStatsSweep();
  // Chat: reactions, photos, voice notes, typing, edit and unsend.
  registerDmExtraRoutes(app, getUserId);
  // Let's meet, the after-date check-in and the quiet-chat nudge.
  registerDateRoutes(app, getUserId);
  startDateSweeps();
  // The bell, "new since you last looked", and the reminders behind them
  // (unread message, event tomorrow / in 2 hours), plus the morning digest.
  registerActivityRoutes(app, getUserId);
  startReminderSweeps();
  push.startPushDigests();
  // Destira Friends: its own deck, waves, friendships (Part O).
  registerFriendRoutes(app, getUserId);
  // The Sunday Table: six people, one lunch, every week (Part O2).
  registerTableRoutes(app, getUserId);
  startTableSweeps();
  // Friend circles: up to 8, invitations only, plans and a shared album (Part O3).
  registerCircleRoutes(app, getUserId);
  // Plans board, "Who's in?": small plans for the week at public places (Part O4).
  registerBoardRoutes(app, getUserId);
  // Vouches from people you've met; you choose up to 3 for your profile (Part O5).
  registerVouchRoutes(app, getUserId);
  // Wingman: circle friends suggest someone from Discover, and say why (Part O6).
  registerWingmanRoutes(app, getUserId);
  registerLoungeDiscoveryRoutes(app, getUserId);
  registerLoungeModerationRoutes(app, getUserId);
  // Lounge: scheduled game nights and voice notes in rooms (Part J).
  registerGameNightRoutes(app, getUserId);
  startGameNightSweep();
  startDateVoucherSweep();
  startEventTicketSweep();
  registerRoomVoiceRoutes(app, getUserId);
  // Events in person: door check-in by QR, then "Who did you click with?" (Part J).
  registerEventDoorRoutes(app, getUserId);
  startClicksSweep();
  // Event calendar files, host ratings and venue partners (Part J).
  registerEventExtraRoutes(app, getUserId);
  // Selfie verification (server/verification.ts).
  registerVerificationRoutes(app, getUserId, upload);
  // Video dates between matches (server/video-calls.ts).
  registerVideoCallRoutes(app, getUserId);
  // Date safety kit: "All good?" an hour into a date (server/date-safety.ts).
  registerDateSafetyRoutes(app, getUserId);

  // The app's own routes, by area, in their original order.
  registerProfilesRoutes(app);
  registerProximityRoutes(app);
  registerPhotosRoutes(app);
  registerMatchesRoutes(app);
  registerInterviewsRoutes(app);
  registerTwinRoutes(app);
  registerOnboardingRoutes(app);
  registerMessagesRoutes(app);
  registerGroupsRoutes(app);
  registerGroupExtrasRoutes(app);
  registerChatRequestsRoutes(app);
  registerPaymentsRoutes(app);
  registerInboxRoutes(app);
  registerStoriesRoutes(app);
  registerAccountRoutes(app);
  registerEventsRoutes(app);

  await startBackgroundWork();

  return httpServer;
}
