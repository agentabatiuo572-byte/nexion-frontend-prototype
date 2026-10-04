import source from "./marketplace.vue?raw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import ts from "typescript";
import { ApiError } from "@/api/errors";
import { en } from "@/i18n/messages/en";
import { fmt } from "@/i18n/format";
import { toast, useUI } from "@/store/ui";

// Exercise the production handler, including its awaits and guards. Network,
// account epoch, and page visibility are controlled boundaries, not real trades.
const body = source.slice(source.indexOf("const buyPending = ref(false);"), source.indexOf("function goGenesis()"));
function page() {
  let accountEpoch = 1;
  const genesis = { acquireSecondary: vi.fn().mockResolvedValue(true), remoteEligibility: { maxPerUser: 5 } };
  const bindings = {
    ref, genesis, secondaryBlock: ref(null), gatesSecondary: ref(true), eligible: ref(true),
    gate: ref({ capRemaining: 4 }), eligSheetOpen: ref(false), secondaryBlockText: ref("closed"),
    secondaryBlockSub: ref("closed"), remoteApiEnabled: true, ownedCount: ref(2),
    t: ref(en), toast, fmt, ApiError, geoPolicyUserMessage: () => null,
    captureAccountScope: () => accountEpoch, isCurrentAccountScope: (epoch: number) => epoch === accountEpoch,
  };
  const js = ts.transpileModule(`let marketplacePageVisible=true; let marketplaceObservationEpoch=0;\n${body}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const actions = new Function(...Object.keys(bindings), `${js}\nreturn {handleBuy, hide(){marketplacePageVisible=false;marketplaceObservationEpoch++}, show(){marketplacePageVisible=true}}`)(...Object.values(bindings)) as {
    handleBuy: (listing: { tokenId: string; priceUSDT: number }) => Promise<void>; hide: () => void; show: () => void;
  };
  return { ...actions, genesis, changeAccount: () => ++accountEpoch };
}
beforeEach(() => { vi.useFakeTimers(); setActivePinia(createPinia()); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("Genesis secondary purchase price and lifecycle", () => {
  it.each(["recovered", "local-retirement-pending"])("does not call %s a new purchase", async (outcome) => {
    const p = page(); p.genesis.acquireSecondary.mockResolvedValue(outcome);
    await p.handleBuy({ tokenId: "GEN-ONE", priceUSDT: 10 });
    expect(useUI().toasts[0].kind).toBe("info");
    expect(useUI().toasts[0].title).toBe(outcome === "recovered" ? en.marketplace.commandRecovered : en.marketplace.commandLocalPending);
  });
  it("dispatches the displayed quote once and retains that quote while the view changes", async () => {
    const p = page(); let finish!: (ok: boolean) => void;
    p.genesis.acquireSecondary.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const listing = { tokenId: "GEN-ONE", priceUSDT: 10.123456 };
    const first = p.handleBuy(listing); const duplicate = p.handleBuy(listing);
    listing.priceUSDT = 999;
    expect(p.genesis.acquireSecondary).toHaveBeenCalledExactlyOnceWith("GEN-ONE", 10.123456);
    finish(true); await Promise.all([first, duplicate]);
    expect(useUI().toasts[0].description).not.toContain("999");
    expect(useUI().toasts[0].description).toContain("10.123456");
  });
  it.each(["page", "account"])("does not display a response after the %s scope changes", async (scope) => {
    const p = page(); let finish!: (ok: boolean) => void;
    p.genesis.acquireSecondary.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const attempt = p.handleBuy({ tokenId: "GEN-ONE", priceUSDT: 10 });
    if (scope === "page") { p.hide(); p.show(); } else p.changeAccount();
    finish(true); await attempt; expect(useUI().toasts).toEqual([]);
  });
  it.each([
    ["GENESIS_WALLET_INSUFFICIENT", en.marketplace.insufficient],
    ["GENESIS_LISTING_PRICE_CHANGED", en.marketplace.priceChanged],
    ["GENESIS_LISTING_NOT_ACTIVE", en.marketplace.purchaseUnconfirmed],
    ["connection lost", en.marketplace.purchaseUnconfirmed],
  ])("reports %s without inventing an insufficient balance", async (message, expected) => {
    const p = page();
    p.genesis.acquireSecondary.mockRejectedValue(new ApiError({ kind: "http", message, status: 409 }));
    await p.handleBuy({ tokenId: "GEN-ONE", priceUSDT: 10 });
    expect(useUI().toasts[0].title).toBe(expected);
  });
});
