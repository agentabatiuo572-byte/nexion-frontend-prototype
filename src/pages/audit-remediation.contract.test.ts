import { describe, expect, it } from "vitest";

const sources = import.meta.glob([
  "../components/slot-action-sheet.vue",
  "./me/devices.vue",
  "./onboarding/connect.vue",
  "./me/receipts.vue",
  "./daily/daily.vue",
  "./globe/globe.vue",
  "./onboarding/intro.vue",
  "./store/order-detail.vue",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const read = (path: string) => sources[path] ?? "";

describe("read-only audit remediation contracts", () => {
  it("activates inventory through the canonical device command in remote mode", () => {
    const source = read("../components/slot-action-sheet.vue");
    expect(source).toContain("async function onActivate");
    expect(source).toContain("await deviceE3Api.activate");
    expect(source).toContain("await app.refreshRemoteFleet");
    expect(source).toContain("if (remoteApiEnabled)");
  });

  it("blocks both real activation click paths until a missing activation timestamp is reconciled", () => {
    const slotSheet = read("../components/slot-action-sheet.vue");
    const devices = read("./me/devices.vue");
    expect(slotSheet).toContain("if (requiresActivationConfirmation(d))");
    expect(slotSheet).toContain("const unconfirmedDevices");
    expect(devices).toContain("if (requiresActivationConfirmation(d))");
    expect(devices).toContain("const unconfirmedDevices");
  });

  it("does not collapse a failed compute receipt request into an empty list", () => {
    const source = read("./me/receipts.vue");
    expect(source).toContain('remoteComputeReceiptStatus.value = "error"');
    expect(source).toContain("showRemoteReceiptInitialError");
    expect(source).toContain("retryRemoteReceipts");
    expect(source).toContain("failedComputeReceiptRequest.value = { offset, cursor, append }");
    expect(source).toContain("if (failed.append) void loadSelectedMoreRemoteReceipts();");
    expect(source).toContain("else void loadRemoteComputeReceipts(failed.offset, false, failed.cursor);");
    expect(source).toMatch(/<GlassSegments[^>]*v-model="tab"[^>]*:options="categoryOptions"/);
    expect(source).toContain('@keydown.space.prevent="handleClearAll"');
  });

  it("gates daily facts and actions on a ready response, including reload failures", () => {
    const source = read("./daily/daily.vue");
    expect(source).toContain("remoteInitialLoading");
    expect(source).toContain('v-if="remoteInitialLoading || (remoteApiEnabled && [\'idle\', \'loading\'].includes(faucet.remoteReadState))"');
    expect(source).toContain('<template v-if="dailyFactsReady">');
    expect(source).toContain("!remoteApiEnabled || faucet.remoteReadState === 'ready'");
    expect(source).toContain("['idle', 'loading'].includes(faucet.remoteReadState)");
    for (const handler of ["handleCheckIn", "handleClaimMilestone", "handleUseSaver"]) {
      expect(source).toMatch(new RegExp(`async function ${handler}\\([^)]*\\) \\{\\s*if \\(!dailyFactsReady.value\\) return;`));
    }
    expect(source).toContain('role="button" tabindex="0" :aria-disabled="lastSignedToday || remoteRefreshing || checkInSubmitting || !checkInStateConfirmed ? \'true\' : \'false\'"');
    expect(source).toContain('@keydown.enter.prevent="handleCheckIn"');
    expect(source).toContain('@keydown.space.prevent="handleUseSaver"');
    expect(source).toContain('@keydown.enter.prevent="goWithdraw"');
    expect(source).toContain("if (lastSignedToday.value || remoteRefreshing.value || checkInSubmitting.value) return");
    expect(source).toContain("if (!streakBroken.value || remoteRefreshing.value || saverSubmitting.value) return");
  });

  it("refreshes globe data on return and makes every click target keyboard-operable", () => {
    const source = read("./globe/globe.vue");
    expect(source).toMatch(/import\s*\{[^}]*\bonShow\b[^}]*\}\s*from\s*["']@dcloudio\/uni-app["']/);
    expect(source).toContain("onShow(() =>");
    expect(source).toMatch(/<g[\s\S]*?role="button"[\s\S]*?tabindex="0"/);
    expect(source).toContain('@keydown.enter.prevent="select(r)"');
    expect(source).toContain('@keydown.space.prevent="select(r)"');
    expect(source).toContain('@keydown.enter.prevent="selected = null"');
    expect(source).toContain("showProjectionInlineError");
    expect(source).toContain("hasUsableProjection.value");
  });

  it("uses an honest public-stat placeholder and renders expiry/refund facts", () => {
    expect(read("./onboarding/intro.vue")).toContain("t.intro.publicStatsUnavailable");
    expect(read("./onboarding/intro.vue")).not.toContain("paid === null ? t.home.networkStatUpdating");
    const order = read("./store/order-detail.vue");
    expect(order).toContain("order.expiresAt");
    expect(order).toContain("order.refundedAt");
    expect(order).toContain("order.refundAmountUsdt");
    expect(order).toContain("order.refundBillNo");
  });
});
