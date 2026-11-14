import { useLocation } from "wouter";
import { DestiraMarkMotion } from "@/components/brand/logo";

// Brief 7.19: the two rings drifting apart, one line, one button home.
export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-dvh w-full flex flex-col items-center justify-center bg-vf-ink text-vf-text px-6 text-center">
      <DestiraMarkMotion size={140} mode="drift" />
      <h1 className="vf-h1 font-display mt-8" data-testid="text-not-found">This page wandered off</h1>
      <p className="vf-body text-vf-muted mt-2 max-w-[32ch]">
        The link may be old, or the page has moved.
      </p>
      <button
        onClick={() => setLocation("/")}
        className="mt-8 h-12 px-7 rounded-full bg-vf-ember text-vf-ink font-semibold vf-press"
        data-testid="button-not-found-home"
      >
        Take me home
      </button>
      <p className="mt-6 font-mono text-[11px] tracking-[0.12em] text-vf-faint">404</p>
    </div>
  );
}
