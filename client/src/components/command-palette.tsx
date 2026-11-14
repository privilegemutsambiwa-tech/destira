// Desktop keyboard layer (docs/destira-upgrade-prompt.md §9):
//   Cmd/Ctrl+K  the command palette: any screen, people you've matched,
//               your rooms, your seats, and settings
//   ?           the shortcuts sheet
//   g then a letter  go somewhere (g d Discover, g c Chats, ...)
// Lists are fetched only while the palette is open, and share their cache
// keys with the screens that already load them.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  CalendarDays, Heart, MessageCircle, Search, Settings as SettingsIcon, Sparkles, User, Users, CreditCard, Gift, Ticket,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { VfAvatar } from "@/components/ui-vf";
import { useAuth } from "@/hooks/use-auth";

type Go = { label: string; href: string; icon: React.ComponentType<{ className?: string }>; keys?: string; words?: string };

const SCREENS: Go[] = [
  { label: "Discover", href: "/discover", icon: Search, keys: "g d", words: "people tonight three" },
  { label: "Chats", href: "/chats", icon: MessageCircle, keys: "g c", words: "messages interviews" },
  { label: "Likes", href: "/matches", icon: Heart, keys: "g l", words: "matches liked you" },
  { label: "Lounge", href: "/lounge", icon: Users, keys: "g o", words: "rooms groups games" },
  { label: "Events", href: "/events", icon: CalendarDays, keys: "g e", words: "tickets seats host" },
  { label: "Profile", href: "/profile", icon: User, keys: "g p", words: "me photos prompts" },
  { label: "Talk to your twin", href: "/twin-chat", icon: Sparkles, keys: "g t", words: "twin ai" },
  { label: "Settings", href: "/settings", icon: SettingsIcon, keys: "g s", words: "preferences account" },
  { label: "Plans", href: "/plans", icon: CreditCard, words: "upgrade spark flame ember billing" },
  { label: "Invite friends", href: "/invite", icon: Gift, words: "referral code" },
];

const SETTINGS_SECTIONS = [
  "Account", "Your twin", "Privacy & safety", "Notifications", "Discovery", "Plan & billing", "App", "Help", "Legal",
];

const G_KEYS: Record<string, string> = Object.fromEntries(
  SCREENS.filter((s) => s.keys).map((s) => [s.keys!.split(" ")[1], s.href]),
);

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

const json = (url: string) => async () => {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
};

const ITEM =
  "flex items-center gap-3 px-3 h-11 rounded-[10px] cursor-pointer text-[14.5px] text-vf-text data-[selected=true]:bg-vf-text/[0.07]";
const HEADING =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-vf-faint";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-[6px] border border-vf-line bg-vf-surface2 font-mono text-[11px] text-vf-muted">
      {children}
    </kbd>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [, setLocation] = useLocation();
  const gPending = useRef<number | null>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const { user } = useAuth();
  const signedIn = !!user;

  useEffect(() => {
    if (!signedIn) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setHelp(false);
        setOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setOpen(false);
        setHelp((h) => !h);
        return;
      }
      if (gPending.current != null) {
        const href = G_KEYS[e.key.toLowerCase()];
        window.clearTimeout(gPending.current);
        gPending.current = null;
        if (href) {
          e.preventDefault();
          setLocation(href);
        }
        return;
      }
      if (e.key === "g") {
        gPending.current = window.setTimeout(() => { gPending.current = null; }, 1200);
      }
    };
    // The rail's "Go anywhere" button opens it too.
    const onOpen = () => { setHelp(false); setOpen(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("vf:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("vf:open-palette", onOpen);
    };
  }, [setLocation, signedIn]);

  const { data: matches } = useQuery<any[]>({ queryKey: ["/api/matches"], queryFn: json("/api/matches"), enabled: open, staleTime: 60_000 });
  const { data: groups } = useQuery<any[]>({ queryKey: ["/api/lounge/groups", undefined, "all"], queryFn: json("/api/lounge/groups"), enabled: open, staleTime: 60_000 });
  const { data: seats } = useQuery<any[]>({ queryKey: ["/api/events", "my-seats"], queryFn: json("/api/events/my-seats"), enabled: open, staleTime: 60_000 });

  const people = (matches ?? []).filter((m) => m?.otherProfile?.displayName && m.status === "matched").slice(0, 40);
  const rooms = (groups ?? []).filter((g) => g?.isMember).slice(0, 30);
  const mySeats = (Array.isArray(seats) ? seats : []).slice(0, 20);

  if (!signedIn) return null;

  const go = (href: string) => {
    setOpen(false);
    setLocation(href);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 overflow-hidden max-w-[600px] top-[18%] translate-y-0 rounded-[18px] border border-vf-line bg-vf-surface text-vf-text [&>button]:hidden">
          <DialogTitle className="sr-only">Go anywhere</DialogTitle>
          <DialogDescription className="sr-only">Search screens, people you've matched, your rooms, your seats and settings.</DialogDescription>
          <Command loop className={HEADING}>
            <div className="flex items-center gap-2.5 px-4 border-b border-vf-line">
              <Search className="w-[18px] h-[18px] text-vf-faint shrink-0" />
              <Command.Input
                autoFocus
                placeholder="Go to a screen, a person, a room…"
                className="h-14 flex-1 bg-transparent outline-none text-[16px] text-vf-text placeholder:text-vf-faint"
                data-testid="input-command-palette"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[420px] overflow-y-auto p-2 vf-scroll">
              <Command.Empty className="py-10 text-center text-[14px] text-vf-muted">Nothing called that.</Command.Empty>

              <Command.Group heading="Go to">
                {SCREENS.map((s) => (
                  <Command.Item key={s.href} value={`${s.label} ${s.words ?? ""}`} onSelect={() => go(s.href)} className={ITEM}>
                    <s.icon className="w-[18px] h-[18px] text-vf-muted" />
                    <span className="flex-1">{s.label}</span>
                    {s.keys && <span className="flex gap-1">{s.keys.split(" ").map((k) => <Kbd key={k}>{k}</Kbd>)}</span>}
                  </Command.Item>
                ))}
              </Command.Group>

              {people.length > 0 && (
                <Command.Group heading="People">
                  {people.map((m) => (
                    <Command.Item key={`m${m.id}`} value={`person ${m.otherProfile.displayName} ${m.id}`} onSelect={() => go(`/chat/${m.id}`)} className={ITEM}>
                      <VfAvatar src={m.otherProfile.coverPhotoUrl} name={m.otherProfile.displayName} seed={m.otherProfile.userId} size={26} />
                      <span className="flex-1 truncate">{m.otherProfile.displayName}</span>
                      <span className="vf-small text-vf-faint">Chat</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {rooms.length > 0 && (
                <Command.Group heading="Your rooms">
                  {rooms.map((g) => (
                    <Command.Item key={`g${g.id}`} value={`room ${g.name} ${g.id}`} onSelect={() => go(`/lounge/group/${g.id}`)} className={ITEM}>
                      <Users className="w-[18px] h-[18px] text-vf-muted" />
                      <span className="flex-1 truncate">{g.name}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {mySeats.length > 0 && (
                <Command.Group heading="Your seats">
                  {mySeats.map((e) => (
                    <Command.Item key={`e${e.id}`} value={`event ${e.title} ${e.id}`} onSelect={() => go(`/events/${e.id}`)} className={ITEM}>
                      <Ticket className="w-[18px] h-[18px] text-vf-muted" />
                      <span className="flex-1 truncate">{e.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Settings">
                {SETTINGS_SECTIONS.map((label) => (
                  <Command.Item key={label} value={`settings ${label}`} onSelect={() => go(`/settings?q=${encodeURIComponent(label)}`)} className={ITEM}>
                    <SettingsIcon className="w-[18px] h-[18px] text-vf-muted" />
                    <span className="flex-1">{label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
            <div className="flex items-center gap-4 px-4 h-10 border-t border-vf-line text-[12px] text-vf-faint">
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> open</span>
              <span className="ml-auto flex items-center gap-1.5"><Kbd>?</Kbd> all shortcuts</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-[440px] rounded-[18px] border border-vf-line bg-vf-surface text-vf-text">
          <DialogTitle className="font-display text-[26px] font-normal">Shortcuts</DialogTitle>
          <DialogDescription className="sr-only">Keyboard shortcuts for Destira on a computer.</DialogDescription>
          <ul className="mt-2 divide-y divide-vf-line" data-testid="shortcuts-sheet">
            {[
              { k: [isMac ? "⌘" : "Ctrl", "K"], d: "Go anywhere" },
              { k: ["?"], d: "This list" },
              { k: ["Esc"], d: "Close a sheet or dialog" },
              ...SCREENS.filter((s) => s.keys).map((s) => ({ k: s.keys!.split(" "), d: s.label })),
            ].map((row) => (
              <li key={row.d} className="flex items-center justify-between py-2.5 text-[14.5px]">
                <span>{row.d}</span>
                <span className="flex gap-1">{row.k.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
