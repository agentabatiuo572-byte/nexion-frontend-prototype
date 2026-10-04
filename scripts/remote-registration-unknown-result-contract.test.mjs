import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("unknown remote registration results attempt one password-login recovery", () => {
  const api = read("src/api/auth-api.ts");
  const page = read("src/pages/register/register.vue");
  const recovery = read("src/auth/registration-auto-login.ts");
  const zh = read("src/i18n/messages/zh.ts");

  assert.match(api, /function isRegistrationOutcomeUnknown\(error: unknown\)/);
  assert.match(api, /apiError\.kind === "network"\s*\|\| apiError\.kind === "protocol"/);
  assert.match(api, /apiError\.kind === "http" && \(apiError\.status \?\? 0\) >= 500/);
  assert.match(page, /registerAndLogin\(authApi/);
  assert.match(recovery, /if \(!isRegistrationOutcomeUnknown\(error\)\)[\s\S]*?kind: "registration_error"/);
  assert.match(recovery, /authApi\.login\(/);
  assert.match(zh, /registrationOutcomeUnknown:\s*"账号可能已创建，但自动登录结果未确认。请使用刚设置的手机号和密码登录"/);
  // 🔴 语言面必须三语齐点(门的门 ① 判据):只点一种语言时,另两种可以随意漂移而本门全绿。
  // 实测过的失败形态:语言豁免表不带语言维 → vi 真丢了占位符照样绿。
  // 中文钉**原文**(话术是产品决定),英/越只钉**键存在** —— 措辞由翻译定,但键不许缺。
  for (const [loc, src] of [["en", read("src/i18n/messages/en.ts")], ["vi", read("src/i18n/messages/vi.ts")]]) {
    assert.match(src, /registrationOutcomeUnknown:/,
      `${loc}.ts 缺 registrationOutcomeUnknown —— 该语言下这条恢复指引不存在`);
  }
});

test("authoritative remote 4xx registration errors stay on the form for correction", () => {
  const page = read("src/pages/register/register.vue");

  assert.match(page, /registration\.kind === "registration_error"[\s\S]*?registrationErrorText\(registration\.error\)/);
});

test("an optional sponsor is rejected only when it crosses environments", () => {
  const page = read("src/pages/register/register.vue");
  const zh = read("src/i18n/messages/zh.ts");

  assert.match(page, /function registrationErrorText\(cause: unknown\)/);
  assert.doesNotMatch(page, /USER_REGISTRATION_SANDBOX_SPONSOR_REQUIRED/);
  assert.match(page, /USER_REGISTRATION_SPONSOR_ENVIRONMENT_MISMATCH/);
  assert.match(page, /error\.value = registrationErrorText\(registration\.error\)/);
  assert.match(zh, /sponsorEnvironmentMismatch:\s*"该邀请码不可用,请核对后重试"/);
  // 同上:三语齐点。中文钉当前用户友好文案,英/越钉键存在。
  for (const [loc, src] of [["en", read("src/i18n/messages/en.ts")], ["vi", read("src/i18n/messages/vi.ts")]]) {
    assert.match(src, /sponsorEnvironmentMismatch:/, `${loc}.ts 缺 sponsorEnvironmentMismatch`);
  }
});
