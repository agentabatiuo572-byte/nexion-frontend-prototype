import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const selector = read("src/components/country-code-sheet.vue");
const phoneRules = read("src/auth/phone-number.ts");
const login = read("src/pages/login/login.vue");
const register = read("src/pages/register/register.vue");

test("only +84 and +86 remain selectable while every other country stays visible and disabled", () => {
  assert.match(selector, /v-for="\(item, index\) in COUNTRIES"/);
  assert.match(selector, /case "CN": return t\.value\.countryCodes\.china/);
  assert.match(phoneRules, /PHONE_COUNTRIES[^=]*=\s*\[\s*\{ iso: "VN", dialCode: "\+84"[^\n]*selectable: true/);
  assert.match(phoneRules, /\{ iso: "CN", dialCode: "\+86"[^\n]*selectable: true/);
  assert.equal((phoneRules.match(/dialCode:\s*"\+/g) ?? []).length, 16);
  assert.equal((phoneRules.match(/selectable:\s*true/g) ?? []).length, 2);
  assert.equal((phoneRules.match(/selectable:\s*false/g) ?? []).length, 14);
  assert.match(selector, /:aria-disabled="!item\.selectable"/);
  assert.match(selector, /:tabindex="item\.selectable \? 0 : -1"/);
  assert.match(selector, /cc-row--disabled/);
  assert.match(selector, /@click="select\(item\)"/);
  assert.match(selector, /if \(!item\.selectable\) return/);
  for (const page of [login, register]) {
    assert.match(page, /<CountryCodeSheet :open="showCountries" :model-value="country" @select="pickCountry"/);
    assert.match(page, /ref\(dialCodeForLocale\(useLocaleStore\(\)\.code\)\)/);
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
