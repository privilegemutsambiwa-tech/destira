// Static enforcement of "every /api/admin/* route fails closed by default".
//
// adminRoute() (server/admin/auth.ts) is the ONLY sanctioned way to register a
// route under /api/admin — it bakes requireAdmin(minRole) in, so a route
// literally cannot exist without declaring a role. This scans server/**/*.ts
// — not just server/admin/ — for any route registered by calling
// app.<verb>(...) directly on an /api/admin path, which would bypass that.
// Scanning only server/admin/ would miss exactly the case that matters most:
// a bare /api/admin route added somewhere else entirely (routes.ts is the
// obvious candidate, being the file every other route lives in) — that route
// would be open with no admin check AND invisible to a scanner that only
// looked in server/admin/. The one deliberate exception is the pre-auth
// surface in auth.ts itself (login, TOTP enrol/verify, logout, whoami) —
// those must be reachable WITHOUT an admin session, because they're how you
// get one.
//
//   npm run check:admin-routes
//
// Also called directly (not spawned as a subprocess — that hit a Windows
// `npx` ENOENT under execFileSync in testing) from script/build.ts, so this
// fails the deploy itself, not just a CI step someone has to remember to add
// — there is no CI in this repo today, so "run this in CI" alone would mean
// it never runs at all.

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ALLOWED_BARE_PREFIX = "/api/admin/auth/";
const ALLOWED_BARE_FILE = "auth.ts";
const BARE_ROUTE_RE = /\bapp\.(get|post|put|patch|delete)\(\s*["'`](\/api\/admin[^"'`]*)["'`]/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Throws with every violation listed if any /api/admin route bypasses
 *  requireAdmin(); logs a one-line summary either way. `serverDir` defaults
 *  to this repo's server/ but is overridable for testing the checker itself. */
export function checkAdminRoutes(serverDir: string = join(import.meta.dirname, "..", "server")): void {
  const violations: string[] = [];
  let bareCount = 0;
  let adminRouteCount = 0;

  for (const file of walk(serverDir)) {
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
        violations.push(`${file}: app.${m[1]}("${path}") registered without adminRoute() / requireAdmin()`);
      }
    }
  }

  console.log(
    `[check-admin-routes] Scanned ${serverDir} — ${adminRouteCount} route(s) via adminRoute(), ${bareCount} bare app.* registration(s) on an /api/admin path (${bareCount - violations.length} allowed pre-auth exceptions).`,
  );

  if (violations.length) {
    throw new Error(
      "FAILED — the following admin routes bypass requireAdmin():\n" +
        violations.map((v) => "  " + v).join("\n") +
        "\n\nFix: register them with adminRoute(app, method, path, minRole, handler) instead.",
    );
  }

  console.log("[check-admin-routes] OK — every /api/admin route (outside the pre-auth exceptions) goes through requireAdmin().");
}

// Run directly (`npm run check:admin-routes`) as well as imported.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("check-admin-routes.ts")) {
  try {
    checkAdminRoutes();
    process.exit(0);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
