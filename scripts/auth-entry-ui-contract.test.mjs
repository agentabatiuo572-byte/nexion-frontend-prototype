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
  assert.match(countrySheet, /SUPPORTED_PHONE_COUNTRIES/);
  assert.match(countrySheet, /cc-row__iso/);
  assert.match(countrySheet, /item\.iso/);
});

test("four auth providers use one stable grid with visible icons", async () => {
  const [login, register, providerGrid] = await Promise.all([
    read("src/pages/login/login.vue"),
    read("src/pages/register/register.vue"),
    read("src/components/auth-provider-grid.vue"),
  ]);
  for (const page of [login, register]) {
    assert.match(page, /AuthProviderGrid/);
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
