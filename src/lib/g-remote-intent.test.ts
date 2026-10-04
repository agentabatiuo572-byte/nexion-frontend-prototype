import { describe, expect, it } from "vitest";
import {
  RemoteIntentKeyRegistry,
  type RemoteIntentStorage,
} from "./g-remote-intent";

function memoryStorage(initial?: unknown): RemoteIntentStorage {
  let value = structuredClone(initial);
  return {
    read: () => value,
    write: (next) => { value = structuredClone(next); },
  };
}

describe("RemoteIntentKeyRegistry", () => {
  it("reuses an unknown-result key after an App reload", () => {
    const storage = memoryStorage();
    const first = new RemoteIntentKeyRegistry("G1", storage, () => "first")
      .acquire("user:1", "open", { tierKey: "usdt30d", amountUsdt: "100.00" });

    const afterReload = new RemoteIntentKeyRegistry("G1", storage, () => "second")
      .acquire("user:1", "open", { tierKey: "usdt30d", amountUsdt: "100.00" });

    expect(afterReload.key).toBe(first.key);
    expect(afterReload.fingerprint).toBe(first.fingerprint);
  });

  it("isolates pending money commands by account and operation", () => {
    const storage = memoryStorage();
    let sequence = 0;
    const registry = new RemoteIntentKeyRegistry("G1", storage, () => `key-${++sequence}`);

    const open = registry.acquire("user:1", "open", { tierKey: "usdt30d", amountUsdt: "100.00" });
    const anotherAccount = registry.acquire("user:2", "open", { tierKey: "usdt30d", amountUsdt: "100.00" });
    const claim = registry.acquire("user:1", "claim", { positionNo: "STK-1" });

    expect(new Set([open.key, anotherAccount.key, claim.key]).size).toBe(3);
  });

  it("keeps an unknown command but retires a confirmed command", () => {
    const storage = memoryStorage();
    let sequence = 0;
    const registry = new RemoteIntentKeyRegistry("G1", storage, () => `key-${++sequence}`);
    const lease = registry.acquire("user:1", "early", { positionNo: "STK-1" });

    registry.complete(lease, false);
    expect(new RemoteIntentKeyRegistry("G1", storage, () => `key-${++sequence}`)
      .acquire("user:1", "early", { positionNo: "STK-1" }).key).toBe(lease.key);

    registry.complete(lease, true);
    expect(new RemoteIntentKeyRegistry("G1", storage, () => `key-${++sequence}`)
      .acquire("user:1", "early", { positionNo: "STK-1" }).key).not.toBe(lease.key);
  });

  it("fails closed before a money request when persistence is unavailable", () => {
    const storage: RemoteIntentStorage = {
      read: () => undefined,
      write: () => {},
    };
    const registry = new RemoteIntentKeyRegistry("G1", storage, () => "not-persisted");

    expect(() => registry.acquire("user:1", "claim", { positionNo: "STK-1" }))
      .toThrow("REMOTE_INTENT_PERSIST_FAILED");
  });

  it("fails closed instead of replacing a corrupted unknown command", () => {
    const storage = memoryStorage({
      schema: 1,
      pending: { "corrupted-fingerprint": "not a valid key with spaces" },
    });
    const registry = new RemoteIntentKeyRegistry("G1", storage, () => "replacement");

    expect(() => registry.acquire("user:1", "open", { tierKey: "usdt30d", amountUsdt: "100.00" }))
      .toThrow("REMOTE_INTENT_PERSIST_FAILED");
  });

  it("does not turn an acknowledged financial success into a failure when key retirement fails", () => {
    let stored: unknown;
    const registry = new RemoteIntentKeyRegistry("G1", {
      read: () => stored,
      write: (state) => {
        if (Object.keys(state.pending).length === 0) throw new Error("storage unavailable");
        stored = structuredClone(state);
      },
    }, () => "confirmed-key");
    const lease = registry.acquire("user:1", "open", { tierKey: "usdt30d", amountUsdt: 100 });

    expect(registry.complete(lease, true)).toBe(false);
    expect(registry.acquire("user:1", "open", { tierKey: "usdt30d", amountUsdt: 100 }).key).toBe(lease.key);
  });
});
