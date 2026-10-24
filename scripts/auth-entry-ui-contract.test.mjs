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
  assert.match(countrySheet, /:aria-disabled="!item\.selectable"/);
  assert.match(countrySheet, /if \(!item\.selectable\) return;/);
  assert.match(countrySheet, /cc-row__iso/);
  assert.match(countrySheet, /item\.iso/);
});

test("supported auth providers share a local identity flow and stable visible icons", async () => {
  const [login, register, providerGrid, providerFlow] = await Promise.all([
    read("src/pages/login/login.vue"),
    read("src/pages/register/register.vue"),
    read("src/components/auth-provider-grid.vue"),
    read("src/components/third-party-auth.vue"),
  ]);
  for (const page of [login, register]) {
    assert.match(page, /<ThirdPartyAuth/);
    assert.match(page, /data-testid="auth-runtime-label"/);
    assert.doesNotMatch(page, /const oauth\s*=/);
    assert.doesNotMatch(page, /oauthDisplayLabel/);
  }
  assert.match(providerFlow, /<AuthProviderGrid[^>]*:providers="\['Google', 'Apple', 'Telegram'\]"/);
  assert.match(providerFlow, /@select="start"/);
  assert.match(providerFlow, /selectIdentity\(subject\)/);
  for (const provider of ["Passkey", "Google", "Apple", "Telegram"]) {
    assert.match(providerGrid, new RegExp(`data-provider="${provider}"`));
  }
  assert.doesNotMatch(providerGrid, /[·•]\s*Mock/);
  assert.doesNotMatch(providerGrid, /(?:stroke|fill)="white"/);
  assert.match(providerGrid, /grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(providerGrid, /focus-visible/);
});
