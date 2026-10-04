import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const storage = new Map<string, unknown>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => storage.get(key) ?? "",
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  });
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("voucher popup session cadence", () => {
  it("enforces maxPerSession while allowing the server cooldown to remain authoritative", async () => {
    const { useVoucherClaimSheet } = await import("./voucher-claim-sheet");
    const sheet = useVoucherClaimSheet();

    expect(sheet.tryAutoPush({ surface: "home", cooldownHours: 0, maxPerSession: 1 })).toBe(true);
    expect(sheet.surface).toBe("home");
    sheet.closeTransient();
    expect(sheet.tryAutoPush({ surface: "home", cooldownHours: 0, maxPerSession: 1 })).toBe(false);

    sheet.resetCooldown();
    expect(sheet.tryAutoPush({ surface: "home", cooldownHours: 0, maxPerSession: 1 })).toBe(true);
  });

  it("does not carry cooldown or session cap across account/run scopes", async () => {
    const { useVoucherClaimSheet } = await import("./voucher-claim-sheet");
    const sheet = useVoucherClaimSheet();

    sheet.bindScope({ accountKey: "account-a", accountEpoch: 1, runId: "run-a", runEpoch: 1 });
    expect(sheet.tryAutoPush({ surface: "home", cooldownHours: 24, maxPerSession: 1 })).toBe(true);
    sheet.hide();

    sheet.bindScope({ accountKey: "account-b", accountEpoch: 2, runId: "run-b", runEpoch: 2 });
    expect(sheet.tryAutoPush({ surface: "home", cooldownHours: 24, maxPerSession: 1 })).toBe(true);
  });

  it("binds the manual sheet to its entry surface and closes it on a scope change", async () => {
    const { useVoucherClaimSheet } = await import("./voucher-claim-sheet");
    const sheet = useVoucherClaimSheet();

    sheet.show("store");
    expect(sheet.open).toBe(true);
    expect(sheet.surface).toBe("store");

    sheet.bindScope({ accountKey: "account-a", accountEpoch: 3, runId: null, runEpoch: 4 });
    expect(sheet.open).toBe(false);
  });
});
