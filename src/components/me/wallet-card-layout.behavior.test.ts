import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./wallet-card.vue?raw";
import { formatFinanceAmount } from "@/lib/finance-amount-display";
import { fmt, fmtMoney, openSlotsTemplate } from "@/i18n/format";
import { remoteAuthorityStatus } from "@/lib/remote-authority-display";
import { auditUiCopy } from "@/i18n/audit-ui";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const dictionaries = { zh, en, vi: vietnamese };
const code = ts.transpileModule(compileScript(parse(source).descriptor, { id: "wallet-details", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text"].includes(tag) } },
}).content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function wallet(language: keyof typeof dictionaries) {
  const visibility = Vue.reactive({ hidden: false, mask: (value: string | number) => visibility.hidden ? "••••" : String(value) });
  const app = Vue.reactive({ remoteFleetHasSnapshot: true, remoteFleetStatus: "ready", remoteWalletReceiptHasSnapshot: false,
    user: { usdtBalance: 10297.08, nexBalance: 4268.32, earningBuckets: { pendingReviewUsdt: 0, bonusLockedUsdt: 0 } },
    visibleDevices: [], activeSlotCount: 0, slotCap: 6 });
  const release = Vue.ref({ serverCanonical: true, buckets: { pending_review: 0, bonus_locked: 0 } });
  const status = Vue.ref("ready"), hasSnapshot = Vue.ref(true);
  const market = Vue.reactive({ isMockMode: false, remoteReady: true, nexPriceUSDT: .124 });
  const imports: Record<string, unknown> = {
    "@/store/data-visibility": { useDataVisibility: () => visibility },
    "@/components/ui/data-visibility-toggle.vue": { default: { render: () => null } },
    vue: Vue, "@/lib/finance-amount-display": { formatFinanceAmount }, "@/lib/route": { navTo: vi.fn(), navReset: vi.fn() },
    "@/i18n/use-t": { useT: () => Vue.ref(dictionaries[language]) }, "@/i18n/audit-ui": { useAuditUiCopy: () => Vue.ref(auditUiCopy[language]) },
    "@/i18n/format": { fmt, fmtMoney, openSlotsTemplate }, "@/store/app": { useApp: () => app },
    "@/store/earning-release": { earningsReleaseSnapshot: release, earningsReleaseStatus: status, earningsReleaseHasSnapshot: hasSnapshot },
    "@/store/bills": { useBills: () => ({ summaryStatus: "ready", summary: { monthBillCount: 0 } }) },
    "@/store/market": { useMarket: () => market }, "@/api/runtime": { remoteApiEnabled: true, fundsServerEnabled: true },
    "@/lib/remote-authority-display": { remoteAuthorityStatus }, "@/store/free-trial": { trialReservesSlotNow: () => false, useFreeTrial: () => ({ authorityStatus: "unknown" }) },
    "@/components/me/section-header.vue": { default: { render: () => null } },
    "@/components/me/wallet-action-btn.vue": { default: { props: ["href"], setup: (props: { href: string }) => () => Vue.h("view", { "data-wallet-route": props.href }) } },
  };
  const exports = {} as { default: Vue.Component };
  new Function("require", "exports", code)((id: string) => imports[id], exports);
  return { app, visibility, release, status, hasSnapshot, market, html: (compact = true) => renderToString(Vue.createSSRApp(exports.default, { compact })) };
}
it.each(["zh", "en", "vi"] as const)("keeps the compact %s wallet free of inserted bucket rows through zero/pending/failure/recovery", async language => {
  const w = wallet(language);
  for (const state of ["ready", "loading", "error", "ready"]) {
    w.status.value = state;
    w.release.value.buckets = { pending_review: state === "ready" ? 0 : 4.5, bonus_locked: 7 };
    const html = await w.html();
    expect(html).not.toContain("nx-wallet-pending");
    expect(html).toContain("nx-wallet-valuation");
    expect(html).toContain("nx-wallet-actions");
  }
  expect(w.app.user.usdtBalance).toBe(10297.08);
});
it.each(["zh", "en", "vi"] as const)("keeps noncompact %s bucket amounts and unknown authority truthful", async language => {
  const w = wallet(language);
  expect(await w.html(false)).not.toContain("nx-wallet-pending");
  w.release.value.buckets = { pending_review: 4.5, bonus_locked: 7 };
  expect(await w.html(false)).toContain(auditUiCopy[language].confirming + " $4.50");
  expect(await w.html(false)).toContain(auditUiCopy[language].locked + " $7.00");
  w.status.value = "loading";
  expect(await w.html(false)).toContain(auditUiCopy[language].locked + " $7.00");
  w.status.value = "error"; w.market.remoteReady = false;
  const failed = await w.html(false);
  expect(failed).toContain(auditUiCopy[language].confirming + " --");
  expect(failed).toContain(auditUiCopy[language].locked + " --");
  expect(failed).toContain("1 UVT = — USDT");
  expect(failed).not.toContain("$4.50"); expect(failed).not.toContain("$0.00");
  expect(w.app.user.usdtBalance).toBe(10297.08);
});
it("preserves unknown money and quote authority plus the existing navigation destinations", async () => {
  const w = wallet("en"); w.app.remoteFleetHasSnapshot = false; w.app.remoteFleetStatus = "error";
  w.hasSnapshot.value = false; w.status.value = "error"; w.market.remoteReady = false;
  const html = await w.html();
  expect(html).not.toContain("10,297.08"); expect(html).not.toContain("4,268.32 UVT");
  expect(html).toContain("≈ — USDT · 1 UVT = — USDT");
  for (const route of ["wallet-topup", "wallet-withdraw-method", "wallet-exchange"]) expect(html).toContain('data-wallet-route="/pages/me/' + route + '"');
});


it("conceals wallet amount, UVT and valuation in rendered text and accessibility labels", async () => {
  const w = wallet("zh");
  expect(await w.html()).toContain("10,297");
  w.visibility.hidden = true;
  const hidden = await w.html();
  for (const amount of ["10,297", "4,268.32", "529.27"]) expect(hidden).not.toContain(amount);
  expect(hidden).toContain("•••• UVT");
  expect(hidden).toContain("≈ •••• USDT");
  expect(hidden).toContain("1 UVT = 0.124 USDT");
  expect(w.app.user.usdtBalance).toBe(10297.08);
  w.visibility.hidden = false;
  expect(await w.html()).toContain("10,297");
});
