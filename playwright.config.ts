// npm run test:smoke: the core of the app, end to end, against the running
// local server (npm run dev:local, PGlite). It makes two throwaway members
// (smoke-*@local.test) and deletes them at the end.
//
// SMOKE_BASE_URL points it elsewhere, but never at production: it signs up
// members and pays with the mock gateway.
import { defineConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

/** Use whichever Chromium Playwright already downloaded, if its own isn't there. */
function chromium(): string | undefined {
  const root = path.join(process.env.LOCALAPPDATA || path.join(process.env.HOME || "", ".cache"), "ms-playwright");
  try {
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const exe of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
        const p = path.join(root, d, exe);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}
  return undefined;
}

export default defineConfig({
  testDir: "tests/smoke",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL || "http://localhost:5001",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath: process.env.SMOKE_CHROMIUM || chromium(),
      // A test pattern and a tone instead of a real camera and microphone,
      // allowed without a prompt (video-call.spec.ts).
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
    trace: "retain-on-failure",
  },
  outputDir: "test-results/smoke",
});
