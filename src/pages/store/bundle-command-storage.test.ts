import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./bundle.vue?raw";
import { acquireAccountCommandKey, readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";
import { restoreBundleCommand, type PendingBundleCommand } from "@/api/bundle-command";
import { normalizeBundleExpectedAmountUsdt } from "@/api/bundle-order-api";

const start = page.indexOf("interface PendingBundleCommands");
const end = page.indexOf("function retireBundleKey", start);
if (start < 0 || end < start) throw new Error("bundle command acquisition is required");
const acquisition = ts.transpileModule(page.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const acquireBundleCommand = new Function("readAccountRow", "writeAccountRow", "acquireAccountCommandKey",
  "restoreBundleCommand", "normalizeBundleExpectedAmountUsdt", `${acquisition}\nreturn acquireBundleCommand;`)(
  readAccountRow, writeAccountRow, acquireAccountCommandKey, restoreBundleCommand, normalizeBundleExpectedAmountUsdt,
) as (list: Array<{ id: string }>, accountKey: string, amount: number) => PendingBundleCommand;

const tableKey = "nexgrid-bundle-order-command-v1";
const fingerprint = "skuA|skuB";
const list = [{ id: "skuB" }, { id: "skuA" }];
const uuid = "7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a02";
const oldCommand = { key: "bundle:7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01", expectedAmountUsdt: 19.9, productNos: ["skuA", "skuB"] };

describe("bundle durable command storage boundaries", () => {
  let storage: Map<string, unknown>;
  let reads: number;
  let faultRead: number | null;
  let faultWrite: number | null;
  let entropy: ReturnType<typeof vi.fn>;
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = new Map();
    reads = 0;
    faultRead = null;
    faultWrite = null;
    entropy = vi.fn(() => uuid);
    write = vi.fn((key: string, value: unknown) => {
      if (write.mock.calls.length === faultWrite) throw new Error("transient write");
      storage.set(key, structuredClone(value));
    });
    vi.stubGlobal("crypto", { randomUUID: entropy });
    vi.stubGlobal("plus", undefined);
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => { if (++reads === faultRead) throw new Error("transient read"); return storage.get(key); },
      setStorageSync: write,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("recovers a complete v2 command with its original key, amount and SKU order", () => {
    storage.set(tableKey, { "user:a": { commands: { [fingerprint]: oldCommand } } });
    expect(acquireBundleCommand(list, "user:a", 99)).toEqual(oldCommand);
    expect(entropy).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([oldCommand.key, { key: oldCommand.key, expectedAmountUsdt: 19.9 }])("keeps legacy command %j recovery-only", (legacy) => {
    const before = { "user:a": { commands: { [fingerprint]: legacy } } };
    storage.set(tableKey, structuredClone(before));
    expect(() => acquireBundleCommand(list, "user:a", 99)).toThrow("BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED");
    expect(storage.get(tableKey)).toEqual(before);
    expect(entropy).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects an unknown initial row with zero entropy and writes, then recovers the old v2 payload", () => {
    const before = {
      "user:a": { commands: { [fingerprint]: oldCommand, sibling: "bundle:sibling" } },
      "user:b": { commands: { [fingerprint]: "bundle:other-account" } },
    };
    storage.set(tableKey, structuredClone(before));
    faultRead = 1;
    let returned: PendingBundleCommand | null = null;
    let message: string | null = null;
    try { returned = acquireBundleCommand(list, "user:a", 99); }
    catch (error) { message = error instanceof Error ? error.message : String(error); }
    expect({ returned, message, reads, writes: write.mock.calls.length, entropy: entropy.mock.calls.length,
      table: storage.get(tableKey) }).toEqual({
      returned: null, message: "ACCOUNT_COMMAND_STORAGE_UNAVAILABLE", reads: 1, writes: 0, entropy: 0, table: before,
    });
    expect(acquireBundleCommand(list, "user:a", 99)).toEqual(oldCommand);
    expect(storage.get(tableKey)).toEqual(before);
    expect(entropy).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    ["shared initial read", 2, 0, 0],
    ["shared write reread", 3, 1, 0],
    ["shared readback", 4, 1, 1],
    ["bundle merge read", 5, 1, 1],
    ["bundle write reread", 6, 1, 1],
    ["bundle readback", 7, 1, 2],
  ] as const)("rejects %s failure without replacing sibling intents", (_label, failAt, generated, writes) => {
    const before = {
      "user:a": { commands: { sibling: "bundle:sibling" } },
      "user:b": { commands: { other: "bundle:other-account" } },
    };
    storage.set(tableKey, structuredClone(before));
    faultRead = failAt;
    expect(() => acquireBundleCommand(list, "user:a", 19.9)).toThrow("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
    expect(entropy).toHaveBeenCalledTimes(generated);
    expect(write).toHaveBeenCalledTimes(writes);
    const command = { key: `bundle:${uuid}`, expectedAmountUsdt: 19.9, productNos: ["skuB", "skuA"] };
    const expected = writes === 0 ? before : {
      ...before, "user:a": { commands: { sibling: "bundle:sibling", [fingerprint]: writes === 1 ? command.key : command } },
    };
    expect(storage.get(tableKey)).toEqual(expected);
    if (writes === 1) {
      expect(() => acquireBundleCommand(list, "user:a", 99)).toThrow("BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED");
      expect(entropy).toHaveBeenCalledTimes(generated);
      expect(write).toHaveBeenCalledTimes(writes);
    } else if (writes === 2) {
      expect(acquireBundleCommand(list, "user:a", 99)).toEqual(command);
      expect(entropy).toHaveBeenCalledTimes(generated);
      expect(write).toHaveBeenCalledTimes(writes);
    }
  });

  it.each([1, 2])("rejects write %i failure while retaining the durable key and siblings", (failAt) => {
    const before = { "user:a": { commands: { sibling: "bundle:sibling" } } };
    storage.set(tableKey, structuredClone(before));
    faultWrite = failAt;
    expect(() => acquireBundleCommand(list, "user:a", 19.9)).toThrow("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
    expect(write).toHaveBeenCalledTimes(failAt);
    expect(entropy).toHaveBeenCalledTimes(1);
    expect(storage.get(tableKey)).toEqual(failAt === 1 ? before : {
      "user:a": { commands: { sibling: "bundle:sibling", [fingerprint]: `bundle:${uuid}` } },
    });
  });

  it("persists and replays one new secure command for empty storage", () => {
    const command = { key: `bundle:${uuid}`, expectedAmountUsdt: 19.9, productNos: ["skuB", "skuA"] };
    expect(acquireBundleCommand(list, "user:a", 19.9)).toEqual(command);
    expect(acquireBundleCommand(list, "user:a", 99)).toEqual(command);
    expect(entropy).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("rejects a new bundle command without a safe random source", () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => acquireBundleCommand(list, "user:a", 19.9)).toThrow("CRYPTO_RANDOM_UUID_UNAVAILABLE");
    expect(write).not.toHaveBeenCalled();
    expect(storage.size).toBe(0);
  });
});
