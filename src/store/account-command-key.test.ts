import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireAccountCommandKey, readAccountRow, releaseAccountCommandKey } from "./account-scoped-storage";

describe("account-scoped durable command keys", () => {
  let storage: Map<string, unknown>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, structuredClone(value)),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reuses the persisted key after the in-memory page state is lost", () => {
    const first = acquireAccountCommandKey("pending-orders", "user:a", "sku|wallet", "order", () => "uuid-1");
    const replay = acquireAccountCommandKey("pending-orders", "user:a", "sku|wallet", "order", () => "uuid-2");

    expect(first).toBe("order:uuid-1");
    expect(replay).toBe(first);
  });

  it("persists the default secure byte-based id when a WebView lacks randomUUID", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => { bytes.fill(0x25); return bytes; });
    vi.stubGlobal("crypto", { getRandomValues });
    vi.stubGlobal("plus", undefined);

    const first = acquireAccountCommandKey("pending-orders", "user:a", "sku|wallet", "order");
    expect(first).toBe("order:25252525-2525-4525-a525-252525252525");
    vi.stubGlobal("crypto", undefined);
    expect(acquireAccountCommandKey("pending-orders", "user:a", "sku|wallet", "order")).toBe(first);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("uses the default Android secure UUID while isolating accounts and intents", () => {
    const nativeUuid = {};
    const ids = [
      "7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01",
      "7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a02",
      "7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a03",
    ];
    const invoke = vi.fn((target: unknown, method: string) => method === "randomUUID"
      ? nativeUuid : target === nativeUuid && method === "toString" ? ids.shift() : undefined);
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal("plus", { android: { invoke } });

    const first = acquireAccountCommandKey("pending-orders", "user:a", "sku-a|wallet", "order");
    const otherAccount = acquireAccountCommandKey("pending-orders", "user:b", "sku-a|wallet", "order");
    const otherIntent = acquireAccountCommandKey("pending-orders", "user:a", "sku-b|wallet", "order");
    expect(new Set([first, otherAccount, otherIntent]).size).toBe(3);
    expect(invoke).toHaveBeenCalledWith("java.util.UUID", "randomUUID");
    expect(invoke).toHaveBeenCalledWith(nativeUuid, "toString");
    vi.stubGlobal("plus", undefined);
    expect(acquireAccountCommandKey("pending-orders", "user:a", "sku-a|wallet", "order")).toBe(first);
    expect(storage.get("pending-orders")).toEqual({
      "user:a": { commands: { "sku-a|wallet": first, "sku-b|wallet": otherIntent } },
      "user:b": { commands: { "sku-a|wallet": otherAccount } },
    });
  });

  it("does not persist a default command when all secure id sources are unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal("plus", undefined);
    expect(() => acquireAccountCommandKey("pending-orders", "user:a", "sku|wallet", "order")).toThrow();
    expect(storage.size).toBe(0);
  });

  it("requires read-after-write before returning a native command id", () => {
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal("plus", { android: { invoke: () => "7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01" } });
    vi.stubGlobal("uni", { getStorageSync: () => undefined, setStorageSync: () => undefined });
    expect(() => acquireAccountCommandKey("pending-orders", "user:a", "sku|wallet", "order"))
      .toThrow("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
  });

  it("preserves other pending intents in the same account row", () => {
    acquireAccountCommandKey("pending-orders", "user:a", "sku-a", "order", () => "uuid-a");
    acquireAccountCommandKey("pending-orders", "user:a", "sku-b", "order", () => "uuid-b");

    expect(storage.get("pending-orders")).toEqual({
      "user:a": { commands: { "sku-a": "order:uuid-a", "sku-b": "order:uuid-b" } },
    });
  });

  it("preserves pending keys without new entropy or writes after a transient first read failure", () => {
    const before = {
      "user:a": { commands: { "sku|wallet": "order:old", sibling: "order:sibling" } },
      "user:b": { commands: { "sku|wallet": "order:other-account" } },
    };
    storage.set("pending-orders", structuredClone(before));
    let reads = 0;
    const write = vi.fn((key: string, value: unknown) => storage.set(key, structuredClone(value)));
    const randomUUID = vi.fn(() => "7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01");
    vi.stubGlobal("crypto", { randomUUID });
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => { if (++reads === 1) throw new Error("transient read"); return storage.get(key); },
      setStorageSync: write,
    });
    let returned: string | null = null;
    let message: string | null = null;
    try { returned = acquireAccountCommandKey("pending-orders", "user:a", "sku|wallet", "order"); }
    catch (error) { message = error instanceof Error ? error.message : String(error); }

    expect({ returned, message, reads, entropyCalls: randomUUID.mock.calls.length,
      writes: write.mock.calls.length, table: storage.get("pending-orders") }).toEqual({
      returned: null, message: "ACCOUNT_COMMAND_STORAGE_UNAVAILABLE", reads: 1, entropyCalls: 0,
      writes: 0, table: before,
    });
    expect(acquireAccountCommandKey("pending-orders", "user:a", "sku|wallet", "order")).toBe("order:old");
    expect(randomUUID).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(storage.get("pending-orders")).toEqual(before);
  });

  it.each(["reread", "write", "readback"] as const)("fails closed on %s faults while preserving durable intents", (fault) => {
    const before = { "user:a": { commands: { sibling: "order:sibling" } } };
    storage.set("pending-orders", structuredClone(before));
    let reads = 0;
    let faultPending = true;
    const uuid = "7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01";
    const randomUUID = vi.fn(() => uuid);
    vi.stubGlobal("crypto", { randomUUID });
    const write = vi.fn((key: string, value: unknown) => {
      if (fault === "write" && faultPending) { faultPending = false; throw new Error("write failed"); }
      storage.set(key, structuredClone(value));
    });
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => {
        reads += 1;
        if (faultPending && ((fault === "reread" && reads === 2) || (fault === "readback" && reads === 3))) {
          faultPending = false;
          throw new Error("read failed");
        }
        return storage.get(key);
      },
      setStorageSync: write,
    });

    expect(() => acquireAccountCommandKey("pending-orders", "user:a", "sku|wallet", "order"))
      .toThrow("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(fault === "reread" ? 0 : 1);
    const persisted = { "user:a": { commands: { sibling: "order:sibling", "sku|wallet": `order:${uuid}` } } };
    expect(storage.get("pending-orders")).toEqual(fault === "readback" ? persisted : before);
    expect(acquireAccountCommandKey("pending-orders", "user:a", "sku|wallet", "order")).toBe(`order:${uuid}`);
    expect(randomUUID).toHaveBeenCalledTimes(fault === "readback" ? 1 : 2);
    expect(storage.get("pending-orders")).toEqual(persisted);
  });

  it("keeps ordinary read-only consumers tolerant of unavailable storage", () => {
    vi.stubGlobal("uni", { getStorageSync: () => { throw new Error("read unavailable"); } });
    expect(readAccountRow("pending-orders", "user:a")).toBeNull();
  });

  it("fails closed before a remote mutation when the key cannot be persisted", () => {
    vi.stubGlobal("uni", {
      getStorageSync: () => undefined,
      setStorageSync: () => { throw new Error("quota exceeded"); },
    });

    expect(() => acquireAccountCommandKey("pending-orders", "user:a", "sku", "order", () => "uuid"))
      .toThrow("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
  });

  it("fails closed instead of falling back to a weak random command id", () => {
    expect(() => acquireAccountCommandKey("pending-orders", "user:a", "sku", "order", () => ""))
      .toThrow("ACCOUNT_COMMAND_ID_UNAVAILABLE");
    expect(storage.size).toBe(0);
  });

  it("releases only the completed key and preserves other pending intents", () => {
    const completed = acquireAccountCommandKey("pending-orders", "user:a", "sku-a", "order", () => "uuid-a");
    acquireAccountCommandKey("pending-orders", "user:a", "sku-b", "order", () => "uuid-b");

    expect(releaseAccountCommandKey("pending-orders", "user:a", "sku-a", completed)).toBe(true);
    expect(storage.get("pending-orders")).toEqual({
      "user:a": { commands: { "sku-b": "order:uuid-b" } },
    });
  });

  it("does not delete a command when the completion key is stale", () => {
    acquireAccountCommandKey("pending-orders", "user:a", "sku-a", "order", () => "current");

    expect(releaseAccountCommandKey("pending-orders", "user:a", "sku-a", "order:stale")).toBe(false);
    expect(acquireAccountCommandKey("pending-orders", "user:a", "sku-a", "order", () => "replacement"))
      .toBe("order:current");
  });
});
