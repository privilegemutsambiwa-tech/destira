// Keeps what you're typing above the on-screen keyboard in the Android app.
//
// Android 15 draws apps edge to edge, and the installed app (up to 1.3)
// doesn't shrink its web view for the keyboard: it slides up OVER the page,
// so a chat's composer, pinned to the bottom of an `h-dvh` screen, ends up
// hidden behind it. MainActivity now resizes the web view for the keyboard
// (from the next app release); this covers phones still on an older build,
// and it switches itself off wherever the page does shrink.
//
// How: when a text field gets focus and the page hasn't shrunk a moment
// later, the keyboard must be overlaying it. We can't measure the keyboard
// from here, so we reserve a typical keyboard's height (about 40% of the
// screen in portrait) and let CSS lift full-height screens by that much
// (index.css: html.vf-kb-overlay). Too much leaves a small gap above the
// keyboard; too little would hide the field again, so it errs high.
import { isNativeApp } from "./native";

const TEXT_INPUT = /^(text|search|email|url|tel|password|number)$/;

function isTextField(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return TEXT_INPUT.test(el.type || "text") && !el.readOnly;
  return (el as HTMLElement).isContentEditable;
}

export function initKeyboardOverlay() {
  if (!isNativeApp() || !/android/i.test(navigator.userAgent)) return;

  const root = document.documentElement;
  let baseline = window.innerHeight;
  let check = 0;
  let resizes = false; // learned: this build resizes the page for the keyboard

  const clear = () => {
    root.classList.remove("vf-kb-overlay");
    root.style.removeProperty("--vf-kb");
  };

  window.addEventListener("resize", () => {
    // A real shrink while a field is focused means the native fix is in.
    if (isTextField(document.activeElement) && window.innerHeight < baseline - 120) {
      resizes = true;
      clear();
    }
    if (!isTextField(document.activeElement)) baseline = window.innerHeight;
  });

  document.addEventListener("focusin", (e) => {
    if (resizes || !isTextField(e.target as Element)) return;
    window.clearTimeout(check);
    check = window.setTimeout(() => {
      const el = document.activeElement;
      if (!isTextField(el) || window.innerHeight < baseline - 120) return;
      const kb = Math.round(Math.max(window.screen.height, baseline) * 0.42);
      root.style.setProperty("--vf-kb", `${kb}px`);
      root.classList.add("vf-kb-overlay");
      // Bring the field itself into the space that's left.
      requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" }));
    }, 380);
  });

  document.addEventListener("focusout", () => {
    window.clearTimeout(check);
    // Moving straight to another field keeps the keyboard up.
    window.setTimeout(() => {
      if (!isTextField(document.activeElement)) clear();
    }, 80);
  });
}
