// Stories.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage, genderMatchesSeeking } from "../storage";
import { and } from "drizzle-orm";
import { putObject, generateFilename } from "../storage/objectStorage";
import * as push from "../push";
import * as gate from "../gate";
import { canShareEventToStory } from "../event-seats";
import { ensureTodaysOfficialStories } from "../official-stories";
import { DESTIRA_SYSTEM_USER_ID as OFFICIAL_STORY_USER } from "../system-user";
import * as safety from "../safety";
import { upload, getUserId } from "./shared";

export function registerStoriesRoutes(app: Express) {
  // ============ STORIES ============
  
  // Create a story (upload image)
  app.post("/api/stories", upload.single("media"), async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const caption = req.body.caption || "";
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const story = await storage.createStory(userId, expiresAt);
      
      // From an event's "Post to Status": the story links to that event.
      const eventId = Number(req.body.eventId) || undefined;
      if (eventId && !(await canShareEventToStory(eventId))) {
        return res.status(400).json({ message: "That event can't be shared" });
      }

      let mediaUrl = "";
      if (req.file) {
        const filename = generateFilename(req.file.originalname);
        await putObject(filename, req.file.buffer, req.file.mimetype);
        mediaUrl = `/uploads/${filename}`;
      } else if (req.body.mediaUrl) {
        mediaUrl = req.body.mediaUrl;
      }
      
      if (mediaUrl) {
        await storage.addStoryMedia(story.id, "image", mediaUrl, caption, undefined, eventId);
      }
      
      const media = await storage.getStoryMedia(story.id);
      res.json({ ...story, media });
    } catch (e) {
      console.error("Create story error:", e);
      res.status(500).json({ message: "Failed to create story" });
    }
  });

  // Get all active stories (grouped by user)
  app.get("/api/stories", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.deleteExpiredStories();
      const activeStories = await storage.getActiveStories();
      res.json(activeStories);
    } catch (e) {
      res.status(500).json({ message: "Failed to get stories" });
    }
  });

  app.get("/api/stories/feed", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.deleteExpiredStories();
      // Cheap after the first call each day; the sweep normally beats us to it.
      await ensureTodaysOfficialStories().catch((e) => console.error("[official-stories]", e));
      const requesterProfile = await storage.getProfile(userId);
      const seekingGenders = (requesterProfile?.seekingGenders ?? []) as string[];
      const seeAllGenders = seekingGenders.length === 0 || seekingGenders.includes("everyone");
      const groupedStories = await storage.getActiveStories();
      const flatStories = groupedStories.flatMap((group: any) =>
        group.stories.map((s: any) => ({ ...s, userId: group.userId }))
      );
      const enrichedAll = await Promise.all(flatStories.map(async (s: any) => {
        const profile = await storage.getProfileWithUser(s.userId);
        const media = await storage.getStoryMedia(s.id);
        const likes = await storage.getStoryLikes(s.id);
        const views = await storage.getStoryViews(s.id);
        // The official Destira account: the brand, not a person.
        if (s.userId === OFFICIAL_STORY_USER) {
          return {
            ...s,
            displayName: "Destira",
            photoUrl: "/brand/destira-icon-192.png",
            gender: null,
            isOfficial: true,
            media,
            likeCount: likes.length,
            viewCount: views.length,
            likedByMe: likes.some((l: any) => l.userId === userId),
            viewedByMe: views.some((v: any) => v.userId === userId),
          };
        }
        return {
          ...s,
          displayName: profile?.displayName || "User",
          photoUrl: profile?.coverPhotoUrl || profile?.user?.profileImageUrl || "",
          gender: profile?.gender ?? null,
          media,
          likeCount: likes.length,
          viewCount: views.length,
          likedByMe: likes.some((l: any) => l.userId === userId),
          viewedByMe: views.some((v: any) => v.userId === userId),
        };
      }));
      const enriched = enrichedAll.filter((s: any) =>
        s.isOfficial || s.userId === userId || seeAllGenders || genderMatchesSeeking(s.gender, seekingGenders)
      );
      res.json(enriched);
    } catch (e) {
      console.error("Get stories feed error:", e);
      res.status(500).json({ message: "Failed to get stories feed" });
    }
  });

  // Get my stories
  app.get("/api/stories/mine", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const myStories = await storage.getUserStories(userId);
      const result = await Promise.all(myStories.map(async (s) => {
        const media = await storage.getStoryMedia(s.id);
        const likes = await storage.getStoryLikes(s.id);
        const views = await storage.getStoryViews(s.id);
        const comments = await storage.getStoryComments(s.id);
        return { ...s, media, likeCount: likes.length, viewCount: views.length, commentCount: comments.length };
      }));
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Failed to get your stories" });
    }
  });

  // Get a specific story with media. Counts only — raw viewer/liker rows
  // (who exactly) only ever go out through the owner-only, tier-gated
  // /viewers and /likes endpoints below, never here.
  app.get("/api/stories/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const story = await storage.getStory(parseInt(req.params.id));
      if (!story) return res.status(404).json({ message: "Story not found" });
      const media = await storage.getStoryMedia(story.id);
      const likes = await storage.getStoryLikes(story.id);
      const views = await storage.getStoryViews(story.id);
      let comments: any[] = [];
      if (story.userId === userId) {
        comments = await storage.getStoryComments(story.id);
      }
      res.json({ ...story, media, comments, likesCount: likes.length, viewsCount: views.length });
    } catch (e) {
      res.status(500).json({ message: "Failed to get story" });
    }
  });

  // Who viewed this story — owner only. Free tier gets the count; Spark+
  // gets names/photos too (see_story_engagers). Blocked either direction
  // never show up, on either tier.
  app.get("/api/stories/:id/viewers", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const story = await storage.getStory(parseInt(req.params.id));
      if (!story) return res.status(404).json({ message: "Story not found" });
      if (story.userId !== userId) return res.sendStatus(403);
      const { count, viewers } = await storage.getStoryViewersDetailed(story.id, userId);
      const g = await gate.checkGate(userId, "see_story_engagers");
      res.json({ count, viewers: g.ok ? viewers : [], seeStoryEngagers: g.ok });
    } catch (e) {
      res.status(500).json({ message: "Failed to get story viewers" });
    }
  });

  // Who liked this story — owner only. Same free/paid split as /viewers.
  app.get("/api/stories/:id/likes", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const story = await storage.getStory(parseInt(req.params.id));
      if (!story) return res.status(404).json({ message: "Story not found" });
      if (story.userId !== userId) return res.sendStatus(403);
      const { count, likers } = await storage.getStoryLikersDetailed(story.id, userId);
      const g = await gate.checkGate(userId, "see_story_engagers");
      res.json({ count, likers: g.ok ? likers : [], seeStoryEngagers: g.ok });
    } catch (e) {
      res.status(500).json({ message: "Failed to get story likes" });
    }
  });

  // Reply threads across all of the caller's own stories — powers the Chat
  // "Story replies" filter. Reading is never capped or tier-gated.
  app.get("/api/stories/mine/replies", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const threads = await storage.getStoryRepliesForOwner(userId);
      res.json(threads);
    } catch (e) {
      res.status(500).json({ message: "Failed to get story replies" });
    }
  });

  // Clears the "Story replies" filter's unread badge. Fired once when that
  // tab becomes active, mirroring markDirectMessagesRead.
  app.post("/api/stories/mine/replies/read", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.markStoryRepliesRead(userId);
      res.json({ read: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to mark story replies read" });
    }
  });

  // Like a story
  app.post("/api/stories/:id/like", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const story = await storage.getStory(parseInt(req.params.id));
      if (!story) return res.status(404).json({ message: "Story not found" });
      if (await storage.isBlocked(story.userId, userId) || await storage.isBlocked(userId, story.userId)) {
        return res.sendStatus(403);
      }
      await storage.likeStory(story.id, userId);
      res.json({ liked: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to like story" });
    }
  });

  // Unlike a story
  app.delete("/api/stories/:id/like", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.unlikeStory(parseInt(req.params.id), userId);
      res.json({ liked: false });
    } catch (e) {
      res.status(500).json({ message: "Failed to unlike story" });
    }
  });

  // Reply to a story. Free tier is capped at storyRepliesPerWeek per rolling
  // 7 days (server/gate.ts "story_reply"); reading your own replies is
  // never capped — only posting one is.
  app.post("/api/stories/:id/comments", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { text } = req.body;
      if (!text?.trim()) return res.status(400).json({ message: "Comment text required" });
      const story = await storage.getStory(parseInt(req.params.id));
      if (!story) return res.status(404).json({ message: "Story not found" });
      // Nobody reads replies to the Destira account.
      if (story.userId === OFFICIAL_STORY_USER) return res.status(400).json({ message: "Replies are off on Destira posts" });
      if (await storage.isBlocked(story.userId, userId) || await storage.isBlocked(userId, story.userId)) {
        return res.sendStatus(403);
      }
      if (await gate.denyIfGated(res, userId, "story_reply")) return;
      if (await safety.blockIfHeld(res, userId)) return;
      const comment = await storage.addStoryComment(story.id, userId, text.trim());
      res.json(comment);
      safety.scanText({ senderId: userId, text, source: "story_comment", refId: comment.id, recipientId: story.userId }).catch(() => {});
      if (story.userId !== userId) {
        const replierProfile = await storage.getProfile(userId);
        const replierName = replierProfile?.displayName || "Someone";
        push.sendCategorizedPush(story.userId, "stories", {
          title: `${replierName} replied to your story`,
          body: text.trim().slice(0, 140),
          url: "/chats?filter=story_replies",
          tag: `story-reply-${story.id}`,
        }).catch(() => {});
      }
    } catch (e) {
      res.status(500).json({ message: "Failed to add comment" });
    }
  });

  // View a story (track view)
  app.post("/api/stories/:id/view", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.addStoryView(parseInt(req.params.id), userId);
      res.json({ viewed: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to record view" });
    }
  });

  // Create a text-only story
  app.post("/api/stories/text", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { textContent, caption } = req.body;
      if (!textContent?.trim()) return res.status(400).json({ message: "textContent is required" });
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const story = await storage.createStory(userId, expiresAt);
      await storage.addStoryMedia(story.id, "text", null, caption || undefined, textContent.trim());
      const media = await storage.getStoryMedia(story.id);
      res.json({ ...story, media });
    } catch (e) {
      console.error("Create text story error:", e);
      res.status(500).json({ message: "Failed to create text story" });
    }
  });

  // Delete own story
  app.delete("/api/stories/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const story = await storage.getStory(parseInt(req.params.id));
      if (!story) return res.status(404).json({ message: "Story not found" });
      if (story.userId !== userId) return res.sendStatus(403);
      await storage.deleteStory(parseInt(req.params.id));
      res.json({ deleted: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete story" });
    }
  });
}
