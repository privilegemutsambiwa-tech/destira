import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useMarkSeen } from "@/hooks/use-activity";
import { MatchCelebration } from "@/components/match-celebration";
import { DecisionDock } from "@/components/decision-dock";
import { InstallCard } from "@/components/install-card";
import { requestPushNudge } from "@/lib/engagement-prompts";
import { type ClickReason } from "@/components/why-click";
import { LocationAskSheet, hasLocationConsent } from "@/components/location-permission-modal";
import { Flag } from "lucide-react";
import { lookingForOf } from "@shared/friends";
import { useDiscoverProfiles, useStartInterview, useCreateMatch, useFeedStories, UpgradeRequiredError, LikeWaitingError } from "@/hooks/use-interactions";
import { haptic } from "@/lib/haptics";
import { gateCopy } from "@shared/entitlements";
import { usePaywall, RefusalSheet } from "@/hooks/use-paywall";
import { useGate, resetLabel, type GateState } from "@/hooks/use-gate";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { StoryViewer } from "@/components/story-viewer";
import { withFrom } from "@/lib/from-route";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profiles";
import { recordPass, sendWaitingDecisions, undoPass as takeBackPass, useDecidedIds, forgetDecision, likeDelivered } from "@/lib/discover-decisions";
import type { Feature } from "@shared/entitlements";
import { WingmanStrip } from "@/components/wingman";
import { PurchaseSheet } from "@/components/purchase-sheet";
import { SINGLE_LABEL, SINGLE_PRICE_CENTS, singlePrice } from "@shared/single-purchases";
import { type DiscoverPerks, BoostControl } from "@/components/discover/boost-control";
import { type GalleryPhoto } from "@/components/discover/card-gallery";
import { DiscoverNotes } from "@/components/discover/notes";
import { type FilterChip, getInitialFilter, DiscoverTopBar, BackToEveryone } from "@/components/discover/top-bar";
import { ProfileCard } from "@/components/discover/profile-card";
import { NextUp } from "@/components/discover/next-up";
import { BlockReportDialog } from "@/components/discover/block-report-dialog";
import { LikesUsedUp, DeckEmpty } from "@/components/discover/empty-states";
import { DiscoverCardSkeleton } from "@/components/ui-vf/skeletons";
import { type DeckKeyActions, useDeckKeys, useDeckOrder, perkRefusalGate } from "@/components/discover/use-deck";

export default function Discover() {
  useMarkSeen("discover");
  // Anyone liked or passed leaves the deck the instant you act, and stays out:
  // the device remembers the decision (lib/discover-decisions) until the
  // server has it, and the server excludes them for good after that (a
  // `matches` row for a like, `discover_passes` for a pass). dismissedIds
  // holds what only needs to last while the deck is open, such as a block.
  const { user: me } = useAuth();
  const decidedIds = useDecidedIds(me?.id);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const evaluatedIds = useMemo(() => new Set([...decidedIds, ...dismissedIds]), [decidedIds, dismissedIds]);
  useEffect(() => {
    if (me?.id) void sendWaitingDecisions();
  }, [me?.id]);
  const [filter, setFilterState] = useState<FilterChip>(getInitialFilter);
  // Mirrors the scope into the URL (replace, not push), so coming back from a
  // full profile — which links back with ?from= — lands on the same deck.
  const setFilter = useCallback((f: FilterChip) => {
    setFilterState(f);
    try {
      window.history.replaceState(window.history.state, "", f === "nearby" ? "/discover?filter=nearby" : "/discover");
    } catch {}
  }, []);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [askLocation, setAskLocation] = useState(false);
  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); },
      () => {},
      { timeout: 5000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);
  // Location is asked here, when "Within 20 km" needs it (§8.2), never on
  // arrival.
  const toggleScope = useCallback(() => {
    if (filter === "nearby") return setFilter("all");
    if (!hasLocationConsent()) return setAskLocation(true);
    setFilter("nearby");
  }, [filter, setFilter]);
  // Stable bits only (name/photo don't change from a like/comment/view) — the
  // actual `stories` array is derived live from storiesByUserId below, so an
  // invalidated feed query reaches this viewer while it's still open.
  const [viewingCardMeta, setViewingCardMeta] = useState<{ userId: string; displayName: string; photoUrl: string } | null>(null);
  const paywall = usePaywall();
  // Rewind, super like and boost (server/discover-perks.ts). Their refusals
  // come from the server, so the sheet is fed the 403 body directly.
  const { data: perks } = useQuery<DiscoverPerks>({ queryKey: ["/api/discover/perks"] });
  const [perkSheet, setPerkSheet] = useState<{ feature: Feature; gate: GateState } | null>(null);
  const [rewinding, setRewinding] = useState(false);
  const [superLiking, setSuperLiking] = useState(false);
  const [boosting, setBoosting] = useState(false);
  // Out of super likes or boosts: buy one (Part G3), then it's used straight away.
  const [buying, setBuying] = useState<"super_like" | "boost" | null>(null);
  // Cards a rewind brought back that this session's pages never had.
  const [extraCards, setExtraCards] = useState<Record<string, any>>({});
  const [confirm, setConfirm] = useState<"block" | "report" | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportPhotoId, setReportPhotoId] = useState<number | null>(null);
  // Guards against a double-tap firing two Like/Pass actions on the same card
  // before the deck advances — isActingRef blocks re-entrancy synchronously
  // (state updates aren't visible until the next render), isActing state just
  // drives the disabled prop so the buttons visibly lock while it settles.
  const isActingRef = useRef(false);
  const [isActing, setIsActing] = useState(false);
  // Which way the current card leaves: left for a pass, right for a like.
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);
  // The last pass, offered back for a few seconds (free, like it should be).
  const [undoPass, setUndoPass] = useState<{ userId: string; name: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keyboard shortcuts read the latest handlers through this; it's reset to
  // null every render and only filled in when a card is actually showing.
  const keyActionsRef = useRef<DeckKeyActions | null>(null);
  keyActionsRef.current = null;
  useDeckKeys(keyActionsRef);
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);
  const { data: rawProfiles, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useDiscoverProfiles(filter, userLat, userLng);
  const { data: feedStories } = useFeedStories();
  const startInterview = useStartInterview();
  const createMatch = useCreateMatch();
  // Set when a like lands on someone who'd already liked you — the server
  // turns it straight into a match (see POST /api/matches).
  const [celebrating, setCelebrating] = useState<{ matchId: number; otherUserId: string; name: string; photoUrl: string | null } | null>(null);
  const qc = useQueryClient();
  // Checked up front, not just on tap: once today's likes are used up, the
  // whole deck stops (not just the Like button) — see the empty-state block
  // below. Passing stays free and doesn't touch this.
  const { data: likesGate } = useGate("daily_likes");
  const [woLocation, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: ownProfile, isLoading: isOwnProfileLoading } = useProfile();

  // Mandatory-onboarding gate: gender and who they're seeking must be set
  // before Discover shows anyone (this also catches Google sign-ins and any
  // direct-URL navigation that skipped the essentials step).
  const needsEssentials =
    !isOwnProfileLoading &&
    (!ownProfile || !ownProfile.gender || !Array.isArray(ownProfile.seekingGenders) || ownProfile.seekingGenders.length === 0);

  useEffect(() => {
    if (needsEssentials) setLocation("/essentials");
  }, [needsEssentials, setLocation]);
  // Here for friends only: their deck is Friends (Part O).
  const friendsOnly = !isOwnProfileLoading && lookingForOf((ownProfile as any)?.lookingFor) === "friends";
  useEffect(() => {
    if (friendsOnly) setLocation("/friends");
  }, [friendsOnly, setLocation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilterState(params.get("filter") === "nearby" ? "nearby" : "all");
  }, [woLocation]);

  useEffect(() => {
    if (hasLocationConsent()) locate();
  }, [locate]);

  const storiesByUserId = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (!feedStories) return map;
    feedStories.forEach((s) => {
      if (!map[s.userId]) map[s.userId] = [];
      map[s.userId].push(s);
    });
    return map;
  }, [feedStories]);

  const viewingCardStories = viewingCardMeta ? storiesByUserId[viewingCardMeta.userId] : null;

  // The browsing order and the "N of total" count (components/discover/use-deck).
  const { eligibleForFilter, profiles, toFront } = useDeckOrder(rawProfiles, extraCards, filter, evaluatedIds);

  // Always the front of the deck — evaluating a profile removes it from
  // `profiles` above (via evaluatedIds), so there's no index to advance,
  // just a new [0] once the set changes.
  const currentProfile = profiles[0];

  // The server now sends the deck a page at a time (see useDiscoverProfiles)
  // instead of every eligible profile in one shot — so the deck needs to ask
  // for more before it actually runs dry. 5 is comfortably more than the
  // current card + the 2 "next up" previews the UI ever shows at once, so
  // this fires well before someone could out-swipe what's loaded.
  useEffect(() => {
    if (profiles.length <= 5 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [profiles.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    isActingRef.current = false;
    setIsActing(false);
  }, [currentProfile?.userId]);

  const handleViewCardStory = useCallback((profile: any) => {
    const userId: string = profile.userId;
    const stories = storiesByUserId[userId];
    if (!stories || stories.length === 0) return;
    setViewingCardMeta({
      userId,
      displayName: profile.displayName || "User",
      photoUrl: profile.user?.profileImageUrl || "",
    });
  }, [storiesByUserId]);

  const refusePerk = (feature: Feature, body: any) => {
    const gate = perkRefusalGate(feature, body);
    if (gate) setPerkSheet({ feature, gate });
    else toast({ title: body?.message || "Not right now" });
  };
  // The few-second Undo is free; after that it's a rewind of the last pass.
  const handleRewind = async () => {
    // Still inside the free undo: the same as tapping Undo. (Written out
    // here because the empty deck renders before handleUndoPass exists.)
    if (undoPass) {
      const { userId } = undoPass;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoPass(null);
      setExitDir(null);
      setDismissedIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
      toFront(userId);
      takeBackPass(userId);
      return;
    }
    if (rewinding) return;
    setRewinding(true);
    try {
      const res = await fetch("/api/discover/rewind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lat: userLat, lng: userLng }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) return refusePerk("rewind", body);
      if (!res.ok) return toast({ title: body?.message || "Couldn't bring them back" });
      const card = body.profile;
      forgetDecision(card.userId);
      setExtraCards((prev) => ({ ...prev, [card.userId]: card }));
      setDismissedIds((prev) => { const next = new Set(prev); next.delete(card.userId); return next; });
      toFront(card.userId);
      setExitDir(null);
      qc.setQueryData(["/api/discover/perks"], body.perks);
      toast({ title: `${(card.displayName || "They").split(/\s+/)[0]} is back`, description: "Take another look." });
    } catch {
      toast({ title: "Couldn't bring them back", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setRewinding(false);
    }
  };

  const handleBoost = async () => {
    if (boosting) return;
    setBoosting(true);
    try {
      const res = await fetch("/api/discover/boost", { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) return refusePerk("boost", body);
      if (body?.perks) qc.setQueryData(["/api/discover/perks"], body.perks);
      if (res.ok) toast({ title: "Boost on", description: "For 30 minutes you're at the front of decks near you." });
      else toast({ title: body?.message || "Couldn't start your boost" });
    } catch {
      toast({ title: "Couldn't start your boost", variant: "destructive" });
    } finally {
      setBoosting(false);
    }
  };

  if (isLoading || isOwnProfileLoading || needsEssentials) {
    return (
      <LayoutShell>
        <div className="max-w-[640px] md:max-w-3xl lg:max-w-5xl mx-auto">
          <DiscoverCardSkeleton />
        </div>
      </LayoutShell>
    );
  }

  const myFirstName = ((ownProfile as any)?.displayName || (me as any)?.firstName || "").trim().split(/\s+/)[0] || null;
  const topBar = <DiscoverTopBar filter={filter} onScope={toggleScope} name={myFirstName} />;
  const locationSheet = (
    <LocationAskSheet
      open={askLocation}
      onOpenChange={setAskLocation}
      onEnabled={() => { locate(); setFilter("nearby"); }}
    />
  );

  // Likes are the metric, not passes — free tier gets 30/day (80 Spark, 200
  // Flame, unlimited Ember). The moment that's used up, the deck itself
  // stops, not just the Like button: there's no point browsing further
  // today if nothing you tap can turn into a like. Passing stays free and
  // never trips this.
  const celebration = celebrating && (
    <MatchCelebration
      matchId={celebrating.matchId}
      otherUserId={celebrating.otherUserId}
      otherName={celebrating.name}
      otherPhotoUrl={celebrating.photoUrl}
      onClose={() => setCelebrating(null)}
    />
  );

  if (likesGate && !likesGate.ok) {
    const copy = gateCopy("daily_likes", {
      tier: likesGate.tier as any,
      limit: likesGate.limit,
      used: likesGate.used,
      resetLabel: resetLabel(likesGate.resetAt),
    });
    return (
      <LayoutShell>
        <div className="max-w-[640px] mx-auto">
          {topBar}
          <WingmanStrip />
          <LikesUsedUp likesGate={likesGate} copy={copy} onSeePlans={() => setLocation(withFrom(`/plans?feature=daily_likes`, "/discover"))} />
        </div>
        {locationSheet}
        {celebration}
      </LayoutShell>
    );
  }

  if (!profiles || profiles.length === 0) {
    return (
      <LayoutShell>
        <div className="max-w-[640px] mx-auto">
          {filter === "nearby" && <BackToEveryone onBack={() => setFilter("all")} />}
          {topBar}
          <WingmanStrip />
          <DeckEmpty
            filter={filter}
            anyDecided={evaluatedIds.size > 0}
            onSeeEveryone={() => setFilter("all")}
            userLat={userLat}
            userLng={userLng}
            onRewind={handleRewind}
            rewinding={rewinding}
          />
          <div className="mt-8 space-y-4">
            <DiscoverNotes />
          </div>
        </div>
        {locationSheet}
        {celebration}
      </LayoutShell>
    );
  }

  const distanceKm: number | null = currentProfile.distanceKm ?? null;
  const nearby: boolean = currentProfile.isNearbyNow ?? false;
  const isVeryClose = distanceKm !== null && distanceKm < 1;
  const cardStories = storiesByUserId[currentProfile.userId] || [];
  const hasCardStories = cardStories.length > 0;
  const reasons: ClickReason[] = Array.isArray(currentProfile.reasons) ? currentProfile.reasons : [];

  // The only way a card leaves the deck: mark it evaluated so the `profiles`
  // memo drops it and [0] becomes whoever's next. No index to advance.
  const handleNext = (evaluatedUserId: string) => {
    setDismissedIds((prev) => new Set(prev).add(evaluatedUserId));
  };

  const handleInterview = async () => {
    try {
      const interview = await startInterview.mutateAsync(currentProfile.userId);
      toast({
        title: "Interview Started",
        description: `Chat with ${currentProfile.displayName}'s AI Twin now.`,
      });
      setLocation(`/interviews/${interview.id}/chat?from=/discover`);
    } catch (err: any) {
      if (err instanceof UpgradeRequiredError) {
        setLocation(withFrom("/plans?feature=start_interview", "/discover"));
      } else {
        toast({
          title: "Error",
          description: err?.message || "Could not start interview.",
          variant: "destructive",
        });
      }
    }
  };

  // Counted on free (daily_passes, resets at midnight; paid plans have no
  // limit), so the deck can't be passed through to see everyone. Persisted
  // server-side (discover_passes) so this person never comes back, the
  // same permanence a like already has via the matches table.
  const handlePass = () => {
    if (isActingRef.current) return;
    isActingRef.current = true;
    setIsActing(true);
    const passedProfile = currentProfile;
    paywall.guard("daily_passes", () => {
      setExitDir("left");
      haptic.pass();
      handleNext(passedProfile.userId);
      recordPass(passedProfile.userId);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoPass({ userId: passedProfile.userId, name: passedProfile.displayName || "them" });
      undoTimerRef.current = setTimeout(() => setUndoPass(null), 6000);
    }).finally(() => {
      // The refused path never advances the deck, so release the buttons here.
      isActingRef.current = false;
      setIsActing(false);
    });
  };

  // Brings the last passed card back to the front and forgets the pass.
  const handleUndoPass = () => {
    if (!undoPass) return;
    const { userId } = undoPass;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoPass(null);
    setExitDir(null);
    setDismissedIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    // Back to the front of the deck, not the end of the line.
    toFront(userId);
    takeBackPass(userId);
  };

  const doBlock = async () => {
    if (!currentProfile?.userId) return;
    const blockedId = currentProfile.userId;
    setConfirm(null);
    try {
      await apiRequest("POST", `/api/users/block/${blockedId}`, {});
      toast({ title: "Blocked", description: "They won't appear in your feed anymore." });
      handleNext(blockedId);
    } catch {
      toast({ title: "Could not block", variant: "destructive" });
    }
  };

  const doReport = async () => {
    if (!currentProfile?.userId) return;
    const reportedId = currentProfile.userId;
    const reason = reportReason.trim();
    const evidence = reportPhotoId != null ? [{ type: "photo", id: reportPhotoId }] : undefined;
    setConfirm(null);
    setReportReason("");
    setReportPhotoId(null);
    try {
      await apiRequest("POST", `/api/users/${reportedId}/report`, { reason, evidence });
      toast({ title: "Report sent", description: "Our team will review it. They're now blocked too." });
      handleNext(reportedId);
    } catch {
      toast({ title: "Could not send report", variant: "destructive" });
    }
  };

  // Refuse before attempting when the daily cap is already reached — the sheet
  // says the number, the reset time, and the next tier. The server still
  // enforces on /api/likes. (The empty-deck block further up already stops
  // this from ever being reachable once the cap is hit, but this stays as
  // the same defense-in-depth the rest of the app uses.)
  const handleLike = () => {
    if (isActingRef.current) return;
    isActingRef.current = true;
    setIsActing(true);
    const likedProfile = currentProfile;
    paywall.guard("daily_likes", () => {
      // Optimistic: the card leaves the deck the instant the tap lands, like a
      // swipe — the actual like request finishes in the background.
      setExitDir("right");
      haptic.like();
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoPass(null);
      handleNext(likedProfile.userId);
      doLike(likedProfile);
    }).finally(() => {
      // Covers the path that never advances the deck (gate refused) — the
      // effect keyed on currentProfile's id already resets this pair once
      // handleNext runs above.
      isActingRef.current = false;
      setIsActing(false);
    });
  };

  // A like they see first. If they already liked you, it's a plain like
  // (that's already a match), so nothing is spent.
  const handleSuperLike = async () => {
    if (isActingRef.current || superLiking) return;
    const target = currentProfile;
    setSuperLiking(true);
    try {
      const res = await fetch("/api/discover/super-like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetId: target.userId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body?.code === "liked_you") return handleLike();
      if (res.status === 403) return refusePerk("super_like", body);
      if (!res.ok) return toast({ title: body?.message || "Couldn't send that super like" });
      likeDelivered(target.userId);
      setExitDir("right");
      haptic.like();
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoPass(null);
      handleNext(target.userId);
      if (body?.perks) qc.setQueryData(["/api/discover/perks"], body.perks);
      const first = (target.displayName || "They").split(/\s+/)[0];
      toast({ title: "Super like sent", description: `${first} will see you first, marked as a super like.` });
    } catch {
      toast({ title: "Couldn't send that super like", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setSuperLiking(false);
    }
  };

  const doLike = async (targetProfile: typeof currentProfile) => {
    try {
      const result = await createMatch.mutateAsync(targetProfile.userId);
      // The deck-stops-at-the-cap block above reads this same query — without
      // invalidating it, a like that lands exactly on the limit wouldn't lock
      // the deck until the gate's own 60s staleTime happened to expire.
      qc.invalidateQueries({ queryKey: ["/api/gate", "daily_likes"] });
      requestPushNudge("like");
      if (result?.mutual) {
        setCelebrating({
          matchId: result.id,
          otherUserId: targetProfile.userId,
          name: targetProfile.displayName,
          photoUrl: targetProfile.coverPhotoUrl ?? null,
        });
        return;
      }
      toast({
        title: "Liked!",
        description: `${targetProfile.displayName} will be notified.`,
      });
    } catch (err) {
      if (err instanceof LikeWaitingError) {
        // Saved on the device and sent when the connection is back, so the
        // card stays gone: the like counts, it just hasn't arrived yet.
        toast({ title: "Like saved", description: err.message });
      } else if (err instanceof Error && err.message?.includes("already exists")) {
        toast({ title: "Already Connected", description: "You already have a match request with this person." });
      } else if (err instanceof UpgradeRequiredError) {
        // The like didn't actually happen — bring the card back rather than
        // leaving it removed from the deck until the next reload. The gate is
        // re-read first: the cached copy is what let this tap through.
        setDismissedIds((prev) => { const next = new Set(prev); next.delete(targetProfile.userId); return next; });
        await qc.invalidateQueries({ queryKey: ["/api/gate", "daily_likes"] });
        paywall.guard("daily_likes", () => {});
      } else {
        // Same reasoning — a like the server refused shouldn't silently vanish
        // the profile from the deck for the rest of the session.
        setDismissedIds((prev) => { const next = new Set(prev); next.delete(targetProfile.userId); return next; });
        toast({ title: "Could not like", description: "Something went wrong. Please try again.", variant: "destructive" });
      }
    }
  };

  // Everything the payload is allowed to carry for this person (server gates it
  // to public profiles + non-private answers).
  const galleryPhotos: GalleryPhoto[] = Array.isArray(currentProfile.photos) && currentProfile.photos.length > 0
    ? currentProfile.photos
    : currentProfile.coverPhotoUrl
      ? [{ url: currentProfile.coverPhotoUrl, w800: null, w1600: null, role: "cover", focalX: 0.5, focalY: 0.5 }]
      : [];
  const answers: { question: string; answer: string }[] = Array.isArray(currentProfile.answers)
    ? currentProfile.answers.slice(0, 2)
    : [];
  const interests: string[] = Array.isArray(currentProfile.interests) ? currentProfile.interests.slice(0, 6) : [];
  const aboutText: string = currentProfile.aboutMe || currentProfile.bio || "";

  const upcoming = profiles.slice(1, 4);
  keyActionsRef.current = { pass: handlePass, like: handleLike, interview: handleInterview, undo: handleRewind };

  return (
    <LayoutShell>
      <div className="max-w-[640px] md:max-w-3xl lg:max-w-5xl mx-auto">
        {filter === "nearby" && <BackToEveryone onBack={() => setFilter("all")} />}
        {topBar}
        <WingmanStrip />

        {/* The card and its action bar share a box, so the bar only rides the
            bottom of the screen while the card is on it. */}
        <div className="relative">
        <ProfileCard
          profile={currentProfile}
          exitDir={exitDir}
          photos={galleryPhotos}
          nearby={nearby}
          isVeryClose={isVeryClose}
          distanceKm={distanceKm}
          hasStories={hasCardStories}
          onViewStory={() => handleViewCardStory(currentProfile)}
          reasons={reasons}
          onAsk={handleInterview}
          answers={answers}
          interests={interests}
          aboutText={aboutText}
          onFullProfile={() => setLocation(withFrom(`/u/${currentProfile.userId}`, filter === "nearby" ? "/discover?filter=nearby" : "/discover"))}
        />

        <DecisionDock
          name={currentProfile.displayName || ""}
          onPass={handlePass}
          onLike={handleLike}
          onInterview={handleInterview}
          busy={isActing}
          likePending={createMatch.isPending}
          interviewPending={startInterview.isPending}
          undo={undoPass ? { name: undoPass.name, onUndo: handleUndoPass } : null}
          onRewind={handleRewind}
          rewindPending={rewinding}
          onSuperLike={handleSuperLike}
          superPending={superLiking}
        />
        </div>

        <BoostControl perks={perks} onBoost={handleBoost} onBuy={() => setBuying("boost")} busy={boosting} />
        <div className="flex items-center justify-between px-1 mt-2 mb-8">
          <p className="vf-small text-vf-faint">
            {eligibleForFilter.length - profiles.length + 1} of {eligibleForFilter.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setConfirm("block")}
              className="vf-small text-vf-faint hover:text-vf-text transition-colors min-h-[36px] px-2"
              data-testid="button-block-user"
            >
              Block
            </button>
            <button
              onClick={() => setConfirm("report")}
              className="vf-small text-vf-faint hover:text-vf-text transition-colors inline-flex items-center gap-1 min-h-[36px] px-2"
              data-testid="button-report-user"
            >
              <Flag className="w-3 h-3" /> Report
            </button>
          </div>
        </div>

        {/* A peek at who's next, never a way to get to them: on every plan,
            the only way forward is to like or pass the person in front. No
            jumping ahead, so nobody can browse the deck without deciding, and
            the faces waiting here are a reason to keep going (and, at the
            daily limit, to upgrade). Tapping one only says so. */}
        {upcoming.length > 0 && (
          <NextUp upcoming={upcoming} currentName={currentProfile.displayName} />
        )}
      </div>

      {/* Below the deck, never above a person: at most one note, then the
          website's install card. */}
      <div className="mt-10 space-y-4 max-w-[640px]">
        <DiscoverNotes />
        <InstallCard />
      </div>

      {locationSheet}

      {viewingCardMeta && viewingCardStories && viewingCardStories.length > 0 && (
        <StoryViewer
          stories={viewingCardStories}
          initialIndex={0}
          onClose={() => setViewingCardMeta(null)}
          userName={viewingCardMeta.displayName}
          profileImageUrl={viewingCardMeta.photoUrl}
          onInterviewTwin={async () => {
            try {
              const interview = await startInterview.mutateAsync(viewingCardMeta.userId);
              setViewingCardMeta(null);
              setLocation(`/interviews/${interview.id}/chat?from=/discover`);
            } catch (err: any) {
              if (err instanceof UpgradeRequiredError) {
                setViewingCardMeta(null);
                setLocation(withFrom("/plans?feature=start_interview", "/discover"));
              } else {
                toast({ title: "Could not start interview", description: err?.message, variant: "destructive" });
              }
            }
          }}
        />
      )}

      {confirm && (
        <BlockReportDialog
          confirm={confirm}
          name={currentProfile.displayName}
          photos={galleryPhotos}
          reportReason={reportReason}
          setReportReason={setReportReason}
          reportPhotoId={reportPhotoId}
          setReportPhotoId={setReportPhotoId}
          onClose={() => { setConfirm(null); setReportReason(""); setReportPhotoId(null); }}
          onConfirm={confirm === "block" ? doBlock : doReport}
        />
      )}

      {paywall.sheet}
      {perkSheet && (
        <RefusalSheet
          feature={perkSheet.feature}
          gate={perkSheet.gate}
          onClose={() => setPerkSheet(null)}
          noPlan={!perkSheet.gate.requiredTierName}
          buy={perkSheet.feature === "super_like" || perkSheet.feature === "boost"
            ? {
                label: perkSheet.feature === "super_like" ? `Or buy one super like · ${singlePrice("super_like")}` : `Or buy one boost · ${singlePrice("boost")}`,
                onBuy: () => setBuying(perkSheet.feature as "super_like" | "boost"),
              }
            : undefined}
        />
      )}
      <PurchaseSheet
        open={!!buying}
        onOpenChange={(o) => { if (!o) setBuying(null); }}
        kind={buying ?? "super_like"}
        refId={1}
        title={buying === "boost" ? "Boost" : "Super like"}
        label={SINGLE_LABEL[buying ?? "super_like"]}
        cents={SINGLE_PRICE_CENTS[buying ?? "super_like"]}
        note={buying === "boost"
          ? "30 minutes at the front of decks near you, starting once it's paid."
          : `Sent to ${(currentProfile?.displayName || "them").split(/\s+/)[0]} once it's paid. They'll see you first.`}
        onPaid={() => {
          const k = buying;
          setBuying(null);
          qc.invalidateQueries({ queryKey: ["/api/discover/perks"] });
          if (k === "boost") handleBoost();
          else if (k === "super_like") handleSuperLike();
        }}
      />
      {celebration}
    </LayoutShell>
  );
}
