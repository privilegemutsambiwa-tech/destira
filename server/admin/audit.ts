// Written BEFORE the read or write it covers — this file is called at the top
// of a handler, before any data leaves the server or any row changes. Nothing
// here can be deleted or edited; there is no route for either.
import { db } from "../db";
import { adminAuditLog } from "@shared/schema";
import type { Request } from "express";

export async function auditAdmin(
  req: Request,
  adminUserId: string,
  action: string,
  opts: { targetType?: string; targetId?: string | number; details?: unknown } = {},
): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      adminUserId,
      action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId != null ? String(opts.targetId) : null,
      details: opts.details ?? null,
      ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });
  } catch (e) {
    // The audit log failing to write is itself a serious problem, but it must
    // never be the reason an admin action fails outright — log loudly and let
    // the caller proceed. (A future hardening: block on audit-log failure for
    // owner-level destructive actions specifically.)
    console.error("[admin audit] FAILED TO WRITE AUDIT LOG:", action, e);
  }
}
