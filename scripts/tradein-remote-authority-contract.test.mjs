import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

test("remote checkout gets trade-in sources from server eligibility", () => {
  const source = read("src/pages/store/checkout.vue");
  assert.match(source, /deviceE3Api\.eligibility\(kind\)/);
  assert.match(source, /eligibility\?\.sources\.filter\(\(source\) => source\.eligible\)/);
});

test("ordinary remote checkout is not rejected when optional trade-in eligibility fails", () => {
  const source = read("src/pages/store/checkout.vue");
  const preflight = read("src/domain/tradein-checkout-preflight.ts");
  const intercept = source.slice(
    source.indexOf("function fireTradeinIntercept"),
    source.indexOf("// Sticky chassis nav header"),
  );
  assert.match(intercept, /resolveTradeinCheckoutPreflight\(/);
  assert.match(preflight, /Promise\.allSettled\(/);
  assert.match(preflight, /eligibilityResult\.status === "fulfilled"/);
  assert.match(preflight, /capacityResult\.status !== "fulfilled"[\s\S]*throw capacityResult\.reason/);
  assert.doesNotMatch(intercept, /Promise\.all\(\[/);
});

test("share checkout never enters the physical-device trade-in capacity preflight", () => {
  const source = read("src/pages/store/checkout.vue");
  const intercept = source.slice(
    source.indexOf("function fireTradeinIntercept"),
    source.indexOf("// Sticky chassis nav header"),
  );
  const shareGuard = intercept.indexOf('if (p.productType === "SHARE") return;');
  const capacityRequest = intercept.indexOf("deviceE3Api.capacityQuote(kind)");

  assert.ok(shareGuard >= 0, "SHARE checkout must have an explicit trade-in preflight bypass");
  assert.ok(shareGuard < capacityRequest, "SHARE bypass must run before the capacity request");
});

test("remote trade-in sheet revalidates eligibility and never previews local credit", () => {
  const source = read("src/components/tradein-sheets.vue");
  assert.match(source, /deviceE3Api\.eligibility\(targetKind\)/);
  assert.match(source, /remoteRetireEligibleTargets\.value\.has\(p\.id\)/);
  assert.match(source, /eligibility\.sources\.some\(\(candidate\) => candidate\.eligible/);
  assert.doesNotMatch(source, /remoteApiEnabled\s*\?\s*isProductAvailable\(p, phase\.value\)/);
  assert.match(source, /remoteApiEnabled \? "—" :/);
});

test("remote keep-and-buy uses the atomic server command and verifies paid inactive readback", () => {
  const source = read("src/components/tradein-sheets.vue");
  const start = source.indexOf("async function submitCanonicalKeepBuy");
  const end = source.indexOf("function onKeepBuy", start);
  const keep = source.slice(start, end);
  assert.match(keep, /deviceE3Api\.capacityKeep/);
  assert.doesNotMatch(keep, /orderApi\.create/);
  assert.match(keep, /canonicalStatus !== "paid"/);
  assert.match(keep, /activationStatus\.toUpperCase\(\) !== "WAITING_PROVISIONING"/);
  assert.match(keep, /persisted\.targetDeviceId !== submitted\.targetDeviceId/);
  assert.match(keep, /target\.activatedAt !== null/);
});

test("remote device and product cards do not render a locally estimated trade-in credit", () => {
  const devices = read("src/pages/me/devices.vue");
  const product = read("src/components/store/product-card.vue");
  const banner = read("src/components/store/tradein-window-banner.vue");
  assert.match(devices, /if \(remoteApiEnabled\)[\s\S]{0,250}tradeinCtaLabel/);
  assert.match(product, /!remoteApiEnabled && bestTradeinCredit\.value > 0/);
  assert.match(banner, /deviceE3Api\.eligibility/);
  assert.match(banner, /deviceE3Api\.quote/);
});

test("remote ladder and device capability use server facts or fail closed", () => {
  const ladder = read("src/components/me/tradein-ladder-sheet.vue");
  const card = read("src/components/earn/device-card-pc.vue");
  assert.match(ladder, /t\.tradein\.ladderFootnote/);
  assert.doesNotMatch(ladder.split("</template>")[0], /tradeCredit|creditAmount|\$\{\{/);
  assert.match(card, /remoteApiEnabled \? null : FALLBACK_CAP\.tops/);
  assert.match(card, /remoteApiEnabled \? null : FALLBACK_CAP\.tier/);
  assert.match(card, /v-else-if="phoneRunning"[\s\S]*hashCapabilityUnknown/);
});
