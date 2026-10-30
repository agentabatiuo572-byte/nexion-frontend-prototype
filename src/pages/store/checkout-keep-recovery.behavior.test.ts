import { ref } from "vue";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./checkout.vue?raw";
import { parsePendingKeepCommand } from "@/lib/keep-command-recovery";
import { validatePromotionItems } from "@/api/promotion-api";
import { voucherEntryContext } from "@/lib/promotion-entry";
import { zh } from "@/i18n/messages/zh";

const ast = ts.createSourceFile("checkout.ts", parse(source).descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node)
  && ["recoverKeepBeforePurchase", "resumeServerOrder"].includes(node.name?.text ?? ""));
const loadNode = ast.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
  && node.expression.expression.getText(ast) === "onLoad") as ts.ExpressionStatement;
const load = (loadNode.expression as ts.CallExpression).arguments[0].getText(ast);
const code = ts.transpileModule(`let serverOrderRecovery=null;${functions.map(node => node.getText(ast)).join("\n")};const load=${load};return {load,resumeServerOrder,recoverKeepBeforePurchase};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function screen(stored: unknown, target = "stellarbox-s1") {
  const productId = ref(target), scope = { accountKey: "user:7", accountEpoch: 1, productNo: target, generation: 1 };
  const deps = { app: { accountKey: "user:7" }, remoteApiEnabled: true, productId, keepCheckoutTarget: ref(null), keepCheckoutReadError: ref(false),
    readPendingKeepCommand: (account: string, sku: string) => parsePendingKeepCommand(stored, account, sku),
    tradein: { showKeepRecovery: vi.fn(), appliedTradein: null }, promotionRoute: ref(null), voucherEntryContext, validatePromotionItems,
    takeNavigationQuery: () => "", URLSearchParams, t: ref(zh), toast: { warn: vi.fn() }, navTo: vi.fn(), navReplace: vi.fn(),
    captureCheckoutRoute: () => scope, isCurrentCheckoutRoute: () => true, isCurrentAccountScope: () => true,
    resumePendingRemoteTradein: vi.fn(async () => false), recoverCheckoutOrder: vi.fn(async () => false), orderApi: { list: vi.fn() },
    trialCheckoutSource: false, resolveTrialCheckoutProductId: (id: string) => id, resumeSessionId: null,
    beginCheckoutRoute: () => scope, checkoutRouteInitialized: false, activeCheckoutLoad: null, quantityReady: ref(false),
    refreshProductCatalog: vi.fn(async () => true), refreshServerProductPhase: vi.fn(async () => true),
    getProduct: () => ({ id: target, productType: "DEVICE", inventoryMode: "FINITE", stock: 10 }),
    trialQuoteAt: () => ({ applied: false }), mockServerNow: () => 0, isProductAvailable: () => true, phase: ref("P1"),
    refreshPurchaseEligibility: vi.fn(async () => "eligible"), resumePendingSession: vi.fn(), fireTradeinIntercept: vi.fn(async () => false),
    deviceE3Api: { eligibility: vi.fn(async () => ({ eligible: false, sources: [] })), capacityQuote: vi.fn(async () => ({ decision: "CAPACITY_AVAILABLE" })) } };
  const view = new Function("deps", `with(deps){${code}}`)(deps);
  return { ...deps, ...view };
}
const intent = "keep|1156|stellarbox-s1|1|1299|1299|6";
it("restores KEEP before catalog or replacement eligibility even with no eligible source and available capacity", async () => {
  const page = screen({ "user:7": { commands: { [intent]: "original-key" } } });
  await page.load({ product: "stellarbox-s1" });
  expect(page.keepCheckoutTarget.value).toBe("stellarbox-s1");
  expect(page.tradein.showKeepRecovery).toHaveBeenCalledExactlyOnceWith("stellarbox-s1");
  expect(page.refreshProductCatalog).not.toHaveBeenCalled();
  expect(page.fireTradeinIntercept).not.toHaveBeenCalled();
  expect(page.deviceE3Api.eligibility).not.toHaveBeenCalled();
  expect(page.deviceE3Api.capacityQuote).not.toHaveBeenCalled();
});
it("delegates items checkout to the owning Promotion session before any new-purchase KEEP gate", async () => {
  const page = screen({ "user:7": { commands: { [intent]: "original-key" } } });
  await page.load({ items: JSON.stringify([{ productNo: "stellarbox-s1", quantity: 2 }]) });
  expect(page.promotionRoute.value).toMatchObject({items:[{productNo:"stellarbox-s1",quantity:2}]});
  expect(page.tradein.showKeepRecovery).not.toHaveBeenCalled();
});
it.each(["malformed", [], { [intent]: "one", "keep|1157|stellarbox-s1|1|1399|1399|6": "two" }])("closes new checkout for invalid or ambiguous history: %s", async commands => {
  const page = screen({ "user:7": { commands } });
  await page.load({ product: "stellarbox-s1" });
  expect(page.keepCheckoutReadError.value).toBe(true);
  expect(page.keepCheckoutTarget.value).toBe("stellarbox-s1");
  expect(page.fireTradeinIntercept).not.toHaveBeenCalled();
});
it("permits a normal fresh purchase only after the recovered key is removed, and leaves unrelated SKUs usable", async () => {
  const commands: Record<string,string> = { [intent]: "original-key" };
  const stored = { "user:7": { commands } };
  const unrelated = screen(stored, "stellarbox-pro"); await unrelated.load({ product: "stellarbox-pro" });
  expect(unrelated.keepCheckoutTarget.value).toBeNull(); expect(unrelated.fireTradeinIntercept).toHaveBeenCalledOnce();
  delete commands[intent];
  const next = screen(stored); await next.load({ product: "stellarbox-s1" });
  expect(next.keepCheckoutTarget.value).toBeNull(); expect(next.fireTradeinIntercept).toHaveBeenCalledOnce();
});
