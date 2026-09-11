// Single mount point for the whole admin console backend. This is the ONLY
// file server/routes.ts needs to import to wire it in.
import type { Express } from "express";
import { mountAdminSession } from "./session";
import { registerAdminAuthRoutes } from "./auth";
import { registerAdminOverviewRoutes } from "./overview";
import { registerAdminReportRoutes } from "./reports";
import { registerAdminFeedbackRoutes } from "./feedback";

export function registerAdminConsole(app: Express) {
  mountAdminSession(app);
  registerAdminAuthRoutes(app);
  registerAdminOverviewRoutes(app);
  registerAdminReportRoutes(app);
  registerAdminFeedbackRoutes(app);
}
