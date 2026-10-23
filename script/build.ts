import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { checkAdminRoutes } from "../scripts/check-admin-routes";
import { newBundleId, packageAppBundle } from "./app-bundle";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  // There's no CI in this repo — this is the only thing that runs on every
  // deploy. Fails the build (not just a console warning) if any /api/admin
  // route bypasses requireAdmin(). Called directly, not spawned as a
  // subprocess — `execFileSync("npx", ...)` hit ENOENT on Windows since it
  // doesn't resolve npx's .cmd shim without a shell.
  checkAdminRoutes();

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  // The same build is the app's screens; it needs to know its own id to
  // tell when an update is newer (client/src/lib/app-update.ts).
  const bundleId = newBundleId();
  process.env.VITE_BUNDLE_ID = bundleId;
  await viteBuild();
  await packageAppBundle("dist/public", "dist/app-bundle", bundleId);

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
