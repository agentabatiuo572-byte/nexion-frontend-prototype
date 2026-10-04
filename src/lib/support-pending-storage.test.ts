import { afterEach, expect, it, vi } from "vitest";
import { clearSupportPending, restoreSupportPending } from "./support-pending-storage";

afterEach(() => vi.unstubAllGlobals());

it("migrates a legacy App localStorage slot into durable uni storage", () => {
  const key = "support-pending-commands:account-a:run-1:tickets";
  const slot = `sha256:${"a".repeat(64)}`;
  const value = JSON.stringify({ [slot]: "support-ticket-create-123" });
  const native = new Map<string, string>();
  vi.stubGlobal("plus", {});
  vi.stubGlobal("localStorage", { getItem: (name: string) => name === key ? value : null });
  vi.stubGlobal("uni", {
    getStorageSync: (name: string) => native.get(name) ?? "",
    setStorageSync: (name: string, data: string) => native.set(name, data),
  });

  expect(restoreSupportPending("account-a", "run-1", "tickets").get(slot)).toBe("support-ticket-create-123");
  expect(native.get(key)).toBe(value);
});

it.each(["h5", "app"])("retirement clears this account's conversation runs while preserving other accounts and tickets (%s)", platform => {
  const retired = ["support-pending-commands:user:1:run-1:conversations", "support-pending-commands:user:1:run-2:conversations"];
  const retained = ["support-pending-commands:user:10:run-1:conversations", "support-pending-commands:user:1:run-1:tickets"];
  const values = new Map([...retired, ...retained].map(key => [key, "pending"]));
  vi.stubGlobal("localStorage", {
    get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
  });
  if (platform === "app") {
    vi.stubGlobal("plus", {});
    vi.stubGlobal("uni", { getStorageInfoSync: () => ({ keys: [...values.keys()] }), removeStorageSync: (key: string) => values.delete(key) });
  }
  clearSupportPending("user:1", "conversations");
  expect([...values.keys()]).toEqual(retained);
});
