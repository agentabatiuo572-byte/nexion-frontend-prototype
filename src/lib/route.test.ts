import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navTo, toUniRoute } from "./route";

type Options = { url: string; success?: () => void; fail?: () => void; complete?: () => void };
type Method = "navigateTo" | "redirectTo" | "reLaunch";
const calls: { method: Method; options: Options }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("uni", Object.fromEntries((["navigateTo", "redirectTo", "reLaunch"] as const).map(method => [method, vi.fn((options: Options) => calls.push({ method, options }))])));
});
afterEach(() => vi.unstubAllGlobals());

describe("navigation completion contract", () => {
  it.each([
    ["/store", "/pages/store/store", true],
    ["/earn?range=week", "/pages/earn/earn?range=week", true],
    ["/me/wallet/exchange?from=card", "/pages/me/wallet-exchange?from=card", false],
    ["/pages/me/devices", "/pages/me/devices", false],
  ] as const)("preserves mapping for %s", (href, url, tab) => {
    expect(toUniRoute(href)).toEqual({ url, tab });
  });

  it.each([
    ["/store", ["reLaunch", "redirectTo", "navigateTo"]],
    ["/pages/me/devices", ["navigateTo", "redirectTo", "reLaunch"]],
  ] as const)("waits for the successful first navigation for %s", async (href, order) => {
    let settled = false;
    const result = navTo(href).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false); expect(calls.map(call => call.method)).toEqual([order[0]]);
    calls[0].options.success?.(); await result;
    expect(settled).toBe(true); expect(calls).toHaveLength(1);
  });

  it.each([
    ["/store", ["reLaunch", "redirectTo", "navigateTo"]],
    ["/pages/me/devices", ["navigateTo", "redirectTo", "reLaunch"]],
  ] as const)("preserves fallback order and waits for its final callback for %s", async (href, order) => {
    let settled = false;
    const result = navTo(href).then(() => { settled = true; });
    calls[0].options.fail?.(); await Promise.resolve();
    expect(settled).toBe(false); expect(calls.map(call => call.method)).toEqual(order.slice(0, 2));
    calls[1].options.fail?.(); await Promise.resolve();
    expect(settled).toBe(false); expect(calls.map(call => call.method)).toEqual([...order]);
    expect(calls.every(call => call.options.url === toUniRoute(href).url)).toBe(true);
    // The last transport completes even after its failure, releasing the caller's busy state.
    calls[2].options.complete?.(); await result;
    expect(settled).toBe(true);
  });

  it("stops fallback after redirect succeeds", async () => {
    const result = navTo("/store");
    calls[0].options.fail?.(); calls[1].options.success?.();
    await result;
    expect(calls.map(call => call.method)).toEqual(["reLaunch", "redirectTo"]);
  });
});
