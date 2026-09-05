import { describe, expect, it } from "vitest";
import { VietQrCommandKeyRegistry, type VietQrCommandIdentity, type VietQrCommandStorage } from "./vietqr-command-key";

function memoryStorage(): VietQrCommandStorage {
  let value: unknown;
  return { read: () => value, write: (next) => { value = structuredClone(next); } };
}

describe("VietQrCommandKeyRegistry", () => {
  it("reuses one key after an unknown response and reload", () => {
    const storage = memoryStorage();
    const intent = { accountKey: "user:1", action: "CREATE", fingerprint: "25.000000" } satisfies VietQrCommandIdentity;
    const first = new VietQrCommandKeyRegistry(storage).getOrCreate(intent);
    expect(new VietQrCommandKeyRegistry(storage).getOrCreate(intent)).toBe(first);
  });

  it("retires only the command bound to an authoritative intent", () => {
    const storage = memoryStorage();
    const registry = new VietQrCommandKeyRegistry(storage);
    const intent = { accountKey: "user:1", action: "CREATE", fingerprint: "25.000000" } satisfies VietQrCommandIdentity;
    const first = registry.getOrCreate(intent);
    registry.bindIntent(intent, first, "VQR-1");
    expect(registry.finishByIntent("user:1", "VQR-1")).toBe(true);
    expect(registry.getOrCreate(intent)).not.toBe(first);
  });
});
