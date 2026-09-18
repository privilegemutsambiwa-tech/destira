import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { withInviteMeta } from "./group-invite";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist — enriched with a
  // group invite's OG tags first when the URL is /join/:token (see
  // withInviteMeta in ./vite; same enrichment, same source of truth, as the
  // dev-mode path — the plain built file is served untouched otherwise).
  app.use("/{*path}", async (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    try {
      const template = await fs.promises.readFile(indexPath, "utf-8");
      const page = await withInviteMeta(req.originalUrl, req, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch {
      res.sendFile(indexPath);
    }
  });
}
