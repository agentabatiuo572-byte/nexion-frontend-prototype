import { describe, expect, it } from "vitest";
// @ts-expect-error Node-only SFC contract; the application tsconfig omits Node globals.
import { readFileSync } from "node:fs";
import { compileScript, parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import ts from "typescript";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { riskReasonLines, terminalReasonLine } from "@/lib/risk-reason-text";
import * as trackingRead from "./wallet-withdraw-tracking-read";

const source = readFileSync(new URL("./wallet-withdraw-tracking.vue", import.meta.url), "utf8");
const { descriptor } = parse(source, { filename: "wallet-withdraw-tracking.vue" });
const script = compileScript(descriptor, { id: "withdrawal-tracking-copy" });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function actualPage(dictionary: typeof zh | typeof en | typeof vi) {
  const now = Date.now();
  const withdrawal = Vue.reactive({
    id: "WD-COPY", status: "frozen", riskRoute: "freeze", riskReasons: [],
    amount: 100, network: "USDT-TRC20", address: "T-example", submittedAt: now - 86_400_000,
    estimatedCompletion: now + 86_400_000, confirmedAt: now - 60_000, fee: { actualFeeUsd: 1 },
  });
  const imports: Record<string, unknown> = {
    vue: { ...Vue, onUnmounted: () => {} },
    "@dcloudio/uni-app": { onLoad: () => {}, onShow: () => {}, onHide: () => {} },
    "@/api/runtime": { remoteApiEnabled: true, sessionVault: { read: () => null, revision: () => 0 }, withdrawalApi: {} },
    "@/api/order-api": { captureRuntimeRevision: () => ({ epoch: 0 }), subscribeRuntimeRevision: () => () => {} },
    "@/api/withdrawal-api": {},
    "@/store/server-time": { mockServerNow: () => now },
    "@/store/withdrawal-eligibility-core": { platformDayIndex: () => 1 },
    "@/store/withdrawal-eligibility": { dailyLimitStatus: () => ({ reached: false, resetAt: now + 86_400_000 }) },
    "@/i18n/use-t": { useT: () => Vue.ref(dictionary) },
    "@/i18n/format": { fmt },
    "@/store/app": { useApp: () => ({ accountKey: "user:7", accountBindingEpoch: 1, withdrawals: [withdrawal], primaryWithdrawal: withdrawal }) },
    "@/lib/route": { navTo: () => {}, navReplace: async () => true },
    "@/lib/risk-reason-text": { riskReasonLines, terminalReasonLine },
    "./wallet-withdraw-tracking-read": trackingRead,
  };
  const require = (id: string) => {
    if (id in imports) return imports[id];
    if (id.endsWith(".vue")) return { default: {} };
    throw new Error(`Unexpected tracking import: ${id}`);
  };
  const module = { exports: {} as { default: { setup: (props: object, context: object) => Record<string, Vue.Ref> } } };
  new Function("require", "module", "exports", code)(require, module, module.exports);
  const scope = Vue.effectScope();
  const page = scope.run(() => module.exports.default.setup({}, { expose() {} }))!;
  return { withdrawal, page, stop: () => scope.stop() };
}

describe.each(Object.entries({ zh, en, vi }))("withdrawal tracking copy in %s", (_locale, dictionary) => {
  it.each(["freeze", "manual", "delay"])("replaces historical %s guidance after confirmed arrival", route => {
    const { withdrawal, page, stop } = actualPage(dictionary);
    try {
      withdrawal.riskRoute = route;
      withdrawal.status = route === "freeze" ? "frozen" : "review-pending";
      expect(page.routeHeld.value).toBe(true);
      expect(page.needsSupport.value).toBe(true);
      expect(page.etaSub.value).toBe(route === "freeze" ? dictionary.wallet.routeHeldFrozenBody : dictionary.wallet.withdrawRouteHeldSub);

      withdrawal.status = "confirmed";
      expect(page.doneUpTo.value).toBe(5);
      expect(page.showSpinner.value).toBe(false);
      expect(page.routeHeld.value).toBe(false);
      expect(page.isFrozenHold.value).toBe(false);
      expect(page.needsSupport.value).toBe(false);
      expect(page.etaTitle.value).toBe(dictionary.wallet.trackEtaDone);
      expect(page.etaSub.value).toContain(dictionary.wallet.trackArrivedAt.split("{time}")[0]);
      expect(page.etaSub.value).not.toContain("{time}");
      expect(page.etaSub.value).not.toBe(dictionary.wallet.routeHeldFrozenBody);
      expect(page.etaSub.value).not.toBe(dictionary.wallet.withdrawRouteHeldSub);
    } finally { stop(); }
  });
  it("keeps failed withdrawal guidance and its support action", () => {
    const { withdrawal, page, stop } = actualPage(dictionary);
    try {
      withdrawal.status = "tx-failed";
      expect(page.etaSub.value).toBe(dictionary.wallet.trackFailedBody);
      expect(page.needsSupport.value).toBe(true);
      expect(page.showSpinner.value).toBe(false);
    } finally { stop(); }
  });
});
