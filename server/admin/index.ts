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
import { registerAdminTeamRoutes } from "./team";
import { registerAdminAccountRoutes } from "./account";
import { registerAdminMemberEmailRoutes } from "./member-email";

export function registerAdminConsole(app: Express) {
  mountAdminSession(app);
  registerAdminAuthRoutes(app);
  registerAdminOverviewRoutes(app);
  registerAdminReportRoutes(app);
  registerAdminEventRoutes(app);
  registerAdminFeedbackRoutes(app);
  registerAdminEmailRoutes(app);
  registerAdminMetricsRoutes(app);
  registerAdminTeamRoutes(app);
  registerAdminAccountRoutes(app);
  registerAdminMemberEmailRoutes(app);
}
