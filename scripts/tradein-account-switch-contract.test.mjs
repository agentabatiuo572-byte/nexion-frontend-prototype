import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("account scope exposes the shared request fence and advances it on rebind", () => {
  const scope = read("src/lib/account-scope.ts");
  // 共享栅栏的**构造点**已挪进叶子模块 remote-account-epoch.ts(注释写明:放叶子里各 store 才能共用
  // 同一道栅栏而不 import account-scope,否则成环 —— 即本仓 store 互不 import 的硬规则)。
  // 所以构造断言跟着搬,顺带钉住「bind 必推进代次」这条真正的行为事实(只匹配文件名挡不住它被改空)。
  const epoch = read("src/lib/remote-account-epoch.ts");
  assert.match(epoch, /createRemoteAccountEpoch/);
  assert.match(epoch, /epoch \+= 1/);
  assert.match(scope, /remoteAccountScope/);
  assert.match(scope, /captureAccountScope/);
  assert.match(scope, /isCurrentAccountScope/);
  assert.match(scope, /remoteAccountScope\.bind\(accountKey\)/);
});

test("a late checkout eligibility or capacity response cannot open account B's sheet", () => {
  const checkout = read("src/pages/store/checkout.vue");
  const intercept = checkout.slice(checkout.indexOf("function fireTradeinIntercept"), checkout.indexOf("// Sticky chassis nav header"));
  assert.match(intercept, /const requestScope = captureCheckoutRoute\(\);/);
  assert.match(intercept, /resolveTradeinCheckoutPreflight\([\s\S]{0,360}isCurrentCheckoutRoute\(requestScope\)/);
  const guarded = intercept.indexOf("if (!isCurrentCheckoutRoute(requestScope)) return;");
  assert.ok(guarded >= 0 && guarded < intercept.indexOf("tradein.showChoice"));
  assert.ok(guarded >= 0 && guarded < intercept.indexOf("tradein.showCanonicalReplace"));
  assert.match(intercept, /catch\(\(\): undefined => \{\s*if \(!isCurrentCheckoutRoute\(requestScope\)\) return;/);
  assert.match(checkout, /function checkoutRouteIdentity\(\) \{\s*const account = captureAccountScope\(\);\s*return \{ accountKey: account.accountKey, accountEpoch: account.epoch, productNo: productId.value \};/);
  assert.match(checkout, /function captureCheckoutRoute\(\): CheckoutRouteScope \{\s*return checkoutRouteFence.capture\(checkoutRouteIdentity\(\)\);/);
  assert.match(checkout, /function isCurrentCheckoutRoute\(scope: CheckoutRouteScope\): boolean \{\s*return pageAlive\s*&& pageVisible\s*&& checkoutRouteFence.isCurrent\(scope, checkoutRouteIdentity\(\)\);/);
  const fence = read("src/lib/checkout-route-fence.ts");
  for (const field of ["accountKey", "accountEpoch", "productNo"]) {
    assert.ok(fence.includes(`scope.${field} === identity.${field}`));
  }
  assert.match(fence, /scope.generation === this.generation/);
});

test("a late trade-in purchase eligibility or quote response cannot write account B's canonical quote", () => {
  const sheets = read("src/components/tradein-sheets.vue");
  assert.match(sheets, /const requestScope = captureAccountScope\(\);/);
  assert.match(sheets, /purchaseEligibilityApi\.get\(targetKind\)\.catch\(\(\) => null\)/);
  assert.match(sheets, /deviceE3Api\.quote\(Number\(oldDevice\.id\), targetKind\)[\s\S]{0,180}requestIsCurrent\(\)/);
  assert.match(sheets, /requestIsCurrent\(\)[\s\S]{0,100}canonicalQuote\.value = null/);
  assert.match(sheets, /capacityQuote\(s\.targetKind\)[\s\S]{0,180}requestIsCurrent\(\)/);
  assert.match(sheets, /watch\(\[\(\) => app\.accountKey, \(\) => app\.accountBindingEpoch\],[\s\S]{0,520}loadCanonicalTradeinConfig\(\)/);
});

test("a superseded quote for source A cannot overwrite the later source B selection", () => {
  const sheets = read("src/components/tradein-sheets.vue");
  assert.match(sheets, /const quoteRequestGeneration = ref\(0\)/);
  assert.match(sheets, /const requestGeneration = \+\+quoteRequestGeneration\.value/);
  assert.match(sheets, /requestGeneration === quoteRequestGeneration\.value/);
  const open = sheets.slice(sheets.indexOf("async function openTradeinQuote"), sheets.indexOf("function onChooseTradein"));
  const guard = open.indexOf("if (!requestIsCurrent()) return;");
  assert.ok(guard >= 0 && guard < open.indexOf("canonicalQuote.value = quote"));
  assert.match(open, /quote\.sourceRowVersion !== sourceRowVersion/);
});

test("capacity replacement suppresses stale account readback and notifications", () => {
  const sheets = read("src/components/tradein-sheets.vue");
  const submit = sheets.slice(sheets.indexOf("async function submitCanonicalCapacityReplacement"));
  assert.match(submit, /const requestScope = captureAccountScope\(\)/);
  assert.match(submit, /ACCOUNT_SCOPE_CHANGED/);
  assert.match(submit, /readback:[\s\S]{0,240}requireCurrentAccount\(\)/);
  assert.match(submit, /commit\(\) \{\s*requireCurrentAccount\(\)/);
  assert.match(submit, /catch \{\s*if \(!isCurrentAccountScope\(requestScope\)\) return;/);
});

test("keep-and-buy also suppresses stale account readback and notifications", () => {
  const sheets = read("src/components/tradein-sheets.vue");
  const start = sheets.indexOf("async function submitCanonicalKeepBuy");
  const end = sheets.indexOf("function onKeepBuy", start);
  const submit = sheets.slice(start, end);
  // New keep purchases share the PIN-authorized capacity runner; this function recovers originals.
  assert.match(submit, /if \(!recovered\) return runCanonicalCapacityPurchase\('keep',quote,newKind\);/);
  assert.match(submit, /const requestScope = captureAccountScope\(\)/);
  assert.match(submit, /ACCOUNT_SCOPE_CHANGED/);
  assert.match(submit, /readback: async[\s\S]{0,240}requireCurrentAccount\(\)/);
  assert.match(submit, /commit\(\) \{\s*requireCurrentAccount\(\)/);
  assert.doesNotMatch(submit, /orderApi\.create/);
  assert.match(submit, /catch \{\s*if \(!isCurrentAccountScope\(requestScope\)\) return;/);
  const runner = sheets.slice(sheets.indexOf("async function runCanonicalCapacityPurchase"));
  assert.match(runner, /const scope=captureAccountScope\(\)/);
  assert.match(runner, /deviceE3Api\.capacityKeep\([\s\S]{0,200}if \(!isCurrentAccountScope\(scope\)\|\|!original\) return;/);
});

test("learning failures are announced and retry remains keyboard reachable", () => {
  const courses = read("src/pages/learn/courses.vue");
  const course = read("src/pages/learn/course.vue");
  for (const page of [courses, course]) {
    assert.match(page, /v-else-if="error"[^>]*role="alert"[^>]*aria-live="assertive"/);
    assert.match(page, /role="button"[^>]*tabindex="0"/);
  }
  // The courses retry is the shared NxButton, which carries role, tabindex and Enter/Space activation.
  assert.match(courses, /<NxButton class="learning-retry[^"]*"[^>]*@click="load"/);
  assert.match(read("src/components/ui/nx-button.vue"), /@keydown\.enter\.prevent="activate" @keydown\.space\.prevent="activate"/);
});
