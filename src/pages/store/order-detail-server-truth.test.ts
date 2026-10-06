import { compile } from "@vue/compiler-dom";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import ts from "typescript";
import * as Vue from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalOrder, CanonicalOrderList } from "@/api/order-api";
import { advanceRuntimeRevision, captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { nexGridBrandText } from "@/lib/brand-copy";
import { formatTrialDateTime } from "@/lib/trial-date";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import source from "./order-detail.vue?raw";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  productCatalogApi: { catalog: vi.fn() },
  orderApi: { list: vi.fn(), cancel: vi.fn(), pay: vi.fn() },
}));
vi.mock("@/api/runtime", () => remote);
const { useOrders, timelineFor } = await import("@/store/orders");

const { descriptor } = parse(source, { filename: "order-detail.vue" });
const script = compileScript(descriptor, { id: "order-detail-server-truth" });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const render = new Function("Vue", compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true,
}).code)(Vue);
const scopes: Vue.EffectScope[] = [];
const copies = [
  ["EN", en, "Activated in Cloud-Global · earnings depend on completed tasks and settlement"],
  ["ZH", zh, "已在 Cloud-Global 激活 · 收益以任务完成及结算结果为准"],
  ["VI", vietnamese, "Đã kích hoạt tại Cloud-Global · thu nhập phụ thuộc vào nhiệm vụ hoàn tất và quyết toán"],
] as const;

beforeEach(() => {
  setActivePinia(createPinia());
  advanceRuntimeRevision(null);
  remote.orderApi.list.mockReset();
  remote.orderApi.cancel.mockReset();
  remote.orderApi.pay.mockReset();
});
afterEach(() => { for (const scope of scopes.splice(0)) scope.stop(); });

function canonical(dataCenter: string | null, status: CanonicalOrder["canonicalStatus"] = "activated"): CanonicalOrder {
  return {
    orderNo: "ORD-SERVER-TRUTH", productId: 10, productNo: "cloud-share", productName: "Cloud Share ×1",
    quantity: 1, subtotalUsdt: 19.9, unitPriceUsdt: 19.9, discountUsdt: 0, amountUsdt: 19.9,
    paymentMethod: "WALLET", paymentStatus: "PAID", orderStatus: "COMPLETED", activationStatus: "ACTIVATED",
    canonicalStatus: status, orderType: "SINGLE", placedAt: 1000, expiresAt: null,
    paidAt: 2000, activatedAt: status === "activated" ? 3000 : null, refundedAt: null,
    refundAmountUsdt: null, refundChannel: null, refundBillNo: null, dataCenter,
    tradeinNo: null, sourceDeviceId: null, targetDeviceId: null, targetDeviceInstanceNo: null, itemCount: null,
  };
}

async function detail(dataCenter: string | null, copy = en, status: CanonicalOrder["canonicalStatus"] = "activated") {
  const row = canonical(dataCenter, status);
  const response: CanonicalOrderList = {
    source: "server", sourceEnvironment: "PRODUCTION", runId: null, nextCursor: null, orders: [row],
  };
  remote.orderApi.list.mockResolvedValueOnce(response);
  const orders = useOrders();
  orders.bindAccount("user:server-truth");
  await orders.refreshRemote();
  let onLoad: ((options: Record<string, string>) => void) | undefined;
  const copyRef = Vue.ref(copy);
  const navTo = vi.fn();
  const load = (id: string) => {
    if (id === "vue") return { ...Vue, onUnmounted: Vue.onScopeDispose };
    if (id === "@dcloudio/uni-app") return {
      onLoad: (callback: typeof onLoad) => { onLoad = callback; }, onShow: () => {}, onHide: () => {}, onUnload: () => {},
    };
    if (id === "@/store/orders") return { useOrders: () => orders, timelineFor };
    if (id === "@/store/app") return { useApp: () => ({}) };
    if (id === "@/store/auth") return { useAuth: () => ({ isAuthenticated: true, accountId: "user:server-truth" }) };
    if (id === "@/i18n/use-t") return { useT: () => copyRef };
    if (id === "@/i18n/format") return { dateLocale: () => "en-US" };
    if (id === "@/lib/brand-copy") return { nexGridBrandText };
    if (id === "@/lib/trial-date") return { formatTrialDateTime };
    if (id === "@/store/free-trial") return { trialReservesSlotNow: () => false };
    if (id === "@/store/ui" || id === "@/api/errors" || id === "@/lib/account-scope") return {};
    if (id === "@/composables/use-page-header") return { useSetPageHeader: () => {} };
    if (id === "@/lib/route") return { navTo };
    if (id === "@/api/runtime") return remote;
    if (id === "@/api/order-api") return { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision };
    if (id.endsWith(".vue")) return { __esModule: true, default: {} };
    throw new Error(`Unexpected order-detail script import: ${id}`);
  };
  const exports = {};
  const scope = Vue.effectScope();
  scopes.push(scope);
  const view = scope.run(() => new Function("require", "module", "exports", "setInterval", "clearInterval",
    `${code}; return module.exports.default.setup({}, { expose() {} });`,
  )(load, { exports }, exports, () => 0, () => {}));
  onLoad!({ id: row.orderNo });
  return { view: { ...view }, orders, row, copyRef, navTo };
}

async function rendered(view: Awaited<ReturnType<typeof detail>>["view"]) {
  const app = Vue.createSSRApp({ render, setup: () => Vue.proxyRefs(view) });
  app.component("AppChassis", Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("main", slots.default?.()) }));
  app.component("DetailRow", Vue.defineComponent({ props: ["label", "value"], setup: (props) => () => Vue.h("div", `${props.label}: ${props.value}`) }));
  return renderToString(app);
}

describe("BUG 381 canonical order data-center and activation truth", () => {
  it.each(["Cloud-Global", "Frankfurt DC", "Singapore DC", "Other Region", "Cloud-Frankfurt", null, ""])(
    "preserves the canonical data-center %s instead of inferring a region", async (dataCenter) => {
      const { orders, row } = await detail(dataCenter);
      expect(orders.orders[0].dataCenter).toBe(dataCenter);
      expect(orders.orders[0]).toMatchObject({ status: row.canonicalStatus, total: 19.9, quantity: 1, paidAt: 2000, activatedAt: 3000 });
      expect(orders.orders[0].timeline.map((event) => event.status)).toEqual(["placed", "paid", "activated"]);
    },
  );

  for (const [language, copy, expectedHint] of copies) {
    it(`${language} renders Cloud-Global and conditional earnings without claiming income has begun`, async () => {
      const { view, orders, navTo } = await detail("Cloud-Global", copy);
      const html = await rendered(view);
      expect(html).toContain(expectedHint);
      expect(html).not.toContain(copy.store.coDcSingapore);
      expect(html).toContain(copy.uiChrome.viewOnEarn);
      view.goEarn();
      expect(navTo).toHaveBeenCalledWith("/earn");
      expect(orders.orders[0].status).toBe("activated");
      expect(remote.orderApi.pay).not.toHaveBeenCalled();
      expect(remote.orderApi.cancel).not.toHaveBeenCalled();
    });

    it.each(["Frankfurt DC", "Singapore DC"])(`${language} keeps the known %s label localized`, async (dataCenter) => {
      const { view } = await detail(dataCenter, copy);
      const html = await rendered(view);
      const label = dataCenter === "Frankfurt DC" ? copy.store.coDcFrankfurt : copy.store.coDcSingapore;
      expect(html).toContain(label);
      expect(html).toContain(copy.orders.activatedHint.replace("{dc}", label));
    });

    it.each([null, "", "   "])(`${language} renders unknown data-center %s neutrally`, async (dataCenter) => {
      const { view } = await detail(dataCenter, copy);
      const html = await rendered(view);
      expect(html).toContain(copy.orders.activatedHint.replace("{dc}", "—"));
      expect(html).not.toContain(copy.store.coDcSingapore);
      expect(html).not.toContain(copy.store.coDcFrankfurt);
    });
  }

  it("escapes a new server region as text", async () => {
    const { view } = await detail("Cloud-<script>region</script>");
    const html = await rendered(view);
    expect(html).toContain("Cloud-&lt;script&gt;region&lt;/script&gt;");
    expect(html).not.toContain("<script>region</script>");
  });

  it("keeps server region replacement characters literal in the activation explanation", async () => {
    const { view } = await detail("Cloud-$&-region");
    const html = await rendered(view);
    expect(html).toContain("Activated in Cloud-$&amp;-region · earnings depend on completed tasks and settlement");
  });

  it("updates a known label and the activation explanation when the language changes", async () => {
    const { view, copyRef } = await detail("Singapore DC");
    copyRef.value = zh;
    const html = await rendered(view);
    expect(html).toContain(zh.orders.activatedHint.replace("{dc}", zh.store.coDcSingapore));
    expect(html).not.toContain(en.orders.activatedHint.replace("{dc}", en.store.coDcSingapore));
  });

  it("keeps provisioning separate from activated earnings navigation", async () => {
    const { view } = await detail("Cloud-Global", en, "provisioning");
    const html = await rendered(view);
    expect(html).toContain(en.orders.provisioningHint.replace("{dc}", "Cloud-Global"));
    expect(html).not.toContain(en.uiChrome.viewOnEarn);
  });
});
