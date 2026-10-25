import * as Vue from "vue";
import { expect, it, vi } from "vitest";
import { all, flush, mountEntry, slot, text } from "@/lib/entry-review.test-support";
import { zh } from "@/i18n/messages/zh";
import { fmt } from "@/i18n/format";
import * as presentation from "@/lib/genesis-marketplace-presentation";
import { genesisConsumerCopyFor } from "./genesis-consumer-copy";
import source from "./marketplace.vue?raw";

function setup() {
  const genesis = Vue.reactive({ remotePublicReadState: "ready", remoteAccountReadState: "ready", remoteRoyaltyPct: null as number | null,
    remoteMarketStats: { floorUsdt: null, volume24hUsdt: null, owners: null, floorDeltaPct: null, lastSaleUsdt: null },
    remoteListings: [], remoteTransactions: [], myOwned: 0, ownedTokenIds: [] as string[], activityPage: { cursor: null },
    syncRemote: vi.fn(async () => true), acquireSecondary: vi.fn(),
  });
  const gate = { block: Vue.ref<string | null>("marketClosed"), secondaryBlock: Vue.ref<string | null>("marketClosed"),
    marketClosed: Vue.ref(true), blockText: Vue.ref<string | null>(zh.genesis.marketClosed.default) };
  const cfg = { refresh: vi.fn(async () => {}) };
  const navTo = vi.fn(), report = vi.fn();
  const segments = Vue.defineComponent({ props: ["modelValue", "options"], emits: ["update:modelValue"],
    setup: (props, { emit }) => () => Vue.h("view", props.options.map((o: { value: string; label: string }) => Vue.h("view", { role: "tab", tab: o.value, onClick: () => emit("update:modelValue", o.value) }, o.label))) });
  const empty = Vue.defineComponent({ props: ["title", "desc", "ctaLabel"], emits: ["cta"],
    setup: (props, { emit }) => () => Vue.h("view", { class: "test-empty" }, [String(props.title), String(props.desc), props.ctaLabel ? Vue.h("view", { role: "button", onClick: () => emit("cta") }, String(props.ctaLabel)) : null]) });
  const dependencies: Record<string, unknown> = {
    "@/lib/genesis-marketplace-presentation": presentation, "@/lib/route": { navTo },
    "@dcloudio/uni-app": { onHide: vi.fn(), onShow: vi.fn() },
    "@/components/app-chassis.vue": slot, "@/components/sub-page-header.vue": { default: { render: () => null } },
    "@/components/genesis/listing-card.vue": { default: { render: () => null } },
    "@/components/genesis/activity-row.vue": { default: { render: () => null } },
    "@/components/genesis/my-token-card.vue": { default: Vue.defineComponent({ props: ["tokenId"], setup: props => () => Vue.h("view", { class: "test-holding" }, props.tokenId) }) },
    "@/components/genesis/eligibility-sheet.vue": { default: { render: () => null } },
    "@/components/glass-segments.vue": { default: segments }, "@/components/empty-state.vue": { default: empty },
    "@/i18n/use-t": { useT: () => Vue.ref(zh) }, "@/i18n/format": { fmt },
    "@/store/locale": { useLocaleStore: () => ({ code: "zh" }) }, "./genesis-consumer-copy": { genesisConsumerCopyFor },
    "@/store/genesis": { useGenesis: () => genesis }, "@/store/genesis-config": { useGenesisConfig: () => cfg },
    "@/composables/use-genesis-eligibility": { useGenesisEligibility: () => ({ gate: Vue.ref({}), eligible: Vue.ref(false), gatesSecondary: Vue.ref(true) }) },
    "@/composables/use-genesis-sale-gate": { useGenesisSaleGate: () => gate },
    "@/store/ui": { toast: {} }, "@/api/geo-policy-error": { geoPolicyUserMessage: vi.fn() }, "@/api/errors": { ApiError: Error },
    "@/api/runtime": { remoteApiEnabled: true, sessionVault: { read: () => null }, h3ObservationApi: { secondaryMarket: vi.fn() } },
    "@/api/order-api": { subscribeRuntimeRevision: () => () => {} },
    "@/lib/account-scope": { captureAccountScope: () => ({}), isCurrentAccountScope: () => true },
    "@/lib/authenticated-page-observation": { authenticatedPageObservationReporter: { report } },
    "@/lib/active-page-refresh": { registerActivePageRefresh: () => () => {} },
  };
  return { genesis, gate, cfg, navTo, report, page: mountEntry(source, dependencies) };
}

it("offers information and a working read retry on every closed-market tab, including owned holdings", async () => {
  const { page, genesis, cfg, navTo, report } = setup(); await flush();
  for (const owned of [false, true]) {
    genesis.myOwned = owned ? 1 : 0; genesis.ownedTokenIds = owned ? ["GEN-1"] : [];
    for (const tab of ["listings", "activity", "mine"]) {
      all(page.root).find(n => n.props.tab === tab)!.props.onClick(); await flush();
      expect(text(page.root)).not.toContain(zh.marketplace.reservePrimary);
      page.control(genesisConsumerCopyFor("zh").learn)!.props.onClick();
      expect(navTo).toHaveBeenLastCalledWith("/pages/genesis/genesis");
      if (owned && tab === "mine") expect(page.nodes("test-holding")).toHaveLength(1);
      cfg.refresh.mockClear(); genesis.syncRemote.mockClear(); report.mockClear();
      page.control(zh.marketplace.retry)!.props.onClick(); await flush();
      expect(cfg.refresh).toHaveBeenCalledOnce(); expect(genesis.syncRemote).toHaveBeenCalledOnce();
      expect(report).not.toHaveBeenCalled(); expect(genesis.acquireSecondary).not.toHaveBeenCalled();
    }
  }
  page.unmount();
});

it("keeps failed reads distinct from empty lists and only offers reservation when the primary gate permits it", async () => {
  const { page, genesis, gate } = setup(); await flush();
  genesis.remotePublicReadState = "unavailable"; await flush();
  expect(text(page.root)).toContain(zh.marketplace.marketUnavailable);
  expect(text(page.root)).not.toContain(zh.empty.genesisListingsTitle);
  all(page.root).find(n => n.props.tab === "mine")!.props.onClick();
  genesis.remoteAccountReadState = "unavailable"; await flush();
  expect(text(page.root)).toContain(zh.marketplace.accountUnavailable);
  expect(text(page.root)).not.toContain(zh.marketplace.noTokensTitle);
  genesis.remoteAccountReadState = "ready"; genesis.remotePublicReadState = "ready"; genesis.remoteRoyaltyPct = 0;
  gate.secondaryBlock.value = null; gate.blockText.value = null; gate.block.value = "soldOut"; await flush();
  expect(page.control(zh.marketplace.reservePrimary)).toBeUndefined();
  expect(page.control(zh.marketplace.retry)).toBeUndefined();
  gate.block.value = null; await flush();
  expect(page.control(zh.marketplace.reservePrimary)).toBeDefined();
  page.unmount();
});
