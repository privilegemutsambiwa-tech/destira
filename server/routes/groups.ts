// Lounge rooms: create, join, invites, members and messages.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { and } from "drizzle-orm";
import crypto from "crypto";
import * as gate from "../gate";
import * as groupInvite from "../group-invite";
import * as safety from "../safety";
import { notifyRoomMessage } from "../lounge-discovery";
import { denyIfCantPost } from "../lounge-moderation";
import { getUserId } from "./shared";

export function registerGroupsRoutes(app: Express) {
  app.get("/api/groups", async (req, res) => {
    const userId = getUserId(req);
    const search = req.query.search as string | undefined;
    try {
      let allGroups;
      if (search) {
        allGroups = await storage.searchGroups(search);
      } else {
        allGroups = await storage.getGroups();
      }
      allGroups = allGroups.filter((g: any) => !g.isEventChat);
      const groupsWithCounts = await Promise.all(allGroups.map(async (g) => {
        const members = await storage.getGroupMembers(g.id);
        const isMember = userId ? members.some(m => m.userId === userId) : false;
        const myRole = userId ? members.find(m => m.userId === userId)?.role : undefined;
        return { ...g, memberCount: members.length, isMember, myRole };
      }));
      res.json(groupsWithCounts);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch groups" });
    }
  });

  app.post("/api/groups", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (await gate.denyIfGated(res, userId, "create_group")) return;
    const { name, description, type, iconUrl, categoryTags, privacyMode, mediaEnabled, stickersEnabled, postingPermission, inviteDirectJoinEnabled, locationLabel } = req.body;
    try {
      const group = await storage.createGroupFull({
        name, description: description || "", type: type || "custom",
        ownerId: userId, iconUrl, categoryTags, privacyMode,
        locationLabel: typeof locationLabel === "string" && locationLabel.trim() ? locationLabel.trim().slice(0, 60) : undefined,
        mediaEnabled, stickersEnabled, postingPermission, inviteDirectJoinEnabled,
      });
      const creatorProfile = await storage.getProfile(userId);
      const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
      const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
      const fallbackNick = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
      const nickname = creatorProfile?.groupNickname || creatorProfile?.displayName || fallbackNick;
      await storage.joinGroup(group.id, userId, nickname);
      await storage.updateGroupMemberRole(group.id, userId, "owner");
      res.status(201).json(group);
    } catch (e) {
      console.error("Group create error:", e);
      res.status(500).json({ message: "Failed to create group" });
    }
  });

  app.get("/api/groups/:id", async (req, res) => {
    const groupId = parseInt(req.params.id);
    const userId = getUserId(req);
    try {
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ message: "Group not found" });
      const rawMembers = await storage.getGroupMembers(groupId);
      // Bare gender only, same as the enriched-messages endpoint — a Lounge
      // is for meeting people, so who's who is part of the point.
      const membersWithGender = await Promise.all(rawMembers.map(async (m) => {
        const profile = await storage.getProfile(m.userId);
        return { ...m, gender: profile?.gender || null };
      }));
      const isMember = userId ? membersWithGender.some(m => m.userId === userId) : false;
      const myRole = userId ? membersWithGender.find(m => m.userId === userId)?.role : undefined;
      res.json({ ...group, memberCount: membersWithGender.length, members: membersWithGender, isMember, myRole });
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch group" });
    }
  });

  app.put("/api/groups/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Only admins can edit group settings" });
      }
      const updated = await storage.updateGroup(groupId, req.body);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to update group" });
    }
  });

  app.delete("/api/groups/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || member.role !== "owner") {
        return res.status(403).json({ message: "Only owner can delete group" });
      }
      await storage.deleteGroup(groupId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete group" });
    }
  });

  app.post("/api/groups/:id/join", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const isMember = await storage.isGroupMember(groupId, userId);
      if (isMember) return res.status(409).json({ message: "Already a member" });

      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ message: "Group not found" });

      const gj = await gate.checkGate(userId, "join_group");
      if (!gj.ok) {
        return res.status(403).json(gate.gateBody(gj, "join_group"));
      }

      if (group.privacyMode === "request-to-join") {
        const request = await storage.createJoinRequest(groupId, userId);
        return res.json({ status: "requested", request });
      }

      if (group.privacyMode === "invite-only") {
        return res.status(403).json({ message: "This group is invite-only" });
      }

      const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
      const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
      const fallbackNickname = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
      const joinerProfile = await storage.getProfile(userId);
      const nickname = joinerProfile?.groupNickname || fallbackNickname;
      const member = await storage.joinGroup(groupId, userId, nickname);
      res.json(member);
    } catch (e) {
      res.status(500).json({ message: "Failed to join group" });
    }
  });

  app.get("/api/groups/:id/join-requests", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const requests = await storage.getJoinRequests(groupId);
      res.json(requests);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch join requests" });
    }
  });

  app.put("/api/groups/:id/join-requests/:requestId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const requestId = parseInt(req.params.requestId);
    const { status } = req.body;
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (status === "approved") {
        const pending = await storage.getJoinRequests(groupId);
        const target = pending.find((r) => r.id === requestId);
        if (target) {
          const gj = await gate.checkGate(target.userId, "join_group");
          if (!gj.ok) {
            return res.status(403).json({
              groupCapped: true,
              message: `They're in ${gj.used} rooms already, the most their plan allows. They'll need to leave one before joining this one.`,
            });
          }
        }
      }
      const processed = await storage.processJoinRequest(requestId, userId, status);
      if (status === "approved") {
        const joinerProfile = await storage.getProfile(processed.userId);
        const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
        const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
        const fallbackNickname = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
        const approvedNickname = joinerProfile?.groupNickname || fallbackNickname;
        await storage.joinGroup(groupId, processed.userId, approvedNickname);
      }
      res.json(processed);
    } catch (e) {
      res.status(500).json({ message: "Failed to process join request" });
    }
  });

  app.post("/api/groups/:id/invite-link", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ message: "Group not found" });
      // Circles, Sunday Table and plan chats are for the people in them: no links.
      if (group.type === "circle" || group.type === "table" || group.type === "plan") return res.status(403).json({ message: "Invite people from the circle's page instead." });
      const member = await storage.getGroupMember(groupId, userId);
      const isOwner = group.ownerId === userId;
      const isAdmin = member?.role === "owner" || member?.role === "admin";
      const memberCanInvite = !!member && (group.canMembersAddOthers || group.privacyMode === "open");
      if (!isOwner && !isAdmin && !memberCanInvite) {
        return res.status(403).json({ message: "Not authorized" });
      }
      // Only one invite link should ever be live for a group — retire any
      // existing active one before minting the new token.
      await storage.deactivateGroupInviteLinks(groupId);
      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const link = await storage.createInviteLink(groupId, userId, token, expiresAt);
      res.json(link);
    } catch (e) {
      res.status(500).json({ message: "Failed to create invite link" });
    }
  });

  app.get("/api/groups/:id/invite-links", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const link = await storage.getActiveGroupInviteLink(groupId);
      res.json(link ?? null);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch invite link" });
    }
  });

  app.post("/api/groups/join-by-invite/:token", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    // The client always sends the full "<groupId>-<token>" composite (same
    // shape as the URL param everywhere else — see the GET preview handler
    // below, which already stripped this the same way). Without this, every
    // real invite link 404'd here even though its preview resolved fine.
    const rawParam = req.params.token || "";
    const dashIdx = rawParam.indexOf("-");
    const token = dashIdx > 0 ? rawParam.slice(dashIdx + 1) : rawParam;
    try {
      const link = await storage.getInviteLink(token);
      if (!link || !link.isActive) return res.status(404).json({ message: "Invalid or expired invite link" });
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(410).json({ message: "Invite link expired" });
      }
      const isMember = await storage.isGroupMember(link.groupId, userId);
      if (isMember) return res.status(409).json({ message: "Already a member", groupId: link.groupId });

      const inviteGroup = await storage.getGroup(link.groupId);
      if (!inviteGroup || inviteGroup.type === "circle" || inviteGroup.type === "table" || inviteGroup.type === "plan") return res.status(404).json({ message: "Invalid or expired invite link" });

      if (typeof inviteGroup.maxMembers === "number") {
        const currentCount = (await storage.getGroupMembers(link.groupId)).length;
        if (currentCount >= inviteGroup.maxMembers) {
          return res.status(409).json({ message: "group_full", groupName: inviteGroup.name });
        }
      }

      const gj = await gate.checkGate(userId, "join_group");
      if (!gj.ok) {
        return res.status(403).json(gate.gateBody(gj, "join_group"));
      }

      if (inviteGroup.privacyMode === "request-to-join") {
        const joinRequest = await storage.createJoinRequest(link.groupId, userId);
        return res.json({ status: "requested", groupId: link.groupId, groupName: inviteGroup.name, request: joinRequest });
      }

      const inviteJoinerProfile = await storage.getProfile(userId);
      const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
      const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
      const fallbackNickname = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
      const inviteNickname = inviteJoinerProfile?.groupNickname || fallbackNickname;
      const member = await storage.joinGroup(link.groupId, userId, inviteNickname);
      res.json({ ...member, groupId: link.groupId, groupName: inviteGroup.name });
    } catch (e) {
      res.status(500).json({ message: "Failed to join via invite" });
    }
  });

  // The /join/:token OG/share-preview HTML itself is handled in
  // server/vite.ts (dev) and server/static.ts (prod) — NOT here. Both of
  // those already read/produce the page's index.html on every request
  // (Vite's own transformIndexHtml in dev, the built file in prod); this
  // used to duplicate that by reading client/index.html directly, which
  // skips Vite's transform and — in dev — drops the @vitejs/plugin-react
  // preamble it injects, which breaks React mounting entirely (blank page).
  // Enriching the HTML those two already produce, instead of generating a
  // competing copy, is both correct and avoids a second rendering stack.

  // Public (auth optional) — the join page's own data fetch. Same
  // token-resolution as the OG route above it in group-invite.ts, so what a
  // crawler is told and what this page shows can never drift apart.
  app.get("/api/groups/join-by-invite/:token/preview", async (req, res) => {
    const userId = getUserId(req);
    try {
      // The client sends the full "<groupId>-<token>" composite (same shape
      // as the URL param everywhere else — see the POST join handler and
      // the /join/:token OG route above), so it needs the same stripping.
      const rawParam = req.params.token || "";
      const dashIdx = rawParam.indexOf("-");
      const token = dashIdx > 0 ? rawParam.slice(dashIdx + 1) : rawParam;
      const resolution = await groupInvite.resolveInvite(token);
      if (!resolution.valid || !resolution.group) {
        return res.json({ valid: false, reason: resolution.reason ?? "invalid" });
      }
      const { group, memberCount, isFull, approvalRequired } = resolution;
      const isMember = userId ? await storage.isGroupMember(group.id, userId) : false;
      res.json({
        valid: true,
        groupId: group.id,
        name: group.name,
        description: group.description,
        photoUrl: groupInvite.groupHeroPhotoUrl(group),
        memberCount,
        categoryTags: group.categoryTags ?? [],
        approvalRequired,
        isFull,
        isMember,
        createdAt: group.createdAt,
      });
    } catch (e) {
      console.error("Invite preview error:", e);
      res.status(500).json({ valid: false, reason: "invalid" });
    }
  });

  // Public share-card image for a group's invite (og:image target). Cached
  // to disk by group id + content hash — see group-invite.ts. The hash in
  // the URL both cache-busts on change and makes the URL itself immutable,
  // which is friendlier to crawlers that cache aggressively per-URL.
  app.get("/api/groups/:id/share-card/:hash.jpg", async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).end();
      const members = await storage.getGroupMembers(groupId);
      const jpg = await groupInvite.getOrRenderShareCard(group, members.length);
      if (!jpg) return res.redirect(302, "/brand/og-default.png");
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.send(jpg);
    } catch (e) {
      console.error("Share card error:", e);
      res.redirect(302, "/brand/og-default.png");
    }
  });

  app.delete("/api/groups/:id/invite-links/:linkId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ message: "Group not found" });
      const member = await storage.getGroupMember(groupId, userId);
      const isOwner = group.ownerId === userId;
      const isAdmin = member?.role === "owner" || member?.role === "admin";
      const memberCanInvite = !!member && (group.canMembersAddOthers || group.privacyMode === "open");
      if (!isOwner && !isAdmin && !memberCanInvite) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.revokeInviteLink(parseInt(req.params.linkId), groupId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to revoke invite link" });
    }
  });

  app.get("/api/groups/:id/members", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const rawMembers = await storage.getGroupMembers(groupId);
      // Bare gender only, same as the enriched-messages endpoint — a Lounge
      // is for meeting people, so who's who is part of the point.
      const members = await Promise.all(rawMembers.map(async (m) => {
        const profile = await storage.getProfile(m.userId);
        return { ...m, gender: profile?.gender || null };
      }));
      res.json(members);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  app.put("/api/groups/:id/members/role", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { role, targetUserId } = req.body;
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || member.role !== "owner") {
        return res.status(403).json({ message: "Only owner can change roles" });
      }
      const updated = await storage.updateGroupMemberRole(groupId, targetUserId, role);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.delete("/api/groups/:id/members/:targetUserId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { targetUserId } = req.params;
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.removeGroupMember(groupId, targetUserId);
      await storage.createModerationLog({ groupId, userId: targetUserId, action: "removed", moderatedBy: userId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  app.delete("/api/groups/:id/messages/:messageId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const messageId = parseInt(req.params.messageId);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const deleted = await storage.deleteGroupMessage(messageId);
      await storage.createModerationLog({ groupId, messageId, userId: deleted.userId, action: "message_deleted", moderatedBy: userId });
      res.json(deleted);
    } catch (e) {
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  app.get("/api/groups/:id/messages", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      // Members only, and only what was sent after they joined.
      const msgs = await storage.getVisibleGroupMessages(groupId, userId);
      // What a removed or unsent message said stays on the server.
      res.json(msgs.map((m) => ({ ...m, originalContent: null, mediaKey: null })));
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/groups/:id/messages", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { content, contentType, mediaUrl, replyToMessageId } = req.body;
    try {
      const members = await storage.getGroupMembers(groupId);
      const member = members.find(m => m.userId === userId);
      if (!member) return res.status(403).json({ message: "Must join group first" });

      const group = await storage.getGroup(groupId);
      if (group?.postingPermission === "admins_only" && member.role === "member") {
        return res.status(403).json({ message: "Only admins can post in this group" });
      }

      if (group?.canMembersSendMessages === false && member.role !== "owner" && member.role !== "admin") {
        return res.status(403).json({ message: "The host has turned off messaging in this group" });
      }

      if ((contentType === "image" || contentType === "video") && group?.mediaPermission === "admin_only" && member.role === "member") {
        return res.status(403).json({ message: "Only admins can post media in this group" });
      }
      if (await denyIfCantPost(res, group, member)) return;

      let displayNickname = member.nickname;
      if (!displayNickname) {
        const profile = await storage.getProfile(userId);
        displayNickname = profile?.groupNickname || profile?.displayName || "Anonymous";
      }
      if (await safety.blockIfHeld(res, userId)) return;
      const msg = await storage.sendGroupMessage(groupId, userId, displayNickname, content, {
        contentType, mediaUrl, replyToMessageId
      });
      res.status(201).json(msg);
      safety.scanText({ senderId: userId, text: content, source: "group", refId: msg.id, recipientId: `group:${groupId}` }).catch(() => {});
      notifyRoomMessage(groupId, userId, msg).catch((e) => console.error("[lounge] mention notify failed:", e));
    } catch (e) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // The client calls this once it's actually shown someone the latest
  // message in a group thread (mirrors how a match's read-state is only
  // advanced by real viewing, not by the request that fetched the messages).
  app.post("/api/groups/:id/seen", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const messageId = parseInt(req.body?.messageId);
    if (!Number.isFinite(messageId)) return res.status(400).json({ message: "messageId is required" });
    try {
      if (!(await storage.isGroupMember(groupId, userId))) return res.sendStatus(403);
      await storage.markGroupMessagesSeen(groupId, userId, messageId);
      res.sendStatus(204);
    } catch (e) {
      res.status(500).json({ message: "Failed to update read status" });
    }
  });

  app.get("/api/groups/:id/messages/:messageId/read-info", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const messageId = parseInt(req.params.messageId);
    try {
      if (!(await storage.isGroupMember(groupId, userId))) return res.sendStatus(403);
      const message = await storage.getGroupMessage(messageId);
      if (!message || message.groupId !== groupId) return res.status(404).json({ message: "Message not found" });
      // Excludes the sender, not the caller — "how many people have read
      // this" is about everyone ELSE in the group, regardless of who's asking.
      const info = await storage.getGroupMessageReadInfo(groupId, messageId, message.userId);
      res.json(info);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch read info" });
    }
  });

  app.post("/api/groups/:id/leave", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      await storage.removeGroupMember(groupId, userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to leave group" });
    }
  });
}
