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
  const intercept = checkout.slice(checkout.indexOf("function fireTradeinIntercept"));
  assert.match(checkout, /const requestScope = captureAccountScope\(\);/);
  assert.match(checkout, /resolveTradeinCheckoutPreflight\([\s\S]{0,360}isCurrentAccountScope\(requestScope\)/);
  assert.ok(intercept.indexOf("if (!isCurrentAccountScope(requestScope)) return;")
    < intercept.indexOf("tradein.showChoice"));
  assert.ok(intercept.indexOf("if (!isCurrentAccountScope(requestScope)) return;")
    < intercept.indexOf("tradein.showCanonicalReplace"));
  assert.match(checkout, /catch\(\(\) => \{\s*if \(!isCurrentAccountScope\(requestScope\)\) return;/);
});

test("a late trade-in eligibility or quote response cannot write account B's canonical quote", () => {
  const sheets = read("src/components/tradein-sheets.vue");
  assert.match(sheets, /const requestScope = captureAccountScope\(\);/);
  assert.match(sheets, /deviceE3Api\.eligibility\(targetKind\)[\s\S]{0,180}requestIsCurrent\(\)/);
  assert.match(sheets, /deviceE3Api\.quote\(Number\(oldDevice\.id\), targetKind\)[\s\S]{0,180}requestIsCurrent\(\)/);
  assert.match(sheets, /requestIsCurrent\(\)[\s\S]{0,100}canonicalQuote\.value = null/);
  assert.match(sheets, /capacityQuote\(s\.targetKind\)[\s\S]{0,180}requestIsCurrent\(\)/);
  assert.match(sheets, /watch\(\(\) => app\.accountKey,[\s\S]{0,420}loadCanonicalTradeinConfig\(\)/);
});

test("a superseded quote for source A cannot overwrite the later source B selection", () => {
  const sheets = read("src/components/tradein-sheets.vue");
  assert.match(sheets, /const quoteRequestGeneration = ref\(0\)/);
  assert.match(sheets, /const requestGeneration = \+\+quoteRequestGeneration\.value/);
  assert.match(sheets, /requestGeneration === quoteRequestGeneration\.value/);
  assert.match(sheets, /if \(!requestIsCurrent\(\)\) return;[\s\S]{0,120}canonicalQuote\.value = quote/);
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
  assert.match(submit, /const requestScope = captureAccountScope\(\)/);
  assert.match(submit, /ACCOUNT_SCOPE_CHANGED/);
  assert.match(submit, /deviceE3Api\.capacityKeep[\s\S]{0,180}requireCurrentAccount\(\)/);
  assert.doesNotMatch(submit, /orderApi\.create/);
  assert.match(submit, /catch \{\s*if \(!isCurrentAccountScope\(requestScope\)\) return;/);
});

test("learning failures are announced and retry remains keyboard reachable", () => {
  const courses = read("src/pages/learn/courses.vue");
  const course = read("src/pages/learn/course.vue");
  for (const page of [courses, course]) {
    assert.match(page, /v-else-if="error"[^>]*role="alert"[^>]*aria-live="assertive"/);
    assert.match(page, /role="button"[^>]*tabindex="0"/);
  }
  assert.match(courses, /@keydown\.enter\.prevent="onKeyboardActivate\(\$event, load\)"/);
});
