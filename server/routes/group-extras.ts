// Lounge rooms: polls, games, reactions, room pictures and search.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { and } from "drizzle-orm";
import { putObject, generateFilename } from "../storage/objectStorage";
import * as groupGames from "../group-games";
import * as gate from "../gate";
import { upload, getUserId, requireGroupMessageAccess } from "./shared";

export function registerGroupExtrasRoutes(app: Express) {
  // Poll endpoints
  app.post("/api/groups/:id/polls", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { question, options, allowMultiple } = req.body;
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member) return res.status(403).json({ message: "Must join group first" });
      if (!question || !options || options.length < 2 || options.length > 12) {
        return res.status(400).json({ message: "Poll needs a question and 2-12 options" });
      }
      const result = await storage.createPoll(groupId, userId, question, options, !!allowMultiple);
      res.status(201).json(result);
    } catch (e) {
      res.status(500).json({ message: "Failed to create poll" });
    }
  });

  app.get("/api/polls/:pollId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const result = await storage.getPoll(parseInt(req.params.pollId));
      if (!result) return res.status(404).json({ message: "Poll not found" });
      const member = await storage.getGroupMember(result.poll.groupId, userId);
      if (!member) return res.status(403).json({ message: "Not authorized" });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch poll" });
    }
  });

  app.get("/api/messages/:messageId/poll", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const access = await requireGroupMessageAccess(parseInt(req.params.messageId), userId);
      if (!access.ok) return res.status(access.status).json(access.body);
      const result = await storage.getPollByMessageId(access.message.id);
      if (!result) return res.status(404).json({ message: "Poll not found" });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch poll" });
    }
  });

  app.post("/api/polls/:pollId/vote", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { optionId } = req.body;
    try {
      const pollId = parseInt(req.params.pollId);
      const poll = await storage.getPoll(pollId);
      if (!poll) return res.status(404).json({ message: "Poll not found" });
      const member = await storage.getGroupMember(poll.poll.groupId, userId);
      if (!member) return res.status(403).json({ message: "Not authorized" });
      const vote = await storage.votePoll(pollId, optionId, userId);
      res.status(201).json(vote);
    } catch (e) {
      res.status(500).json({ message: "Failed to vote" });
    }
  });

  app.delete("/api/polls/:pollId/vote", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { optionId } = req.body;
    try {
      await storage.removePollVote(parseInt(req.params.pollId), optionId, userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to remove vote" });
    }
  });

  // Group games — same shape as the poll endpoints just above, generalized
  // to a reveal moment and (for some kinds) a hidden answer. See
  // server/group-games.ts for the one place config/response payloads are
  // ever interpreted.
  app.get("/api/games/kinds", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    res.json({ kinds: groupGames.listGameKinds() });
  });

  app.get("/api/games/kinds/:kind/bank", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const preview = groupGames.getBankPreview(req.params.kind as any);
    if (preview == null) return res.status(404).json({ message: "No bank for this kind" });
    res.json({ items: preview });
  });

  app.post("/api/groups/:id/games", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { kind, setup } = req.body || {};
    try {
      const game = await groupGames.createGame(groupId, userId, kind, setup ?? {});
      const state = await groupGames.getGameState(game.id, userId);
      res.status(201).json(state);
    } catch (e) {
      if (e instanceof groupGames.NotGroupMemberError) return res.status(403).json({ message: e.message });
      if (e instanceof groupGames.InvalidSetupError) return res.status(400).json({ message: e.message });
      console.error("Create game error:", e);
      res.status(500).json({ message: "Failed to start game" });
    }
  });

  // The "Join Game Room" lobby: every game currently live in a group.
  app.get("/api/groups/:id/games/active", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const groupId = parseInt(req.params.id);
      const member = await storage.getGroupMember(groupId, userId);
      if (!member) return res.status(403).json({ message: "Must be a member of this group" });
      const { active, recent } = await groupGames.listGameRoom(groupId);
      res.json({ games: active, recent });
    } catch (e) {
      console.error("List active games error:", e);
      res.status(500).json({ message: "Failed to load games" });
    }
  });

  app.get("/api/games/:gameId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const state = await groupGames.getGameState(parseInt(req.params.gameId), userId);
      res.json(state);
    } catch (e) {
      if (e instanceof groupGames.GameNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof groupGames.NotGroupMemberError) return res.status(403).json({ message: e.message });
      res.status(500).json({ message: "Failed to fetch game" });
    }
  });

  app.get("/api/messages/:messageId/game", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const access = await requireGroupMessageAccess(parseInt(req.params.messageId), userId);
      if (!access.ok) return res.status(access.status).json(access.body);
      const state = await groupGames.getGameByMessageId(access.message.id, userId);
      if (!state) return res.status(404).json({ message: "Game not found" });
      res.json(state);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch game" });
    }
  });

  app.post("/api/games/:gameId/respond", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const gameId = parseInt(req.params.gameId);
      await groupGames.submitResponse(gameId, userId, req.body?.response ?? {});
      const state = await groupGames.getGameState(gameId, userId);
      res.status(201).json(state);
    } catch (e) {
      if (e instanceof groupGames.GameNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof groupGames.NotGroupMemberError) return res.status(403).json({ message: e.message });
      if (e instanceof groupGames.GameNotActiveError) return res.status(409).json({ message: e.message });
      if (e instanceof groupGames.NotEligibleError) return res.status(403).json({ message: e.message });
      console.error("Submit game response error:", e);
      res.status(500).json({ message: "Failed to submit response" });
    }
  });

  app.post("/api/games/:gameId/reveal", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const gameId = parseInt(req.params.gameId);
      await groupGames.revealNow(gameId, userId);
      const state = await groupGames.getGameState(gameId, userId);
      res.json(state);
    } catch (e) {
      if (e instanceof groupGames.GameNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof groupGames.NotEligibleError) return res.status(403).json({ message: e.message });
      res.status(500).json({ message: "Failed to reveal" });
    }
  });

  // Joining a room is what makes someone count toward eligibility/reveal —
  // idempotent, called both from the lobby's "Join" button and automatically
  // when a room is opened by someone who hasn't joined yet.
  app.post("/api/games/:gameId/join", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const gameId = parseInt(req.params.gameId);
      await groupGames.joinGame(gameId, userId);
      const state = await groupGames.getGameState(gameId, userId);
      res.json(state);
    } catch (e) {
      if (e instanceof groupGames.GameNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof groupGames.NotGroupMemberError) return res.status(403).json({ message: e.message });
      console.error("Join game error:", e);
      res.status(500).json({ message: "Failed to join" });
    }
  });

  // A game room's own small text thread — separate from the group's main
  // chat (server/group-games.ts's sendGameMessage/getGameMessages).
  app.get("/api/games/:gameId/messages", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const messages = await groupGames.getGameMessages(parseInt(req.params.gameId), userId);
      res.json({ messages });
    } catch (e) {
      if (e instanceof groupGames.GameNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof groupGames.NotGroupMemberError) return res.status(403).json({ message: e.message });
      res.status(500).json({ message: "Failed to load messages" });
    }
  });

  app.post("/api/games/:gameId/messages", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const message = await groupGames.sendGameMessage(parseInt(req.params.gameId), userId, req.body?.content ?? "");
      res.status(201).json(message);
    } catch (e) {
      if (e instanceof groupGames.GameNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof groupGames.NotGroupMemberError) return res.status(403).json({ message: e.message });
      if (e instanceof groupGames.InvalidSetupError) return res.status(400).json({ message: e.message });
      console.error("Send game message error:", e);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Reaction endpoints
  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { reaction } = req.body;
    try {
      const access = await requireGroupMessageAccess(parseInt(req.params.messageId), userId);
      if (!access.ok) return res.status(access.status).json(access.body);
      const r = await storage.addReaction(access.message.id, userId, reaction);
      res.status(201).json(r);
    } catch (e) {
      res.status(500).json({ message: "Failed to add reaction" });
    }
  });

  app.delete("/api/messages/:messageId/reactions", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { reaction } = req.body;
    try {
      const access = await requireGroupMessageAccess(parseInt(req.params.messageId), userId);
      if (!access.ok) return res.status(access.status).json(access.body);
      await storage.removeReaction(access.message.id, userId, reaction);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to remove reaction" });
    }
  });

  app.get("/api/messages/:messageId/reactions", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const access = await requireGroupMessageAccess(parseInt(req.params.messageId), userId);
      if (!access.ok) return res.status(access.status).json(access.body);
      const reactions = await storage.getReactions(access.message.id);
      res.json(reactions);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch reactions" });
    }
  });

  // Group photo upload
  app.post("/api/groups/:id/photo", upload.single("image"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (!req.file) return res.status(400).json({ message: "No image provided" });
      const filename = generateFilename(req.file.originalname);
      await putObject(filename, req.file.buffer, req.file.mimetype);
      const url = `/uploads/${filename}`;
      await storage.updateGroup(groupId, { groupPhotoUrl: url });
      res.json({ url });
    } catch (e) {
      res.status(500).json({ message: "Failed to upload group photo" });
    }
  });

  // Group icon upload
  app.post("/api/groups/:id/upload-icon", upload.single("image"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (!req.file) return res.status(400).json({ message: "No image provided" });
      const filename = generateFilename(req.file.originalname);
      await putObject(filename, req.file.buffer, req.file.mimetype);
      const url = `/uploads/${filename}`;
      await storage.updateGroup(groupId, { iconUrl: url });
      res.json({ url });
    } catch (e) {
      res.status(500).json({ message: "Failed to upload group icon" });
    }
  });

  // Group banner upload
  app.post("/api/groups/:id/upload-banner", upload.single("image"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (!req.file) return res.status(400).json({ message: "No image provided" });
      const filename = generateFilename(req.file.originalname);
      await putObject(filename, req.file.buffer, req.file.mimetype);
      const url = `/uploads/${filename}`;
      await storage.updateGroup(groupId, { bannerUrl: url });
      res.json({ url });
    } catch (e) {
      res.status(500).json({ message: "Failed to upload group banner" });
    }
  });

  // Toggle mute for current user in group
  app.post("/api/groups/:id/mute", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member) return res.status(403).json({ message: "Not a member" });
      const newMuted = !member.isMuted;
      await storage.updateGroupMemberMute(groupId, userId, newMuted);
      res.json({ isMuted: newMuted });
    } catch (e) {
      res.status(500).json({ message: "Failed to toggle mute" });
    }
  });

  // Add member to group (user search + add)
  app.post("/api/groups/:id/members/add", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ message: "targetUserId required" });
    try {
      const requester = await storage.getGroupMember(groupId, userId);
      if (!requester) return res.status(403).json({ message: "Not a member" });
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ message: "Group not found" });
      if (!group.canMembersAddOthers && requester.role === "member") {
        return res.status(403).json({ message: "Only admins can add members" });
      }
      const alreadyMember = await storage.isGroupMember(groupId, targetUserId);
      if (alreadyMember) return res.status(409).json({ message: "Already a member" });
      const gj = await gate.checkGate(targetUserId, "join_group");
      if (!gj.ok) {
        return res.status(403).json({
          groupCapped: true,
          message: `They're in ${gj.used} rooms already, the most their plan allows. They'll need to leave one before joining this one.`,
        });
      }
      const targetProfile = await storage.getProfile(targetUserId);
      const nickname = targetProfile?.groupNickname || targetProfile?.displayName || "Anonymous";
      const member = await storage.joinGroup(groupId, targetUserId, nickname);
      await storage.createNotification(targetUserId, "group_added", "Added to Group", `You've been added to "${group.name}"`);
      res.status(201).json(member);
    } catch (e) {
      res.status(500).json({ message: "Failed to add member" });
    }
  });

  // Search group messages
  app.get("/api/groups/:id/messages/search", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const query = (req.query.q as string || "").toLowerCase().trim();
    if (!query) return res.json([]);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member) return res.status(403).json({ message: "Not a member" });
      const msgs = await storage.getGroupMessages(groupId, 500, member.joinedAt ?? undefined);
      const results = msgs.filter(m =>
        !m.deletedForEveryone && !m.isDeletedByAdmin &&
        m.content.toLowerCase().includes(query)
      ).slice(-50);
      res.json(results);
    } catch (e) {
      res.status(500).json({ message: "Failed to search messages" });
    }
  });

  // User search for adding to groups
  app.get("/api/users/search", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const query = (req.query.q as string || "").trim();
    if (query.length < 2) return res.json([]);
    try {
      const results = await storage.searchUsers(query, userId);
      res.json(results);
    } catch (e) {
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // PATCH /api/groups/:id for admin settings (alias PUT)
  app.patch("/api/groups/:id", async (req, res) => {
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
}
