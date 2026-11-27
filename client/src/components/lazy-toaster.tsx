// The toast area, loaded off the first screen (Part K5): Radix's toast code
// isn't needed to show the landing, so it's fetched once the page has
// settled, or straight away if something wants to show a toast before then.
// Toasts raised meanwhile wait in use-toast's store and appear when it lands.
import { lazy, Suspense, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

const Toaster = lazy(() => import("@/components/ui/toaster").then((m) => ({ default: m.Toaster })));

export function LazyToaster() {
  const { toasts } = useToast();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setSettled(true), { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setSettled(true), 2500);
    return () => window.clearTimeout(id);
  }, []);
  if (!settled && toasts.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}
