// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sheetSource = readFileSync(new URL("./purchase-sheet.vue", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../../store/genesis.ts", import.meta.url), "utf8");
const appStoreSource = readFileSync(new URL("../../store/app.ts", import.meta.url), "utf8");
const liveE2eSource = readFileSync(new URL("../../../scripts/genesis-cta-live-e2e.mjs", import.meta.url), "utf8");

describe("Genesis purchase visible wallet projection", () => {
  it("carries the server-authoritative balance from the purchase receipt", () => {
    expect(storeSource).toContain("walletBalanceUsdt: state.walletBalanceUsdt");
  });

  it("does not downgrade a committed purchase when the follow-up readback is unavailable", () => {
    const purchaseStart = storeSource.indexOf("async function purchase(");
    const localFallback = storeSource.indexOf("// ↓↓ mock 模式", purchaseStart);
    const remotePurchase = storeSource.slice(purchaseStart, localFallback);
    const receipt = remotePurchase.indexOf("resolveRemoteGenesisPurchase({");
    expect(receipt).toBeGreaterThan(-1);
    expect(remotePurchase).toContain("applyReceipt: applyCommittedPurchaseReceipt");
    expect(remotePurchase).toContain("recoverUnknown: () => syncRemote(request, runScope)");
    expect(remotePurchase).not.toContain('if (!clearPurchaseIntent(n, tokenIds)) return { ok: false');
  });

  it("projects a confirmed dev purchase into the wallet UI immediately", () => {
    expect(sheetSource).toContain("const walletReceiptScope = app.captureRemoteAccountRequest()");
    expect(sheetSource).toContain("result.walletReceiptSourceEnvironment");
    expect(sheetSource).toContain("app.adoptDevelopmentGenesisWallet(");
    const purchaseStart = sheetSource.indexOf("const result = await genesis.purchase(qty.value)");
    const successCommit = sheetSource.indexOf("committed = true", purchaseStart);
    const projection = sheetSource.indexOf("app.adoptDevelopmentGenesisWallet(", purchaseStart);
    expect(projection).toBeGreaterThan(purchaseStart);
    expect(projection).toBeLessThan(successCommit);
    expect(sheetSource.indexOf("showConfirmedSuccess()", successCommit)).toBeGreaterThan(successCommit);
  });

  it("rejects a canonical receipt after the bound account changes", () => {
    const projectionStart = appStoreSource.indexOf("function adoptDevelopmentGenesisWallet(");
    const projectionEnd = appStoreSource.indexOf("function refreshFundsSandboxForAccount", projectionStart);
    const projectionBody = appStoreSource.slice(projectionStart, projectionEnd);
    expect(projectionBody).toContain('receiptSourceEnvironment !== "PRODUCTION"');
    expect(projectionBody).toContain("adoptDevelopmentCommerceWallet(balanceAfterUsdt, receiptScope)");
  });

  it("describes a committed purchase as synchronized money and order facts, not a provisional seat lock", () => {
    expect(sheetSource).toContain("genesis.purchaseSubtitle");
    expect(storeSource).toContain("orderPager.reset(state.orders, state.ordersNextCursor ?? null)");
  });

  it("keeps the standard development smoke test canonical and read-only", () => {
    expect(liveE2eSource).toContain('sourceEnvironment, "PRODUCTION"');
    expect(liveE2eSource).toContain('runId, ""');
    expect(liveE2eSource).toContain('page.on("request"');
    expect(liveE2eSource).toContain("businessMutatingRequests: businessMutatingRequests.length");
    expect(liveE2eSource).not.toContain("sandbox-fixture");
    expect(liveE2eSource).not.toContain("MYSQL_PWD");
  });
});
