import { useEffect, useRef } from "react";

/**
 * Re-anchors a chat's message list to the latest message when the on-screen
 * keyboard opens or closes. `interactive-widget=resizes-content` (client/
 * index.html) plus `h-dvh` on the chat's outer container handle "the
 * composer/last message ends up hidden behind the keyboard" for most
 * browsers — the layout itself shrinks with the visual viewport. What that
 * doesn't do is move an already-scrolled list back to the bottom, which is
 * what this actually fixes: the visualViewport `resize` event (the standard
 * signal for a keyboard opening on both iOS Safari and Android Chrome) fires
 * `onChange`.
 *
 * Takes the callback by ref internally, so callers don't need to memoize it
 * with useCallback for this to behave correctly — DirectChat's scrollToBottom
 * isn't memoized today and this shouldn't be the reason it has to become so.
 */
export function useKeyboardScroll(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const handle = () => {
      cancelAnimationFrame(raf);
      // One frame's delay — the viewport resize and the keyboard animation
      // aren't perfectly synchronous; this avoids scrolling mid-transition.
      raf = requestAnimationFrame(() => onChangeRef.current());
    };
    vv.addEventListener("resize", handle);
    return () => {
      vv.removeEventListener("resize", handle);
      cancelAnimationFrame(raf);
    };
  }, []);
}
