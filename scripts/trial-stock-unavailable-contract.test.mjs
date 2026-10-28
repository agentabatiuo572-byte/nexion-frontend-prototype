import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("zero-stock S1 stays visible but every trial and purchase CTA is disabled", () => {
  const card = read("src/components/store/product-card.vue");
  const detail = read("src/pages/store/detail.vue");
  const stickyCta = read("src/components/sticky-cta-bar.vue");
  const trialHero = read("src/components/trial-hero-banner.vue");
  const trialPage = read("src/pages/me/trial.vue");
  const locales = ["zh", "en", "vi"].map((locale) => read(`src/i18n/messages/${locale}.ts`));

  assert.match(card, /stockUnavailable/);
  assert.match(card, /temporarilyOutOfStock/);
  assert.match(card, /@keydown\.enter\.prevent\.stop="onBuy"/);
  assert.doesNotMatch(card, /<text role="button" tabindex="0" @click\.stop="onBuy">/);
  assert.doesNotMatch(card, /:style="cardStyle" role="button"/);
  assert.match(card, /:role="compact \? 'link' : undefined" :tabindex="compact \? 0 : -1" :aria-label="compact \? nexGridBrandText\(product\.name\) : undefined" @click="goDetail"/);
  assert.match(card, /:style="renderWrapStyle" :role="compact \? undefined : 'button'" :tabindex="compact \? -1 : 0" :aria-label="compact \? undefined : nexGridBrandText\(product\.name\)" @click\.stop="goDetail"/);
  assert.match(detail, /const stockUnavailable = computed/);
  assert.match(detail, /disabled:\s*true/);
  assert.match(detail, /buttonLabel:\s*t\.value\.store\.temporarilyOutOfStock/);
  const eligibilityGuard = detail.search(/if \(remoteApiEnabled && \(?eligibility\.value\.status !== "ready"/);
  assert.ok(eligibilityGuard >= 0, "purchase eligibility must have a pending/failed guard");
  assert.ok(
    detail.indexOf("if (stockUnavailable.value)")
      < eligibilityGuard,
    "zero-stock CTA must win over a pending/failed purchase-eligibility request",
  );
  assert.match(stickyCta, /:aria-disabled="cta\.disabled \? 'true' : 'false'"/);
  assert.match(stickyCta, /if \(!cta\.value \|\| cta\.value\.disabled\) return/);
  assert.match(trialHero, /product-unavailable/);
  assert.match(trialHero, /heroProductUnavailable/);
  assert.match(trialHero, /:tabindex="canOpen \? 0 : -1"/);
  assert.match(trialHero, /const canOpen = computed\(\(\) => hasLifecycle\.value \|\| canClaim\.value \|\| capacityFull\.value\)/);
  assert.match(trialHero, /if \(!canClaim\.value\) return/);
  assert.doesNotMatch(trialHero, /@keydown/);
  assert.match(trialPage, /product-unavailable/);
  assert.match(trialPage, /trialProductUnavailable/);
  assert.match(trialPage, /:tabindex="canStartNow \? 0 : -1"/);
  assert.match(trialPage, /:aria-disabled="trialProductUnavailable \? 'true' : 'false'"/);
  assert.match(trialPage, /if \(authorityUnavailable\.value \|\| trialProductUnavailable\.value\) return/);
  for (const locale of locales) {
    assert.match(locale, /temporarilyOutOfStock:\s*"[^"]+"/);
    assert.match(locale, /heroProductUnavailable:\s*"[^"]+"/);
  }
});
