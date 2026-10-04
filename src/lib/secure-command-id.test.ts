import { afterEach, describe, expect, it, vi } from "vitest";
import { requireCryptoUuid } from "./secure-command-id";

afterEach(() => vi.unstubAllGlobals());

describe("secure command identifiers", () => {
  it("uses the platform crypto UUID", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01") });
    expect(requireCryptoUuid()).toBe("7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01");
  });

  it("uses secure random bytes when a native WebView lacks randomUUID", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => {
      bytes.set([
        0x7a, 0x9b, 0xb4, 0xc6, 0x55, 0xc7, 0x4f, 0xbe,
        0x0c, 0x54, 0x5b, 0x5b, 0xfb, 0xf6, 0x0a, 0x01,
      ]);
      return bytes;
    } });
    expect(requireCryptoUuid()).toBe("7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01");
  });

  it("uses Android's secure native UUID when Web Crypto is unavailable", () => {
    vi.stubGlobal("crypto", {});
    const nativeUuid = {};
    const invoke = vi.fn((target: unknown, method: string) => method === "randomUUID"
      ? nativeUuid : target === nativeUuid && method === "toString"
        ? "7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01" : undefined);
    vi.stubGlobal("plus", { android: { invoke } });
    expect(requireCryptoUuid()).toBe("7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01");
    expect(invoke).toHaveBeenCalledWith("java.util.UUID", "randomUUID");
    expect(invoke).toHaveBeenCalledWith(nativeUuid, "toString");
  });

  it("fails closed when crypto UUID is unavailable", () => {
    vi.stubGlobal("crypto", {});
    expect(() => requireCryptoUuid()).toThrow("CRYPTO_RANDOM_UUID_UNAVAILABLE");
  });

  it("fails closed when the native random source rejects the request", () => {
    vi.stubGlobal("crypto", { getRandomValues: () => { throw new Error("native failure"); } });
    expect(() => requireCryptoUuid()).toThrow("CRYPTO_RANDOM_UUID_UNAVAILABLE");
  });

  it("rejects an invalid native UUID", () => {
    vi.stubGlobal("crypto", {});
    vi.stubGlobal("plus", { android: { invoke: vi.fn(() => "not-a-uuid") } });
    expect(() => requireCryptoUuid()).toThrow("CRYPTO_RANDOM_UUID_UNAVAILABLE");
  });
});
