import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { createGenesisApi, type GenesisEligibility } from "@/api/genesis-api";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { formatAmount } from "@/lib/amount-display";
import { platformDisplayText } from "@/lib/brand-copy";
import { genesisConsumerCopyFor } from "./genesis-consumer-copy";
import { formatGenesisPrice } from "@/lib/genesis-marketplace-presentation";
import { refreshActivePage, registerActivePageRefresh, resetActivePageRefreshForTest } from "@/lib/active-page-refresh";
import source from "./holder.vue?raw";

const script = compileScript(parse(source).descriptor, { id: "holder-allocation", inlineTemplate: true });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
afterEach(resetActivePageRefreshForTest);

// A real Vue mount runs the page's unmount hook; its visual output is checked
// separately through the actual inline template below.
type RefreshHost = { parent: RefreshHost | null; children: RefreshHost[] };
const host = (): RefreshHost => ({ parent: null, children: [] });
const lifecycleRenderer = Vue.createRenderer<RefreshHost, RefreshHost>({
  createElement: host, createText: host, createComment: host,
  setText: () => {}, setElementText: () => {}, patchProp: () => {},
  parentNode: target => target.parent, nextSibling: () => null,
  insert: (target, parent) => { target.parent = parent; parent.children.push(target); },
  remove: target => { if (target.parent) target.parent.children = target.parent.children.filter(child => child !== target); },
});

it.each([en, zh, vietnamese])("renders actual holder allocations from parser-confirmed null, zero and recovery", async copy => {
  const at = new Date().toISOString();
  const payload = { serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", eligible: true,
    reasons: [], ownedCount: 0, maxPerUser: 20, remainingCap: 20, minAccountAgeDays: 0, accountAgeDays: 30,
    status: "READY", reservedAllocation: null as number | null, reservedAllocationUnit: "NEX",
    priorityRank: null, priorityTier: "STANDARD", qualificationReasonCodes: [] as string[], policyVersion: "1",
    effectiveAt: at, asOf: at, serverTime: at,
    provenance: { source: "holder-eligibility", environment: "PRODUCTION", runId: "" } };
  const request = vi.fn(async () => payload);
  const api = createGenesisApi({ request } as never);
  const genesis = Vue.reactive({ myOwned: 0, dividendsOpen: false, totalSlots: 20, soldSlots: 0,
    remoteAccountReadState: "ready", remoteEligibility: null as GenesisEligibility | null,
    remoteEligibilityError: "", remoteHoldings: [],
    syncRemote: async () => { genesis.remoteEligibility = await api.eligibility(); } });
  const shows: Array<() => void> = [];
  const hides: Array<() => void> = [];
  const configRefresh = vi.fn(async () => {});
  const pointsRefresh = vi.fn(async () => {});
  const wrapper = { setup: (_props: unknown, { slots }: { slots: Vue.Slots }) => () => Vue.h("view", slots.default?.()) };
  const dependencies: Record<string, unknown> = {
    "@/lib/brand-copy": { platformDisplayText },
    "@/store/locale": { useLocaleStore: () => ({ code: copy === zh ? "zh" : copy === vietnamese ? "vi" : "en" }) },
    "./genesis-consumer-copy": { genesisConsumerCopyFor },
    "@/lib/amount-display": { formatAmount },
    "@/lib/genesis-marketplace-presentation": { formatGenesisPrice },
    vue: Vue, "@dcloudio/uni-app": { onShow: (hook: () => void) => shows.push(hook), onHide: (hook: () => void) => hides.push(hook) },
    "@/lib/route": { navTo: vi.fn() }, "@/i18n/use-t": { useT: () => Vue.ref(copy) },
    "@/i18n/format": { fmt, dateLocale: () => "en-US" },
    "@/store/genesis": { useGenesis: () => genesis, GENESIS_EMISSION: {} },
    "@/store/genesis-config": { useGenesisConfig: () => ({ refresh: configRefresh }) },
    "@/store/config": { useConfig: () => ({ isEnabled: () => true }) },
    "@/composables/use-genesis-sale-gate": { useGenesisSaleGate: () => ({ showUrgency: Vue.ref(false), blockText: Vue.ref(null) }) },
    "@/store/genesis-points": { useGenesisPoints: () => ({ projection: null, status: "idle", refresh: pointsRefresh }) },
    "@/lib/active-page-refresh": { registerActivePageRefresh },
    "@/api/runtime": { remoteApiEnabled: true },
    "@/components/app-chassis.vue": { default: wrapper }, "@/components/sub-page-header.vue": { default: { render: () => null } },
    "@/components/genesis/genesis-artwork.vue": { default: { render: () => null } },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected holder import: ${id}`);
    return dependencies[id];
  }, exports);
  const show = async () => {
    const html = await renderToString(Vue.createSSRApp(exports.default));
    const label = genesis.myOwned ? copy.genesisHolder.pre.allocLabel : copy.holderFacts.allocation;
    return { html, allocation: html.slice(html.indexOf(label)).match(/<\/text>\s*<text[^>]*>([^<]*)<\/text>/)?.[1] };
  };
  for (const owned of [0, 2]) {
    genesis.myOwned = owned;
    await genesis.syncRemote();
    let page = await show(); expect(page.allocation).toBe("-");
    if (owned === 0) {
      expect(page.html).not.toContain(copy.genesisHolder.previewModeBanner);
      expect(page.html).not.toContain(copy.genesis.ctaSoldOut);
      expect(page.html).toContain(genesisConsumerCopyFor(copy === zh ? "zh" : copy === vietnamese ? "vi" : "en").trust);
    }
    expect(page.html).toContain(copy.holderFacts.confirmed);
    expect(page.html).toContain(copy.holderFacts.allocationUnavailable);
    expect(page.html).not.toContain(copy.holderFacts.unavailable);
    payload.qualificationReasonCodes = ["HOLDINGS_CONFIRMED"]; await genesis.syncRemote();
    page = await show(); expect(page.allocation).toBe("-");
    expect(page.html).toContain(copy.holderFacts.reasons.HOLDINGS_CONFIRMED);
    expect(page.html).toContain(copy.holderFacts.allocationUnavailable);
    payload.reservedAllocation = 0; await genesis.syncRemote();
    page = await show(); expect(page.allocation).toBe("0.00 UVT");
    expect(page.html).toContain(copy.holderFacts.reasons.HOLDINGS_CONFIRMED);
    expect(page.html).not.toContain(copy.holderFacts.allocationUnavailable);
    payload.reservedAllocation = 1.234567; await genesis.syncRemote();
    expect((await show()).allocation).toBe("1.23 UVT");
    expect(genesis.remoteEligibility?.reservedAllocation).toBe(1.234567);
    for (const status of ["CONFIG_UNAVAILABLE", "NOT_EFFECTIVE", "NOT_ELIGIBLE"]) {
      payload.status = status; payload.reservedAllocation = null; await genesis.syncRemote();
      page = await show(); expect(page.allocation).toBe("-");
      expect(page.html).not.toContain(copy.holderFacts.allocationUnavailable);
      const reason = status === "CONFIG_UNAVAILABLE" ? copy.holderFacts.unpublished
        : status === "NOT_EFFECTIVE" ? copy.holderFacts.notEffective : copy.holderFacts.notEligible;
      expect(page.html).toContain(reason);
    }
    payload.status = "READY"; payload.asOf = new Date(Date.now() - 16 * 60_000).toISOString();
    await genesis.syncRemote(); page = await show(); expect(page.allocation).toBe("-"); expect(page.html).toContain(copy.holderFacts.stale);
    expect(page.html).not.toContain(copy.holderFacts.allocationUnavailable);
    payload.asOf = at; payload.reservedAllocation = null; payload.qualificationReasonCodes = [];
    genesis.remoteEligibility = null; expect((await show()).allocation).toBe("-");
    shows.at(-1)!(); await Promise.resolve(); await Promise.resolve();
    expect(genesis.remoteEligibility).toMatchObject({ reservedAllocation: null });
  }

  genesis.remoteAccountReadState = "unavailable";
  const unavailable = await show();
  expect(unavailable.html).toContain(copy.holderFacts.unconfirmed);
  expect(unavailable.html).not.toContain(copy.genesisHolder.notHolderTitle);
  expect(unavailable.html).not.toContain('class="gh-hero gh-surface"');
  genesis.remoteAccountReadState = "ready";

  const lifecyclePage = Vue.defineComponent({ setup(props, context) {
    (exports.default as { setup: (props: object, context: unknown) => unknown }).setup(props, context);
    return () => null;
  } });
  const mounted = lifecycleRenderer.createApp(lifecyclePage); mounted.mount(host());
  const holderShow = shows.at(-1)!; const holderHide = hides.at(-1)!;
  configRefresh.mockClear(); pointsRefresh.mockClear();
  holderShow(); await refreshActivePage();
  expect(configRefresh).toHaveBeenCalledTimes(1); expect(pointsRefresh).toHaveBeenCalledTimes(1);
  expect((await show()).html).toContain(copy.holderFacts.allocationUnavailable);
  payload.reservedAllocation = 0; request.mockClear();
  await refreshActivePage(); expect(request).toHaveBeenCalledTimes(1);
  const recovered = await show(); expect(recovered.allocation).toBe("0.00 UVT");
  expect(recovered.html).not.toContain(copy.holderFacts.allocationUnavailable);
  holderHide(); request.mockClear(); await refreshActivePage(); expect(request).not.toHaveBeenCalled();

  holderShow(); await refreshActivePage();
  const newerPageRefresh = vi.fn(); registerActivePageRefresh(newerPageRefresh);
  holderHide(); request.mockClear(); await refreshActivePage();
  expect(newerPageRefresh).toHaveBeenCalledTimes(1); expect(request).not.toHaveBeenCalled();
  mounted.unmount(); await refreshActivePage();
  expect(newerPageRefresh).toHaveBeenCalledTimes(2); expect(request).not.toHaveBeenCalled();

  const remounted = lifecycleRenderer.createApp(lifecyclePage); remounted.mount(host());
  shows.at(-1)!(); await refreshActivePage(); request.mockClear();
  remounted.unmount(); await refreshActivePage(); expect(request).not.toHaveBeenCalled();
});
