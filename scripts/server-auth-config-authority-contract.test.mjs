import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
// 🔴 fnBlock:按大括号配平抠出**这一个函数的块**,断言只在块内量。
//   为什么必须有它(2026-08-14 红测实测):`function bindAccount\([\s\S]*?clearRemoteState` 这种
//   全文懒惰通配,把 bindAccount 里的 clearRemoteState 删掉之后**照样绿** —— 通配滑出函数
//   边界,命中了别的函数里的同名调用。断言看着在守「重绑必清态」,实际全文出现过就算。
//   跳参数表再找 `{`(免得被类型注解骗;本仓有 `Promise<{…}>` 撑爆同类抠取器的先例)。
const fnBlock = (src, name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `source is missing function ${name}`);
  let i = src.indexOf("(", start);
  for (let d = 0; i < src.length; i += 1) {
    if (src[i] === "(") d += 1;
    else if (src[i] === ")" && (d -= 1) === 0) { i += 1; break; }
  }
  for (let ang = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === "<") ang += 1;
    else if (c === ">" && src[i - 1] !== "=") ang = Math.max(0, ang - 1);
    else if (c === "{" && ang === 0) break;
  }
  for (let d = 0, s = i; i < src.length; i += 1) {
    if (src[i] === "{") d += 1;
    else if (src[i] === "}" && (d -= 1) === 0) return src.slice(s, i + 1);
  }
  assert.fail(`unbalanced braces in function ${name}`);
};

test("server mode starts unauthenticated and only retains a non-secret recovery trace", () => {
  const auth = read("src/store/auth.ts");
  const vault = read("src/api/session-vault.ts");

  assert.match(auth, /import \{ remoteApiEnabled \} from "@\/api\/runtime"/);
  assert.match(auth, /function hydrate\(\): Persisted \{[\s\S]*?if \(remoteApiEnabled\) \{[\s\S]*?isAuthenticated: false[\s\S]*?accountId: "default"/);
  assert.match(auth, /hasPersistedServerAuthenticatedAccountTrace[\s\S]*?startsWith\("user:"\)/);
  assert.match(vault, /createRuntimeSessionVault\(\): SessionVault \{[\s\S]*?return createSessionVault\(\);/);
  assert.doesNotMatch(vault, /accessToken:\s*snapshot\.accessToken/,
    "the H5 persistence format must never contain a Bearer token");
});

test("explicit logout revokes the remote refresh session before local state is cleared", () => {
  const me = read("src/pages/me/me.vue");

  assert.match(me, /import \{ authApi, remoteApiEnabled \} from "@\/api\/runtime"/);
  assert.match(me, /async function handleSignOut\(\)[\s\S]*?if \(remoteApiEnabled\) await authApi\.logout\(\);[\s\S]*?session\.signOutSession\(\);[\s\S]*?auth\.signOut\(\);/);
});

test("registration OTP send uses the public auth route and a delivery-specific fallback", () => {
  const api = read("src/api/auth-api.ts");
  const register = read("src/pages/register/register.vue");
  const zh = read("src/i18n/messages/zh.ts");
  const en = read("src/i18n/messages/en.ts");
  const vi = read("src/i18n/messages/vi.ts");

  assert.match(api, /sendRegistrationOtp[\s\S]*?path: "\/auth\/users\/register\/otp\/send"/);
  assert.match(register, /authApi\.sendRegistrationOtp[\s\S]*?errorOtpSendUnavailable/);
  assert.match(zh, /errorOtpSendUnavailable: "验证码暂时没发出去 —— 可先用下方 Google \/ Apple \/ Telegram 直接登录,或稍等片刻再试。"/);
  assert.match(en, /errorOtpSendUnavailable: "The code didn't go out just now — sign in with Google \/ Apple \/ Telegram below, or retry in a moment\."/);
  assert.match(vi, /errorOtpSendUnavailable: "Mã xác minh chưa gửi được — bạn có thể đăng nhập bằng Google \/ Apple \/ Telegram bên dưới, hoặc thử lại sau ít phút\."/);
});

test("mock password reset persists through AuthApi and reuses the phone account scope", () => {
  const login = read("src/pages/login/login.vue");
  const reset = fnBlock(login, "finishReset");
  const accountId = fnBlock(login, "authenticatedAccountId");

  assert.match(reset, /await authApi\.completePasswordReset\(/);
  assert.doesNotMatch(reset, /if \(remoteApiEnabled\)/,
    "mock reset must not bypass the AuthApi persistence call");
  assert.match(accountId, /if \(remoteApiEnabled\) return `user:\$\{user\.userId\}`/);
  assert.match(accountId, /authAccountKeyForPhone\(`\$\{user\.countryCode\}\$\{user\.phone\}`\)/);
  assert.equal((login.match(/accountId: authenticatedAccountId\(result\.user\)/g) || []).length, 3);
  assert.match(login, /identity: authenticatedAccountId\(result\.user\)/);
});

test("remote configuration loads are authoritative and remote writes do not revive local tables", () => {
  const config = read("src/store/config.ts");
  const rank = read("src/store/v-rank.ts");
  const commission = read("src/store/commission.ts");
  const staking = read("src/store/staking.ts");
  const earnConfig = read("src/store/earn-config.ts");
  const phoneTiers = read("src/mock/phone-tiers.ts");
  const app = read("src/App.vue");
  const accountScope = read("src/lib/account-scope.ts");
  const repurchase = read("src/store/repurchase.ts");

  assert.match(config, /if \(!remoteApiEnabled\) \{[\s\S]*?syncFailed\.value = false[\s\S]*?return;/);
  assert.match(config, /const config = ref<PlatformConfig>\(remoteApiEnabled \? unavailableServerConfig : mockConfig\)/);
  assert.match(config, /rewards:\s*remote\.rewards/);
  assert.match(config, /if \(remoteApiEnabled \|\| IS_PRODUCTION\) return;/);
  assert.match(config, /const remote = await platformConfigApi\.platformConfig\(\);[\s\S]*?config\.value = \{[\s\S]*?featureFlags: \{ \.\.\.config\.value\.featureFlags, \.\.\.remote\.featureFlags \}[\s\S]*?publicStats: remote\.publicStats[\s\S]*?onlineBonus: remote\.onlineBonus[\s\S]*?rewards: remote\.rewards[\s\S]*?computeShare: remote\.computeShare/);
  assert.match(config, /catch \{[\s\S]*?syncFailed\.value = true/);
  assert.match(rank, /function setMyRank\(v: VRank\) \{[\s\S]*?if \(remoteApiEnabled\) return;/);
  {
    const block = fnBlock(rank, "bindAccount");
    const iClear = block.indexOf("clearRemoteFacts();");
    const iRefresh = block.indexOf("void refreshCanonicalVRank(");
    assert.ok(iClear >= 0, "remote V-rank rebind must clear the previous account facts");
    assert.ok(iRefresh > iClear, "remote V-rank rebind must refresh only after clearing old facts");
  }
  assert.match(rank, /function setProgress\(p: VRankProgressPatch\) \{[\s\S]*?if \(remoteApiEnabled\) return;/);
  assert.match(commission, /function withdraw\(id: string\): boolean \{[\s\S]*?if \(remoteApiEnabled\) return false;/);
  assert.match(staking, /async function openRemote\([\s\S]*?if \(!remoteReady\.value\) throw new Error\("G1_REMOTE_AUTHORITY_UNAVAILABLE"\);/);
  assert.match(staking, /const boot = remoteApiEnabled \? \{ positions: \[\], rev: 0 \} : hydrate\(boundKey\)/);
    // 🔴 2026-08-14:下面三处不再钉调用点的 `.catch` —— 韧性包(c2c572e/c244c86)把自吞
  // 挪进了刷新缝内部,「不 reject」由 selfcheck-remote-refresh-resilience 对全部 28 条缝
  // 行为级看守;调用点的 .catch 成了死代码,有的已删有的还挂着。这里只钉真不变量:
  // 远端重绑必须清本地态 + 触发一次重拉。带不带 .catch 都接受(它无害,只是没必要)。
  {
    const block = fnBlock(staking, "bindAccount");
    const iClear = block.indexOf("clearRemoteState();");
    const iSync = block.indexOf("void syncRemote()");
    assert.ok(iClear >= 0, "remote rebind must clear local staking state (in bindAccount itself)");
    assert.ok(iSync > iClear, "remote rebind must trigger a resync after clearing (in bindAccount itself)");
  }
  assert.match(staking, /const pool = pools\.value\.find\(\(row\) => row\.tierKey === tierKey && row\.enabled\);[\s\S]*?if \(!pool \|\| amountUsdt < pool\.minAmountUsdt\) throw new Error\("G1_REMOTE_AUTHORITY_UNAVAILABLE"\);/);
  assert.match(earnConfig, /if \(remoteApiEnabled\) applyCanonicalPhoneTierYields\(\[\]\);/);
  assert.match(earnConfig, /catch \(cause\) \{[\s\S]*?phoneTiers\.value = null;[\s\S]*?applyCanonicalPhoneTierYields\(\[\]\);/);
  assert.match(phoneTiers, /\?\? \{ baseRateUsdt: 0, baseRateNex: 0 \}/);
  assert.match(app, /if \(remoteApiEnabled\) \{[\s\S]*?void refreshEarnConfig\(\)[\s\S]*?void useMarket\(\)\.syncRemote\(\)/);
  assert.match(accountScope, /useRepurchase\(\)\.bindAccount\(\);/);
  assert.match(repurchase, /async function refresh\(\) \{[\s\S]*?if \(!remoteApiEnabled\) \{[\s\S]*?config\.value = null[\s\S]*?orders\.value = \[\][\s\S]*?return null;/);
  assert.match(repurchase, /async function open\(amountUsdt: number\) \{[\s\S]*?if \(!remoteApiEnabled\) throw new Error\("REPURCHASE_REMOTE_AUTHORITY_REQUIRED"\);/);
  {
    const block = fnBlock(repurchase, "bindAccount");
    const iClear = block.indexOf("pendingKeys.clear();");
    const iRefresh = block.search(/if \(remoteApiEnabled\) void refresh\(\)/);
    assert.ok(iClear >= 0, "repurchase rebind must clear pending keys (in bindAccount itself)");
    assert.ok(iRefresh > iClear, "repurchase rebind must re-pull after clearing (in bindAccount itself)");
  }
});

test("remote policy branches use dedicated server contracts or stay fail-closed", () => {
  const config = read("src/store/config.ts");
  const login = read("src/pages/login/login.vue");
  const share = read("src/lib/share.ts");

  // The public E6/H8 projection does not contain K/D5 risk, OTP, or share
  // policy.  Its pending snapshot must explicitly close those branches rather
  // than spreading DEFAULT_PLATFORM_CONFIG through remote mode.
  // withdrawRules 这一支曾锚在 dailyWithdrawLimitCount 上,该字段已按产品决定从
  // WithdrawRulesConfig 删除(每日笔数上限唯一来源 = GET /api/withdrawals/policy),
  // 锚点改用同样「关死」的 smallAmountThresholdUsd: 0(小额免审真停用),强度不变。
  assert.match(config, /const unavailableServerConfig: PlatformConfig = \{[\s\S]*?riskCluster: \{[\s\S]*?releaseMode: "manual_only"[\s\S]*?withdrawRules: \{[\s\S]*?sameAddressRoute: "reject"[\s\S]*?smallAmountThresholdUsd: 0[\s\S]*?riskScore: \{[\s\S]*?weakSignalClusterThreshold: 0[\s\S]*?otpGate: \{[\s\S]*?maxVerifyAttempts: 0[\s\S]*?share: \{[\s\S]*?channels: \[\]/);
  assert.match(login, /import \{[^}]*authApi[^}]*remoteApiEnabled[^}]*\} from "@\/api\/runtime"/);
  assert.match(login, /async function startOauth\([\s\S]*?authApi\.oauthExchange/);
  assert.match(login, /apiRuntimeConfig\.mode === "sandbox" && apiRuntimeConfig\.modeExplicit \? "SANDBOX_MOCK" : "PROVIDER"/);
  assert.match(login, /async function requestCode\(captchaTicket\?: string\) \{[\s\S]*?if \(remoteApiEnabled\) \{[\s\S]*?authApi\.sendPasswordResetOtp[\s\S]*?authApi\.sendLoginOtp/);
  assert.match(login, /async function verifyCode\(\) \{[\s\S]*?if \(remoteTwoFactorChallenge\.value\) \{ await verifyRemoteTwoFactor\(\); return; \}[\s\S]*?if \(remoteApiEnabled\) \{[\s\S]*?authApi\.completeOtpLogin/);
  assert.match(login, /async function finishReset\(\) \{[\s\S]*?authApi\.completePasswordReset/);
  assert.match(share, /export function buildShareLink[\s\S]*?if \(remoteApiEnabled\) \{[\s\S]*?location\.origin[\s\S]*?return "";/);
  assert.match(share, /export function buildShareText\(\): string \{[\s\S]*?if \(remoteApiEnabled\) return "";/);
  assert.match(share, /export function visibleChannels\(\): ShareChannelDef\[\] \{[\s\S]*?useConfig\(\)\.config\.share\.channels\.filter\(\(c\) => c\.enabled\)/);
  assert.match(share, /const text = remoteApiEnabled[\s\S]*?def\.textTemplate\?\.replace\("\{link\}", link\)/);
});
