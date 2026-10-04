import { describe, expect, it, vi } from "vitest";
import { VietQrCommandKeyRegistry, type VietQrCommandIdentity, type VietQrCommandStorage } from "./vietqr-command-key";

function memoryStorage(initial?: unknown): VietQrCommandStorage {
  let value: unknown = structuredClone(initial);
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

  it("does not replay another installation's historical create key after local storage is reset", () => {
    const identity = {
      accountKey: "user:42",
      action: "CREATE",
      fingerprint: "5000.000000",
    } satisfies VietQrCommandIdentity;

    const firstInstall = new VietQrCommandKeyRegistry(memoryStorage(), () => "install-a");
    const resetInstall = new VietQrCommandKeyRegistry(memoryStorage(), () => "install-b");

    expect(resetInstall.getOrCreate(identity)).not.toBe(firstInstall.getOrCreate(identity));
  });

  it("retries a legacy unknown command once, then retires it into an installation-scoped key", () => {
    const identity = {
      accountKey: "user:42",
      action: "CREATE",
      fingerprint: "5000.000000",
    } satisfies VietQrCommandIdentity;
    const legacyScope = JSON.stringify(["user:42", "CREATE", "5000.000000"]);
    const storage = memoryStorage({
      schema: 1,
      pending: {
        [legacyScope]: { ...identity, key: "vietqr-legacy-unknown" },
      },
      generations: { [legacyScope]: 6 },
    });
    const registry = new VietQrCommandKeyRegistry(storage, () => "install-after-upgrade");

    expect(registry.getOrCreate(identity)).toBe("vietqr-legacy-unknown");
    expect(registry.finish(identity, "vietqr-legacy-unknown")).toBe(true);
    expect(registry.getOrCreate(identity)).not.toBe("vietqr-legacy-unknown");
  });

  it("replaces an invalid persisted installation nonce before deriving a payment key", () => {
    const identity = {
      accountKey: "user:42",
      action: "CREATE",
      fingerprint: "5000.000000",
    } satisfies VietQrCommandIdentity;
    const invalidStorage = memoryStorage({
      schema: 2,
      clientNonce: "x".repeat(1024),
      pending: {},
      generations: {},
    });
    const expectedStorage = memoryStorage();

    expect(new VietQrCommandKeyRegistry(invalidStorage, () => "safe-install").getOrCreate(identity))
      .toBe(new VietQrCommandKeyRegistry(expectedStorage, () => "safe-install").getOrCreate(identity));
  });

  it("falls back to distinct installation nonces when WebView entropy words are zero", () => {
    let firstStored: unknown;
    let secondStored: unknown;
    const firstStorage: VietQrCommandStorage = {
      read: () => firstStored,
      write: (value) => { firstStored = structuredClone(value); },
    };
    const secondStorage: VietQrCommandStorage = {
      read: () => secondStored,
      write: (value) => { secondStored = structuredClone(value); },
    };
    vi.stubGlobal("crypto", {
      getRandomValues: (values: Uint32Array) => values.fill(0),
    });
    vi.spyOn(Date, "now").mockReturnValue(1_234_567_890);
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.4);
    try {
      const identity = {
        accountKey: "user:42",
        action: "CREATE",
        fingerprint: "5000.000000",
      } satisfies VietQrCommandIdentity;
      const firstKey = new VietQrCommandKeyRegistry(firstStorage).getOrCreate(identity);
      const secondKey = new VietQrCommandKeyRegistry(secondStorage).getOrCreate(identity);

      expect((firstStored as { clientNonce: string }).clientNonce).toMatch(/^[a-z0-9_-]{8,128}$/i);
      expect((secondStored as { clientNonce: string }).clientNonce).toMatch(/^[a-z0-9_-]{8,128}$/i);
      expect(secondKey).not.toBe(firstKey);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it("rotates the installation nonce instead of wrapping a capped generation back to zero", () => {
    const identity = {
      accountKey: "user:42",
      action: "CREATE",
      fingerprint: "5000.000000",
    } satisfies VietQrCommandIdentity;
    const scope = JSON.stringify(["user:42", "CREATE", "5000.000000"]);
    const originalGenerationZeroKey = new VietQrCommandKeyRegistry(
      memoryStorage(),
      () => "install-before-cap",
    ).getOrCreate(identity);
    const storage = memoryStorage({
      schema: 2,
      clientNonce: "install-before-cap",
      pending: {},
      generations: { [scope]: 1_000_000 },
    });
    const registry = new VietQrCommandKeyRegistry(storage, () => "install-after-cap");
    const cappedKey = registry.getOrCreate(identity);

    expect(registry.finish(identity, cappedKey)).toBe(true);
    const rotatedKey = registry.getOrCreate(identity);
    expect(rotatedKey).not.toBe(cappedKey);
    expect(rotatedKey).not.toBe(originalGenerationZeroKey);
    expect(new VietQrCommandKeyRegistry(storage, () => "unused-install").getOrCreate(identity)).toBe(rotatedKey);
  });

  it("rotates the installation nonce when a capped bound command finishes by intent", () => {
    const identity = {
      accountKey: "user:42",
      action: "CREATE",
      fingerprint: "5000.000000",
    } satisfies VietQrCommandIdentity;
    const scope = JSON.stringify(["user:42", "CREATE", "5000.000000"]);
    const originalGenerationZeroKey = new VietQrCommandKeyRegistry(
      memoryStorage(),
      () => "install-before-cap",
    ).getOrCreate(identity);
    const storage = memoryStorage({
      schema: 2,
      clientNonce: "install-before-cap",
      pending: {},
      generations: { [scope]: 1_000_000 },
    });
    const registry = new VietQrCommandKeyRegistry(storage, () => "install-after-cap");
    const cappedKey = registry.getOrCreate(identity);
    registry.bindIntent(identity, cappedKey, "VQR-CAPPED");

    expect(registry.finishByIntent("user:42", "VQR-CAPPED")).toBe(true);
    const rotatedKey = registry.getOrCreate(identity);
    expect(rotatedKey).not.toBe(originalGenerationZeroKey);
    expect(new VietQrCommandKeyRegistry(storage, () => "unused-install").getOrCreate(identity)).toBe(rotatedKey);
  });
});
