import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const selector = read("src/components/country-code-sheet.vue");
const login = read("src/pages/login/login.vue");
const register = read("src/pages/register/register.vue");

test("China +86 is a visible, keyboard-selectable country row shared by login and registration", () => {
  assert.match(selector, /v-for="\(item, index\) in COUNTRIES"/);
  assert.match(selector, /\{ code: "\+86", name: t\.value\.countryCodes\.china \}/);
  assert.match(selector, /@click="select\(item\.code\)"/);
  assert.match(selector, /@keydown="onRowKeydown\(\$event, item\.code, index\)"/);
  for (const page of [login, register]) {
    assert.match(page, /<CountryCodeSheet :open="showCountries" :model-value="country" @select="pickCountry"/);
    assert.match(page, /country\.value = c;/);
  }
});

test("China is localized in every supported country selector locale", () => {
  for (const [file, label] of [
    ["src/i18n/messages/en.ts", "China"],
    ["src/i18n/messages/zh.ts", "中国"],
    ["src/i18n/messages/vi.ts", "Trung Quốc"],
  ]) {
    assert.match(read(file), new RegExp(`china:\\s*"${label}"`));
  }
});
