import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const runtime = read("src/api/runtime.ts");
const phaseStore = read("src/store/server-product-phase.ts");
const productCatalogStore = read("src/store/product-catalog.ts");
const accountScope = read("src/lib/account-scope.ts");
const composable = read("src/composables/use-product-phase.ts");
const catalog = read("src/pages/store/store.vue");
const detail = read("src/pages/store/detail.vue");
const checkout = read("src/pages/store/checkout.vue");
const productAvailability = read("src/store/product-availability.ts");
const productCatalogContract = read("src/api/product-catalog-contract.ts");
const lockedProductCard = read("src/components/store/locked-product-card.vue");

test("remote storefront mirrors H1 product phase instead of deriving it from account age", () => {
  assert.match(runtime, /productPhaseApi = createProductPhaseApi\(apiClient\)/);
  assert.match(phaseStore, /productPhaseApi\.current\(\)/);
  assert.match(composable, /remoteApiEnabled[\s\S]*serverProductPhaseState\.phase/);
  assert.match(composable, /getPhaseParams\(serverProductPhaseState\.phase\)/);
  assert.match(composable, /if \(!remoteApiEnabled\) return resolveActivePhase\(app\.user\.joinedAt\)/);
  assert.doesNotMatch(composable, /if \(remoteApiEnabled\) return resolveActivePhase\(app\.user\.joinedAt\)/);
  assert.match(catalog, /refreshServerProductPhase\(true\)/);
});

test("remote phase failure stays fail-closed and never falls back to a fresh account P1 claim", () => {
  assert.match(phaseStore, /status:\s*remoteApiEnabled \? "loading" : "ready"/);
  assert.match(composable, /serverProductPhaseState\.status === "ready"/);
  assert.match(composable, /return PHASES\[0\]/);
});

test("account switching invalidates catalog snapshots and ignores stale responses", () => {
  assert.match(accountScope, /prepareProductCatalog\(\)/);
  assert.match(accountScope, /prepareServerProductPhase\(\)/);
  assert.match(productCatalogStore, /catalogEpoch \+= 1/);
  assert.match(productCatalogStore, /requestEpoch !== catalogEpoch/);
  assert.match(productCatalogStore, /refreshInFlight === request/);
  assert.match(phaseStore, /phaseEpoch \+= 1/);
  assert.match(phaseStore, /requestEpoch !== phaseEpoch/);
});

test("store detail and checkout refresh the server phase when they become visible", () => {
  assert.match(detail, /onShow\([\s\S]*refreshServerProductPhase\(true\)/);
  assert.match(checkout, /onShow\([\s\S]*refreshServerProductPhase\(true\)/);
});

test("remote product locks display the server E1 decision without deriving H1 progress", () => {
  assert.match(productAvailability, /typeof product\.available === "boolean"[\s\S]*return product\.available/);
  assert.match(productCatalogContract, /releaseState:\s*optionalString\(source\.releaseState\)/);
  assert.match(productCatalogContract, /releasePhaseId:\s*optionalString\(source\.releasePhaseId\)/);
  assert.match(lockedProductCard, /data-testid="server-release-reason"/);
  assert.match(lockedProductCard, /props\.product\.available === false && props\.product\.releasePhaseId/);
  assert.match(lockedProductCard, /props\.product\.available === undefined && props\.product\.unlocksAtPhase/);
  assert.doesNotMatch(lockedProductCard, /available === false[^\n]*isPhaseReached/);
});
