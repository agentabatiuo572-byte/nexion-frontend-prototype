import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), "utf8");

test("withdrawal parser accepts backend strong-review route as manual", () => {
  const source = read("src/api/withdrawal-api.ts");
  assert.match(source, /case\s+"strong-review"\s*:\s*return\s+"manual"/);
});

test("server-backed withdrawal refresh is account-generation safe", () => {
  const source = read("src/store/app.ts");
  assert.match(source, /if\s*\(!remoteApiEnabled\) return \[\]/);
  assert.match(source, /const\s+expectedAccountKey\s*=\s*accountKey\.value/);
  assert.match(source, /expectedAccountKey\s*!==\s*accountKey\.value/);
  assert.match(source, /nexRefundedChanged|remote\.nexRefunded/);
});

test("address policy is server-projected instead of a local zero fallback", () => {
  const api = read("src/api/payout-address-api.ts");
  const page = read("src/pages/me/wallet-address-rebind.vue");
  assert.match(api, /changeCooldownDays/);
  assert.match(page, /payout\.[A-Za-z]*changeCooldownDays|nextChangeAllowedAt/);
  assert.doesNotMatch(page, /remote[A-Za-z]*\s*\?\?\s*0/);
});

test("risk disclosure consumes I5 authority independently from withdrawal policy", () => {
  const disclosure = read("src/pages/me/risk-disclosure.vue");
  const disclosureStore = read("src/store/risk-disclosure.ts");
  const withdraw = read("src/pages/me/wallet-withdraw.vue");

  // I5 owns the published jurisdiction/version/chapters. A withdrawal policy
  // must not replace any disclosure chapter, while a successful acknowledgement
  // must still read the current server disclosure before enabling the gate.
  assert.match(disclosure, /const\s+disclosure\s*=\s*computed\(\(\)\s*=>\s*risk\.current\)/);
  assert.match(disclosureStore, /await\s+riskDisclosureApi\.acknowledge\(disclosure\)[\s\S]*await\s+riskDisclosureApi\.current\(\)/);
  assert.doesNotMatch(disclosure, /withdrawalApi\.policy\(\)/);
  assert.match(withdraw, /withdrawalApi\.policy\(\)/);
  assert.match(withdraw, /smallAmountThresholdUsd/);
});

test("risk disclosure keeps the two-step gate usable across H5 and App webviews", () => {
  const disclosure = read("src/pages/me/risk-disclosure.vue");
  const readingGate = read("src/lib/risk-disclosure-reading-gate.ts");

  // `scrolltolower` is the uni-app native path. The sentinel observer is the
  // H5/iOS-chassis fallback required by PRD 11.4a and P-019; either path may
  // mark the document as read, but neither may tick the acknowledgement.
  assert.match(disclosure, /:key="nativeScrollSurface.key"[\s\S]*:onScroll="nativeScrollSurface.events.scroll"[\s\S]*:onScrolltolower="nativeScrollSurface.events.scrolltolower"/);
  assert.match(disclosure, /scrolltolower:\s*\(\)\s*=>\s*\{\s*if\s*\(isCurrent\(\)\)/);
  assert.match(disclosure, /ref="sentinelRef"/);
  assert.match(disclosure, /new IntersectionObserver/);
  assert.match(disclosure, /\$el\s+instanceof\s+Element/);
  assert.match(disclosure, /observer\?\.disconnect\(\)/);
  assert.match(disclosure, /if\s*\(!disclosure\.value\s*\|\|\s*!identity/);
  assert.match(disclosure, /async\s+function\s+reload\(\)[\s\S]*scrollEventIdentity\.value\s*=\s*null[\s\S]*setReadingState\(\)[\s\S]*await\s+armReading/);

  // A native event has no document id. It is armed only after the current
  // disclosure has rendered, and it cannot satisfy a new jurisdiction/version/
  // token identity with the previous document's read state.
  assert.match(disclosure, /watch\(documentIdentity,[\s\S]*resetScrollSurface\(nextIdentity\)[\s\S]*readingIdentity\.value\s*=\s*nextIdentity[\s\S]*armReading\(nextIdentity, generation\)/);
  assert.match(disclosure, /generation\s*===\s*nativeGeneration[\s\S]*identity\s*===\s*scrollEventIdentity\.value/);
  assert.match(disclosure, /onHide\([\s\S]*nativeGeneration\s*\+=\s*1[\s\S]*stopBottomObserver\(\)[\s\S]*onShow\([\s\S]*await reload\(\)/);
  assert.match(disclosure, /canCompleteRiskDisclosureReadingFromScrollEvent\(/);
  assert.match(readingGate, /scrollEventIdentity\s*===\s*documentIdentity[\s\S]*readingIdentity\s*===\s*documentIdentity/);
  assert.match(readingGate, /input\.readingIdentity\s*===\s*input\.documentIdentity[\s\S]*input\.reading\.scrolledToBottom[\s\S]*input\.reading\.checked/);

  // The legal acknowledgement remains a deliberate second action. The CTA
  // must not silently no-op when one of the two prerequisites is missing.
  assert.match(disclosure, /canAcknowledgeRiskDisclosure\(/);
  assert.match(disclosure, /if\s*\(!scrolledToBottom\.value\)/);
  assert.match(disclosure, /if\s*\(!checked\.value\)/);
  assert.match(disclosure, /@keydown\.enter\.prevent="toggleCheck"/);
  assert.match(disclosure, /@keydown\.space\.prevent="toggleCheck"/);
  assert.match(disclosure, /@keydown\.enter\.prevent="onAccept"/);
  assert.match(disclosure, /@keydown\.space\.prevent="onAccept"/);
});
