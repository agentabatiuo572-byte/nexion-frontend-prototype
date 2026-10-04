// @ts-expect-error Vitest executes this source contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { COMPUTE_MARKET_ROUTE, createMarketBoardNavigation } from "./market-board-navigation";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferredNavigation() {
  let settle!: (ok: boolean) => void;
  const navigate = vi.fn(() => new Promise<boolean>((resolve) => { settle = resolve; }));
  return { navigate, settle: (ok: boolean) => settle(ok) };
}

describe("home compute-market navigation", () => {
  it("starts one navigation chain for a real H5 double click", async () => {
    const request = deferredNavigation();
    const navigation = createMarketBoardNavigation(request.navigate);

    expect(navigation.openMarket()).toBe(true);
    expect(navigation.openMarket()).toBe(false);
    await flush();

    expect(request.navigate).toHaveBeenCalledOnce();
    expect(request.navigate).toHaveBeenCalledWith(COMPUTE_MARKET_ROUTE);
    expect(navigation.isInFlight()).toBe(true);
    request.settle(true);
    await flush();
    expect(navigation.isInFlight()).toBe(false);
  });

  it("ignores repeated Enter keydown events while allowing one initial activation", async () => {
    const request = deferredNavigation();
    const navigation = createMarketBoardNavigation(request.navigate);

    expect(navigation.openMarketFromKeyboard({ repeat: true })).toBe(false);
    expect(navigation.openMarketFromKeyboard({ repeat: false })).toBe(true);
    expect(navigation.openMarketFromKeyboard({ repeat: true })).toBe(false);
    await flush();

    expect(request.navigate).toHaveBeenCalledOnce();
    request.settle(true);
    await flush();
  });

  it("releases the lock after a failed navigation chain so the user can retry", async () => {
    const navigate = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const navigation = createMarketBoardNavigation(navigate);

    expect(navigation.openMarket()).toBe(true);
    await flush();
    await flush();
    expect(navigation.isInFlight()).toBe(false);

    expect(navigation.openMarket()).toBe(true);
    await flush();
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it("keeps the entry outside the data rows and exposes a visible H5 focus ring", () => {
    const source = readFileSync(new URL("./market-board-card.vue", import.meta.url), "utf8");
    const actionAt = source.indexOf('data-home-action="compute-market-open"');
    const rowsAt = source.indexOf('v-if="homeMarketRows.length"');

    expect(actionAt).toBeGreaterThan(0);
    expect(rowsAt).toBeGreaterThan(actionAt);
    expect(source).toContain('class="market-board-open ');
    expect(source).toContain(".market-board-open:focus,");
    expect(source).toContain(".market-board-open:focus-visible {");
    expect(source).toContain("outline: 2px solid var(--v5-brand);");
  });
});
