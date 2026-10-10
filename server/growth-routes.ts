// Growth/retention routes: the signed-out event teaser + share card, the
// first-day checklist, member email unsubscribe, tonight's three, and the
// background member-email and daily-picks sweeps.
import type { Express, Request } from "express";
import { getPublicEventTeaser, getOrRenderEventShareCard } from "./event-share";
import { getFirstDayState, claimFirstDayReward, FirstDayNotDoneError } from "./first-day";
import * as memberEmail from "./member-email";
import { getDailyPicks, runDailyPicksPushSweep } from "./daily-picks";
import { escapeHtml } from "./group-invite";

export function registerGrowthRoutes(app: Express, getUserId: (req: Request) => string | null) {
  // ── public event teaser (no sign-in) ──────────────────────────────
  app.get("/api/public/events/:id", async (req, res) => {
    try {
      const teaser = await getPublicEventTeaser(Number(req.params.id));
      if (!teaser) return res.status(404).json({ message: "This event isn't public" });
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(teaser);
    } catch (e) {
      console.error("Public event teaser error:", e);
      res.status(500).json({ message: "Failed to load event" });
    }
  });

  app.get("/api/events/:id/share-card/:hash.jpg", async (req, res) => {
    try {
      const teaser = await getPublicEventTeaser(Number(req.params.id));
      if (!teaser) return res.redirect(302, "/brand/og-default.png");
      const jpg = await getOrRenderEventShareCard(teaser);
      if (!jpg) return res.redirect(302, "/brand/og-default.png");
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.send(jpg);
    } catch (e) {
      console.error("Event share card error:", e);
      res.redirect(302, "/brand/og-default.png");
    }
  });

  // ── first-day checklist ───────────────────────────────────────────
  app.get("/api/first-day", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await getFirstDayState(userId));
    } catch (e) {
      console.error("First-day state error:", e);
      res.status(500).json({ message: "Failed to load your checklist" });
    }
  });

  app.post("/api/first-day/claim", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const result = await claimFirstDayReward(userId);
      if (!result) return res.status(409).json({ message: "You've already claimed this reward" });
      res.json(result);
    } catch (e) {
      if (e instanceof FirstDayNotDoneError) return res.status(400).json({ message: e.message });
      console.error("First-day claim error:", e);
      res.status(500).json({ message: "Couldn't claim the reward" });
    }
  });

  // ── member email unsubscribe ──────────────────────────────────────
  // GET shows a confirm button (link scanners prefetch GETs, so a GET must
  // never unsubscribe anyone by itself). POST applies it; mail apps' one-click
  // "Unsubscribe" (List-Unsubscribe-Post) POSTs here directly.
  const SCOPE_LABEL: Record<string, string> = {
    email_all: "all Destira emails",
    email_tips: "tips emails",
    email_likes: "like notifications by email",
    email_digest: "the weekly digest and catch-up emails",
  };
  const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#FBF8F5;font-family:Helvetica,Arial,sans-serif;color:#1A1418">
<div style="max-width:440px;margin:60px auto;padding:30px 26px;background:#fff;border:1px solid #EDE6E0;border-radius:20px">
<div style="font:400 22px Georgia,serif;margin-bottom:16px">destira</div>${body}</div></body></html>`;
  const parse = (req: Request) => {
    const q = { ...(req.query as Record<string, unknown>), ...(req.body ?? {}) };
    const u = typeof q.u === "string" ? q.u : "";
    const s = typeof q.s === "string" ? q.s : "";
    const t = typeof q.t === "string" ? q.t : "";
    const valid = !!u && !!s && !!t && (memberEmail.MEMBER_EMAIL_PREF_KEYS as readonly string[]).includes(s) && memberEmail.verifyUnsubscribeToken(u, s, t);
    return { u, s, t, valid };
  };

  app.get("/api/email/unsubscribe", (req, res) => {
    const { u, s, t, valid } = parse(req);
    if (!valid) return res.status(400).type("html").send(page("Link not valid", `<p>This unsubscribe link isn't valid. You can manage email in Settings inside the app.</p>`));
    const label = SCOPE_LABEL[s] ?? "these emails";
    res.type("html").send(page("Unsubscribe", `<p style="font-size:16px;line-height:1.5">Stop receiving <strong>${escapeHtml(label)}</strong>?</p>
<form method="post"><input type="hidden" name="u" value="${escapeHtml(u)}"><input type="hidden" name="s" value="${escapeHtml(s)}"><input type="hidden" name="t" value="${escapeHtml(t)}">
<button style="background:#B34B34;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-weight:600;font-size:15px;cursor:pointer">Unsubscribe</button></form>
<p style="font-size:13px;color:#6B5F67;margin-top:18px">You can change any of this later in Settings.</p>`));
  });

  app.post("/api/email/unsubscribe", async (req, res) => {
    const { u, s, valid } = parse(req);
    if (!valid) return res.status(400).type("html").send(page("Link not valid", `<p>This unsubscribe link isn't valid.</p>`));
    try {
      await memberEmail.setEmailPref(u, s, false);
      res.type("html").send(page("Unsubscribed", `<p style="font-size:16px;line-height:1.5">Done. You won't get ${escapeHtml(SCOPE_LABEL[s] ?? "these emails")} any more.</p>
<p style="font-size:13px;color:#6B5F67">Changed your mind? Turn it back on in Settings inside the app.</p>`));
    } catch (e) {
      console.error("Unsubscribe error:", e);
      res.status(500).type("html").send(page("Something went wrong", `<p>We couldn't save that. Please try again.</p>`));
    }
  });

  // ── tonight's three ───────────────────────────────────────────────
  app.get("/api/daily-picks", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await getDailyPicks(userId));
    } catch (e) {
      console.error("Daily picks error:", e);
      res.status(500).json({ message: "Failed to load tonight's picks" });
    }
  });

  // ── background sweep ──────────────────────────────────────────────
  const sweep = () =>
    memberEmail
      .runMemberEmailSweep()
      .then((r) => {
        if ("counts" in r && r.counts && Object.keys(r.counts).length) console.log("[member-email]", r.counts);
      })
      .catch((e) => console.error("[member-email] sweep failed:", e));
  setTimeout(sweep, 20_000);
  setInterval(sweep, 15 * 60 * 1000);

  const picksSweep = () =>
    runDailyPicksPushSweep()
      .then((r) => {
        if ("notified" in r && r.notified) console.log("[daily-picks] notified", r.notified);
      })
      .catch((e) => console.error("[daily-picks] sweep failed:", e));
  setTimeout(picksSweep, 30_000);
  setInterval(picksSweep, 10 * 60 * 1000);
}
