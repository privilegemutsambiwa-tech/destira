// The Discover deck's logic, out of pages/Discover.tsx: keyboard shortcuts,
// the browsing order, and reading a perk refusal from the server.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Feature } from "@shared/entitlements";
import type { GateState } from "@/hooks/use-gate";
import type { FilterChip } from "./top-bar";

export type DeckKeyActions = { pass: () => void; like: () => void; interview: () => void; undo: () => void };

/** Left pass, right like, I interview, Z undo. Reads the latest handlers
 *  through `ref`, which the page fills only while a card is showing. */
export function useDeckKeys(ref: MutableRefObject<DeckKeyActions | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = ref.current;
      if (!a || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      // Never while typing, and never under an open dialog or sheet.
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft") { e.preventDefault(); a.pass(); }
      else if (k === "arrowright") { e.preventDefault(); a.like(); }
      else if (k === "i") a.interview();
      else if (k === "z") a.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}

/**
 * The actual browsing order, as a list of ids — not re-derived from
 * scratch each render. Tapping a "Next up" card must permanently rotate
 * the previous front card out of the immediate preview window (otherwise
 * it lands right back in the next-up slice and two or three people just
 * trade places forever instead of the viewer ever reaching the rest of
 * the deck — this was the actual bug, not the backend candidate list).
 */
export function useDeckOrder(rawProfiles: any[] | undefined, extraCards: Record<string, any>, filter: FilterChip, evaluatedIds: Set<string>) {
  const [deckOrder, setDeckOrder] = useState<string[]>([]);

  // Under the active filter, before this session's evaluations thin it out
  // — the stable denominator for the "N of total" counter. Excludes
  // evaluatedIds on purpose: the counter's total shouldn't shrink every time
  // a card leaves the deck, only the position within it should climb.
  const eligibleForFilter = useMemo(() => {
    const base: any[] = rawProfiles ?? [];
    const have = new Set(base.map((p: any) => p.userId));
    const all = [...Object.values(extraCards).filter((c: any) => !have.has(c.userId)), ...base];
    return filter === "nearby" ? all.filter((p: any) => p.distanceKm !== null && p.distanceKm !== undefined) : all;
  }, [rawProfiles, filter, extraCards]);

  // Keeps the deck's browsing order stable across renders instead of
  // re-deriving it from the raw list every time. Newly-seen candidates
  // (a fresh signup, or the filter changing) are appended at the back;
  // anyone evaluated or filtered out drops off; everyone else keeps their
  // relative position, which is what makes the "Next up" rotation
  // actually work.
  //
  // "Within 20km" sorts by distance HERE, once, as candidates join the deck —
  // never on every render. Re-sorting the rendered list each time used to
  // snap the nearest person straight back to the front, so tapping a "Next
  // up" card in nearby mode did nothing. A filter change starts a fresh order.
  const deckFilterRef = useRef(filter);
  useEffect(() => {
    let available: any[] = eligibleForFilter.filter((p: any) => !evaluatedIds.has(p.userId));
    if (filter === "nearby") {
      available = [...available].sort((a: any, b: any) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    const availableIds: string[] = available.map((p: any) => p.userId as string);
    const availableSet = new Set(availableIds);
    const filterChanged = deckFilterRef.current !== filter;
    deckFilterRef.current = filter;
    setDeckOrder((prev) => {
      const kept = (filterChanged ? [] : prev).filter((id) => availableSet.has(id));
      const keptSet = new Set(kept);
      const added = availableIds.filter((id) => !keptSet.has(id));
      const next = [...kept, ...added];
      const unchanged = next.length === prev.length && next.every((id, i) => id === prev[i]);
      return unchanged ? prev : next;
    });
  }, [eligibleForFilter, evaluatedIds, filter]);

  const profiles = useMemo(() => {
    const byId = new Map<string, any>(eligibleForFilter.map((p: any) => [p.userId as string, p]));
    return deckOrder.map((id) => byId.get(id)).filter((p): p is any => !!p);
  }, [eligibleForFilter, deckOrder]);

  /** Put someone back at the front of the deck. */
  const toFront = (userId: string) => setDeckOrder((prev) => [userId, ...prev.filter((id) => id !== userId)]);

  return { eligibleForFilter, profiles, toFront };
}

/** A 403 from rewind, super like or boost, as the refusal sheet's gate.
 *  Null when the server only sent a message (shown as a toast). */
export function perkRefusalGate(feature: Feature, body: any): GateState | null {
  const offersPlan = ((feature === "super_like" || feature === "boost") && body?.upgradeRequired) || body?.requiredTierName;
  if (!offersPlan) return null;
  return {
    ok: false,
    tier: body?.currentTier ?? "free",
    limit: null,
    resetAt: body?.resetAt,
    line: body?.message,
    action: body?.action,
    requiredTierName: body?.requiredTierName,
    requiredPrice: body?.requiredPrice,
  };
}
