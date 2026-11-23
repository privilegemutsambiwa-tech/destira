// Lounge home (docs/destira-upgrade-prompt.md §7.13): "Your rooms" first as
// sideways cards (cover, unread, a live game), then "Find a room": search,
// chips and a grid of rooms with who's in them and one button to join.
import { useMarkSeen } from "@/hooks/use-activity";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutShell } from "@/components/layout-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BadgeCheck, BellOff, Loader2, Lock, Plus, UserPlus } from "lucide-react";
import { useGroups, useCreateGroup, useJoinGroup } from "@/hooks/use-interactions";
import { useToast } from "@/hooks/use-toast";
import { usePaywall } from "@/hooks/use-paywall";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LOUNGE_TOPICS, type LoungeDiscover } from "@shared/lounge";
import { warmLounge } from "@/lib/lounge-warmup";
import { avatarColor } from "@/lib/avatar-color";
import { gameName } from "@/lib/game-names";
import {
  EmptyState,
  NOTE_PRIORITY,
  ScreenNotes,
  SearchField,
  VfAvatar,
  VfButton,
  VfSheet,
  VfSkeleton,
} from "@/components/ui-vf";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "official", label: "Official" },
  { value: "popular", label: "Popular" },
  { value: "new", label: "New" },
  ...LOUNGE_TOPICS.map((t) => ({ value: `topic:${t.key}`, label: t.label })),
  { value: "area", label: "By area" },
];
/** Chips the server filters; the topic and area ones are sorted out here. */
const SERVER_FILTERS = new Set(["all", "official", "popular", "new"]);

const names = (people: { name: string }[]) =>
  people.length === 1
    ? people[0].name
    : people.length === 2
      ? `${people[0].name} and ${people[1].name}`
      : `${people[0].name}, ${people[1].name} and ${people.length - 2} more`;

const coverOf = (g: any): string | null => g.bannerUrl || g.groupPhotoUrl || g.iconUrl || null;

/** A room's cover: its photo, or a generated one from its name (also when
 *  the photo fails, so a broken image never shows). */
function RoomCover({ room, className, initialSize = 44 }: { room: any; className?: string; initialSize?: number }) {
  const [failed, setFailed] = useState(false);
  const src = coverOf(room);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`${className} object-cover bg-vf-surface2`} />;
  }
  const a = avatarColor(String(room.id));
  const b = avatarColor(room.name || "");
  return (
    <div
      className={`${className} flex items-center justify-center font-display text-white/90`}
      style={{ background: `radial-gradient(120% 120% at 15% 10%, ${a}, transparent 65%), radial-gradient(120% 120% at 90% 100%, ${b}, transparent 60%), ${b}`, fontSize: initialSize }}
      aria-hidden="true"
    >
      {(room.name || "?").trim()[0]?.toUpperCase()}
    </div>
  );
}

function Faces({ faces }: { faces: { id: string; name: string; avatarUrl: string }[] | undefined }) {
  if (!faces?.length) return null;
  return (
    <span className="flex -space-x-2 shrink-0" aria-hidden="true">
      {faces.slice(0, 4).map((f) => (
        <VfAvatar key={f.id} size={24} name={f.name} seed={f.id} src={f.avatarUrl} className="ring-2 ring-[var(--vf-surface2)]" />
      ))}
    </span>
  );
}

function LivePill({ game, onDark = false }: { game: { kind: string; playing: number } | null | undefined; onDark?: boolean }) {
  if (!game) return null;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap"
      style={onDark ? { background: "rgba(12,9,16,.6)", color: "#F5F0EA", backdropFilter: "blur(6px)" } : undefined}
      data-testid="pill-live-game"
    >
      <span className="relative flex w-2 h-2 shrink-0">
        <span className="absolute inset-0 rounded-full bg-vf-ember motion-safe:animate-ping opacity-60" />
        <span className="relative w-2 h-2 rounded-full bg-vf-ember" />
      </span>
      <span className="truncate">
        {gameName(game.kind)} live{game.playing > 0 ? ` · ${game.playing} playing` : ""}
      </span>
    </span>
  );
}

export default function Lounge() {
  useMarkSeen("lounge");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const serverFilter = SERVER_FILTERS.has(activeFilter) ? activeFilter : "all";
  const { data: groups, isLoading } = useGroups(searchQuery || undefined, serverFilter);
  const { data: everything } = useGroups(undefined, "all");
  const { data: discover } = useQuery<LoungeDiscover>({ queryKey: ["/api/lounge/discover"], staleTime: 60_000 });
  const byId = useMemo(() => new Map<number, any>((everything || []).map((g: any) => [g.id, g])), [everything]);
  const [, setLocation] = useLocation();
  const open = (id: number | string) => setLocation(`/lounge/group/${id}`);

  // "Your rooms" never changes with the search box or chips below it.
  const mine = useMemo(
    () =>
      (everything || [])
        .filter((g: any) => g.isMember)
        .sort((a: any, b: any) =>
          Number(!!b.liveGame) - Number(!!a.liveGame) ||
          (b.unreadCount || 0) - (a.unreadCount || 0) ||
          new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime(),
        ),
    [everything],
  );
  // Your rooms' latest messages and faces, fetched quietly in the background
  // and kept on the phone, so opening one is instant (lib/lounge-warmup.ts).
  const warmQc = useQueryClient();
  useEffect(() => {
    if (mine.length) warmLounge(warmQc, mine);
  }, [mine, warmQc]);
  const searching = !!searchQuery.trim();
  const found = useMemo(() => {
    let list = (groups || []).filter((g: any) => searching || !g.isMember);
    if (activeFilter.startsWith("topic:")) {
      const key = activeFilter.slice(6);
      return list.filter((g: any) => (discover?.topics[g.id] as string[] | undefined)?.includes(key));
    }
    if (activeFilter === "area") {
      // Rooms for a place, grouped by it; your own area first.
      const area = discover?.myArea?.toLowerCase();
      const isMine = (g: any) => Number(!!area && String(g.locationLabel).toLowerCase().includes(area));
      list = list.filter((g: any) => g.locationLabel);
      return [...list].sort(
        (a: any, b: any) =>
          isMine(b) - isMine(a) ||
          String(a.locationLabel).localeCompare(String(b.locationLabel)) ||
          (b.memberCount || 0) - (a.memberCount || 0),
      );
    }
    if (activeFilter !== "all") return list;
    // Destira's own rooms first (always good, always joinable), then the busiest.
    return [...list].sort((a: any, b: any) => Number(!!b.isOfficial) - Number(!!a.isOfficial) || (b.memberCount || 0) - (a.memberCount || 0));
  }, [groups, searching, activeFilter, discover]);
  const browsing = !searching && activeFilter === "all";
  const trending = useMemo(
    () => (discover?.trending ?? []).map((t) => ({ t, room: byId.get(t.groupId) })).filter((x) => x.room),
    [discover, byId],
  );
  const matchRooms = useMemo(
    () => (discover?.matchRooms ?? []).map((m) => ({ m, room: byId.get(m.groupId) })).filter((x) => x.room),
    [discover, byId],
  );

  return (
    <LayoutShell>
      <div className="max-w-5xl mx-auto">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="vf-h1 text-vf-text" data-testid="text-lounge-title">Lounge</h1>
            <p className="vf-small text-vf-muted mt-1">Rooms for the things you're into. Chat, play, then meet.</p>
          </div>
          <VfButton variant="secondary" size="sm" className="mt-1 shrink-0" leading={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)} data-testid="button-create-group">
            New room
          </VfButton>
        </header>

        <ScreenNotes
          className="mb-5"
          notes={[
            {
              kind: "lounge_intro_tip",
              priority: NOTE_PRIORITY.tip,
              eyebrow: "The Lounge",
              body: "Join a room to chat and play games with people who like what you like. The easy way to meet people.",
              testId: "strip-lounge-intro",
            },
          ]}
        />

        {mine.length > 0 && (
          <section className="mb-8" data-testid="text-section-joined">
            <div className="vf-label text-vf-text mb-3">Your rooms</div>
            <div className="-mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {mine.map((room: any) => (
                <YourRoomCard key={room.id} room={room} onOpen={() => open(room.id)} />
              ))}
            </div>
          </section>
        )}

        {browsing && matchRooms.length > 0 && (
          <section className="mb-8" data-testid="section-match-rooms">
            <div className="vf-label text-vf-text mb-3">Your matches are here</div>
            <div className="-mx-4 px-4 flex gap-3 overflow-x-auto snap-x pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {matchRooms.map(({ m, room }, i) => (
                <div key={room.id} className="snap-start shrink-0 w-[260px] flex">
                  <RoomCard
                    room={room}
                    index={i}
                    onOpen={() => open(room.id)}
                    note={`${names(m.people)} ${m.people.length === 1 ? "is" : "are"} in this room`}
                    testId={`match-room-${room.id}`}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {browsing && trending.length > 0 && (
          <section className="mb-8" data-testid="section-trending">
            <div className="vf-label text-vf-text mb-3">Busy this week</div>
            <div className="-mx-4 px-4 flex gap-3 overflow-x-auto snap-x pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {trending.map(({ t, room }, i) => (
                <div key={room.id} className="snap-start shrink-0 w-[260px] flex">
                  <RoomCard room={room} index={i} onOpen={() => open(room.id)} note={`${t.messages} messages this week`} testId={`trending-${room.id}`} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="vf-label text-vf-text mb-3">Find a room</div>
          <SearchField className="mb-3" label="Search rooms" value={searchQuery} onChange={setSearchQuery} data-testid="input-search-groups" />
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-5 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTER_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                aria-pressed={activeFilter === f.value}
                className={`vf-press shrink-0 px-4 min-h-[36px] text-[13.5px] font-medium rounded-full border transition-colors ${
                  activeFilter === f.value
                    ? "bg-vf-text border-transparent text-vf-ink"
                    : "bg-vf-surface border-vf-line text-vf-text hover:border-vf-text/25"
                }`}
                data-testid={`filter-${f.value}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-[22px] border border-vf-line overflow-hidden">
                  <VfSkeleton className="aspect-[16/9] rounded-none" />
                  <div className="p-4 flex flex-col gap-2">
                    <VfSkeleton className="h-5 w-2/3" />
                    <VfSkeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : found.length === 0 ? (
            <EmptyState
              testId="text-no-groups"
              title={searching ? "No rooms match that." : activeFilter === "all" ? "You're in every room here." : "No rooms here yet."}
              body={searching ? "Try another word, or start the room you're looking for." : activeFilter === "all" ? "Start a new one for the thing you'd like to talk about." : "Start the first one."}
              action={<VfButton variant="secondary" onClick={() => setShowCreate(true)}>New room</VfButton>}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="text-section-discover">
              {found.map((room: any, i: number) => (
                <Fragment key={room.id}>
                  {activeFilter === "area" && room.locationLabel !== found[i - 1]?.locationLabel && (
                    <div className={`col-span-full vf-label text-vf-faint ${i ? "mt-3" : ""}`} data-testid="area-heading">
                      {room.locationLabel}
                    </div>
                  )}
                  <RoomCard room={room} index={i} onOpen={() => open(room.id)} />
                </Fragment>
              ))}
            </div>
          )}
        </section>
      </div>

      <CreateRoomSheet open={showCreate} onOpenChange={setShowCreate} />
    </LayoutShell>
  );
}

function YourRoomCard({ room, onOpen }: { room: any; onOpen: () => void }) {
  const unread = room.unreadCount > 0 && !room.isMuted ? room.unreadCount : 0;
  const line = room.lastMessage ? `${room.lastMessageNickname || "Someone"}: ${room.lastMessage}` : "Say hello.";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="vf-press snap-start shrink-0 w-[220px] rounded-[20px] overflow-hidden border border-vf-line bg-vf-surface2 text-left"
      data-testid={`card-group-${room.id}`}
    >
      <div className="relative h-[104px]">
        <RoomCover room={room} className="absolute inset-0 w-full h-full" initialSize={40} />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[rgba(12,9,16,.75)] to-transparent" />
        {unread > 0 && (
          <span className="absolute top-2.5 right-2.5 font-mono text-[11px] rounded-full px-2 min-w-[22px] h-[22px] leading-[22px] text-center bg-vf-ember text-vf-ink" data-testid={`badge-unread-${room.id}`}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
        {room.isMuted && <BellOff className="absolute top-3 right-3 w-4 h-4 text-white/80" aria-label="Muted" />}
        <div className="absolute left-3 right-3 bottom-2.5">
          {room.liveGame ? <LivePill game={room.liveGame} onDark /> : null}
        </div>
      </div>
      <div className="px-3.5 py-3">
        <div className={`text-[15.5px] text-vf-text truncate ${unread ? "font-semibold" : "font-medium"}`} data-testid={`text-group-name-${room.id}`}>
          {room.name}
        </div>
        <p className={`text-[13px] truncate mt-0.5 ${unread ? "text-vf-text" : "text-vf-muted"}`} data-testid={`text-group-preview-${room.id}`}>
          {line}
        </p>
      </div>
    </button>
  );
}

function RoomCard({ room, onOpen, index, note, testId }: { room: any; onOpen: () => void; index: number; note?: string; testId?: string }) {
  const reduce = useReducedMotion();
  const members: number = room.memberCount || 0;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.24 }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group vf-lift w-full rounded-[22px] overflow-hidden border border-vf-line bg-vf-surface2 cursor-pointer hover:border-vf-text/20 flex flex-col"
      data-testid={testId ?? `card-group-${room.id}`}
    >
      <div className="relative aspect-[16/9]">
        <RoomCover room={room} className="absolute inset-0 w-full h-full" initialSize={52} />
        {room.isOfficial && (
          <span
            className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 rounded-full"
            style={{ background: "rgba(245,240,234,.92)", color: "#14101C" }}
            data-testid="badge-official"
          >
            <BadgeCheck className="w-3 h-3" /> Official
          </span>
        )}
        {room.liveGame && (
          <span className="absolute bottom-2.5 left-2.5">
            <LivePill game={room.liveGame} onDark />
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="min-w-0">
          <div className="font-display text-[20px] leading-tight text-vf-text truncate" data-testid={`text-group-name-${room.id}`}>{room.name}</div>
          {note ? (
            <p className="vf-small text-vf-ember line-clamp-1 mt-0.5" data-testid="room-note">{note}</p>
          ) : (
            <p className="vf-small text-vf-muted line-clamp-1 mt-0.5">{room.description || "A new room. Say hello."}</p>
          )}
        </div>
        <div className="mt-auto flex items-center gap-2.5">
          <Faces faces={room.faces} />
          <span className="flex-1 min-w-0 text-[12.5px] text-vf-muted truncate inline-flex items-center gap-1.5">
            {members > 0 ? `${members} member${members === 1 ? "" : "s"}` : "New"}
            {room.privacyMode === "request-to-join" && <UserPlus className="w-3.5 h-3.5" aria-label="Asks to join" />}
            {room.privacyMode === "invite-only" && <Lock className="w-3.5 h-3.5" aria-label="Invite only" />}
          </span>
          {room.isMember ? (
            <span className="vf-label text-vf-faint shrink-0">Joined</span>
          ) : (
            <JoinCta room={room} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function JoinCta({ room }: { room: any }) {
  const [status, setStatus] = useState<"idle" | "joined" | "requested">("idle");
  const joinGroup = useJoinGroup();
  const paywall = usePaywall();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const performJoin = () => {
    joinGroup.mutate(room.id, {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/lounge/groups"] });
        if (data?.status === "requested") {
          setStatus("requested");
          toast({ title: "Request sent", description: "You'll be let in once an admin approves." });
        } else {
          setStatus("joined");
        }
      },
      onError: (err: Error) => toast({ title: "Couldn't join", description: err.message, variant: "destructive" }),
    });
  };

  if (status !== "idle") {
    return <span className="vf-label text-vf-faint shrink-0">{status === "joined" ? "Joined" : "Requested"}</span>;
  }
  if (room.privacyMode === "invite-only") return null;
  return (
    <>
      <button
        onClick={(e) => {
          // The card behind this button opens the room: join, don't navigate.
          e.stopPropagation();
          paywall.guard("join_group", performJoin);
        }}
        disabled={joinGroup.isPending}
        className="vf-press shrink-0 min-h-[40px] px-4 rounded-full text-[13.5px] font-semibold bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] transition-colors disabled:opacity-60"
        data-testid={`button-join-${room.id}`}
      >
        {joinGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : room.privacyMode === "request-to-join" ? "Ask to join" : "Join"}
      </button>
      {paywall.sheet}
    </>
  );
}

function CreateRoomSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacyMode, setPrivacyMode] = useState("open");
  const [topic, setTopic] = useState<string | null>(null);
  const [area, setArea] = useState("");
  const createGroup = useCreateGroup();
  const { toast } = useToast();
  const qc = useQueryClient();

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createGroup.mutateAsync({
        name, description, privacyMode,
        categoryTags: topic ? [topic] : undefined,
        locationLabel: area.trim() || undefined,
      });
      qc.invalidateQueries({ queryKey: ["/api/lounge/groups"] });
      qc.invalidateQueries({ queryKey: ["/api/lounge/discover"] });
      toast({ title: "Room made", description: `"${name}" is ready.` });
      setName("");
      setDescription("");
      setTopic(null);
      setArea("");
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Couldn't make the room", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    }
  };

  const field = "w-full h-11 px-3.5 text-[15px] rounded-[10px] bg-[var(--vf-elevated)] border border-transparent text-vf-text outline-none focus:border-vf-line transition-colors";
  return (
    <VfSheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Lounge"
      title="A new room"
      description="Somewhere for people who like the same thing."
      footer={
        <VfButton fullWidth onClick={handleCreate} disabled={!name.trim()} loading={createGroup.isPending} data-testid="button-submit-group">
          Make the room
        </VfButton>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="vf-label text-vf-faint mb-2 block">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Harare film nights" className={field} data-testid="input-group-name" />
        </label>
        <label className="block">
          <span className="vf-label text-vf-faint mb-2 block">What it's about</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line people will read first" className={field} data-testid="input-group-description" />
        </label>
        <div>
          <span className="vf-label text-vf-faint mb-2 block">Topic (optional)</span>
          <div className="flex flex-wrap gap-2">
            {LOUNGE_TOPICS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTopic(topic === t.key ? null : t.key)}
                aria-pressed={topic === t.key}
                className={`vf-press px-3.5 min-h-[34px] text-[13px] rounded-full border transition-colors ${
                  topic === t.key ? "bg-vf-text border-transparent text-vf-ink" : "bg-vf-surface border-vf-line text-vf-text"
                }`}
                data-testid={`create-topic-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="vf-label text-vf-faint mb-2 block">Area (optional)</span>
          <input value={area} onChange={(e) => setArea(e.target.value.slice(0, 60))} placeholder="Avondale, or Harare" className={field} data-testid="input-group-area" />
        </label>
        <div>
          <span className="vf-label text-vf-faint mb-2 block">Who can join</span>
          <Select value={privacyMode} onValueChange={setPrivacyMode}>
            <SelectTrigger data-testid="select-privacy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Anyone</SelectItem>
              <SelectItem value="request-to-join">People you let in</SelectItem>
              <SelectItem value="invite-only">Only people you invite</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </VfSheet>
  );
}
