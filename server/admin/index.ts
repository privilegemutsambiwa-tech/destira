// Single mount point for the whole admin console backend. This is the ONLY
// file server/routes.ts needs to import to wire it in.
import type { Express } from "express";
import { mountAdminSession } from "./session";
import { registerAdminAuthRoutes } from "./auth";
import { registerAdminOverviewRoutes } from "./overview";
import { registerAdminReportRoutes } from "./reports";
import { registerAdminEventRoutes } from "./events";
import { registerAdminFeedbackRoutes } from "./feedback";
import { registerAdminEmailRoutes } from "./email";
import { registerAdminMetricsRoutes } from "./metrics";
import { registerAdminGrowthRoutes } from "./growth";
import { registerAdminOfficialStoryRoutes } from "./official-stories";
import { registerAdminTeamRoutes } from "./team";
import { registerAdminAccountRoutes } from "./account";
import { registerAdminMemberEmailRoutes } from "./member-email";
import { registerAdminVerificationRoutes } from "./verification";
import { registerAdminRiskRoutes } from "./risk";
import { registerAdminFunnelRoutes } from "./funnel";
import { registerAdminRevenueRoutes } from "./revenue";
import { registerAdminCrownRoutes } from "./crown";
import { registerAdminMatchmakerRoutes } from "./matchmaker";
import { registerAdminCrownTableRoutes } from "./crown-table";
import { registerAdminDateVoucherRoutes } from "./date-vouchers";
import { registerAdminEventTicketRoutes } from "./event-tickets";
import { registerMemberAdminRoutes } from "./members";
import { registerAdminErrorLogRoutes } from "./error-log";

export function registerAdminConsole(app: Express) {
  mountAdminSession(app);
  registerAdminAuthRoutes(app);
  registerAdminOverviewRoutes(app);
  registerAdminReportRoutes(app);
  registerAdminEventRoutes(app);
  registerAdminFeedbackRoutes(app);
  registerAdminErrorLogRoutes(app);
  registerAdminEmailRoutes(app);
  registerAdminMetricsRoutes(app);
  registerAdminGrowthRoutes(app);
  registerAdminOfficialStoryRoutes(app);
  registerAdminTeamRoutes(app);
  registerAdminAccountRoutes(app);
  registerAdminMemberEmailRoutes(app);
  registerAdminVerificationRoutes(app);
  registerAdminRiskRoutes(app);
  registerAdminFunnelRoutes(app);
  registerAdminRevenueRoutes(app);
  registerAdminCrownRoutes(app);
  registerAdminMatchmakerRoutes(app);
  registerAdminCrownTableRoutes(app);
  registerAdminDateVoucherRoutes(app);
  registerAdminEventTicketRoutes(app);
  registerMemberAdminRoutes(app);
}
