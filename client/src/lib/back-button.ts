// Android's back button closes whatever is open on top before it leaves the
// screen: a sheet, a dialog, a menu, a photo viewer. Pressing back with a
// sheet up and losing the whole page is the most common "this app is broken"
// moment on Android.
//
// Two kinds of overlay:
// - Radix ones (VfSheet, dialogs, menus, selects) close on Escape, so back
//   sends Escape to the one on top. Nothing to wire per screen.
// - Hand-made ones (a lightbox, a confirm panel, the match moment) call
//   useBackToClose(open, close) and are closed first, newest first.
import { useEffect, useRef } from "react";

const closers: Array<() => void> = [];

/** Close the newest overlay. Returns true if back was used up doing that. */
export function closeTopOverlay(): boolean {
  const top = closers.pop();
  if (top) {
    top();
    return true;
  }
  const open = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]',
  );
  const el = open[open.length - 1];
  if (!el) return false;
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  return true;
}

/** While `open`, the back button calls `close` instead of leaving the screen. */
export function useBackToClose(open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const fn = () => latest.current();
    closers.push(fn);
    return () => {
      const i = closers.lastIndexOf(fn);
      if (i >= 0) closers.splice(i, 1);
    };
  }, [open]);
}
