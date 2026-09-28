import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceKind } from "./types";

type InventoryRow = { id: string; kind: DeviceKind; activatedAt: number | null; paidPriceUsdt: number };
const fixture = vi.hoisted(() => ({
  remote: false,
  visible: [] as InventoryRow[],
  refresh: vi.fn<() => Promise<boolean>>(),
  navigate: vi.fn(),
  activate: vi.fn(),
  balances: { usdt: 125, nex: 350 },
  orders: [] as string[],
  accountKey: "account-one",
  page: { route: "pages/earn/earn" },
}));

vi.mock("./app", () => ({ useApp: () => ({
  get visibleDevices() { return fixture.visible; },
  get accountKey() { return fixture.accountKey; },
  refreshRemoteFleet: fixture.refresh,
  activateDevice: fixture.activate,
  user: fixture.balances,
  orders: fixture.orders,
}) }));
vi.mock("@/api/runtime", () => ({ get remoteApiEnabled() { return fixture.remote; } }));
vi.mock("@/lib/route", () => ({ navTo: fixture.navigate }));

import { useSlotActionSheet } from "./slot-action-sheet";

function row(kind: DeviceKind, activatedAt: number | null = null, paidPriceUsdt = 0): InventoryRow {
  return { id: `inventory-${kind}`, kind, activatedAt, paidPriceUsdt };
}
function deferred() {
  let resolve!: (result: boolean) => void;
  const promise = new Promise<boolean>((done) => { resolve = done; });
  return { promise, resolve };
}
function state() {
  return structuredClone({ devices: fixture.visible, balances: fixture.balances, orders: fixture.orders });
}

beforeEach(() => {
  setActivePinia(createPinia());
  fixture.remote = false;
  fixture.visible = [];
  fixture.refresh.mockReset().mockResolvedValue(true);
  fixture.navigate.mockReset().mockResolvedValue(undefined);
  fixture.activate.mockReset();
  fixture.balances = { usdt: 125, nex: 350 };
  fixture.orders = [];
  fixture.accountKey = "account-one";
  fixture.page = { route: "pages/earn/earn" };
  vi.stubGlobal("getCurrentPages", () => [fixture.page]);
});
afterEach(() => vi.unstubAllGlobals());

describe("shared add-device navigation", () => {
  it.each<DeviceKind>(["stellarbox-s1", "stellarbox-pro", "stellarbox-pro-v2", "stellarrack-p1", "stellarrack-p2"])(
    "offers both destinations for inactive %s, including fully discounted hardware", async (kind) => {
      fixture.visible = [row(kind, null, 0)];
      const before = state(), sheet = useSlotActionSheet();
      await sheet.openForSlot();
      expect(sheet.open).toBe(true);
      expect(sheet.checking).toBe(false);
      expect(fixture.refresh).not.toHaveBeenCalled();
      expect(fixture.navigate).not.toHaveBeenCalled();
      expect(fixture.activate).not.toHaveBeenCalled();
      expect(state()).toEqual(before);
    },
  );

  it.each<DeviceKind>(["phone", "pc-gpu", "cloud-share"])("does not treat inactive %s as purchased inventory", async (kind) => {
    fixture.visible = [row(kind), row("stellarbox-s1", 100)];
    const before = state(), sheet = useSlotActionSheet();
    await sheet.openForSlot();
    expect(sheet.open).toBe(false);
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith("/store");
    expect(fixture.activate).not.toHaveBeenCalled();
    expect(state()).toEqual(before);
  });

  it("routes an empty inventory to the store without opening the sheet", async () => {
    const sheet = useSlotActionSheet();
    await sheet.openForSlot();
    expect(sheet.open).toBe(false);
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith("/store");
  });

  it("does not reopen or refresh while an existing choice is open", async () => {
    fixture.remote = true;
    const sheet = useSlotActionSheet(); sheet.open = true;
    await sheet.openForSlot();
    expect(fixture.refresh).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(sheet.open).toBe(true);
  });

  it("deduplicates concurrent remote entries and decides using refreshed inventory", async () => {
    fixture.remote = true;
    const pending = deferred(); fixture.refresh.mockReturnValue(pending.promise);
    const sheet = useSlotActionSheet();
    const first = sheet.openForSlot(), second = sheet.openForSlot();
    expect(sheet.checking).toBe(true);
    expect(sheet.open).toBe(false);
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.navigate).not.toHaveBeenCalled();
    fixture.visible = [row("stellarbox-s1")];
    pending.resolve(true); await Promise.all([first, second]);
    expect(sheet.open).toBe(true);
    expect(sheet.checking).toBe(false);
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.activate).not.toHaveBeenCalled();
  });

  it("does not use stale inactive inventory after a successful refresh removes it", async () => {
    fixture.remote = true; fixture.visible = [row("stellarbox-s1")];
    const pending = deferred(); fixture.refresh.mockReturnValue(pending.promise);
    const sheet = useSlotActionSheet();
    const first = sheet.openForSlot(), second = sheet.openForSlot();
    fixture.visible = []; pending.resolve(true);
    await Promise.all([first, second]);
    expect(sheet.open).toBe(false); expect(sheet.checking).toBe(false);
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith("/store");
  });

  it.each(["false", "throw"] as const)("keeps inventory reachable after refresh %s and allows retry", async (failure) => {
    fixture.remote = true;
    if (failure === "throw") fixture.refresh.mockRejectedValueOnce(new Error("inventory unavailable"));
    else fixture.refresh.mockResolvedValueOnce(false);
    const before = state(), sheet = useSlotActionSheet();
    await sheet.openForSlot();
    expect(sheet.open).toBe(false); expect(sheet.checking).toBe(false);
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith("/pages/me/devices");
    expect(fixture.activate).not.toHaveBeenCalled(); expect(state()).toEqual(before);
    fixture.navigate.mockClear();
    await sheet.openForSlot();
    expect(fixture.refresh).toHaveBeenCalledTimes(2);
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith("/store");
  });

  it("keeps the entry busy until empty-inventory navigation completes", async () => {
    let complete!: () => void;
    fixture.navigate.mockReturnValue(new Promise<void>(resolve => { complete = resolve; }));
    const sheet = useSlotActionSheet();
    const first = sheet.openForSlot(), repeated = sheet.openForSlot();
    expect(sheet.checking).toBe(true);
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith("/store");
    await repeated;
    expect(sheet.checking).toBe(true);
    complete(); await first;
    expect(sheet.checking).toBe(false);
  });

  it.each(["hide", "page", "account"] as const)("discards refreshed inventory after the initiating %s changes", async (change) => {
    fixture.remote = true;
    fixture.visible = [row("stellarbox-s1")];
    const pending = deferred(); fixture.refresh.mockReturnValue(pending.promise);
    const sheet = useSlotActionSheet(), first = sheet.openForSlot();
    if (change === "hide") sheet.hide();
    if (change === "page") fixture.page = { route: "pages/earn/earn" };
    if (change === "account") fixture.accountKey = "account-two";
    pending.resolve(true); await first;
    expect(sheet.open).toBe(false); expect(sheet.checking).toBe(false);
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.activate).not.toHaveBeenCalled();
  });

  it.each(["false", "throw"] as const)("does not redirect an abandoned intent after refresh %s", async (failure) => {
    fixture.remote = true;
    let reject!: (error: Error) => void, resolve!: (ready: boolean) => void;
    fixture.refresh.mockReturnValue(new Promise<boolean>((done, fail) => { resolve = done; reject = fail; }));
    const sheet = useSlotActionSheet(), first = sheet.openForSlot();
    sheet.hide();
    if (failure === "throw") reject(new Error("unavailable")); else resolve(false);
    await first;
    expect(sheet.checking).toBe(false); expect(sheet.open).toBe(false);
    expect(fixture.navigate).not.toHaveBeenCalled();
  });
});
