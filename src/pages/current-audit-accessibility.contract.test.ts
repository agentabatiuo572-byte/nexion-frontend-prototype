// @ts-ignore Node-only contract test; the application TS project excludes Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
describe("audited navigation semantics", () => {
  it("exposes interactive wallet rows without focusing static rows", () => {
    const source = read("../components/me/wallet-list-row.vue");
    expect(source).toContain(':role="interactive ?');
    expect(source).toContain(':tabindex="interactive ? 0 : undefined"');
  });
  it("makes device ranking and commission help keyboard reachable", () => {
    expect(read("../components/earn/market-board.vue")).toContain(':tabindex="d.kind ? 0 : undefined"');
    expect(read("team/commissions.vue")).toMatch(/role="link" tabindex="0"[^>]*@click="go\('\/pages\/team\/commissions-how'\)"/);
  });
  it("never presents private purchase totals as a public payout statistic", () => {
    const source = read("onboarding/intro.vue");
    // The intro shows no payout total at all now (slogan only), private or public.
    expect(source).not.toMatch(/homeTruth|onlineDevicesOf|verifiedStats|publicStats|cumulativePaid|completedPayout|platform-stats/);
  });
});
