import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useTheme } from "@/store/theme";
import source from "./promotion-entry.vue?raw";
import * as entry from "@/lib/promotion-entry";

it("keeps the same-scope promotion through hide and pending return, clears scope, and exposes actual errors", async () => {
  const mounted: Array<() => void> = [], hidden: Array<() => void> = [], shown: Array<() => void> = [], unmounted: Array<() => void> = [];
  const app = Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1 });
  const locale = Vue.reactive({ code: "zh" });
  setActivePinia(createPinia());
  const theme = useTheme();
  const activity = { activityId: "A", state: "ACTIVE", template: "DIRECT_REFERRAL", rewardRules: [] };
  const list = vi.fn().mockResolvedValue({ items: [activity], hasMore: false, nextCursor: null });
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onMounted: (fn: () => void) => mounted.push(fn), onBeforeUnmount: (fn: () => void) => unmounted.push(fn) },
    "@/composables/use-tab-page-lifecycle": { onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
    "@/api/runtime": { remoteApiEnabled: true, apiRuntimeConfig: { baseUrl: "https://test.example" }, sessionVault: { read: () => ({ user: { userId: 1 } }) }, promotionApi: { list } },
    "@/store/app": { useApp: () => app }, "@/store/locale": { useLocaleStore: () => locale },
    "@/store/theme": { useTheme: () => theme },
    "@/i18n/use-t": { useT: () => Vue.ref({ promotion: {} }) }, "@/i18n/format": {},
    "@/mock/products": {}, "@/store/product-catalog": { productCatalogState: { status: "ready", serverCanonical: true }, refreshProductCatalog: async () => true },
    "@/lib/route": {}, "@/lib/promotion-display": {}, "@/lib/promotion-entry": entry, "@/components/catalog-machine-image": {},
  };
  const script = compileScript(parse(source).descriptor, { id: "promotion-stability" });
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {} as { default: { setup(props: object, context: object): any } };
  new Function("require", "exports", code)((id: string) => id.endsWith(".vue") ? { default: {} } : modules[id], exports);
  const scope = Vue.effectScope();
  const view = scope.run(() => exports.default.setup({ mode: "home", active: true }, { expose() {}, emit() {} }));
  const flush = async () => { await Vue.nextTick(); for (let i = 0; i < 12; i++) await Promise.resolve(); await Vue.nextTick(); };
  mounted.forEach(fn => fn()); await flush();
  expect(view.items.value).toHaveLength(1);
  view.loadedBanners.value.add("ready-before-theme");
  const imageRefresh = view.imageRefresh.value, reads = list.mock.calls.length;
  theme.setMode(theme.resolved === "dark" ? "light" : "dark"); await flush();
  expect(view.loadedBanners.value.size).toBe(0);
  expect(view.imageRefresh.value).toBe(imageRefresh + 1);
  expect(view.items.value).toHaveLength(1); expect(list.mock.calls.length).toBe(reads);
  view.termsActivity.value = activity;
  hidden.forEach(fn => fn()); expect(view.items.value).toHaveLength(1);
  expect(view.termsActivity.value).toBeNull();
  view.loadedBanners.value.add("ready-while-hidden");
  theme.setMode(theme.resolved === "dark" ? "light" : "dark"); await flush();
  expect(view.loadedBanners.value.size).toBe(0);
  expect(view.items.value).toHaveLength(1); expect(list.mock.calls.length).toBe(reads);
  let fail!: (reason: unknown) => void;
  list.mockReturnValueOnce(new Promise((_yes, reject) => { fail = reject; }));
  shown.forEach(fn => fn()); await flush(); expect(view.items.value).toHaveLength(1);
  fail(new Error("offline")); await flush();
  expect(view.items.value).toEqual([]); expect(view.status.value).toBe("error");
  list.mockReturnValueOnce(new Promise(() => {})); app.accountBindingEpoch++; await flush();
  expect(view.items.value).toEqual([]);
  unmounted.forEach(fn => fn()); scope.stop(); theme.$dispose();
});
