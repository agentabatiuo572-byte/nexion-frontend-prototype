import { computed, ref } from "vue";
import { expect, it } from "vitest";
import ts from "typescript";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import page from "./wallet.vue?raw";

const start = page.indexOf("const withdrawalRowSub = computed");
const end = page.indexOf("function fmtTime(", start);
const code = ts.transpile(page.slice(start, end), { target: ts.ScriptTarget.ES2022 });
const locales = [["zh", zh], ["en", en], ["vi", vi]] as const;
function view(messages: typeof en | typeof zh | typeof vi) {
  const t = ref(messages);
  const latestWithdrawal = ref<{ status: string; network: string; submittedAt: number } | null>(null);
  const sub = new Function("computed", "latestWithdrawal", "t", "fmtTime",
    `${code}; return withdrawalRowSub;`)(computed, latestWithdrawal, t, () => "time");
  return { t, latestWithdrawal, sub };
}

it.each(locales)("%s wallet distinguishes bank SENT from all supported on-chain SENT rows", (_name, messages) => {
  const { latestWithdrawal, sub } = view(messages);
  latestWithdrawal.value = { status: "sent", network: "BANK-VND", submittedAt: 1 };
  expect(sub.value).toBe(`${messages.bankWithdrawal.processing} · time`);
  expect(sub.value).not.toContain(messages.wallet.sent);
  for (const network of ["USDT-TRC20", "USDT-BEP20", "USDT-ERC20"]) {
    latestWithdrawal.value = { status: "sent", network, submittedAt: 1 };
    expect(sub.value).toBe(`${messages.wallet.sent} · time`);
  }
});

it.each(locales)("%s preserves other withdrawal stages without claiming bank arrival", (_name, messages) => {
  const { latestWithdrawal, sub } = view(messages);
  const labels = { submitted: messages.wallet.submitted, "review-pending": messages.wallet.reviewPending,
    "review-passed": messages.wallet.reviewPassed, processing: messages.wallet.processing, confirmed: messages.wallet.confirmed,
    "review-rejected": messages.wallet.reviewRejected, frozen: messages.wallet.statusFrozen,
    "address-invalid": messages.wallet.statusAddressInvalid, "tx-failed": messages.wallet.statusTxFailed, refunded: messages.wallet.statusRefunded };
  for (const [status, label] of Object.entries(labels)) {
    latestWithdrawal.value = { status, network: "BANK-VND", submittedAt: 1 };
    expect(sub.value).toBe(`${label} · time`);
  }
});

it("retranslates the current bank row and clears its label when account state removes the row", () => {
  const { t, latestWithdrawal, sub } = view(en);
  expect(sub.value).toBe("");
  latestWithdrawal.value = { status: "sent", network: "BANK-VND", submittedAt: 1 };
  for (const [, messages] of locales) {
    t.value = messages;
    expect(sub.value).toBe(`${messages.bankWithdrawal.processing} · time`);
  }
  latestWithdrawal.value = null;
  expect(sub.value).toBe("");
});
