// Landing: the pieces every section uses (reveal on scroll, eyebrow, heading).

import type React from "react";
import { useRef, useEffect, useState } from "react";

export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduce;
}

/** Scroll-in reveal: opacity 0→1, translateY(16px)→0 over 600ms, fires once.
 *  Renders the final state immediately under prefers-reduced-motion. */
export function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Visible by default. Only content that starts below the fold is hidden,
  // and only once we know the observer is there to bring it back.
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (reduce || !el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already on screen
    setShown(false);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          window.setTimeout(() => setShown(true), delay);
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay, reduce]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(16px)",
        transition: "opacity 600ms ease-out, transform 600ms ease-out",
      }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, tone = "faint" }: { children: React.ReactNode; tone?: "faint" | "mint" | "ember" }) {
  const color = tone === "mint" ? "text-vf-mint" : tone === "ember" ? "text-vf-ember" : "text-vf-faint";
  return <div className={`font-mono text-[11px] uppercase tracking-[0.16em] ${color}`}>{children}</div>;
}

export function SectionHeading({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <h2
      id={id}
      className={`font-serif font-normal text-vf-text mt-3 ${className}`}
      style={{ fontSize: "clamp(30px, 4.4vw, 50px)", lineHeight: 1.06, letterSpacing: "-0.02em" }}
    >
      {children}
    </h2>
  );
}
