import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the retired external-market feature has no home or market-page surface", () => {
  assert.equal(existsSync(new URL("../src/components/home/external-market-card.vue", import.meta.url)), false);
  assert.doesNotMatch(read("src/pages/index/index.vue"), /ExternalMarketCard|external-market-card/);
  assert.doesNotMatch(read("src/pages/market/market.vue"), /externalQuotes|externalReady|externalSourceEnvironment|TokenRow|CATEGORIES/);
});

test("the app no longer requests or stores external-market quotes", () => {
  assert.doesNotMatch(read("src/api/market-api.ts"), /ExternalMarket|\/api\/config\/market\/external/);
  assert.doesNotMatch(read("src/store/market.ts"), /externalQuotes|externalReady|externalError|syncExternal|marketApi\.external|syncAll/);
  assert.doesNotMatch(read("src/lib/home-data-presenters.ts"), /selectHomepageExternalQuotes|ExternalMarketQuote/);
});

test("translations and live home checks no longer advertise the retired module", () => {
  for (const locale of ["en", "vi", "zh"]) {
    assert.doesNotMatch(read(`src/i18n/messages/${locale}.ts`), /externalMarketTitle|externalMarketSubtitle|externalMarketVolume|externalMarketUnavailable/);
  }
  assert.doesNotMatch(read("scripts/app-home-live-e2e.mjs"), /external-market-link|\/api\/config\/market\/external|externalMarket/);
});
