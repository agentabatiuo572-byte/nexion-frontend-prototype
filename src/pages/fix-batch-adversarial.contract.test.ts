import { describe, expect, it } from "vitest";

const sources = import.meta.glob([
  "./me/wallet-withdraw.vue",
  "./me/security.vue",
  "./support/messages.vue",
  "./me/wallet-exchange.vue",
  "./genesis/marketplace.vue",
  "../api/withdrawal-api.ts",
  "../api/staking-api.ts",
  "../api/repurchase-api.ts",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const read = (path: string) => sources[path] ?? "";

describe("adversarial fix-batch contracts", () => {
  it("clears an accepted withdrawal eligibility snapshot before every new request", () => {
    const source = read("./me/wallet-withdraw.vue");
    const start = source.indexOf("const epoch = ++remoteEligibilityEpoch;");
    const cleared = source.indexOf("remoteEligibility.value = null;", start);
    const request = source.indexOf("await requestWithdrawalEligibility(", start);
    expect(start).toBeGreaterThan(-1);
    expect(cleared).toBeGreaterThan(start);
    expect(request).toBeGreaterThan(cleared);
  });

  it("persists account-deletion request and cancel command keys until verified success", () => {
    const source = read("./me/security.vue");
    expect(source).toContain("acquireAccountCommandKey");
    expect(source).toContain("releaseAccountCommandKey");
    expect(source).toContain("nexgrid-security-command-accounts-v1");
    expect(source).not.toContain('const key = `app-security:account-deletion-cancel:${globalThis.crypto');
  });

  it("registers the visible message inbox with global pull refresh", () => {
    const source = read("./support/messages.vue");
    expect(source).toContain("registerActivePageRefresh");
    expect(source).toContain("releaseActiveRefresh");
    expect(source).toContain("onHide(leaveInbox)");
    expect(source).toContain("onUnmounted(leaveInbox)");
    expect(source).toMatch(/function leaveInbox\(\)\s*\{\s*inboxVisible = false;\s*releaseActiveRefresh\(\);/);
  });

  it("rejects drifting exchange pages and wrong first-page metadata", () => {
    const page = read("./me/wallet-exchange.vue");
    expect(page).toContain("EXCHANGE_HISTORY_PAGINATION_INVALID");
    expect(page).toContain("snapshot.ordersPage.pageNum !== 1");
    expect(page).toContain("snapshot.ordersPage.pageSize !== 20");
    expect(page).toContain("next.ordersPage.pageNum !== nextPage");
    for (const path of ["../api/withdrawal-api.ts", "../api/staking-api.ts", "../api/repurchase-api.ts"]) {
      expect(read(path)).toMatch(/pageNum !== 1/);
    }
  });

  it("moves DOM focus with Genesis roving tab and sort selection", () => {
    const source = read("./genesis/marketplace.vue");
    expect(source).toContain("nx-marketplace-tab");
    expect(source).toContain("nx-marketplace-sort");
    expect(source).toContain('.nx-marketplace-tab[tabindex="0"]');
    expect(source).toContain('.nx-marketplace-sort[tabindex="0"]');
    expect(source).toContain("?.focus()");
  });
});
