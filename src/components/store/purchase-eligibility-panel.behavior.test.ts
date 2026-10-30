import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { expect, it } from "vitest";
import source from "./purchase-eligibility-panel.vue?raw";
import { rackPurchaseEligibility } from "./purchase-eligibility.fixture";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { formatComputePoints } from "@/i18n/compute-points";
import { resolvePurchaseEligibilityMessage } from "@/lib/purchase-eligibility-copy";
import type { PurchaseEligibilitySnapshot } from "@/api/purchase-eligibility-api";

const descriptor = parse(source).descriptor;
const ast = ts.createSourceFile("panel.ts", descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node)
  || ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration =>
    ["message", "statusText"].includes(declaration.name.getText(ast))));
const code = ts.transpileModule(selected.map(node => node.getText(ast)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const render = new Function("Vue", compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
}).code)(Vue);
async function show(snapshot: PurchaseEligibilitySnapshot | null = rackPurchaseEligibility,
  locale: "zh" | "en" | "vi" = "zh", hidden = false, status = "ready") {
  const props = { snapshot, status };
  const copy = { zh, en, vi }[locale];
  const deps = { props, computed: Vue.computed, t: Vue.ref(copy), locale: { code: locale },
    visibility: { hidden, mask: (value: unknown) => hidden ? "•••" : String(value) },
    resolvePurchaseEligibilityMessage, fmt, formatComputePoints };
  const bindings = new Function(...Object.keys(deps), `${code}; return {message,statusText,isQuota,conditionLabel,conditionAmount,conditionValues,conditionRatio};`)(...Object.values(deps));
  return renderToString(Vue.createSSRApp({ render, components: {
    QuotaConditionBar: { props: ["label", "valueText"], render() { return Vue.h("span", { role: "progressbar", "aria-label": this.label, "aria-valuetext": this.valueText }); } },
  }, setup: () => Vue.proxyRefs({ ...deps, ...props, ...bindings }) }));
}

it("renders the captured live Rack conditions without substituting PRD defaults or currency units", async () => {
  const html = await show();
  expect(html).toContain("10 人 / 8 人");
  expect(html).toContain("118,526 算力点 / 800,000 算力点");
  expect(html).toContain("还差 681,474 算力点");
  expect(html).toContain("1 台 / 80 台"); expect(html).toContain("剩余 79 台");
  expect(html).toContain(zh.quota.unlockAll);
  expect(html).not.toContain("20,000"); expect(html).not.toContain("$800");
  expect(html).not.toContain("还差 79");
});
it("keeps EITHER thresholds separate from the mandatory quota and respects policy success", async () => {
  const snapshot = structuredClone(rackPurchaseEligibility) as PurchaseEligibilitySnapshot;
  snapshot.eligible = true; snapshot.decisionCode = "ELIGIBLE";
  snapshot.policies[1].mode = "EITHER"; snapshot.policies[1].eligible = true; snapshot.policies[1].decisionCode = "ELIGIBLE";
  const html = await show(snapshot);
  expect(html).toContain(zh.tradein.purchaseEligible); expect(html).toContain(zh.quota.unlockEither);
  expect(html).not.toContain(zh.tradein.purchaseUnmet);
  expect(html.indexOf(zh.tradein.purchaseConditions.monthlyQuota)).toBeGreaterThan(html.indexOf("681,474"));
  snapshot.eligible = false; snapshot.decisionCode = "F4B_MONTHLY_QUOTA_EXHAUSTED";
  snapshot.policies[1].eligible = false; snapshot.policies[1].decisionCode = "F4B_MONTHLY_QUOTA_EXHAUSTED";
  snapshot.policies[1].conditions[2] = { kind: "monthlyQuota", required: 80, current: 80, gap: 0, met: false };
  const full = await show(snapshot);
  expect(full).toContain(zh.tradein.purchaseQuotaDepleted); expect(full).toContain("剩余 0 台");
});
it.each(["zh", "en", "vi"] as const)("renders localized condition units in %s", async locale => {
  const copy = { zh, en, vi }[locale];
  const html = await show(rackPurchaseEligibility, locale);
  expect(html).toContain(copy.tradein.purchaseHardwarePolicy);
  expect(html).toContain(formatComputePoints(681474, locale));
  expect(html).toContain(fmt(copy.tradein.purchasePeople, { n: 10 }));
});
it("uses level differences for a rank gap and keeps unknown reads out of the progress display", async () => {
  const snapshot = structuredClone(rackPurchaseEligibility) as PurchaseEligibilitySnapshot;
  snapshot.policies[0] = { policy: "E1", eligible: false, decisionCode: "PURCHASE_GATE_NOT_MET", mode: "ALL",
    conditions: [{ kind: "rank", required: 4, current: 1, gap: 3, met: false }] };
  expect(await show(snapshot)).toContain("还差 3 级");
  const error = await show(null, "zh", false, "error");
  expect(error).toContain(zh.store.purchaseEligibilityError); expect(error).not.toContain("progressbar");
});
it("masks account-specific current values and gaps and removes progress in privacy mode", async () => {
  const html = await show(rackPurchaseEligibility, "zh", true);
  expect(html).not.toContain("118,526"); expect(html).not.toContain("681,474");
  expect(html).not.toContain("progressbar"); expect(html).toContain("800,000");
});
it("suppresses policy facts when a combined grant contradicts or cannot confirm its policies", async () => {
  const snapshot = structuredClone(rackPurchaseEligibility) as PurchaseEligibilitySnapshot;
  snapshot.eligible = true; snapshot.decisionCode = "ELIGIBLE";
  const html = await show(snapshot);
  expect(html).toContain(zh.store.purchaseEligibilityError);
  expect(html).not.toContain("118,526"); expect(html).not.toContain("progressbar");
  expect(html).not.toContain(zh.tradein.purchaseMet);
});
