// Static enforcement of "every /api/admin/* route fails closed by default".
//
// adminRoute() (server/admin/auth.ts) is the ONLY sanctioned way to register a
// route under /api/admin — it bakes requireAdmin(minRole) in, so a route
// literally cannot exist without declaring a role. This script scans
// server/admin/**/*.ts for any route registered by calling app.<verb>(...)
// directly on an /api/admin path, which would bypass that. The one deliberate
// exception is the pre-auth surface in auth.ts itself (login, TOTP
// enrol/verify, logout, whoami) — those must be reachable WITHOUT an admin
// session, because they're how you get one.
//
//   npm run check:admin-routes
//
// Run this in CI. A route added the wrong way should fail the build, not get
// discovered in a security review.

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ADMIN_DIR = join(import.meta.dirname, "..", "server", "admin");
const ALLOWED_BARE_PREFIX = "/api/admin/auth/";
const ALLOWED_BARE_FILE = "auth.ts";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const BARE_ROUTE_RE = /\bapp\.(get|post|put|patch|delete)\(\s*["'`](\/api\/admin[^"'`]*)["'`]/g;

let violations: string[] = [];
let bareCount = 0;
let adminRouteCount = 0;

for (const file of walk(ADMIN_DIR)) {
  const src = readFileSync(file, "utf8");
  const fileName = file.split(/[\\/]/).pop()!;

  adminRouteCount += (src.match(/\badminRoute\(/g) || []).length;

  let m: RegExpExecArray | null;
  BARE_ROUTE_RE.lastIndex = 0;
  while ((m = BARE_ROUTE_RE.exec(src))) {
    const path = m[2];
    bareCount++;
    const isAllowed = fileName === ALLOWED_BARE_FILE && path.startsWith(ALLOWED_BARE_PREFIX);
    if (!isAllowed) {
      violations.push(`${fileName}: app.${m[1]}("${path}") registered without adminRoute() / requireAdmin()`);
    }
  }
}

console.log(`Scanned server/admin/ — ${adminRouteCount} route(s) via adminRoute(), ${bareCount} bare app.* registration(s) (${bareCount - violations.length} allowed pre-auth exceptions).`);

if (violations.length) {
  console.error("\nFAILED — the following admin routes bypass requireAdmin():\n");
  for (const v of violations) console.error("  " + v);
  console.error("\nFix: register them with adminRoute(app, method, path, minRole, handler) instead.");
  process.exit(1);
}

console.log("OK — every /api/admin route (outside the pre-auth exceptions) goes through requireAdmin().");
process.exit(0);
