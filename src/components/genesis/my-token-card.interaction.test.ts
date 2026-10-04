import source from "./my-token-card.vue?raw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, effectScope, reactive, ref, watch } from "vue";
import ts from "typescript";
import { en } from "@/i18n/messages/en";
import { fmt } from "@/i18n/format";
import { formatCommandAmount } from "@/lib/command-amount";
import { genesisMarketFloor } from "@/lib/genesis-market-floor";
import { presentGenesisFloorPrice, presentGenesisRoyalty } from "@/lib/genesis-marketplace-presentation";
import { parseGenesisListingPrice } from "@/lib/genesis-listing-price";
import { canExecuteGenesisListingConfirmation } from "@/lib/genesis-listing-confirmation";
import { confirm, toast, useUI } from "@/store/ui";

// Execute the complete production setup script with real Vue reactivity and
// the real Pinia confirmation queue. Only page/account/API boundaries are fake.
const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
const parsed = ts.createSourceFile("card.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const body = parsed.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getText(parsed)).join("\n");
const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const disposers: Array<() => void> = [];
let uid = 0;

function card(listed = false) {
  const scope = effectScope();
  const unmounts: Array<() => void> = [];
  const pageScope = reactive({ visible: true, epoch: 1 });
  const props = reactive({ tokenId: "holding-a", pageScope });
  const genesis = reactive({
    myListings: listed ? [{ tokenId: "holding-a", askPriceUSDT: 12, listedAt: 100 }] : [],
    remoteMarketStats: { floorUsdt: null }, remoteRoyaltyPct: 2.5,
    listNode: vi.fn().mockResolvedValue(true), cancelListing: vi.fn().mockResolvedValue(true),
  });
  const secondaryBlock = ref<string | null>(null);
  let accountEpoch = 1;
  const bindings = {
    ref, computed, watch, getCurrentInstance: () => ({ uid: ++uid }),
    onUnmounted: (fn: () => void) => unmounts.push(fn), defineProps: () => props,
    useT: () => ref(en), useGenesis: () => genesis,
    useGenesisConfig: () => ({ config: { marketStats: { floor: 0 } } }),
    useGenesisSaleGate: () => ({ secondaryBlock, blockText: ref("closed") }),
    remoteApiEnabled: true, genesisMarketFloor, presentGenesisFloorPrice, presentGenesisRoyalty,
    formatCommandAmount, parseGenesisListingPrice, canExecuteGenesisListingConfirmation,
    captureAccountScope: () => accountEpoch, isCurrentAccountScope: (epoch: number) => epoch === accountEpoch,
    useUI, toast, confirm, fmt,
  };
  const actions = scope.run(() => new Function(...Object.keys(bindings), `${js}\nreturn { handleList, handleCancel, askPriceText };`)(...Object.values(bindings))) as {
    handleList: () => Promise<void>; handleCancel: () => Promise<void>; askPriceText: { value: string };
  };
  actions.askPriceText.value = "10.123456";
  const dispose = () => { unmounts.forEach((fn) => fn()); scope.stop(); };
  disposers.push(dispose);
  return { ...actions, genesis, props, pageScope, secondaryBlock, dispose, changeAccount: () => ++accountEpoch,
    hide: () => { pageScope.visible = false; pageScope.epoch += 1; },
    show: () => { pageScope.visible = true; },
  };
}

function setup() { vi.useFakeTimers(); setActivePinia(createPinia()); return useUI(); }
afterEach(() => { disposers.splice(0).forEach((fn) => fn()); vi.clearAllTimers(); vi.useRealTimers(); });

describe("Genesis card confirmation and response ownership", () => {
  it.each(["recovered", "local-retirement-pending"])("does not present %s as a new listing success", async (outcome) => {
    const ui = setup(); const c = card(); c.genesis.listNode.mockResolvedValue(outcome);
    const attempt = c.handleList(); ui.resolveConfirm(ui.confirmQueue[0].id, true); await attempt;
    expect(ui.toasts[0].kind).toBe("info");
    expect(ui.toasts[0].title).toBe(outcome === "recovered" ? en.marketplace.commandRecovered : en.marketplace.commandLocalPending);
  });
  it("hiding a cached page cancels its own confirmation and preserves another owner's queue", async () => {
    const ui = setup(); const c = card(); const attempt = c.handleList();
    void ui.confirm({ title: "other", owner: "another-page" });
    c.hide(); c.show();
    expect(ui.confirmQueue.map((item) => item.owner)).toEqual(["another-page"]);
    await attempt; expect(c.genesis.listNode).not.toHaveBeenCalled();
  });
  it("cannot dispatch when confirm resolves just before hide and return in the same tick", async () => {
    const ui = setup(); const c = card(); const attempt = c.handleList();
    ui.resolveConfirm(ui.confirmQueue[0].id, true); c.hide(); c.show();
    await attempt; expect(c.genesis.listNode).not.toHaveBeenCalled();
  });
  it("does not show an old response on a returned page or a new account", async () => {
    for (const invalidate of ["page", "account"] as const) {
      const ui = setup(); const c = card(); let finish!: (ok: boolean) => void;
      c.genesis.listNode.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
      const attempt = c.handleList(); ui.resolveConfirm(ui.confirmQueue[0].id, true);
      for (let tick = 0; tick < 5 && !finish; tick += 1) await Promise.resolve();
      expect(c.genesis.listNode).toHaveBeenCalledTimes(1);
      if (invalidate === "page") { c.hide(); c.show(); } else c.changeAccount();
      finish(true); await attempt; expect(ui.toasts).toEqual([]);
    }
  });
  it("queues only one confirmation during repeated activation and permits a fresh retry after cancel", async () => {
    const ui = setup(); const c = card(); const first = c.handleList(); const second = c.handleList();
    expect(ui.confirmQueue).toHaveLength(1);
    ui.resolveConfirm(ui.confirmQueue[0].id, false); await Promise.all([first, second]);
    const retry = c.handleList(); expect(ui.confirmQueue).toHaveLength(1);
    ui.resolveConfirm(ui.confirmQueue[0].id, false); await retry;
  });
  it("dispatches the exact confirmed price, then reports success even when the listing projection changes", async () => {
    const ui = setup(); const c = card(); const attempt = c.handleList();
    c.askPriceText.value = "30";
    c.genesis.listNode.mockImplementation(async () => { c.genesis.myListings.push({ tokenId: "holding-a", askPriceUSDT: 10.123456, listedAt: 200 }); return true; });
    ui.resolveConfirm(ui.confirmQueue[0].id, true); await attempt;
    expect(c.genesis.listNode).toHaveBeenCalledWith("holding-a", 10.123456);
    expect(ui.toasts[0].kind).toBe("success");
  });
  it("still allows an owner to cancel while the market is closed", async () => {
    const ui = setup(); const c = card(true); c.secondaryBlock.value = "marketClosed";
    const attempt = c.handleCancel(); ui.resolveConfirm(ui.confirmQueue[0].id, true); await attempt;
    expect(c.genesis.cancelListing).toHaveBeenCalledWith("holding-a");
  });
  it("rejects stale account and replaced listing confirmations", async () => {
    for (const invalidate of ["account", "listing"] as const) {
      const ui = setup(); const c = card(true); const attempt = c.handleCancel();
      if (invalidate === "account") c.changeAccount(); else c.genesis.myListings[0].listedAt += 1;
      ui.resolveConfirm(ui.confirmQueue[0].id, true); await attempt;
      expect(c.genesis.cancelListing).not.toHaveBeenCalled();
    }
  });
  it("unmount clears the owned confirmation without a command", async () => {
    const ui = setup(); const c = card(); const attempt = c.handleList(); c.dispose();
    expect(ui.confirmQueue).toEqual([]); await attempt; expect(c.genesis.listNode).not.toHaveBeenCalled();
  });
  it("declares keyboard controls and an accessible price name for the shared activation layer", () => {
    for (const handler of ["handleList", "handleCancel"]) {
      const tag = source.match(new RegExp(`<view[^>]*@click="${handler}"[^>]*>`))?.[0] ?? "";
      expect(tag).toContain('role="button"'); expect(tag).toContain('tabindex="0"');
    }
    expect(source.match(/<input[^>]*>/)?.[0]).toContain(':aria-label="t.marketplace.listForSale"');
  });
});
