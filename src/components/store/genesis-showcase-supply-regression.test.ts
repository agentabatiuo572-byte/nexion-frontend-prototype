import { computed, reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import showcasePage from "./genesis-showcase-card.vue?raw";
import storePage from "@/pages/store/store.vue?raw";
import saleGatePage from "@/composables/use-genesis-sale-gate.ts?raw";

const showcaseStart = showcasePage.indexOf("const eligSheetOpen = ref");
const showcaseEnd = showcasePage.indexOf("// ── styles", showcaseStart);
const gateStart = saleGatePage.indexOf("const nowTs = ref");
const gateEnd = saleGatePage.indexOf("export function useGenesisSaleGate", gateStart);
const gateFunctionEnd = saleGatePage.lastIndexOf("\n}") + 2;
const storeShowStart = storePage.indexOf("onShow(() => {");
const storeShowEnd = storePage.indexOf("onHide(() =>", storeShowStart);

if (showcaseStart < 0 || showcaseEnd < showcaseStart || gateStart < 0
  || gateEnd < gateStart || gateFunctionEnd < gateEnd || storeShowStart < 0 || storeShowEnd < storeShowStart) {
  throw new Error("Genesis showcase, sale gate, and store lifecycle source are required");
}

function compile<T>(source: string, names: string[], values: unknown[]): T {
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...names, javascript)(...values) as T;
}

function actualShowcase(remoteSupplyKnown: boolean, totalSlots = 0, soldSlots = 0, options: {
  refresh?: () => Promise<unknown>;
  scopeCurrent?: () => boolean;
} = {}) {
  const section = showcasePage.slice(showcaseStart, showcaseEnd);
  const genesis = reactive({ totalSlots, soldSlots, remoteSupplyKnown, unitPriceUSDT: 7999, syncRemote: vi.fn() });
  const block = ref<"configUnavailable" | "soldOut" | null>(null);
  const unmounted: Array<() => void> = [];
  const notices = { info: vi.fn(), success: vi.fn() };
  const value = compile<{
    soldOut: { value: boolean };
    eyebrowText: { value: string };
    ctaText: { value: string };
    onCardTap(): Promise<void>;
  }>(
    `${section}; return { soldOut, eyebrowText, ctaText, onCardTap };`,
    ["computed", "ref", "onUnmounted", "genesis", "cfg", "block", "blockText", "showUrgency", "preSale", "showTime", "countdownDays", "countdownClock", "t", "fmt", "gate", "eligible", "resolveGenesisEligibilityCardCopy", "resolveGenesisPrimaryCta", "captureAccountScope", "isCurrentAccountScope", "navTo", "toast"],
    [
      computed, ref, (callback: () => void) => unmounted.push(callback), genesis, { refresh: vi.fn(options.refresh ?? (async () => undefined)) }, block, ref("unavailable"), ref(false), ref(false), ref(false), ref(0), ref(""),
      ref({ store: { genesisCardEyebrow: "Genesis Node · Limited {n}", genesisCardLeft: "{n} left", genesisCardTierLabel: "Current tier", genesisCardCtaMarket: "Secondary market" }, genesis: { marketClosed: { holdingsSafe: "safe", retryOk: "restored", retryCta: "Retry live status", retryHint: "again" } }, genesisEligibility: { cardLockedLine: "locked", cardPolicyManaged: "managed", reasonServiceUnavailable: "unavailable", reasonPolicyUnavailable: "unavailable", comingSoon: "soon", cardCta: "Reserve" } }),
      (template: string, values: { n: number }) => template.replace("{n}", String(values.n)), ref({ reasons: [] }), ref(true),
      () => ({ line: "", meta: "" }),
      ({ block: current, blockedText, soldOut, comingSoon, reserve }: { block: string | null; blockedText: string | null; soldOut: string; comingSoon: string; reserve: string }) => current === "soldOut" ? soldOut : current === "preSale" ? comingSoon : blockedText ?? reserve,
      () => ({ accountKey: "account-a" }), options.scopeCurrent ?? (() => true),
      vi.fn(), notices,
    ],
  );
  return { value, genesis, block, unmounted, notices };
}

function actualSaleGate(remoteSupplyKnown: boolean, totalSlots = 0, soldSlots = 0) {
  const prelude = saleGatePage.slice(gateStart, gateEnd);
  const body = saleGatePage.slice(gateEnd, gateFunctionEnd).replace("export function useGenesisSaleGate", "function useGenesisSaleGate");
  const mounted: Array<() => void> = [];
  const unmounted: Array<() => void> = [];
  const cfg = reactive({
    loaded: true,
    config: { marketOpenState: "open" as const, halted: false, saleStartAt: null, showCountdown: false, closedNoticeKey: "default" },
    refresh: vi.fn(),
  });
  const genesis = reactive({ totalSlots, soldSlots, remoteSupplyKnown, syncRemote: vi.fn() });
  const factory = compile<() => { block: { value: string | null } }>(
    `${prelude}\n${body}\nreturn useGenesisSaleGate;`,
    ["ref", "computed", "onMounted", "onUnmounted", "useGenesisConfig", "useGenesis", "useT", "remoteApiEnabled", "genesisPurchaseBlock", "genesisShowsUrgency", "genesisSecondaryBlock", "setInterval", "clearInterval"],
    [
      ref, computed, (callback: () => void) => mounted.push(callback), (callback: () => void) => unmounted.push(callback),
      () => cfg, () => genesis, () => ref({ genesis: { marketClosed: { configUnavailable: "unavailable", halted: "halted", default: "closed" } } }), true,
      ({ configLoaded, marketOpenState, halted, remaining, saleStartAt, now }: { configLoaded: boolean; marketOpenState: string; halted: boolean; remaining: number; saleStartAt: number | null; now: number }) => {
        if (!configLoaded) return "configUnavailable";
        if (marketOpenState === "closed") return "marketClosed";
        if (halted) return "halted";
        if (remaining <= 0) return "soldOut";
        if (saleStartAt != null && now < saleStartAt) return "preSale";
        return null;
      },
      (current: string | null) => current === null || current === "preSale",
      () => null,
      () => 1, () => undefined,
    ],
  );
  return { gate: factory(), cfg, genesis, mounted, unmounted };
}

function actualStoreOnShow() {
  const source = storePage.slice(storeShowStart, storeShowEnd);
  const callbacks: Array<() => void> = [];
  const genesisCfg = { refresh: vi.fn() };
  const genesis = { syncRemote: vi.fn() };
  compile<void>(
    `let storePageVisible = false; let storeObservationEpoch = 0; ${source}; return undefined;`,
    ["onShow", "genesisCfg", "genesis", "refreshServerProductPhase", "refreshProductCatalog", "observeDayOneStorePage"],
    [
      (callback: () => void) => callbacks.push(callback), genesisCfg, genesis,
      vi.fn(), vi.fn(), vi.fn(),
    ],
  );
  callbacks.forEach((callback) => callback());
  return { genesisCfg, genesis };
}

describe("Genesis showcase unknown-supply regression", () => {
  it("executes the actual showcase computed values: an unread remote 0/0 is never sold out or rendered as Limited 0, then recovers with supply", () => {
    const card = actualShowcase(false);
    expect(card.value.soldOut.value).toBe(false);
    expect(card.value.eyebrowText.value).not.toContain("0");

    card.genesis.totalSlots = 1000;
    card.genesis.soldSlots = 1;
    card.genesis.remoteSupplyKnown = true;
    expect(card.value.soldOut.value).toBe(false);
    expect(card.value.eyebrowText.value).toContain("1,000");
  });

  it("executes the actual sale-gate computed value: unknown supply is unavailable, restores after a delayed state, and only confirmed exhaustion is sold out", () => {
    const unknown = actualSaleGate(false);
    expect(unknown.gate.block.value).toBe("configUnavailable");
    unknown.genesis.totalSlots = 1000;
    unknown.genesis.soldSlots = 1;
    unknown.genesis.remoteSupplyKnown = true;
    expect(unknown.gate.block.value).toBe(null);
    expect(actualSaleGate(true, 1000, 1000).gate.block.value).toBe("soldOut");
  });

  it("executes the actual store onShow lifecycle and rehydrates the public Genesis projection", () => {
    const page = actualStoreOnShow();
    expect(page.genesisCfg.refresh).toHaveBeenCalledOnce();
    expect(page.genesis.syncRemote).toHaveBeenCalledOnce();
  });

  it("executes the actual showcase retry action: a failed supply read stays unavailable, a later retry restores it, and repeated taps share that retry", async () => {
    const card = actualShowcase(false);
    card.block.value = "configUnavailable";
    let attempts = 0;
    card.genesis.syncRemote.mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) return false;
      card.genesis.totalSlots = 1000;
      card.genesis.soldSlots = 1;
      card.genesis.remoteSupplyKnown = true;
      card.block.value = null;
      return true;
    });

    await card.value.onCardTap();
    expect(card.genesis.syncRemote).toHaveBeenCalledOnce();
    expect(card.block.value).toBe("configUnavailable");

    await Promise.all([card.value.onCardTap(), card.value.onCardTap()]);
    expect(card.genesis.syncRemote).toHaveBeenCalledTimes(2);
    expect(card.value.soldOut.value).toBe(false);
    expect(card.value.eyebrowText.value).toContain("1,000");
  });

  it("executes the actual showcase retry lifecycle: either rebind or unmount during config refresh starts no old-scope read or toast", async () => {
    for (const interrupt of ["rebind", "unmount"] as const) {
      let resolveRefresh!: () => void;
      const refresh = new Promise<void>((resolve) => { resolveRefresh = resolve; });
      let scopeCurrent = true;
      const card = actualShowcase(false, 0, 0, { refresh: () => refresh, scopeCurrent: () => scopeCurrent });
      card.block.value = "configUnavailable";
      const retry = card.value.onCardTap();
      if (interrupt === "rebind") scopeCurrent = false;
      else card.unmounted.forEach((callback) => callback());
      resolveRefresh();
      await retry;

      expect(card.genesis.syncRemote, interrupt).not.toHaveBeenCalled();
      expect(card.notices.info, interrupt).not.toHaveBeenCalled();
      expect(card.notices.success, interrupt).not.toHaveBeenCalled();
    }
  });

  it("uses the visible retry CTA while the public Genesis state is unavailable", () => {
    const card = actualShowcase(false);
    card.block.value = "configUnavailable";
    expect(card.value.ctaText.value).toBe("Retry live status");
    expect(showcasePage).toContain('role="button" tabindex="0" :aria-label="ctaText"');
  });
});
