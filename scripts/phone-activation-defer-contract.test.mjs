import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { initPreContext, preHtml, preJs } = require("@dcloudio/uni-cli-shared");
function compiledPage(source, platform) {
  initPreContext(platform);
  return preJs(preHtml(source, "page.vue"), "page.vue");
}

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("failed phone calibration offers retry and activate-later without minting activation", () => {
  const page = read("src/pages/onboarding/connect.vue");
  const auth = read("src/store/auth.ts");
  assert.match(page, /t(?:\.value)?\.onboarding\.activationRetry/);
  assert.match(page, /t(?:\.value)?\.onboarding\.activationDefer/);
  assert.match(page, /function deferPhoneActivation\s*\(/);
  assert.match(page, /auth\.completeOnboarding\(\)/);

  const handler = page.slice(page.indexOf("function deferPhoneActivation"), page.indexOf("function activate", page.indexOf("function deferPhoneActivation")));
  assert.doesNotMatch(handler, /applyPhoneCalibration|markCalibrated|resumeMining/);
  assert.match(page, /markPhoneActivationDeferred/);
  assert.doesNotMatch(page.slice(page.indexOf("async function deferPhoneActivation"), page.indexOf("function leaveConnect")), /clearCalibrated/);
  assert.match(page, /await confirmDeferredPhoneActivation\(/);
  assert.match(page, /current\.activationStatus !== "DEFERRED"/);
  assert.match(page, /markAuthAccountOnboardingComplete[\s\S]*\|\| remoteApiEnabled/,
    "a server-confirmed defer must not be turned back into an onboarding failure by the optional local phone directory");
  assert.match(auth, /if \(persist\(\) \|\| remoteApiEnabled\) return true/,
    "server mode must keep the live session onboarded when its non-authoritative local cache cannot be persisted");
  assert.match(handler, /!localPhoneStateCommitted && !remoteApiEnabled/,
    "a server-confirmed DEFERRED state must win over local cache write failures without weakening the local mock contract");
  assert.match(page, /activationBusy\.value = false;[\s\S]*accountEpoch \+= 1/,
    "an account switch must release the previous account's busy state");
  assert.match(handler, /accept: \(result\) => acceptCurrentCanonical\(requestScope, result\)/,
    "shared defer recovery fences result, write and readback before mutation");
});

test("estimator activate-later confirms the server state and exits onboarding without reopening registration success", () => {
  const estimator = read("src/pages/onboarding/estimator.vue");
  const deferredTransition = read("src/lib/defer-phone-activation.ts");
  const handler = estimator.slice(estimator.indexOf("async function deferPhoneActivation"));

  assert.match(handler, /await confirmDeferredPhoneActivation\(/,
    "the estimator failure path must persist DEFERRED instead of treating navigation as the decision");
  assert.match(deferredTransition, /onboardingCalibrationApi\.defer\(/);
  assert.match(deferredTransition, /activationStatus !== "DEFERRED"/);
  assert.match(estimator, /markPhoneActivationDeferred/);
  assert.match(estimator, /auth\.completeOnboarding\(\)/);
  assert.match(handler, /navReset\(\{ url: "\/pages\/index\/index"/);
  assert.doesNotMatch(compiledPage(estimator, "app-plus"), /pages\/register\/success/,
    "native login/onboarding recovery must never reopen a web registration or download page");
  assert.match(compiledPage(estimator, "h5"), /pages\/register\/success\?download=1/,
    "the browser offers the download-only guide, without claiming a new registration");
  assert.match(estimator, /activationDeferFailed/,
    "a failed defer write must be explained as a failed save, not as an activation failure");
  assert.match(estimator, /function retryCalibration\(\) \{\s*if \(deferBusy\.value\) return;/,
    "retry must stay locked while a DEFERRED command is in flight");
  const leaveHandler = estimator.slice(estimator.indexOf("function leaveEstimator"), estimator.indexOf("async function deferPhoneActivation"));
  assert.doesNotMatch(leaveHandler, /confirmDeferredPhoneActivation|onboardingCalibrationApi\.defer/,
    "back is navigation, never an implicit server-side defer decision");
});

test("native APP compilation excludes web download mode, copy and route behavior", () => {
  const success = compiledPage(read("src/pages/register/success.vue"), "app-plus");
  const script = success.split('<script setup lang="ts">')[1].split("</script>")[0];
  const template = success.split("<template>")[1].split("</template>")[0];
  assert.doesNotMatch(script, /downloadOnly|officialDownloadUrl|retryDownloadConfig|window\.open/);
  assert.doesNotMatch(template, /rs-h5-download|rs-retry|doneOfficialDownload|phoneActivationAppOnlyBody|doneWhyApp/);
  assert.match(script, /function continueWeb\(\)\s*\{\s*navReset\(\{ url: "\/pages\/onboarding\/estimator"/);
  for (const name of ["connect", "estimator"]) {
    assert.doesNotMatch(compiledPage(read(`src/pages/onboarding/${name}.vue`), "app-plus"), /register\/success\?download=1/);
  }
  for (const path of ["src/pages/onboarding/connect.vue", "src/pages/onboarding/estimator.vue", "src/pages/me/devices.vue", "src/components/earn/device-card-pc.vue"]) {
    const native = compiledPage(read(path), "app-plus");
    assert.match(native, /resolvePhoneActivationGuidance/, `${path} must share the platform-specific guidance`);
    assert.doesNotMatch(native, /phoneActivationAppOnly(?:Title|Body)/, `${path} must not show browser or download instructions inside an APP`);
  }
  const nativeLogin = compiledPage(read("src/pages/login/login.vue"), "app-plus");
  assert.doesNotMatch(nativeLogin, /browserUnsupportedNotice|secureBrowserUnsupported|secure-browser-unsupported-notice/);
  const browserLogin = compiledPage(read("src/pages/login/login.vue"), "h5");
  assert.match(browserLogin, /browserUnsupportedNotice/);
  assert.match(browserLogin, /secure-browser-unsupported-notice/);
});

test("deferred activation is a persisted non-active state, not a forced recalibration loop", () => {
  const session = read("src/store/session.ts");
  const deferred = session.slice(session.indexOf("function markPhoneActivationDeferred"), session.indexOf("function isCurrentDeviceCalibrated"));
  assert.match(deferred, /DEFERRED_PHONE_ACTIVATION_KEY|readDeferredPhoneActivationMap/);
  assert.match(deferred, /requiresRecalibration\.value = false/);
  assert.doesNotMatch(deferred, /requiresRecalibration\.value = true/);

  const cleanup = read("src/store/account-scoped-storage.ts");
  assert.match(cleanup, /nexgrid-deferred-phone-activation-v1/);
});

test("successful activation is confirmed by the server before local compute starts", () => {
  const page = read("src/pages/onboarding/connect.vue");
  assert.match(page, /await onboardingCalibrationApi\.activate\(/);
  assert.ok(page.indexOf("await onboardingCalibrationApi.activate(") < page.indexOf("app.refreshRemoteFleet("));
  assert.doesNotMatch(page, /applyPhoneCalibration/);
});

test("new phone fixture starts inactive and produces no seeded phone reward", () => {
  const factory = read("src/store/device-types.ts");
  const phoneSeed = factory.slice(factory.indexOf("const phone = createDevice"), factory.indexOf("const demoKinds"));
  assert.match(phoneSeed, /phone\.activatedAt = null/);
  assert.match(phoneSeed, /phone\.todayEarnings = 0/);
  assert.match(phoneSeed, /phone\.todayEarningsNEX = 0/);
});

test("device warehouse and slot sheet cannot bypass phone recalibration", () => {
  const devices = read("src/pages/me/devices.vue");
  const slotSheet = read("src/components/slot-action-sheet.vue");
  assert.match(devices, /d\.kind === "phone"/);
  assert.match(devices, /pages\/onboarding\/connect\?mode=recalibrate/);
  assert.match(slotSheet, /d\.kind === "phone"/);
  assert.match(slotSheet, /pages\/onboarding\/connect\?mode=recalibrate/);
  assert.match(devices, /phoneActivationCta/);
  assert.match(devices, /!phones\.some\(\(device\) => device\.activatedAt !== null\)/);

  const connect = read("src/pages/onboarding/connect.vue");
  assert.match(connect, /createPhoneCalibrationFlow/);
  const flow = read("src/lib/phone-calibration-flow.ts");
  assert.match(flow, /error\.status !== 404/);
  assert.match(flow, /expectedRevision: current\?\.revision \?\? 0/);
});

test("all locales explain retry, defer, warehouse recovery and reward consequences", () => {
  for (const locale of ["zh", "en", "vi"]) {
    const messages = read(`src/i18n/messages/${locale}.ts`);
    for (const key of ["activationRetry", "activationDefer", "activationDeferFailed", "activationDeferredHint", "activationDeferredToast", "activationRewardGate"]) {
      assert.match(messages, new RegExp(`${key}:`), `${locale} missing ${key}`);
    }
  }
});
