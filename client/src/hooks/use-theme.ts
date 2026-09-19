import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
const STORAGE_KEY = "destira-theme";
const THEME_COLOR: Record<"light" | "dark", string> = { dark: "#0C0910", light: "#FBF8F5" };

// Kept in lockstep with the inline script in client/index.html — that script
// makes the *first paint* correct (before React or this hook exist yet);
// this hook is what changes the theme thereafter and keeps it applied to
// data-theme, the theme-color meta tag, and localStorage.
function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", pref);
  }
  const resolved = pref === "system" ? resolveSystemTheme() : pref;
  const meta = document.getElementById("meta-theme-color");
  if (meta) meta.setAttribute("content", THEME_COLOR[resolved]);
}

function readStoredPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* localStorage unavailable */
  }
  // No preference saved yet — light is the app default, not the OS setting.
  // "system" stays available as an explicit choice in Settings.
  return "light";
}

/** The Settings toggle (and anything else) reads/sets theme through this —
 *  never touch data-theme or localStorage directly outside this file and
 *  index.html's pre-paint script, or the two will drift. */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* private-mode/quota — theme still applies for this session, just won't persist */
    }
    applyTheme(pref);
  }, []);

  // Re-apply on mount (covers the rare case where React hydrates with a
  // different value than the pre-paint script resolved, e.g. localStorage
  // changed in another tab) and keep the meta tag correct if the OS
  // preference changes while in "system" mode.
  useEffect(() => {
    applyTheme(preference);
    if (preference !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  return { preference, setPreference };
}
