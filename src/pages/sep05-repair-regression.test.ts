import { describe, expect, it } from "vitest";
const sources = import.meta.glob([
  "./store/store.vue", "../components/store/store-hero.vue", "../i18n/messages/*.ts",
  "./me/wallet-withdraw.vue", "./team/leadership-pool.vue",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const read = (path: string) => sources[path] ?? "";

describe("September 5 audited display regressions", () => {
  it("uses the same actual upgrade for the store hero and comparison card", () => {
    expect(read("./store/store.vue")).toContain(':multiplier="upgrade?.multiplier ?? null"');
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
  it("binds pool concentration to server topN and a lifecycle-managed clock", () => {
    const source = read("./team/leadership-pool.vue");
    expect(source).toContain("remotePool.value?.topN");
    expect(source).toContain("let remaining = poolTopN.value");
    expect(source).toContain("createPayoutClock");
    expect(source).toContain("payoutClock.stop()");
    expect(source).toContain("if (!remoteApiEnabled || !pageVisible) return;");
    expect(source).toContain("pageVisible = false;");
    expect(source).not.toContain("nextPayoutTs.value - Date.now()");
  });
});
