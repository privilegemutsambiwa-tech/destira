// Chat threads, who liked you, room lists and starred messages.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { and } from "drizzle-orm";
import { profiles } from "@shared/schema";
import { withRoomExtras } from "../lounge-extras";
import * as gate from "../gate";
import { introMatchIds } from "../crown-perks";
import { activeLikesPass } from "../single-purchases";
import { notifyMatch, getUserId } from "./shared";

export function registerInboxRoutes(app: Express) {
  app.get("/api/chat/threads", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const filter = (req.query.filter as string) || "all";
    try {
      const threads: any[] = [];

      // The two blocks below (matches, AI Twin interviews) are completely
      // independent — both used to run one after the other for the common
      // filter="all" case, roughly doubling this endpoint's latency for no
      // reason. Each is wrapped so Promise.all can run them concurrently.
      const loadMatchThreads = async (): Promise<any[]> => {
        if (!(filter === "all" || filter === "match" || filter === "matches" || filter === "friends")) return [];
        const userMatches = await storage.getMatchesWithProfiles(userId);
        // "Matches" is dating only; "Friends" is friendships only (Part O).
        const wantKind = filter === "friends" ? "friends" : filter === "all" ? null : "love";
        const matchThreads = await Promise.all(
          userMatches
            .filter((m: any) => m.status === "matched" && (!wantKind || (m.kind ?? "love") === wantKind))
            .map(async (m: any) => {
              // getDirectMessages orders oldest-first for rendering the
              // conversation — getLastDirectMessage is the DESC/LIMIT-1 query
              // that actually gets the newest message, so the preview
              // doesn't get stuck on the first message ever sent. These two
              // are independent per-match queries, so they run concurrently
              // too instead of doubling the wait for every match.
              const [lastMsg, unreadCount] = await Promise.all([
                storage.getLastDirectMessage(m.id),
                storage.getUnreadDirectMessageCount(m.id, userId),
              ]);
              return {
                id: `match_${m.id}`,
                type: "match",
                kind: m.kind ?? "love",
                matchId: m.id,
                partnerId: m.otherProfile?.userId ?? null,
                name: m.otherProfile?.displayName || "Match",
                avatar: m.otherProfile?.coverPhotoUrl || null,
                lastMessage: lastMsg?.unsentAt ? "Message unsent" : lastMsg?.content || "Start chatting!",
                lastMessageAt: lastMsg?.createdAt || m.createdAt,
                unreadCount,
                href: `/chat/${m.id}`,
              };
            }),
        );

        // Duplicate match rows for the same pair can exist from old data (or
        // a race before getActiveMatchBetweenUsers's dedupe check) — collapse
        // to the most recently active one per partner, summing unread counts
        // across the collapsed rows so nothing gets silently dropped.
        const byPartner = new Map<string, any>();
        for (const t of matchThreads.sort(
          (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
        )) {
          const key = t.partnerId || t.id;
          const existing = byPartner.get(key);
          if (!existing) {
            byPartner.set(key, t);
          } else {
            existing.unreadCount += t.unreadCount;
          }
        }
        return [...byPartner.values()];
      };

      const loadInterviewThreads = async (): Promise<any[]> => {
        if (!(filter === "all" || filter === "ai_twin_interview" || filter === "ai_twin")) return [];
        const userInterviews = await storage.getInterviewsWithProfiles(userId);
        const interviewThreads = userInterviews.map((iv: any) => {
          let lastMsg = "";
          if (iv.transcript) {
            try {
              const parsed = JSON.parse(iv.transcript);
              if (parsed.length > 0) lastMsg = parsed[parsed.length - 1].content || "";
            } catch {}
          }
          const partnerId = iv.requesterId === userId ? iv.targetId : iv.requesterId;
          // Someone asking YOUR twin shows as them asking it, not as a chat
          // with "your own name's twin".
          const asked = iv.requesterId !== userId;
          return {
            id: `interview_${iv.id}`,
            type: "ai_twin_interview",
            interviewId: iv.id,
            partnerId,
            viewerRole: asked ? "asked" : "asker",
            name: asked
              ? `${iv.requesterProfile?.displayName || "Someone"} asked your twin`
              : `${iv.targetProfile?.displayName || "Unknown"}'s twin`,
            avatar: asked ? iv.requesterProfile?.coverPhotoUrl || null : iv.targetProfile?.coverPhotoUrl || null,
            lastMessage: lastMsg || (asked ? "Nothing asked yet" : "Start interview"),
            // updatedAt tracks the transcript's true last-activity time;
            // createdAt is only ever the interview's start time.
            lastMessageAt: iv.updatedAt || iv.createdAt,
            unreadCount: 0,
            href: `/interviews/${iv.id}/chat`,
          };
        });

        // Every "Meet their Twin" tap used to insert a brand-new interview
        // row for the same partner (server/storage.ts createInterview is now
        // idempotent going forward), so historical duplicates can still exist
        // — collapse to one thread per partner, keeping whichever interview
        // was active most recently.
        const byInterviewPartner = new Map<string, any>();
        for (const t of interviewThreads.sort(
          (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
        )) {
          if (!byInterviewPartner.has(t.partnerId)) byInterviewPartner.set(t.partnerId, t);
        }
        return [...byInterviewPartner.values()];
      };

      const [matchThreads, interviewThreads] = await Promise.all([loadMatchThreads(), loadInterviewThreads()]);
      threads.push(...matchThreads, ...interviewThreads);

      // A dedicated tab, not folded into "all" — replies to your stories are
      // a different relationship than a match or a twin interview, and
      // blending them in would bury the unread badge this tab exists for.
      if (filter === "story_replies") {
        const replyThreads = await storage.getStoryRepliesForOwner(userId);
        threads.push(
          ...replyThreads.map((t: any) => ({
            id: `story_reply_${t.commenterId}`,
            type: "story_reply",
            partnerId: t.commenterId,
            name: t.displayName,
            avatar: t.photoUrl,
            lastMessage: t.lastReply.text,
            lastMessageAt: t.lastReply.createdAt,
            unreadCount: t.unread ? 1 : 0,
            href: `/u/${t.commenterId}`,
          })),
        );
      }

      threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      res.json(threads);
    } catch (e) {
      console.error("Chat threads error:", e);
      res.status(500).json({ message: "Failed to fetch chat threads" });
    }
  });

  // People whose twin talked to yours and who asked to meet. Never gated —
  // the landing page promises we don't sell back people who already liked you,
  // so full profiles always, no blur, no tier check.
  app.get("/api/likes/incoming", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const canSee = (await gate.checkGate(userId, "see_who_asked")).ok;
      const userMatches = await storage.getMatchesWithProfiles(userId);
      // Crown introductions have their own section (/api/crown/intros/incoming).
      const intros = await introMatchIds(userId);
      const pendingRaw = userMatches.filter((m: any) => m.status === "pending" && !m.isRequester && !intros.has(m.id));

      // Old data (or a race before the create-match dedupe) can leave more
      // than one pending row for the same pair — collapse to one per person,
      // keeping their most recent ask, so nobody shows up twice.
      const byRequester = new Map<string, any>();
      for (const m of pendingRaw.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) {
        if (!byRequester.has(m.user1Id)) byRequester.set(m.user1Id, m);
      }
      // Super likes first (server/discover-perks.ts).
      const pending = [...byRequester.values()].sort((a: any, b: any) => Number(!!b.isSuper) - Number(!!a.isSuper));

      // Below Spark you get the COUNT, not the people — no names, no photos, no
      // userId (so the row can't be opened). Never a fake blur. A super like
      // is the exception on every plan: the sender chose to be seen.
      const likes = pending.map((m: any) => {
        if (!canSee && !m.isSuper) return { matchId: m.id, createdAt: m.createdAt, masked: true, profile: null, fromUserId: null };
        return {
          matchId: m.id,
          fromUserId: m.isRequester ? m.user2Id : m.user1Id,
          profile: m.otherProfile ? { ...m.otherProfile, blurred: false } : null,
          createdAt: m.createdAt,
          isSuper: !!m.isSuper,
        };
      });

      res.json({ likes, totalCount: pending.length, seeWhoAsked: canSee, likesPassUntil: await activeLikesPass(userId) });
    } catch (e) {
      console.error("Likes incoming error:", e);
      res.status(500).json({ message: "Failed to fetch incoming likes" });
    }
  });

  // Your outgoing asks — mirror of the incoming filter, requester side.
  app.get("/api/likes/outgoing", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const userMatches = await storage.getMatchesWithProfiles(userId);
      // Dating asks only: a friendship (two waves) is not an ask.
      const outgoingRaw = userMatches.filter((m: any) => m.isRequester && m.status !== "unmatched" && m.kind !== "friends");

      // Defensively collapse to one row per recipient — legacy data (or a race
      // before /api/matches' active-match check) can leave more than one
      // outgoing row for the same person, and they should only render once.
      const byRecipient = new Map<string, any>();
      for (const m of outgoingRaw.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) {
        const toUserId = m.isRequester ? m.user2Id : m.user1Id;
        if (!byRecipient.has(toUserId)) byRecipient.set(toUserId, m);
      }

      const asks = [...byRecipient.values()].map((m: any) => ({
        matchId: m.id,
        toUserId: m.isRequester ? m.user2Id : m.user1Id,
        profile: m.otherProfile ? { ...m.otherProfile, blurred: false } : null,
        status: m.status,
        createdAt: m.createdAt,
      }));

      res.json({ asks, totalCount: asks.length });
    } catch (e) {
      console.error("Likes outgoing error:", e);
      res.status(500).json({ message: "Failed to fetch outgoing likes" });
    }
  });

  app.post("/api/likes/:matchId/like-back", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.matchId);
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.user2Id !== userId) return res.sendStatus(403);
      const updated = await storage.updateMatchStatus(matchId, "matched");
      if (match.status !== "matched") void notifyMatch(updated);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to like back" });
    }
  });

  app.get("/api/lounge/groups", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const filter = (req.query.filter as string) || "all";
    const search = (req.query.search as string) || "";
    try {
      let rawGroups;
      if (search) {
        rawGroups = await storage.searchGroups(search);
      } else {
        rawGroups = await storage.getGroups();
      }
      rawGroups = rawGroups.filter((g: any) => !g.isEventChat);

      let allGroups = await Promise.all(rawGroups.map(async (g) => {
        const members = await storage.getGroupMembers(g.id);
        const myMember = members.find(m => m.userId === userId);
        const isMember = Boolean(myMember);
        const myRole = myMember?.role;
        const isMuted = myMember?.isMuted ?? false;
        // Only members get a message preview, and only from after they joined.
        const since = myMember?.joinedAt ?? undefined;
        const lastMsg = myMember ? await storage.getLatestGroupMessage(g.id, since) : undefined;
        // The sender's CURRENT group nickname, not the snapshot stored on the
        // message row — a preview showing who's active in the group should
        // never lag behind a nickname change the way the full chat history
        // intentionally does (chat history is a record of what was sent).
        const lastMsgSender = lastMsg ? members.find((m) => m.userId === lastMsg.userId) : undefined;
        const unreadCount = myMember
          ? await storage.getUnreadGroupMessageCount(g.id, since, myMember.lastSeenMessageId ?? null)
          : 0;
        return {
          ...g,
          memberCount: members.length,
          isMember,
          myRole,
          isMuted,
          lastMessage: lastMsg?.content || null,
          lastMessageNickname: lastMsgSender?.nickname || lastMsg?.nickname || null,
          lastMessageAt: lastMsg?.createdAt || g.createdAt,
          unreadCount,
        };
      }));

      if (filter === "joined") {
        allGroups = allGroups.filter((g: any) => g.isMember);
      } else if (filter === "popular") {
        allGroups.sort((a: any, b: any) => (b.memberCount || 0) - (a.memberCount || 0));
      } else if (filter === "new") {
        allGroups.sort((a: any, b: any) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
      } else if (filter === "official") {
        allGroups = allGroups.filter((g: any) => g.isOfficial);
      }

      allGroups.sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
      res.json(await withRoomExtras(userId, allGroups));
    } catch (e) {
      console.error("Lounge groups error:", e);
      res.status(500).json({ message: "Failed to fetch lounge groups" });
    }
  });

  app.get("/api/profiles/me/completion", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const completion = await storage.getProfileCompletion(userId);
      await storage.updateProfileCompletionScore(userId, completion.score);
      res.json(completion);
    } catch (e) {
      res.status(500).json({ message: "Failed to get profile completion" });
    }
  });

  app.post("/api/messages/:messageId/star", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const messageId = parseInt(req.params.messageId);
    const { groupId } = req.body;
    try {
      const starred = await storage.starMessage(messageId, userId, groupId);
      res.json(starred);
    } catch (e) {
      res.status(500).json({ message: "Failed to star message" });
    }
  });

  app.delete("/api/messages/:messageId/star", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const messageId = parseInt(req.params.messageId);
    try {
      await storage.unstarMessage(messageId, userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to unstar message" });
    }
  });

  app.get("/api/groups/:id/starred", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const starred = await storage.getStarredMessages(groupId, userId);
      res.json(starred);
    } catch (e) {
      res.status(500).json({ message: "Failed to get starred messages" });
    }
  });

  app.patch("/api/groups/:id/settings", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const members = await storage.getGroupMembers(groupId);
      const member = members.find(m => m.userId === userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Only admins can update group settings" });
      }
      const {
        rulesText, canMembersEditInfo, canMembersSendMessages, canMembersAddOthers,
        postingPermission, mediaPermission, privacyMode, maxMembers
      } = req.body;
      const updates: any = {};
      if (rulesText !== undefined) updates.rulesText = rulesText;
      if (canMembersEditInfo !== undefined) updates.canMembersEditInfo = Boolean(canMembersEditInfo);
      if (canMembersSendMessages !== undefined) updates.canMembersSendMessages = Boolean(canMembersSendMessages);
      if (canMembersAddOthers !== undefined) updates.canMembersAddOthers = Boolean(canMembersAddOthers);
      if (postingPermission !== undefined && ["everyone", "admins_only"].includes(postingPermission)) updates.postingPermission = postingPermission;
      if (mediaPermission !== undefined && ["everyone", "admin_only"].includes(mediaPermission)) updates.mediaPermission = mediaPermission;
      if (privacyMode !== undefined && ["open", "request-to-join", "invite-only"].includes(privacyMode)) updates.privacyMode = privacyMode;
      if (maxMembers !== undefined) updates.maxMembers = Math.max(2, Math.min(5000, parseInt(maxMembers) || 500));
      const group = await storage.updateGroup(groupId, updates);
      res.json(group);
    } catch (e) {
      res.status(500).json({ message: "Failed to update group settings" });
    }
  });
}
