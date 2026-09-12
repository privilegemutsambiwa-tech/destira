// Written BEFORE the read or write it covers — this file is called at the top
// of a handler, before any data leaves the server or any row changes. Nothing
// here can be deleted or edited; there is no route for either.
import { db } from "../db";
import { adminAuditLog } from "@shared/schema";
import type { Request } from "express";

type DbLike = Pick<typeof db, "insert">;

/** `dbOrTx` defaults to the module-level `db`, but MUST be passed the open
 *  transaction (`tx`) when called from inside a `db.transaction()` block —
 *  PGlite has effectively one connection, so a write against the top-level
 *  `db` while a transaction is still open on that same connection deadlocks
 *  (the outer transaction can't commit until this insert returns, and this
 *  insert can't get the connection until the transaction commits). Hit this
 *  live once building team.ts's suspend/remove/role-change flows. */
export async function auditAdmin(
  req: Request,
  adminUserId: string,
  action: string,
  opts: { targetType?: string; targetId?: string | number; details?: unknown } = {},
  dbOrTx: DbLike = db,
): Promise<void> {
  try {
    await dbOrTx.insert(adminAuditLog).values({
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
