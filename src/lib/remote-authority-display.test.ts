import { describe, expect, it } from "vitest";
import { remoteAuthorityStatus } from "@/lib/remote-authority-display";

const pages = import.meta.glob([
  "../pages/me/wallet-exchange.vue",
  "../pages/me/wallet-nex.vue",
  "../pages/market/market.vue",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("remote authority display state", () => {
  it.each([
    ["mock data", false, false, false, "ready"],
    ["a remote read in flight", true, false, false, "loading"],
    ["a remote read failure", true, false, true, "unavailable"],
    ["a received snapshot whose balances are legitimately zero", true, true, false, "ready"],
  ] as const)("treats %s as %s", (_label, remoteApiEnabled, hasSnapshot, hasError, expected) => {
    expect(remoteAuthorityStatus({ remoteApiEnabled, hasSnapshot, hasError })).toBe(expected);
  });

  it("keeps exchange amounts, history, and rate unknown until its remote snapshot exists", () => {
    const source = pages["../pages/me/wallet-exchange.vue"] ?? "";
    expect(source).toContain("exchangeAuthorityStatus");
    expect(source).toContain('exchangeAuthorityStatus === "loading"');
    expect(source).toContain("exchangeAuthorityStatus !== 'ready'");
    expect(source).toContain("const rateLabel = computed(() => exchangeSnapshotReady.value");
    expect(source).toContain("const fromBalLabel = computed(() => exchangeSnapshotReady.value");
    expect(source).toContain("const remoteSnapshotReceivedAt = ref(0)");
    expect(source).toContain("remoteSnapshotReceivedAt.value = Date.now()");
  });

  it("does not attach an ATH percentage or NEX USD valuation to a missing market authority", () => {
    const market = pages["../pages/market/market.vue"] ?? "";
    const wallet = pages["../pages/me/wallet-nex.vue"] ?? "";
    expect(market).toContain('v-if="nex.ath > 0"');
    expect(market).toContain("marketAuthorityStatus === 'loading'");
    expect(wallet).toContain("marketAuthorityStatus");
    expect(wallet).toContain("const valuationKnown = computed(() => balanceKnown.value && marketValueKnown.value)");
    expect(wallet).toContain("marketAuthorityStatus === 'unavailable'");
    expect(wallet).toContain("valuationKnown.value ? fmtUSD(usdValue.value) : \"—\"");
  });
});
