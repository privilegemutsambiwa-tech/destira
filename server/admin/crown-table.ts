// Console: Crown Table dinners (shared/crown-table.ts, server/crown-table.ts).
//   GET  /api/admin/crown-table              dinners with who's coming, and partner venues to pick from
//   POST /api/admin/crown-table              { title, placeId, startsAt, seats, note } tells every Crown member
//   POST /api/admin/crown-table/:id/cancel   { reason } tells everyone holding a seat
import type { Express } from "express";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { crownDinnerSeats, crownDinners, places, profiles } from "@shared/schema";
import { CROWN_DINNER_SEATS_MAX, CROWN_DINNER_SEATS_MIN } from "@shared/crown-table";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import { activeCrownIds } from "../crown";
import { notify } from "../push";

const adminId = (req: any): string => req.admin.userId;
const whenLabel = (d: Date) => d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" });

export function registerAdminCrownTableRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/crown-table", "support", async (_req, res) => {
    try {
      const dinners = await db.select().from(crownDinners).orderBy(desc(crownDinners.startsAt)).limit(24);
      const ids = dinners.map((d) => d.id);
      const seats = ids.length ? await db.select().from(crownDinnerSeats).where(inArray(crownDinnerSeats.dinnerId, ids)) : [];
      const people = Array.from(new Set(seats.flatMap((s) => [s.userId, s.guestOf ?? ""]).filter(Boolean)));
      const ps = people.length ? await db.select({ userId: profiles.userId, displayName: profiles.displayName }).from(profiles).where(inArray(profiles.userId, people)) : [];
      const nm = new Map(ps.map((p) => [p.userId, (p.displayName || "").trim() || "No name"]));
      const venues = await db.select({ id: places.id, name: places.name, suburb: places.suburb, city: places.city, partnerOffer: places.partnerOffer })
        .from(places).where(isNotNull(places.partnerSince)).orderBy(places.name);
      res.json({
        crownMembers: (await activeCrownIds()).size,
        venues,
        dinners: dinners.map((d) => {
          const mine = seats.filter((s) => s.dinnerId === d.id);
          return {
            ...d,
            startsAt: d.startsAt.toISOString(),
            createdAt: d.createdAt.toISOString(),
            held: mine.filter((s) => s.status === "going" || s.status === "invited").length,
            people: mine.filter((s) => s.status !== "cancelled").map((s) => ({
              userId: s.userId, name: nm.get(s.userId) ?? "No name", status: s.status, guestOf: s.guestOf ? nm.get(s.guestOf) ?? "No name" : null,
            })),
          };
        }),
      });
    } catch (e) {
      console.error("[admin crown table] list failed:", e);
      res.status(500).json({ message: "Couldn't load" });
    }
  });

  adminRoute(app, "post", "/api/admin/crown-table", "admin", async (req, res) => {
    const b = req.body ?? {};
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 500) : null;
    const seats = Number(b.seats);
    const startsAt = new Date(b.startsAt);
    if (title.length < 3 || title.length > 80) return res.status(400).json({ message: "Give it a name (3 to 80 characters)." });
    if (!Number.isInteger(seats) || seats < CROWN_DINNER_SEATS_MIN || seats > CROWN_DINNER_SEATS_MAX) return res.status(400).json({ message: `Seats: ${CROWN_DINNER_SEATS_MIN} to ${CROWN_DINNER_SEATS_MAX}.` });
    if (isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() + 24 * 3600e3) return res.status(400).json({ message: "Set it at least a day ahead." });
    try {
      const [place] = await db.select().from(places).where(and(eq(places.id, Number(b.placeId)), isNotNull(places.partnerSince)));
      if (!place) return res.status(400).json({ message: "Pick one of the partner venues." });
      const [d] = await db.insert(crownDinners).values({
        title, placeId: place.id, venueName: place.name, venueDetail: [place.addressLine, place.suburb].filter(Boolean).join(", "),
        startsAt, seats, note, createdBy: adminId(req), createdAt: new Date(),
      }).returning();
      await auditAdmin(req, adminId(req), "crown_table.create", { targetType: "crown_dinner", targetId: d.id, details: { title, placeId: place.id, seats } });
      for (const uid of Array.from(await activeCrownIds())) {
        notify(uid, "account", {
          type: "crown_table",
          title: `Crown Table: ${title}`,
          body: `${whenLabel(startsAt)} at ${place.name}. ${seats} seats. Take yours, and bring a guest if you like.`,
          url: "/crown/table",
          tag: `crown-dinner-${d.id}`,
        }).catch(() => {});
      }
      res.status(201).json({ id: d.id });
    } catch (e) {
      console.error("[admin crown table] create failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });

  adminRoute(app, "post", "/api/admin/crown-table/:id/cancel", "admin", async (req, res) => {
    const id = Number(req.params.id);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 5) return res.status(400).json({ message: "Say why. Everyone with a seat will read it." });
    try {
      const [d] = await db.update(crownDinners).set({ status: "cancelled", cancelReason: reason })
        .where(and(eq(crownDinners.id, id), eq(crownDinners.status, "scheduled"))).returning();
      if (!d) return res.status(404).json({ message: "Not found, or already off." });
      await auditAdmin(req, adminId(req), "crown_table.cancel", { targetType: "crown_dinner", targetId: id, details: { reason } });
      const held = await db.select({ userId: crownDinnerSeats.userId }).from(crownDinnerSeats)
        .where(and(eq(crownDinnerSeats.dinnerId, id), inArray(crownDinnerSeats.status, ["going", "invited"])));
      for (const h of held) {
        notify(h.userId, "account", { type: "crown_table", title: `${d.title} is off`, body: reason.slice(0, 140), url: "/crown/table", tag: `crown-dinner-${id}` }).catch(() => {});
      }
      res.json({ ok: true, told: held.length });
    } catch (e) {
      console.error("[admin crown table] cancel failed:", e);
      res.status(500).json({ message: "Couldn't save" });
    }
  });
}
