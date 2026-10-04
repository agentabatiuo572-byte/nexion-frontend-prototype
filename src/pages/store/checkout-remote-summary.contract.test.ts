import { describe, expect, it } from "vitest";
import source from "./checkout.vue?raw";

describe("remote checkout summary authority boundary", () => {
  it("does not present static shipping or network-fee claims in the remote checkout", () => {
    expect(source).toContain('<CheckoutRow v-if="!remoteApiEnabled" :label="t.store.coRowShipping"');
    expect(source).toContain('<CheckoutRow v-else-if="!remoteApiEnabled" :label="t.store.coRowNetworkFee"');
  });

  it("awaits committed-order recovery before a fresh eligibility decision and never starts a duplicate recovery during initial load", () => {
    const onLoad = source.slice(source.indexOf("onLoad(async (options) => {"), source.indexOf("const catalogStatus = computed"));
    expect(onLoad.indexOf("await resumeServerOrder(routeScope)")).toBeGreaterThanOrEqual(0);
    expect(onLoad.indexOf("await resumeServerOrder(routeScope)")).toBeLessThan(onLoad.indexOf("await refreshPurchaseEligibility(routeScope)"));
    expect(onLoad).toContain("!isCurrentCheckoutRoute(routeScope) || eligibility === \"stale\"");
    const onShow = source.slice(source.indexOf("onShow(() => {"), source.indexOf("onHide(() => {"));
    expect(onShow).toContain("checkoutRouteInitialized && !activeCheckoutLoad");
    expect(source).toContain("watch([() => app.accountKey, () => app.accountBindingEpoch]");
    expect(source).toContain("await offerWalletTopup(quotedTotal, submissionScope)");
    expect(source).toContain("if (!isCurrentCheckoutRoute(confirmationScope)) { confirming = false; return; }");
  });
});
