import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("home exposes the server NEX trend with a fail-closed retry", () => {
  const home = read("src/pages/index/index.vue");
  const card = read("src/components/home/nex-price-card.vue");
  assert.match(home, /<NexPriceCard/);
  assert.match(card, /market\.remoteReady/);
  assert.match(card, /market\.syncRemote\(\)/);
  assert.doesNotMatch(card, /Hidden for current stage/);
});

test("NEX market page remains server-backed after comparable tokens retire", () => {
  const page = read("src/pages/market/market.vue");
  const store = read("src/store/market.ts");
  assert.match(store, /marketApi\.fetch\(\)/);
  assert.match(store, /syncRemote/);
  assert.match(page, /market\.syncRemote\(\)/);
  assert.doesNotMatch(page, /TokenRow|externalQuotes|CATEGORIES/);
});

test("product and Trust Center consume published Trust fields", () => {
  const detail = read("src/pages/store/detail.vue");
  const trust = read("src/pages/trust/trust.vue");
  assert.match(detail, /product-trust-material/);
  assert.match(detail, /productComplianceRows/);
  assert.match(trust, /trustNumberedRows/);
  assert.match(trust, /tvlOnChain/);
  assert.doesNotMatch(trust, /v-if="false"/);
});
