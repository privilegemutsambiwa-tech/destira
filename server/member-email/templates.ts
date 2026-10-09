// Member lifecycle email templates. Each builder returns subject + HTML +
// plain text from REAL data only: a digest with nothing real to say isn't
// built at all (the caller skips the send), never padded with filler.
//
// HTML is table-based with inline styles, the only thing every mail client
// (Gmail app, Outlook, Apple Mail) renders reliably. Light warm ground with
// the ember accent, the app's own light theme, since most mail apps don't
// dark-mode custom backgrounds consistently.

export interface EmailContent {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export interface LayoutCtx {
  origin: string;
  firstName: string;
  unsubscribeUrl: string;
  /** What the unsubscribe link turns off, e.g. "the weekly digest". */
  unsubscribeLabel: string;
}

const C = {
  ground: "#FBF8F5",
  card: "#FFFFFF",
  ink: "#1A1418",
  muted: "#6B5F67",
  faint: "#9A8F96",
  line: "#EDE6E0",
  ember: "#B34B34",
  emberSoft: "#FBEDE8",
};

/** ", Tariro" when we know their name, "" when we don't. */
function comma(ctx: LayoutCtx): string {
  return ctx.firstName ? `, ${ctx.firstName}` : "";
}
function lead(ctx: LayoutCtx, withName: string, without: string): string {
  return ctx.firstName ? withName.replace("{name}", ctx.firstName) : without;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="background:${C.ember};border-radius:999px">
<a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font:600 15px/1 Helvetica,Arial,sans-serif;color:#FFFFFF;text-decoration:none">${esc(label)}</a>
</td></tr></table>`;
}

export function para(html: string): string {
  return `<p style="margin:0 0 14px;font:400 15.5px/1.6 Helvetica,Arial,sans-serif;color:${C.ink}">${html}</p>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 14px;font:400 30px/1.15 Georgia,'Times New Roman',serif;color:${C.ink}">${esc(text)}</h1>`;
}

/** A compact list of real items (events, people counts, steps). */
export function itemList(items: { title: string; detail?: string; href?: string }[]): string {
  const rows = items
    .map((it) => {
      const title = it.href
        ? `<a href="${esc(it.href)}" style="color:${C.ink};text-decoration:none;font-weight:600">${esc(it.title)}</a>`
        : `<span style="font-weight:600">${esc(it.title)}</span>`;
      return `<tr><td style="padding:12px 0;border-top:1px solid ${C.line};font:400 14.5px/1.45 Helvetica,Arial,sans-serif;color:${C.ink}">
${title}${it.detail ? `<div style="color:${C.muted};font-size:13.5px;margin-top:2px">${esc(it.detail)}</div>` : ""}
</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px">${rows}</table>`;
}

export function layout(ctx: LayoutCtx, preheader: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Destira</title></head>
<body style="margin:0;padding:0;background:${C.ground}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 6px 18px">
<a href="${esc(ctx.origin)}" style="text-decoration:none"><img src="${esc(ctx.origin)}/brand/destira-icon-192.png" width="36" height="36" alt="Destira" style="border-radius:9px;vertical-align:middle;border:0">
<span style="font:400 22px/36px Georgia,serif;color:${C.ink};vertical-align:middle;margin-left:8px">destira</span></a>
</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:20px;padding:30px 28px">${body}</td></tr>
<tr><td style="padding:18px 8px;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:${C.faint}">
You're getting this because you have a Destira account.
<a href="${esc(ctx.unsubscribeUrl)}" style="color:${C.faint}">Stop ${esc(ctx.unsubscribeLabel)}</a>
· <a href="${esc(ctx.origin)}/settings" style="color:${C.faint}">Email settings</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

export function textFooter(ctx: LayoutCtx): string {
  return `\n\n—\nDestira · ${ctx.origin}\nStop ${ctx.unsubscribeLabel}: ${ctx.unsubscribeUrl}`;
}

// ── kinds ───────────────────────────────────────────────────────────

export function welcomeEmail(ctx: LayoutCtx, d: { nextStepHref: string; nextStepLabel: string; eventsThisWeek: number; city: string | null }): EmailContent {
  const subject = `Welcome to Destira${comma(ctx)}`;
  const preheader = "Your twin does the awkward first part. Here's how to get the most out of it.";
  const where = d.city ? ` in ${d.city}` : "";
  const eventsLine = d.eventsThisWeek > 0
    ? `There ${d.eventsThisWeek === 1 ? "is" : "are"} <strong>${d.eventsThisWeek} event${d.eventsThisWeek === 1 ? "" : "s"}${esc(where)}</strong> this week you can join.`
    : `Lounges and events are where people actually meet. Have a look around.`;
  const body = [
    heading(`You're in${comma(ctx)}.`),
    para("Destira is built around meeting people, not endless swiping. Your AI twin learns what you're like from a few questions, then helps spot who you'd actually get on with."),
    para(eventsLine),
    para("The single thing that helps most right now:"),
    button(d.nextStepHref, d.nextStepLabel),
  ].join("");
  const text = `You're in${comma(ctx)}.\n\nDestira is built around meeting people, not endless swiping. Your AI twin learns what you're like from a few questions, then helps spot who you'd actually get on with.\n\n${d.nextStepLabel}: ${d.nextStepHref}`;
  return { subject, preheader, html: layout(ctx, preheader, body), text: text + textFooter(ctx) };
}

export function finishProfileEmail(ctx: LayoutCtx, d: { steps: { title: string; detail: string; href: string }[]; rewardLine: string }): EmailContent {
  const subject = lead(ctx, "{name}, you're a few steps from being seen", "You're a few steps from being seen");
  const preheader = "Profiles with a photo and answers are the ones people say yes to.";
  const body = [
    heading("A few steps and you're visible."),
    para("Right now people can't get a real sense of you yet. These take a couple of minutes:"),
    itemList(d.steps),
    para(esc(d.rewardLine)),
    button(d.steps[0]?.href ?? ctx.origin, "Pick up where you left off"),
  ].join("");
  const text = `A few steps and you're visible.\n\n${d.steps.map((s) => `• ${s.title}: ${s.href}`).join("\n")}\n\n${d.rewardLine}`;
  return { subject, preheader, html: layout(ctx, preheader, body), text: text + textFooter(ctx) };
}

export function likesWaitingEmail(ctx: LayoutCtx, d: { count: number; href: string }): EmailContent {
  const who = d.count === 1 ? "Someone" : `${d.count} people`;
  const subject = `${who} liked you on Destira`;
  const preheader = "Open the app to see who, and like them back if it's mutual.";
  const body = [
    heading(`${who} liked you.`),
    para(`${d.count === 1 ? "They're" : "They're all"} waiting on your side. If it's mutual, you can start talking straight away.`),
    button(d.href, "See who liked you"),
  ].join("");
  const text = `${who} liked you on Destira. See who: ${d.href}`;
  return { subject, preheader, html: layout(ctx, preheader, body), text: text + textFooter(ctx) };
}

export function digestEmail(
  ctx: LayoutCtx,
  d: { city: string | null; newPeople: number; events: { title: string; detail: string; href: string }[]; likesWaiting: number; eventsHref: string; discoverHref: string },
): EmailContent {
  const place = d.city ?? "your area";
  const subject = d.events.length > 0
    ? `This week in ${place}: ${d.events[0].title}${d.events.length > 1 ? ` and ${d.events.length - 1} more` : ""}`
    : `${d.newPeople} new ${d.newPeople === 1 ? "person" : "people"} near you on Destira this week`;
  const preheader = "What's happening this week, from real people near you.";
  const parts = [heading(`This week in ${place}`)];
  if (d.likesWaiting > 0) {
    parts.push(para(`<strong>${d.likesWaiting} ${d.likesWaiting === 1 ? "person has" : "people have"} liked you</strong> and ${d.likesWaiting === 1 ? "is" : "are"} waiting on your side.`));
  }
  if (d.newPeople > 0) {
    parts.push(para(`<strong>${d.newPeople} new ${d.newPeople === 1 ? "person" : "people"}</strong> joined near you this week.`));
  }
  if (d.events.length > 0) {
    parts.push(para("Coming up, with seats open:"));
    parts.push(itemList(d.events));
    parts.push(button(d.eventsHref, "See all events"));
  } else {
    parts.push(button(d.discoverHref, "See who's new"));
  }
  const text = [
    `This week in ${place}`,
    d.likesWaiting > 0 ? `${d.likesWaiting} liked you and are waiting on your side.` : "",
    d.newPeople > 0 ? `${d.newPeople} new people joined near you.` : "",
    ...d.events.map((e) => `• ${e.title} (${e.detail}): ${e.href}`),
  ].filter(Boolean).join("\n");
  return { subject, preheader, html: layout(ctx, preheader, parts.join("")), text: text + textFooter(ctx) };
}

export function winBackEmail(
  ctx: LayoutCtx,
  d: { daysAway: number; newPeople: number; likesWaiting: number; nextEvent: { title: string; detail: string; href: string } | null; href: string },
): EmailContent {
  const subject = d.likesWaiting > 0
    ? `${lead(ctx, "{name}, ", "")}${d.likesWaiting === 1 ? (ctx.firstName ? "someone is" : "Someone is") : `${d.likesWaiting} people are`} waiting on you`
    : lead(ctx, "{name}, here's what you missed on Destira", "Here's what you missed on Destira");
  const preheader = "A quick catch-up on what changed while you were away.";
  const lines: string[] = [];
  if (d.likesWaiting > 0) lines.push(`<strong>${d.likesWaiting} ${d.likesWaiting === 1 ? "like" : "likes"}</strong> you haven't seen yet`);
  if (d.newPeople > 0) lines.push(`<strong>${d.newPeople} new ${d.newPeople === 1 ? "person" : "people"}</strong> near you`);
  const body = [
    heading("Here's what changed while you were away."),
    lines.length ? para(lines.join(" · ")) : "",
    d.nextEvent ? para("Coming up near you:") + itemList([d.nextEvent]) : "",
    button(d.href, "Open Destira"),
  ].join("");
  const text = [
    "Here's what changed while you were away.",
    d.likesWaiting > 0 ? `${d.likesWaiting} likes you haven't seen yet.` : "",
    d.newPeople > 0 ? `${d.newPeople} new people near you.` : "",
    d.nextEvent ? `Coming up: ${d.nextEvent.title} (${d.nextEvent.detail}) ${d.nextEvent.href}` : "",
    d.href,
  ].filter(Boolean).join("\n");
  return { subject, preheader, html: layout(ctx, preheader, body), text: text + textFooter(ctx) };
}
