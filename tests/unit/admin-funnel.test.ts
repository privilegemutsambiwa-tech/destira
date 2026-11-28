// The console Funnel screen (client/src/admin/AdminFunnel.tsx) shows the
// date-planned step, the selfie-verified share and the time to sign up.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminFunnel from "../../client/src/admin/AdminFunnel";

const row = (key: string, n: Partial<Record<string, number>> = {}) => ({
  key, visits: 400, signups: 100, basics: 80, liked: 60, matched: 30, messaged: 20, planned: 5, paid: 4, verified: 25, ...n,
});

function render(signup: { finished: number; medianSec: number | null; p90Sec: number | null }) {
  const qc = new QueryClient();
  qc.setQueryData(["admin", "funnel", 30], { days: 30, total: row("all"), byVariant: [row("city-harare")], bySource: [row("campaign")], signup });
  return renderToString(createElement(QueryClientProvider, { client: qc }, createElement(AdminFunnel)))
    .replace(/<!-- -->/g, "");
}

describe("the Funnel screen", () => {
  it("shows the date-planned step after messages", () => {
    const html = render({ finished: 80, medianSec: 94, p90Sec: 260 });
    expect(html.indexOf("Sent a message")).toBeLessThan(html.indexOf("Planned a date"));
    expect(html.indexOf("Planned a date")).toBeLessThan(html.indexOf(">Paid<"));
    // 5 of 20 who messaged planned a date.
    expect(html).toMatch(/Planned a date[\s\S]*?>5<span[^>]*>25%</);
  });

  it("shows verified as a share of sign-ups, and names the city pages", () => {
    const html = render({ finished: 80, medianSec: 94, p90Sec: 260 });
    expect(html).toMatch(/Verified with a selfie[\s\S]*?25<span[^>]*>25% of sign-ups/);
    expect(html).toContain("Dating in Harare page");
  });

  it("says whether sign-up is under the 2 minute goal", () => {
    const fast = render({ finished: 80, medianSec: 94, p90Sec: 260 });
    expect(fast).toContain("1 min 34 s");
    expect(fast).toContain("under the 2 min goal");
    expect(fast).toContain("9 in 10 took 4 min 20 s or less");
    expect(render({ finished: 80, medianSec: 200, p90Sec: 400 })).toContain("over the 2 min goal");
    expect(render({ finished: 0, medianSec: null, p90Sec: null })).toContain("Nobody who signed up in this period has done the basics yet.");
  });
});
