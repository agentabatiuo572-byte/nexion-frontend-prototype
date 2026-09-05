import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("remote security center consumes the authoritative account API", () => {
  const page = read("src/pages/me/security.vue");
  assert.match(page, /accountApi\.securityOverview\(\)/);
  assert.match(page, /accountApi\.changePassword\(/);
  assert.match(page, /accountApi\.updateTwoFactor\(/);
  assert.match(page, /accountApi\.revokeSession\(/);
  assert.match(page, /accountApi\.revokeOtherSessions\(\)/);
  assert.match(page, /accountApi\.requestAccountDeletion\(/);
  assert.match(page, /if \(remoteApiEnabled\) \{[\s\S]{0,180}accountApi\.changePassword\([\s\S]{0,180}else \{[\s\S]{0,80}security\.changePassword\(/);
  assert.match(page, /if \(remoteApiEnabled\) \{[\s\S]{0,180}accountApi\.updateTwoFactor\(/);
  assert.doesNotMatch(page, /ACCOUNT_DELETION_PROVIDER_HOLD/);
});

test("remote passwordless login uses the server OTP contract", () => {
  const api = read("src/api/auth-api.ts");
  const page = read("src/pages/login/login.vue");
  assert.match(api, /sendLoginOtp/);
  assert.match(api, /\/auth\/users\/login\/otp\/send/);
  assert.match(api, /completeOtpLogin/);
  assert.match(api, /\/auth\/users\/login\/otp\/verify/);
  assert.match(page, /authApi\.sendLoginOtp\(/);
  assert.match(page, /authApi\.completeOtpLogin\(/);
  assert.match(api, /\/auth\/users\/password-reset\/otp\/send/);
  assert.match(api, /\/auth\/users\/password-reset\/otp\/complete/);
  assert.match(page, /authApi\.sendPasswordResetOtp\(/);
  assert.match(page, /authApi\.completePasswordReset\(/);
  assert.doesNotMatch(page, /PASSWORD_RESET_PROVIDER_HOLD/);
});

test("remote top-up exposes only authoritative VietQR while external rails stay HOLD", () => {
  const topup = read("src/pages/me/wallet-topup.vue");
  const pane = read("src/components/me/deposit-bank-pane.vue");
  const deposits = read("src/store/deposits.ts");
  assert.match(topup, /remoteApiEnabled[\s\S]{0,500}DepositBankPane/);
  assert.doesNotMatch(topup, /v-if="remoteApiEnabled"[\s\S]{0,200}railsClosedTitle/);
  assert.match(deposits, /paymentApi\.createVietQrIntent\(/);
  assert.match(deposits, /paymentApi\.listVietQrIntents\(/);
  assert.match(deposits, /paymentApi\.cancelVietQrIntent\(/);
  assert.match(pane, /createRemoteBankIntent/);
  assert.match(pane, /cancelRemoteBankIntent/);
});

test("remote profile nickname is changed only through the authenticated profile API", () => {
  const api = read("src/api/profile-api.ts");
  const store = read("src/store/profile.ts");
  const page = read("src/pages/me/profile.vue");
  assert.match(api, /\/api\/app\/profile\/nickname-candidates/);
  assert.match(api, /method:\s*"PUT"[\s\S]{0,100}path:\s*"\/api\/app\/profile"/);
  assert.match(store, /profileApi\.updateNickname\(/);
  assert.match(store, /projectServerIdentity/);
  assert.match(page, /await profile\.setDisplayName\(/);
  assert.doesNotMatch(page, /data-proof="remote-profile-readonly-hold"/);
  assert.match(api, /\/api\/app\/profile\/avatar/);
  assert.match(api, /uploadAvatar/);
  assert.match(page, /profileApi\.uploadAvatar\(/);
  assert.match(page, /uni\.chooseImage\(/);
  assert.doesNotMatch(page, /serverReadOnlyHold/);
});

test("remote achievements render and claim server milestone facts instead of local rewards", () => {
  const page = read("src/pages/me/achievements.vue");
  const api = read("src/api/points-api.ts");
  assert.match(api, /earningMilestones/);
  assert.match(api, /evaluateEarningMilestones/);
  assert.match(page, /pointsApi\.state\(\)/);
  assert.match(page, /pointsApi\.claimMilestone\(/);
  assert.match(page, /pointsApi\.evaluateEarningMilestones\(/);
  assert.match(page, /if \(remoteApiEnabled\) void refreshRemote\(\);[\s\S]{0,80}else evaluate\(\)/);
  assert.match(page, /Local prototype achievements stay available only in mock mode[\s\S]{0,120}v-else/);
});

test("remote Nova and globe consume their authenticated server authorities", () => {
  const chat = read("src/pages/support/chat.vue");
  const globe = read("src/pages/globe/globe.vue");
  assert.match(chat, /novaAiApi\.status/);
  assert.match(chat, /novaAiApi\.chat/);
  assert.match(globe, /remoteApiEnabled/);
  assert.match(globe, /networkRegionsApi\.list\(\)/);
  assert.match(globe, /networkProjection\.value\?\.regions/);
  assert.match(globe, /projectionStatus\.value = next\.regions\.length > 0 \? "ready" : "empty"/);
  assert.doesNotMatch(globe, /GLOBE_REGION_PROJECTION_HOLD/);
  assert.match(globe, /const regions = computed/);
});
