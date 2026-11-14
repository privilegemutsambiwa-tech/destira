// Desktop keyboard layer (docs/destira-upgrade-prompt.md §9):
//   Cmd/Ctrl+K  the command palette (command-palette-dialogs.tsx)
//   ?           the shortcuts sheet
//   g then a letter  go somewhere (g d Discover, g c Chats, ...)
// Only this listener is in the app's first load; the palette itself, with
// cmdk, loads the first time it's opened.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const PaletteDialogs = lazy(() => import("./command-palette-dialogs"));

/** Keep in step with SCREENS in command-palette-dialogs.tsx. */
const G_KEYS: Record<string, string> = {
  d: "/discover",
  c: "/chats",
  l: "/matches",
  o: "/lounge",
  e: "/events",
  p: "/profile",
  t: "/twin-chat",
  s: "/settings",
};

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [, setLocation] = useLocation();
  const gPending = useRef<number | null>(null);
  const { user } = useAuth();
  const signedIn = !!user;

  useEffect(() => {
    if (!signedIn) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLoaded(true);
        setHelp(false);
        setOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setLoaded(true);
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
    const onOpen = () => { setLoaded(true); setHelp(false); setOpen(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("vf:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("vf:open-palette", onOpen);
    };
  }, [setLocation, signedIn]);

  if (!signedIn || !loaded) return null;
  return (
    <Suspense fallback={null}>
      <PaletteDialogs open={open} setOpen={setOpen} help={help} setHelp={setHelp} />
    </Suspense>
  );
}
