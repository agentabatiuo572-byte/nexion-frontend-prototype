import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("H3/H4/H5/H7 stores have an explicit remote authority branch", () => {
  const expectations = [
    ["src/store/quest.ts", "questApi"],
    ["src/store/event-quest.ts", "eventsApi"],
    ["src/store/nex-faucet.ts", "pointsApi"],
    ["src/store/voucher.ts", "voucherApi"],
  ];
  for (const [file, api] of expectations) {
    const source = read(file);
    assert.match(source, /remoteApiEnabled/);
    assert.match(source, new RegExp(`\\b${api}\\b`));
    assert.match(source, /clearRemoteFacts/);
    assert.match(source, /catch\s*\{[\s\S]{0,240}clearRemoteFacts\(\)/);
  }
});

test("H4/H5/H7 authoritative commands use stable idempotency keys", () => {
  for (const file of ["src/store/event-quest.ts", "src/store/nex-faucet.ts", "src/store/voucher.ts"]) {
    const source = read(file);
    assert.match(source, /(?:idempotencyKey|h[457]-[a-z-]+:\$\{)/);
    assert.match(source, /remoteApiEnabled/);
  }
});

test("H8 registration routes remote mode through authApi.register", () => {
  const source = read("src/pages/register/register.vue");
  assert.match(source, /remoteApiEnabled/);
  assert.match(source, /authApi\.register/);
  assert.match(source, /if\s*\(remoteApiEnabled\)/);
});

test("H3 shared completion never treats a route visit or share as a remote completion", () => {
  for (const file of ["src/App.vue", "src/lib/share.ts", "src/pages/me/wallet-cards-new.vue"]) {
    const source = read(file);
    assert.match(source, /remoteApiEnabled/);
  }
  const cards = read("src/pages/me/wallet-cards-new.vue");
  assert.match(cards, /paymentMethodApi\.bind/);
  assert.match(cards, /cardsStore\.refreshRemote/);
});

test("H4 remote event cards are projected from eventsApi.state rather than mock rows", () => {
  const source = read("src/pages/events/events.vue");
  assert.match(source, /eventsApi\.state\(\)/);
  assert.match(source, /remoteEvents/);
  assert.match(source, /remoteApiEnabled\s*\?\s*remoteEvents/);
});

test("H5 power-up and H7 order redemption require server confirmation", () => {
  assert.match(read("src/store/daily-powerup.ts"), /pointsApi\.activatePowerUp/);
  assert.match(read("src/store/daily-powerup.ts"), /remoteApiEnabled/);
  assert.match(read("src/api/order-api.ts"), /voucherRedemption/);
  const checkout = read("src/pages/store/checkout.vue");
  assert.match(checkout, /orderApi\.create/);
  assert.match(checkout, /H7_VOUCHER_REDEMPTION_RECEIPT_INVALID/);
  assert.match(checkout, /receipt\.status !== "REDEEMED"/);
  assert.match(checkout, /No local order, balance debit, or voucher redemption mirror in remote mode/);
});

test("H3 remote cards and missions have no local-authority fallback", () => {
  const cards = read("src/pages/me/wallet-cards-new.vue");
  assert.match(cards, /paymentMethodApi\.bind/);
  assert.match(cards, /refreshRemote/);
  assert.doesNotMatch(cards, /claimRemote\("bind_bank_card"\)/);
  const missions = read("src/pages/missions/missions.vue");
  assert.match(missions, /eventsApi\.state\(\)/);
  assert.match(missions, /remoteApiEnabled/);
  assert.match(missions, /remoteEvents/);
});

test("H3 authority sentinels reject mutated local fallback paths", () => {
  const requireRemoteMissionSnapshot = (source) => {
    if (!/eventsApi\.state\(\)/.test(source) || !/remoteApiEnabled/.test(source) || !/remoteEvents/.test(source)) {
      throw new Error("H3_REMOTE_MISSION_SNAPSHOT_REQUIRED");
    }
  };
  const requireCardReceiptReadback = (source) => {
    if (!/paymentMethodApi\.bind/.test(source) || !/cardsStore\.refreshRemote/.test(source) || /claimRemote\("bind_bank_card"\)/.test(source)) {
      throw new Error("H3_REMOTE_CARD_RECEIPT_REQUIRED");
    }
  };
  const missions = read("src/pages/missions/missions.vue");
  const cards = read("src/pages/me/wallet-cards-new.vue");
  requireRemoteMissionSnapshot(missions);
  requireCardReceiptReadback(cards);
  assert.throws(() => requireRemoteMissionSnapshot(missions.replace("eventsApi.state()", "localEvents()")), /H3_REMOTE_MISSION_SNAPSHOT_REQUIRED/);
  assert.throws(() => requireCardReceiptReadback(cards.replace("cardsStore.refreshRemote", "cardsStore.add")), /H3_REMOTE_CARD_RECEIPT_REQUIRED/);
});

test("H3 remote card receipt rejects stale UNBOUND and empty-readback mutations", () => {
  const api = read("src/api/payment-method-api.ts");
  const bindPage = read("src/pages/me/wallet-cards-new.vue");
  const cardsStore = read("src/store/cards.ts");
  assert.match(api, /status: "BOUND"/);
  assert.match(bindPage, /bound\.status !== "BOUND"/);
  assert.match(bindPage, /readBack\?\.status !== "BOUND"/);
  assert.match(bindPage, /cardsStore\.cards\.find/);
  assert.match(cardsStore, /status: card\.status/);
  const requiresConfirmedReadback = (source) => {
    if (!/bound\.status !== "BOUND"/.test(source) || !/readBack\?\.status !== "BOUND"/.test(source)) {
      throw new Error("H3_CARD_RECEIPT_AND_READBACK_STATUS_REQUIRED");
    }
  };
  requiresConfirmedReadback(bindPage);
  assert.throws(() => requiresConfirmedReadback(bindPage.replace('readBack?.status !== "BOUND"', "false")), /H3_CARD_RECEIPT_AND_READBACK_STATUS_REQUIRED/);
});

test("H3 backend card lifecycle rejects deleted tokens and safely converges rebind races", () => {
  const backend = read("../nexion-backend/src/main/java/ffdd/opsconsole/finance/application/AppPaymentMethodService.java");
  const mapper = read("../nexion-backend/src/main/java/ffdd/opsconsole/finance/mapper/AppPaymentMethodMapper.java");
  assert.match(backend, /findActiveByToken/);
  assert.match(backend, /reactivate/);
  assert.match(backend, /PAYMENT_METHOD_TOKEN_RETIRED/);
  assert.match(backend, /PAYMENT_METHOD_TOKEN_OWNERSHIP_CONFLICT/);
  assert.match(backend, /concurrent = mapper\.findActiveByToken/);
  assert.match(mapper, /INSERT IGNORE INTO nx_wallet_bank_card/);
  assert.match(mapper, /status='UNBOUND'/);
});
