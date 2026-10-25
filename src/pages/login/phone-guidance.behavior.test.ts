import { computed, ref } from "vue";
import { expect, it, vi } from "vitest";
import ts from "typescript";
import { phoneFormatHint, sanitizePhoneInput, validateNationalPhone, isSelectablePhoneDialCode } from "@/auth/phone-number";
import { fmt } from "@/i18n/format";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import source from "./login.vue?raw";

const ast = ts.createSourceFile("login.ts", source.split('<script setup lang="ts">')[1].split("</script>")[0], ts.ScriptTarget.Latest, true);
const names = ["phoneClean", "phoneOk", "invalidPhoneMessage", "phoneFormatMessage", "pwdOk", "primaryDisabledReason", "canPrimary"];
const functions = ["goSendCode", "pickCountry", "signInWithPassword"];
const selected = ast.statements.filter(s => ts.isVariableStatement(s) ? s.declarationList.declarations.some(d => names.includes(d.name.getText(ast)))
  : ts.isFunctionDeclaration(s) && functions.includes(s.name?.text ?? ""));
const code = ts.transpileModule(selected.map(s => s.getText(ast)).join("\n") + `\nreturn { ${[...names, ...functions].join(", ")} };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
it.each([zh, en, vietnamese])("uses the selected country's one phone rule in login and reset", async messages => {
  const country = ref("+86"), phone = ref("123"), mode = ref("password"), error = ref<string | null>(null);
  const requestCode = vi.fn(), invalidateOtpFlow = vi.fn();
  const context = { country, phone, mode, error, computed, fmt, phoneFormatHint, sanitizePhoneInput, validateNationalPhone, isSelectablePhoneDialCode,
    t: ref(messages), password: ref(""), step: ref(1), loading: ref(false), signInTimer: undefined,
    showCountries: ref(false), requestCode, invalidateOtpFlow };
  const page = new Function(...Object.keys(context), code)(...Object.values(context));
  const cnError = fmt(messages.countryCodes.phoneInvalidHint, { example: "138 0013 8000" });
  expect(page.phoneFormatMessage.value).toBe(cnError);
  expect(page.primaryDisabledReason.value).toBe(cnError);
  page.goSendCode(); expect(error.value).toBe(cnError);
  await page.signInWithPassword(); expect(error.value).toBe(cnError);
  expect(requestCode).not.toHaveBeenCalled();
  page.pickCountry("+84"); expect(error.value).toBeNull();
  const vnError = fmt(messages.countryCodes.phoneInvalidHint, { example: "0912 345 678" });
  mode.value = "reset";
  expect(page.phoneFormatMessage.value).toBe(vnError);
  expect(page.primaryDisabledReason.value).toBe(vnError);
  phone.value = "0912345678";
  expect(page.phoneOk.value).toBe(true); expect(page.canPrimary.value).toBe(true);
  expect(page.phoneFormatMessage.value).toBe(fmt(messages.countryCodes.phoneExampleHint, { example: "0912 345 678" }));
  page.pickCountry("+1"); expect(country.value).toBe("+84");
  expect(validateNationalPhone("+1", "4155552671")).toBe(false);
  page.pickCountry("+86"); phone.value = "13800138000";
  expect(page.phoneOk.value).toBe(true);
  phone.value = "123456"; expect(page.phoneOk.value).toBe(false);
});
