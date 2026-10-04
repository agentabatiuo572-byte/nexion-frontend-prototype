import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireAmbassadorCommandKey, finishAmbassadorCommand } from "./ambassador-command-key";

describe("ambassador pending commands", () => {
  let storage: Map<string, unknown>;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("retains an unknown key across other payloads and accounts", () => {
    const original = acquireAmbassadorCommandKey("user:a", "first");
    const anotherPayload = acquireAmbassadorCommandKey("user:a", "second");
    const anotherAccount = acquireAmbassadorCommandKey("user:b", "first");
    expect(acquireAmbassadorCommandKey("user:a", "first")).toBe(original);
    expect(acquireAmbassadorCommandKey("user:a", "second")).toBe(anotherPayload);
    expect(anotherAccount).not.toBe(original);
    finishAmbassadorCommand("user:b", "first");
    expect(acquireAmbassadorCommandKey("user:a", "first")).toBe(original);
  });
  it("only retires the exact settled command", () => {
    const first = acquireAmbassadorCommandKey("user:a", "first");
    const second = acquireAmbassadorCommandKey("user:a", "second");
    finishAmbassadorCommand("user:a", "first");
    expect(acquireAmbassadorCommandKey("user:a", "second")).toBe(second);
    expect(acquireAmbassadorCommandKey("user:a", "first")).not.toBe(first);
  });
  it("retains a legacy pending slot on migration", () => {
    const original = acquireAmbassadorCommandKey("user:a", "first");
    const [key, value] = [...storage.entries()][0];
    const row = value as { slot: string; key: string; entries?: { slot: string; key: string }[] };
    storage.set(key, row.entries?.[0] ?? row);
    acquireAmbassadorCommandKey("user:b", "different");
    expect(acquireAmbassadorCommandKey("user:a", "first")).toBe(original);
  });
  it("fails closed when pending-key storage cannot be read", () => {
    vi.stubGlobal("uni", { getStorageSync: () => { throw new Error("storage inaccessible"); } });
    expect(() => acquireAmbassadorCommandKey("user:a", "first")).toThrow("AMBASSADOR_COMMAND_STORAGE_UNAVAILABLE");
  });
});
