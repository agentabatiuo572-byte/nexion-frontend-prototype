import { describe, expect, it } from "vitest";

const page = (import.meta.glob("./wallet.vue", { query: "?raw", import: "default", eager: true })["./wallet.vue"] ?? "") as string;

describe("wallet authority failure contract", () => {
  it("offers retry and distinguishes stale confirmed values from no snapshot", () => {
    expect(page).toContain("app.remoteFleetHasSnapshot");
    expect(page).toContain("retryFundsAuthority");
    expect(page).toContain("t.wallet.fundsUnavailableTitle");
    expect(page).toContain("t.wallet.fundsStaleBody");
    expect(page).toContain("app.remoteWalletReceiptHasSnapshot");
    expect(page).toContain("t.wallet.fundsReceiptOnlyBody");
    expect(page).toContain("usdtBalanceReadable");
    expect(page).toContain("t.wallet.retryFunds");
  });

  it("does not render the backend error string as customer copy", () => {
    expect(page).not.toContain("{{ fundsAuthorityError }}");
  });
});
