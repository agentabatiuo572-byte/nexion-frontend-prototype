import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import source from "./promotion-entry.vue?raw";
import * as entry from "@/lib/promotion-entry";

afterEach(() => { vi.useRealTimers(); });

function mount(props: { mode: "home" | "events"; activities: object[]; active?: boolean }) {
  const mounted: Array<() => void> = [], hidden: Array<() => void> = [], shown: Array<() => void> = [], unmounted: Array<() => void> = [];
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onMounted: (fn: () => void) => mounted.push(fn), onBeforeUnmount: (fn: () => void) => unmounted.push(fn) },
    "@/composables/use-tab-page-lifecycle": { onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
    "@/api/runtime": { remoteApiEnabled: false, apiRuntimeConfig: { baseUrl: "" }, sessionVault: { read: () => null }, promotionApi: {} },
    "@/store/app": { useApp: () => Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1 }) },
    "@/store/locale": { useLocaleStore: () => Vue.reactive({ code: "zh" }) },
    "@/store/theme": { useTheme: () => Vue.reactive({ resolved: "dark" }) },
    "@/i18n/use-t": { useT: () => Vue.ref({ promotion: {} }) }, "@/i18n/format": {},
    "@/mock/products": {}, "@/store/product-catalog": { productCatalogState: { status: "ready" }, refreshProductCatalog: async () => true, revalidateProductCatalog: async () => true },
    "@/store/home-promotions": {}, "@/lib/route": {}, "@/lib/promotion-display": {}, "@/lib/promotion-entry": entry, "@/components/catalog-machine-image": {},
  };
  const script = compileScript(parse(source).descriptor, { id: "promotion-autoplay" });
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {} as { default: { setup(props: object, context: object): any } };
  new Function("require", "exports", code)((id: string) => id.endsWith(".vue") ? { default: {} } : modules[id], exports);
  const scope = Vue.effectScope();
  const view = scope.run(() => exports.default.setup(Vue.reactive({ active: true, ...props }), { expose() {}, emit() {} }));
  mounted.forEach(fn => fn());
  return { view, hide: () => hidden.forEach(fn => fn()), show: () => shown.forEach(fn => fn()), unmount: () => { unmounted.forEach(fn => fn()); scope.stop(); } };
}
const flush = async () => { await Vue.nextTick(); for (let i = 0; i < 6; i++) await Promise.resolve(); await Vue.nextTick(); };
const offer = (activityId: string) => ({ activityId, state: "ACTIVE", template: "DIRECT_REFERRAL", rewardRules: [] });

it("rotates several home offers every five seconds and restarts the countdown after a tap", async () => {
  vi.useFakeTimers();
  const { view, unmount } = mount({ mode: "home", activities: [offer("A"), offer("B"), offer("C")] });
  await flush();
  expect(view.activeIndex.value).toBe(0);
  vi.advanceTimersByTime(5000); await flush(); expect(view.activeIndex.value).toBe(1);
  vi.advanceTimersByTime(3000); view.cycleOffer(1); await flush(); expect(view.activeIndex.value).toBe(2);
  vi.advanceTimersByTime(3000); await flush(); expect(view.activeIndex.value).toBe(2);
  vi.advanceTimersByTime(2000); await flush(); expect(view.activeIndex.value).toBe(0);
  unmount();
  vi.advanceTimersByTime(20000); expect(view.activeIndex.value).toBe(0);
});

it("pauses while the rules sheet is open or the page is hidden, and never rotates a single or events list", async () => {
  vi.useFakeTimers();
  const home = mount({ mode: "home", activities: [offer("A"), offer("B")] });
  await flush();
  home.view.termsActivity.value = offer("A"); await flush();
  vi.advanceTimersByTime(15000); await flush(); expect(home.view.activeIndex.value).toBe(0);
  home.view.termsActivity.value = null; await flush();
  home.hide(); vi.advanceTimersByTime(15000); await flush(); expect(home.view.activeIndex.value).toBe(0);
  home.show(); await flush(); vi.advanceTimersByTime(5000); await flush(); expect(home.view.activeIndex.value).toBe(1);
  home.unmount();

  for (const props of [{ mode: "home" as const, activities: [offer("A")] }, { mode: "events" as const, activities: [offer("A"), offer("B")] }]) {
    const { view, unmount } = mount(props); await flush();
    vi.advanceTimersByTime(15000); await flush(); expect(view.activeIndex.value).toBe(0);
    unmount();
  }
});
