import assert from "node:assert/strict";
import fs from "node:fs";
import test, { mock } from "node:test";
import ts from "typescript";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function passwordChangeFixture() {
  const script = read("src/pages/me/security.vue").match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "security page script must exist");
  const parsed = ts.createSourceFile("security.ts", script, ts.ScriptTarget.Latest, true);
  const handler = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "submitPasswordChange");
  assert.ok(handler, "real password handler must exist");
  const code = ts.transpileModule(handler.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let resolveReceipt;
  let currentScope = true;
  const deps = {
    current: { value: "OldPass1!" }, next: { value: "NewPass2!" }, confirmPwd: { value: "NewPass2!" },
    securityBusy: { value: false }, editingPwd: { value: true }, err: { value: "" },
    // #216 起真实处理器还持有「错误归属字段」与「焦点目标」两个 ref,以及
    // 字段码常量。夹具按真实签名补齐,否则注入的代码一执行就 ReferenceError。
    pwdErrorField: { value: "" }, pwdFocusField: { value: "" },
    PWD_FIELD_CURRENT: "current", PWD_FIELD_NEXT: "next", PWD_FIELD_CONFIRM: "confirm",
    focusPwdField: mock.fn((field) => { deps.pwdFocusField.value = field; }),
    securityPageFence: { capture: () => ({}) }, captureAccountScope: () => ({}),
    auth: { accountId: "password-fixture" }, isCurrentSecurityRequest: () => currentScope,
    isPasswordOk: (value) => value === "NewPass2!", remoteApiEnabled: true,
    SECURITY_COMMAND_TABLE: "password-fixture-commands", acquireAccountCommandKey: mock.fn(() => "command-fixture"),
    releaseAccountCommandKey: mock.fn(),
    accountApi: {
      passwordCommandReceipt: mock.fn(() => new Promise((resolve) => { resolveReceipt = resolve; })),
      changePassword: mock.fn(async () => undefined),
    },
    security: { changePassword: mock.fn() }, loadRemoteSecurity: mock.fn(async () => true),
    securityErrorMessage: () => "request failed", toast: { success: mock.fn() },
    t: { value: { login: { errorInvalidPassword: "missing" }, security: {
      passwordShort: "short", passwordMismatch: "mismatch", passwordRecovered: "recovered", passwordSaved: "saved",
    } } },
  };
  const submit = new Function(...Object.keys(deps), `${code}; return submitPasswordChange;`)(...Object.values(deps));
  return { ...deps, submit, resolveReceipt: (receipt) => resolveReceipt(receipt), leave: () => { currentScope = false; } };
}

function twoFactorFixture() {
  const script = read("src/pages/me/security.vue").match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "security page script must exist");
  const parsed = ts.createSourceFile("security.ts", script, ts.ScriptTarget.Latest, true);
  const handlers = ["toggleTwoFactor", "onTwoFactorPassword"].map((name) => {
    const node = parsed.statements.find((part) => ts.isFunctionDeclaration(part) && part.name?.text === name);
    assert.ok(node, `${name} must exist`);
    return ts.transpileModule(node.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  }).join("\n");
  const deps = {
    securityBusy: { value: false }, securityPageFence: { capture: () => ({}) },
    captureAccountScope: () => ({}), auth: { accountId: "two-factor-fixture" },
    isCurrentSecurityRequest: () => true, remoteApiEnabled: true,
    remoteSecurity: { value: { twoFactorEnabled: false } }, err: { value: "" },
    twoFactorPassword: { value: "" }, twoFactorPasswordError: { value: "" },
    twoFactorPasswordFocus: { value: false }, twoFactorEnabled: { value: false },
    twoFactorTarget: { value: null }, twoFactorChallengeNo: { value: "" },
    twoFactorPhoneMasked: { value: "" }, twoFactorCode: { value: "" },
    detailVal: (event) => event.detail.value,
    toast: { error: mock.fn(), success: mock.fn() },
    t: { value: { login: { errorInvalidPassword: "enter password" }, security: {
      twoFactorPasswordRequired: "enter current password", opFailed: "failed",
    }, addrRebind: { otpSendCta: "sent" } } },
    accountApi: { sendTwoFactorChallenge: mock.fn(async () => ({ challengeNo: "SEC2FA-fixture", phoneMasked: "***" })) },
    securityErrorMessage: () => "failed", security: { setTwoFactor: mock.fn() },
    uiConfirm: mock.fn(async () => true), securityConfirmOwner: "fixture",
  };
  const actions = new Function(...Object.keys(deps), `${handlers}; return { toggleTwoFactor, onTwoFactorPassword };`)(...Object.values(deps));
  return { ...deps, ...actions };
}

test("empty 2FA password focuses its field and cannot send a challenge", async () => {
  const page = twoFactorFixture();
  await page.toggleTwoFactor(true);
  assert.equal(page.twoFactorPasswordError.value, "enter current password");
  assert.equal(page.twoFactorPasswordFocus.value, true);
  assert.equal(page.toast.error.mock.callCount(), 1);
  assert.equal(page.accountApi.sendTwoFactorChallenge.mock.callCount(), 0);
  page.onTwoFactorPassword({ detail: { value: "a-password" } });
  assert.equal(page.twoFactorPasswordError.value, "");
  assert.equal(page.twoFactorPasswordFocus.value, false);
});

test("password change sends only the values validated before awaiting a prior receipt", async () => {
  const page = passwordChangeFixture();
  const pending = page.submit();
  assert.equal(page.securityBusy.value, true);
  await page.submit();
  assert.equal(page.accountApi.passwordCommandReceipt.mock.callCount(), 1);
  page.current.value = "ChangedOld3!";
  page.next.value = "ChangedNew4!";
  page.confirmPwd.value = "mismatch";
  page.resolveReceipt(null);
  await pending;
  assert.deepEqual(page.accountApi.changePassword.mock.calls.map((call) => call.arguments), [
    ["OldPass1!", "NewPass2!", "command-fixture"],
  ]);
  assert.equal(page.loadRemoteSecurity.mock.callCount(), 1);
  assert.equal(page.releaseAccountCommandKey.mock.callCount(), 1);
  assert.equal(page.security.changePassword.mock.callCount(), 0);
  assert.equal(page.current.value, "");
  assert.equal(page.next.value, "");
});

test("a committed password receipt recovers the old command without submitting edited passwords", async () => {
  const page = passwordChangeFixture();
  const pending = page.submit();
  page.current.value = "ChangedOld3!";
  page.next.value = "ChangedNew4!";
  page.resolveReceipt({ status: "PASSWORD_CHANGED" });
  await pending;
  assert.equal(page.accountApi.changePassword.mock.callCount(), 0);
  assert.equal(page.loadRemoteSecurity.mock.callCount(), 1);
  assert.equal(page.releaseAccountCommandKey.mock.callCount(), 1);
  assert.deepEqual(page.toast.success.mock.calls[0].arguments, ["recovered"]);
});

test("password commands reject invalid forms before requests and do not send after leaving", async () => {
  const page = passwordChangeFixture();
  page.confirmPwd.value = "mismatch";
  await page.submit();
  assert.equal(page.err.value, "mismatch");
  assert.equal(page.accountApi.passwordCommandReceipt.mock.callCount(), 0);
  // #216:每条校验错误必须指名**哪一格**并聚焦过去,否则读屏只知道「提交失败」。
  assert.equal(page.pwdErrorField.value, "confirm");
  assert.equal(page.pwdFocusField.value, "confirm");
  page.confirmPwd.value = page.next.value;
  const pending = page.submit();
  page.leave();
  page.resolveReceipt(null);
  await pending;
  assert.equal(page.accountApi.changePassword.mock.callCount(), 0);
  assert.equal(page.loadRemoteSecurity.mock.callCount(), 0);
  assert.equal(page.releaseAccountCommandKey.mock.callCount(), 0);
  assert.equal(page.toast.success.mock.callCount(), 0);
});

test("every password validation failure names and focuses its own field", async () => {
  // #216:三格各自的错误要能分别定位 —— 这是「错误与输入框关联」的可执行判据,
  // 模板侧的 aria-describedby/aria-invalid 由 a11y-activate 门守。
  const blank = passwordChangeFixture();
  blank.current.value = "";
  await blank.submit();
  assert.equal(blank.pwdErrorField.value, "current");
  assert.equal(blank.pwdFocusField.value, "current");

  const weak = passwordChangeFixture();
  weak.next.value = "short";
  await weak.submit();
  assert.equal(weak.pwdErrorField.value, "next");
  assert.equal(weak.pwdFocusField.value, "next");

  // 服务端/传输层错误不属于任何单格:不得把服务端故障指到某一格上。
  const remote = passwordChangeFixture();
  remote.securityErrorMessage = () => "request failed";
  const pending = remote.submit();
  remote.resolveReceipt(null);
  await pending;
  assert.equal(remote.pwdErrorField.value, "");
});

test("remote security center consumes the authoritative account API", () => {
  const page = read("src/pages/me/security.vue");
  assert.match(page, /accountApi\.securityOverview\(\)/);
  assert.match(page, /accountApi\.changePassword\(/);
  assert.match(page, /accountApi\.updateTwoFactor\(/);
  assert.match(page, /accountApi\.revokeSession\(/);
  assert.match(page, /accountApi\.revokeOtherSessions\(\)/);
  assert.match(page, /accountApi\.requestAccountDeletion\(/);
  assert.match(page, /if \(!twoFactorPassword\.value\) \{\s*twoFactorPasswordError\.value = t\.value\.security\.twoFactorPasswordRequired;\s*twoFactorPasswordFocus\.value = true;\s*toast\.error\(t\.value\.login\.errorInvalidPassword\);\s*return;\s*\}/,
    "the 2FA toggle must report a missing current password and focus its input");
  assert.match(page, /:aria-describedby="twoFactorPasswordError \? 'security-2fa-password-error' : undefined"/,
    "the 2FA password input must be linked to its inline error");
  const passwordChange = page.match(/async function submitPasswordChange\(\) \{([\s\S]*?)^\}/m)?.[1];
  assert.ok(passwordChange, "password command boundary must exist");
  const branches = passwordChange.match(/if \(remoteApiEnabled\) \{([\s\S]*?)\n\s*\} else \{([\s\S]*?)\n\s*\}/);
  assert.ok(branches, "password command must separate server and local authority");
  assert.match(passwordChange, /const currentPassword = current\.value;/);
  assert.match(passwordChange, /const newPassword = next\.value;/);
  assert.ok(passwordChange.indexOf("const newPassword") < passwordChange.indexOf("await accountApi.passwordCommandReceipt"),
    "the validated passwords must be captured before awaiting command recovery");
  assert.match(branches[1], /accountApi\.passwordCommandReceipt\(commandKey\)/);
  assert.match(branches[1], /else await accountApi\.changePassword\(currentPassword, newPassword, commandKey\)/);
  assert.match(branches[1], /await loadRemoteSecurity\(\)/);
  assert.doesNotMatch(branches[1], /security\.changePassword\(/);
  assert.match(branches[2], /security\.changePassword\(currentPassword, newPassword\)/);
  assert.doesNotMatch(branches[2], /accountApi\./);
  assert.match(page, /accountApi\.updateTwoFactor\(target, twoFactorPassword\.value, twoFactorChallengeNo\.value, twoFactorCode\.value\)/);
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

test("remote top-up exposes server-backed USDT and VietQR without card", () => {
  const topup = read("src/pages/me/wallet-topup.vue");
  const pane = read("src/components/me/deposit-bank-pane.vue");
  const deposits = read("src/store/deposits.ts");
  assert.match(topup, /const segments = remoteApiEnabled \? SEGMENTS\.filter\(\(item\) => item\.id !== "card"\)/);
  assert.match(topup, /<DepositUsdtPane v-if="seg === 'crypto'" \/>/);
  assert.match(topup, /<DepositBankPane v-else-if="seg === 'bank'" \/>/);
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
