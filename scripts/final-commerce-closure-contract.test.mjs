import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("mock checkout receipts stop in a recoverable error state", async () => {
  const checkout = await source("src/pages/store/checkout.vue");
  const bundle = await source("src/pages/store/bundle.vue");
  for (const page of [checkout, bundle]) {
    assert.match(page, /if \(!postReceiptOnly\(/);
    assert.match(page, /receiptWriteFailure/);
    assert.match(page, /retryReceiptWrite/);
    assert.match(page, /accountKey/);
    assert.match(page, /readAccountRow<[^>]*ReceiptRecovery/);
    assert.match(page, /writeAccountRow<[^>]*ReceiptRecovery/);
  }
});

test("remote card mutations require authoritative readback before UI success", async () => {
  const cards = await source("src/store/cards.ts");
  const page = await source("src/pages/me/wallet-cards.vue");
  assert.match(cards, /const request = remoteAccountEpoch\.snapshot\(\)/g);
  assert.match(cards, /if \(!\(await refreshRemote\(request\)\)\) throw new Error\("PAYMENT_METHOD_READBACK_FAILED"\)/g);
  assert.match(cards, /const nextCards = remote\.map/);
  assert.match(cards, /return !remoteAccountEpoch\.isCurrent\(request\)/);
  assert.match(page, /data-testid="wallet-cards-retry"/);
  assert.match(page, /cardsStore\.refreshRemote\(\)/);
  assert.match(page, /await cardsStore\.setDefault\(tokenId\);[\s\S]*toast\.success/);
  assert.match(page, /notifs\.push[\s\S]*toast\.success/);
});

test("security mutations fail closed when overview readback fails", async () => {
  const security = await source("src/pages/me/security.vue");
  assert.match(security, /async function loadRemoteSecurity\(\): Promise<boolean>/);
  assert.match(security, /if \(!\(await loadRemoteSecurity\(\)\)\) throw new Error\("SECURITY_READBACK_FAILED"\)/g);
  assert.match(security, /function securityErrorMessage\(cause: unknown\)[\s\S]*default: return t\.value\.security\.opFailed/);
  assert.match(security, /catch \(cause\)[\s\S]*securityErrorMessage\(cause\)/);
});

test("catalog detail retry and bundle order item count remain visible", async () => {
  const detail = await source("src/pages/store/detail.vue");
  const api = await source("src/api/order-api.ts");
  const orders = await source("src/store/orders.ts");
  const orderDetail = await source("src/pages/store/order-detail.vue");
  const bundle = await source("src/pages/store/bundle.vue");
  const freeTrial = await source("src/store/free-trial.ts");
  assert.match(detail, /data-testid="detail-catalog-retry"/);
  assert.match(detail, /refreshServerProductPhase\(true\)/);
  assert.match(api, /itemCount: number \| null/);
  assert.match(orders, /itemCount: row\.itemCount/);
  // Purchased units, not distinct SKU lines (OQ-1 fix): sum the lines, else the order quantity.
  assert.match(orderDetail, /const orderQuantity = computed\(\(\) => order\.value\?\.lineItems\?\.reduce\(\(total, item\) => total \+ item\.quantity, 0\) \?\? order\.value\?\.quantity \?\? 0\)/);
  // New bundles use the shared items checkout; the legacy path settles the original order and opens its detail,
  // where the purchased units are shown (orderQuantity above).
  assert.match(bundle, /await navTo\(promotionCheckoutHref\(list\.map\(product=>\(\{productNo:product\.id,quantity:1\}\)\)\)\)/);
  assert.match(bundle, /bundleOrderApi\.create\([\s\S]*orderApi\.pay\([\s\S]*settled\.status !== "activated"[\s\S]*navTo\(`\/pages\/store\/order-detail\?id=\$\{encodeURIComponent\(created\.orderNo\)\}`\)/);
  const checkout = await source("src/pages/store/checkout.vue");
  assert.match(checkout, /freeTrial\.convert\(p\.id, quotedTotal, trialQuote\.quoteVersion\)/);
  assert.match(freeTrial, /const confirmed = await refreshRemote\(true\)[\s\S]*status\.value !== "converted"/);
});
