import { expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import page from "./wallet.vue?raw";
it.each([["zh",zh,"已批准，待转账"],["en",en,"Approved, transfer pending"],["vi",vi,"Đã chấp thuận, chờ chuyển tiền"]] as const)("%s separates review approval from transfer completion",(_name,locale,label)=>{
  expect(locale.wallet.reviewPassed).toBe(label);
  expect(page).toContain('"review-passed": t.value.wallet.reviewPassed');
  expect(page).toContain('confirmed: t.value.wallet.confirmed');
  expect(locale.wallet.reviewPassed).not.toBe(locale.wallet.confirmed);
});
