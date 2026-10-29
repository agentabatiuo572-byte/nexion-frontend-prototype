import * as displayDate from "@/lib/display-date";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import pageSource from "./staking.vue?raw";
import rulesSource from "./how-it-works.vue?raw";
import * as faqAvailability from "./staking-faq-availability";
import statusSource from "@/components/staking/staking-read-status.vue?raw";
import positionSource from "@/components/staking/position-row.vue?raw";
import vaultSource from "@/components/staking/vault-row.vue?raw";
import * as amount from "@/lib/amount-display";
import * as percentage from "@/lib/staking-percentage";
import * as canonical from "@/lib/staking-canonical";
import * as intent from "@/lib/g-remote-intent";
import * as reviewCopy from "@/lib/staking-review-copy";
import * as format from "@/i18n/format";
import { useLocaleStore } from "@/store/locale";
import { zh } from "@/i18n/messages/zh";

const remote = vi.hoisted(() => ({ remoteApiEnabled: true, apiRuntimeConfig: { environment: "prod", mode: "prod" },
  stakingApi: { fetchStakingPools: vi.fn(), fetchStakingPositions: vi.fn() } }));
vi.mock("@/api/runtime", () => remote);
const storeModule = await import("@/store/staking");
const slot = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("section", slots.default?.()) });
const hidden = Vue.defineComponent({ setup: () => () => null });

function component(source: string, overrides: Record<string, unknown> = {}): Vue.Component {
  const compiled = compileScript(parse(source).descriptor, { id: "staking-review", inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text"].includes(tag) } } });
  const js = ts.transpileModule(compiled.content.replace(/import\.meta\.env\.DEV/g, "false"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modules: Record<string, unknown> = {
    vue: Vue, "@/lib/amount-display": amount, "@/lib/staking-percentage": percentage,
    "@/lib/staking-canonical": canonical, "@/lib/g-remote-intent": intent,
    "@/lib/staking-review-copy": reviewCopy, "@/lib/display-date": displayDate, "@/i18n/format": format,
    "@/i18n/use-t": { useT: () => Vue.computed(() => zh) }, "@/store/staking": storeModule,
    "@/store/config": { useConfig: () => ({ configStatus: "ready", isEnabled: () => true }) },
    "@/store/app": { useApp: () => Vue.reactive({ accountKey: "A", accountBindingEpoch: 1 }) },
    "@/store/ui": { useUI: () => ({ clearConfirmsBy: vi.fn() }), toast: {}, confirm: vi.fn() },
    "@/lib/route": {}, "@/api/geo-policy-error": {}, "@/lib/money-receipt": {},
    "@/api/runtime": { ...remote, exchangeApi: { fetchCaps: async () => ({ swapEnabled: true }) } },
    "./staking-faq-availability": faqAvailability,
    "@dcloudio/uni-app": { onShow: vi.fn(), onHide: vi.fn() },
  };
  function requireModule(path: string): unknown {
    if (path in overrides) return overrides[path];
    if (path.endsWith("staking-read-status.vue")) return { default: component(statusSource) };
    if (path.endsWith("position-row.vue")) return { default: component(positionSource) };
    if (path.endsWith("vault-row.vue")) return { default: component(vaultSource) };
    if (path.endsWith("empty-state.vue")) return { default: Vue.defineComponent({ props: ["title", "desc"], setup: p => () => Vue.h("aside", `${p.title} ${p.desc}`) }) };
    if (path.endsWith("app-chassis.vue") || path.endsWith("card-stagger.vue")) return { default: slot };
    if (path.endsWith(".vue")) return { default: hidden };
    if (path in modules) return modules[path];
    throw new Error(`Missing test dependency: ${path}`);
  }
  const exports: { default?: Vue.Component } = {};
  new Function("require", "exports", js)(requireModule, exports);
  return exports.default!;
}
const Page = component(pageSource);
const render = () => renderToString(Vue.createSSRApp(Page));
const snapshot = {
  sourceEnvironment: "PRODUCTION", runId: "", walletBalanceUsdt: 1000, serverTime: Date.now(),
  positions: [{ id: "read-position", amountUSDT: 100, termDays: 30, apy: .12, penalty: .05,
    startTs: Date.now() - 86400000, unlockTs: Date.now() + 29 * 86400000, status: "active" }],
};

beforeEach(() => {
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn() });
  setActivePinia(createPinia());
  useLocaleStore().setLocale("zh");
  remote.stakingApi.fetchStakingPools.mockReset().mockResolvedValue([30, 90, 180, 365].map(termDays => ({
    termDays, apy: .12, penalty: .05, minAmountUsdt: 20, enabled: true, killed: false, status: "ACTIVE",
  })));
  remote.stakingApi.fetchStakingPositions.mockReset().mockResolvedValue(snapshot);
});

describe("actual staking templates and real read state", () => {
  it.each([
    ["calculator", pageSource, "@/components/staking/compound-calculator.vue"],
    ["rules", rulesSource, "@/components/how/how-hero.vue"],
  ])("keeps the %s page mounted during a background config refresh, but removes it after authority is revoked", async (_label, source, probePath) => {
    vi.useFakeTimers();
    await storeModule.useStaking().syncRemote();
    const config = Vue.reactive({ configStatus: "ready", syncFailed: false, visible: true,
      isEnabled() { return !this.syncFailed && this.visible; } });
    let mounts = 0, disposals = 0;
    let draft!: Vue.Ref<string>;
    const calculator = Vue.defineComponent({ setup() {
      mounts++;
      draft = Vue.ref("1000 / 180");
      Vue.onUnmounted(() => disposals++);
      return () => Vue.h("span", draft.value);
    } });
    type Host = { parent: Host | null; children: Host[] };
    const node = (): Host => ({ parent: null, children: [] });
    const renderer = Vue.createRenderer<Host, Host>({
      createElement: node, createText: node, createComment: node,
      setText: () => {}, setElementText: () => {}, patchProp: () => {},
      parentNode: child => child.parent,
      nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
      insert(child, parent, anchor) {
        if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
        child.parent = parent;
        const at = anchor ? parent.children.indexOf(anchor) : -1;
        parent.children.splice(at < 0 ? parent.children.length : at, 0, child);
      },
      remove(child) { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
    });
    const app = renderer.createApp(component(source, {
      "@/store/config": { useConfig: () => config },
      [probePath]: { default: calculator },
    }));
    try {
      app.mount(node());
      await Vue.nextTick();
      draft.value = "2345 / 90";
      config.configStatus = "loading";
      await Vue.nextTick();
      expect(mounts).toBe(1);
      expect(disposals).toBe(0);
      expect(draft.value).toBe("2345 / 90");
      config.configStatus = "ready";
      await Vue.nextTick();
      expect(mounts).toBe(1);
      expect(draft.value).toBe("2345 / 90");
      config.syncFailed = true;
      config.configStatus = "failed";
      await Vue.nextTick();
      expect(disposals).toBe(1);
      config.configStatus = "loading";
      await Vue.nextTick();
      expect(mounts).toBe(1);
      config.visible = false;
      config.syncFailed = false;
      config.configStatus = "ready";
      await Vue.nextTick();
      expect(mounts).toBe(1);
    } finally {
      app.unmount();
      vi.useRealTimers();
    }
  });
  it("cold failure renders unknown values and one recovery, never zero assets or an empty account", async () => {
    const store = storeModule.useStaking();
    remote.stakingApi.fetchStakingPositions.mockRejectedValue(new Error("503"));
    await store.syncRemote();
    const html = await render();
    expect(html).toContain(reviewCopy.stakingReviewCopy("zh").unavailable);
    expect(html.match(/class="nx-staking-read-retry"/g)).toHaveLength(1);
    expect(html.replace(/<!--[\s\S]*?-->|<[^>]+>/g, "")).not.toContain("0.00");
    expect(html).not.toContain("0 笔进行中");
    expect(html).not.toContain("还没有质押");
    expect(html).not.toContain(zh.empty.stakingTitle);
  });
  it("keeps the previous principal on refresh failure and restores controls after retry", async () => {
    const store = storeModule.useStaking();
    await store.syncRemote();
    const good = await render();
    expect(good).toContain("100.00");
    expect(good).toContain("30 天");
    expect(good).not.toMatch(/安全入门|最热门|最多人选|Founder|空投|30d|30D|⚠/);
    remote.stakingApi.fetchStakingPositions.mockRejectedValueOnce(new Error("503"));
    await store.syncRemote();
    const stale = await render();
    expect(stale).toContain("100.00");
    expect(stale).toContain(reviewCopy.stakingReviewCopy("zh").stale);
    expect(stale).toContain('aria-disabled="true"');
    expect(stale).not.toContain("还没有质押");
    await store.syncRemote();
    expect(await render()).not.toContain(reviewCopy.stakingReviewCopy("zh").stale);
  });
  it("renders zero and an empty list only after a successful empty response", async () => {
    remote.stakingApi.fetchStakingPositions.mockResolvedValue({ ...snapshot, positions: [], walletBalanceUsdt: 0 });
    await storeModule.useStaking().syncRemote();
    const html = await render();
    expect(html).toContain("0.00");
    expect(html).toContain("还没有质押");
    expect(html).not.toContain("nx-staking-read-retry");
  });
  it.each(["zh", "en", "vi"])("localizes term units and distinguishes plan changes from locked positions: %s", locale => {
    const copy = reviewCopy.stakingReviewCopy(locale);
    expect(copy.days(30)).toMatch(/30 (天|days|ngày)/);
    expect(copy.rateNotice).toMatch(/新方案|new plans|gói mới/);
    expect(copy.rateNotice).toMatch(/原奖励率|recorded rate|giữ nguyên tỷ lệ/);
    if (locale !== "en") expect(JSON.stringify(copy.rules)).not.toMatch(/claim|\d+d\b/i);
  });
});
