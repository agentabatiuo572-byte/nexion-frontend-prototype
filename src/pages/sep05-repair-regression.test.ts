import { describe, expect, it } from "vitest";
const sources = import.meta.glob([
  "./store/store.vue", "../components/store/store-hero.vue", "../i18n/messages/*.ts",
  "./me/wallet-withdraw.vue", "./team/leadership-pool.vue",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const read = (path: string) => sources[path] ?? "";

describe("September 5 audited display regressions", () => {
  it("uses the same actual upgrade for the store hero and comparison card", () => {
    // Hero, ladder and phone comparison all read the one store yield authority.
    expect(read("./store/store.vue")).toContain('<StoreHero :multiplier="yieldAuthority.multiplier" />');
    expect(read("./store/store.vue")).toContain('<ClusterLadder :authority="yieldAuthority"');
    expect(read("./store/store.vue")).toContain('<VsPhoneHero :authority="yieldAuthority" />');
    expect(read("../components/store/store-hero.vue")).toContain('v-if="multiplier !== null"');
  });
  it.each(["zh", "en", "vi"])("does not invent weekly stock in %s", (locale) => {
    const copy = read(`../i18n/messages/${locale}.ts`);
    for (const key of ["onlyXLeft", "cardStockCompact"]) {
      expect(copy.match(new RegExp(`${key}: "([^"]+)"`))?.[1]).not.toMatch(/本周|week|tuần/);
    }
  });
  it("shows missing input before a remote verdict which cannot be requested", () => {
    const source = read("./me/wallet-withdraw.vue").split("function disabledReasonFor")[1].split("const submitDisabledReason")[0];
    expect(source.indexOf("submitReasonAmountRequired")).toBeLessThan(source.indexOf('decision.configVersion === "remote-pending"'));
    expect(source.indexOf("submitReasonAddressRequired")).toBeLessThan(source.indexOf('decision.configVersion === "remote-pending"'));
  });
  // The concentration hint (server topN) left in the 2026-10-29 copy audit; the payout clock stays lifecycle-managed.
  it("keeps the pool payout clock lifecycle-managed", () => {
    const source = read("./team/leadership-pool.vue");
    expect(source).toContain("createPayoutClock");
    expect(source).toContain("payoutClock.stop()");
    expect(source).toMatch(/async function loadRemotePool\(\) \{\n  if \(!remoteApiEnabled \|\| !pageVisible\b/);
    expect(source).toContain("pageVisible = false;");
    expect(source).not.toContain("nextPayoutTs.value - Date.now()");
  });
});
