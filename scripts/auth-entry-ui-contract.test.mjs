import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("login and registration share country-aware phone validation", async () => {
  const [login, register, countrySheet] = await Promise.all([
    read("src/pages/login/login.vue"),
    read("src/pages/register/register.vue"),
    read("src/components/country-code-sheet.vue"),
  ]);
  for (const page of [login, register]) {
    assert.match(page, /validateNationalPhone/);
    assert.match(page, /phoneFormatHint/);
    assert.match(page, /data-testid="auth-phone-hint"/);
  }
  assert.match(countrySheet, /PHONE_COUNTRIES/);
  assert.match(countrySheet, /cc-row__iso/);
  assert.match(countrySheet, /item\.iso/);
});

test("registered-number runtime fixtures stay on the selectable development country code", async () => {
  const runtime = await read("scripts/auth-register-existing-runtime.mjs");
  assert.doesNotMatch(runtime, /\+1/);
  assert.match(runtime, /const fullPhone = `\+86\$\{phoneDigits\}`/);
  assert.match(runtime, /hasText: "\+86"/);
  assert.match(runtime, /solveCaptchaSlider\(frame, `\+86\$\{digits\}`\)/);
});

test("keyboard auth regression uses valid phones for both selectable country codes", async () => {
  const keyboardRuntime = await read("scripts/keyboard-submit-h5.e2e.mjs");
  assert.match(keyboardRuntime, /countryCode === "\+84" \? "912345678"/);
  assert.match(keyboardRuntime, /countryCode === "\+86" \? "13800138000"/);
  assert.doesNotMatch(keyboardRuntime, /\+81|4155550123/);
});

test("four auth providers stay visible only in the development mock runtime", async () => {
  const [login, register, providerGrid] = await Promise.all([
    read("src/pages/login/login.vue"),
    read("src/pages/register/register.vue"),
    read("src/components/auth-provider-grid.vue"),
  ]);
  for (const page of [login, register]) {
    assert.match(page, /AuthProviderGrid/);
    assert.match(page, /v-if="step === 1[^\"]*!remoteApiEnabled/);
    assert.match(page, /data-testid="auth-runtime-label"/);
    assert.doesNotMatch(page, /const oauth\s*=/);
    assert.doesNotMatch(page, /oauthDisplayLabel/);
  }
  for (const provider of ["Passkey", "Google", "Apple", "Telegram"]) {
    assert.match(providerGrid, new RegExp(`data-provider="${provider}"`));
  }
  assert.doesNotMatch(providerGrid, /[·•]\s*Mock/);
  assert.doesNotMatch(providerGrid, /(?:stroke|fill)="white"/);
  assert.match(providerGrid, /grid-template-columns:\s*repeat\(4/);
  assert.match(providerGrid, /focus-visible/);
});

test("a held production CAPTCHA has a terminal unavailable state instead of a fake retry loop", async () => {
  const captcha = await read("src/components/captcha-slider.vue");
  assert.match(captcha, /v-else-if="providerHold"/);
  assert.match(captcha, /captchaProviderUnavailable/);
  assert.match(captcha, /v-if="!providerHold"[^>]*class="cs-track"/);
});

test("the LAN H5 preview cannot proxy development OAuth credentials", async () => {
  const [viteConfig, boundary] = await Promise.all([
    read("vite.config.ts"),
    read("src/lib/dev-preview-auth-boundary.ts"),
  ]);
  assert.match(viteConfig, /mustBlockDevelopmentOAuthProxy/);
  assert.match(viteConfig, /bypass:\s*\(req, res\)/);
  assert.match(viteConfig, /req\.socket\.remoteAddress/);
  assert.match(boundary, /\/auth\/users\/oauth\/development\//);
  assert.match(boundary, /\/auth\/users\/oauth\/exchange/);
});

test("authentication failures are announced immediately to assistive technology", async () => {
  const [login, register] = await Promise.all([
    read("src/pages/login/login.vue"),
    read("src/pages/register/register.vue"),
  ]);
  for (const page of [login, register]) {
    assert.match(page, /v-if="error"[^>]*role="alert"[^>]*aria-live="assertive"/);
  }
});
