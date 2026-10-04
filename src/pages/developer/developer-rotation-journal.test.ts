import { describe, expect, it } from "vitest";
import { createDeveloperRotationJournal, developerRotationUniStorage } from "./developer-rotation-journal";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

class BrokenStorage extends MemoryStorage {
  override setItem() { throw new Error("storage unavailable"); }
}

describe("developer rotation journal", () => {
  it("persists only scoped, non-secret uncertainty across a reload", () => {
    const storage = new MemoryStorage();
    const first = createDeveloperRotationJournal(storage, () => "PRODUCTION:account-a");
    const scope = first.captureScope();
    expect(first.markPending(scope, 17)).toBe(true);
    expect(first.markUnknown(scope, 17)).toBe(true);

    const reloaded = createDeveloperRotationJournal(storage, () => "PRODUCTION:account-a");
    expect(reloaded.statusFor(reloaded.captureScope(), 17)).toEqual({ available: true, state: "UNKNOWN" });
    expect(storage.getItem("nexgrid-developer-rotation-journal:v1")).not.toContain("secret");
    expect(storage.getItem("nexgrid-developer-rotation-journal:v1")).not.toContain("sk_");
  });

  it("does not expose another account's rotation recovery state and clears only after a known success", () => {
    const storage = new MemoryStorage();
    const accountA = createDeveloperRotationJournal(storage, () => "PRODUCTION:account-a");
    const accountAScope = accountA.captureScope();
    accountA.markPending(accountAScope, 17);
    const accountB = createDeveloperRotationJournal(storage, () => "PRODUCTION:account-b");
    expect(accountB.statusFor(accountB.captureScope(), 17)).toEqual({ available: true, state: null });
    expect(accountA.statusFor(accountAScope, 17)).toEqual({ available: true, state: "PENDING" });
    expect(accountA.clear(accountAScope, 17)).toBe(true);
    expect(accountA.statusFor(accountAScope, 17)).toEqual({ available: true, state: null });
  });

  it("fails closed for unreadable, malformed, or non-durable journal storage", () => {
    const malformed = new MemoryStorage();
    malformed.setItem("nexgrid-developer-rotation-journal:v1", "{not-json");
    const journal = createDeveloperRotationJournal(malformed, () => "PRODUCTION:account-a");
    const scope = journal.captureScope();
    expect(journal.statusFor(scope, 17)).toEqual({ available: false, state: null });

    const broken = createDeveloperRotationJournal(new BrokenStorage(), () => "PRODUCTION:account-a");
    expect(broken.markPending(broken.captureScope(), 17)).toBe(false);
  });

  it("rejects a non-string Uni storage value instead of treating corruption as an empty journal", () => {
    const originalUni = (globalThis as { uni?: unknown }).uni;
    (globalThis as { uni?: unknown }).uni = {
      getStorageSync: () => ({ malformed: true }),
      setStorageSync: () => undefined,
      removeStorageSync: () => undefined,
    };
    try {
      expect(() => developerRotationUniStorage.getItem("nexgrid-developer-rotation-journal:v1")).toThrow("DEVELOPER_ROTATION_STORAGE_VALUE_INVALID");
    } finally {
      (globalThis as { uni?: unknown }).uni = originalUni;
    }
  });

  it("does not write a captured account scope after that scope is no longer current", () => {
    let account = "PRODUCTION:account-a";
    const journal = createDeveloperRotationJournal(new MemoryStorage(), () => account);
    const scope = journal.captureScope();
    account = "PRODUCTION:account-b";
    expect(journal.isCurrentScope(scope)).toBe(false);
    expect(journal.markUnknown(scope, 17)).toBe(false);
  });
});
