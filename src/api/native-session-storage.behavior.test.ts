// @ts-expect-error This local bridge test runs in Node; App types omit Node.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
// @ts-expect-error This local bridge test runs in Node; App types omit Node.
import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeSessionStorage } from "./native-session-storage";
import { createSessionVault } from "./session-vault";
import { createApiClient } from "./api-client";
import { createAuthApi } from "./auth-api";

// Local synthetic transport for the Java APIs, backed by real AES-GCM. No
// device, credentials, network, or copy of adapter control flow is involved.
function platformHarness() {
  // The installed Uni synchronous codecs are represented locally with Node
  // buffers; this does not attest their actual Android service execution.
  vi.stubGlobal("uni", { arrayBufferToBase64: (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64"),
    base64ToArrayBuffer: (text: string) => Uint8Array.from(Buffer.from(text, "base64")).buffer });
  const preferences = new Map<string, Map<string, string>>();
  const keys = new Map<string, Uint8Array>();
  const fail = { deleteKey: false, commit: false, reads: false, spec: false, asyncMethod: "" };
  let host = "io.dcloud.HBuilder";
  const classes: Record<string, unknown> = {
    "android.os.Build$VERSION": { SDK_INT: 36 },
    "android.security.keystore.KeyProperties": { KEY_ALGORITHM_AES: "AES", BLOCK_MODE_GCM: "GCM", ENCRYPTION_PADDING_NONE: "NoPadding", PURPOSE_ENCRYPT: 1, PURPOSE_DECRYPT: 2 },
    "javax.crypto.Cipher": { ENCRYPT_MODE: 1, DECRYPT_MODE: 2 },
    "android.util.Base64": { NO_WRAP: 2 },
  };
  const store = { load() {}, containsAlias: (alias: string) => keys.has(alias), getKey: (alias: string) => keys.get(alias) ?? null,
    deleteEntry(alias: string) { if (fail.deleteKey) throw new Error("synthetic native delete failure"); keys.delete(alias); } };
  const activity = { getPackageName: () => host, getSharedPreferences(name: string) {
    if (!preferences.has(name)) preferences.set(name, new Map());
    const values = preferences.get(name)!;
    return { getString(name: string) { if (fail.reads) throw new Error("synthetic native read failure"); return values.get(name) ?? null; }, edit() {
      const changes = new Map<string, string | null>();
      const editor = { putString(name: string, value: string) { changes.set(name, value); return editor; }, remove(name: string) { changes.set(name, null); return editor; }, commit() {
        if (fail.commit) return false;
        for (const [name, value] of changes) { if (value === null) values.delete(name); else values.set(name, value); }
        return true;
      } };
      return editor;
    } };
  } };
  function cipher() {
    let mode = 0, key!: Uint8Array, iv!: Uint8Array;
    return { init(nextMode: number, nextKey: Uint8Array, params?: { iv: Uint8Array }) { mode = nextMode; key = nextKey; iv = params?.iv ?? randomBytes(12); }, getIV: () => iv,
      doFinal(input: Uint8Array) {
        if (mode === 1) { const c = createCipheriv("aes-256-gcm", key, iv); return Buffer.concat([c.update(input), c.final(), c.getAuthTag()]); }
        const c = createDecipheriv("aes-256-gcm", key, iv); c.setAuthTag(input.subarray(-16));
        return Buffer.concat([c.update(input.subarray(0, -16)), c.final()]);
      } };
  }
  const statics: Record<string, Record<string, (...args: any[]) => unknown>> = {
    "java.security.KeyStore": { getInstance: () => store },
    "android.text.TextUtils": { split: (value: string, pattern: string) => value.split(pattern) },
    "android.util.Base64": { decode: (text: string) => Buffer.from(text, "base64"), encodeToString: (bytes: Uint8Array) => Buffer.from(bytes).toString("base64") },
    "javax.crypto.Cipher": { getInstance: () => cipher() },
    "javax.crypto.KeyGenerator": { getInstance: () => {
      let spec!: { alias: string };
      return { init: (value: typeof spec) => { spec = value; }, generateKey: () => { const key = randomBytes(32); keys.set(spec.alias, key); return key; } };
    } },
  };
  const android = {
    runtimeMainActivity: () => activity, importClass: (name: string) => classes[name],
    invoke: vi.fn((target: string | Record<string, Function>, method: string, ...args: unknown[]) => {
      if (method === fail.asyncMethod) return Promise.resolve(true);
      const object = typeof target === "string" ? statics[target] : target;
      return object[method](...args);
    }),
    newObject(name: string, ...args: unknown[]) {
      if (name === "javax.crypto.spec.GCMParameterSpec") return { iv: args[1] };
      if (name !== "android.security.keystore.KeyGenParameterSpec$Builder") throw new Error("unexpected synthetic class");
      let modes: string[], paddings: string[];
      const builder = { setBlockModes(array: string[]) { modes = array; return builder; }, setEncryptionPaddings(array: string[]) { paddings = array; return builder; },
        build: () => ({ alias: args[0], getBlockModes: () => fail.spec ? ["CBC"] : modes, getEncryptionPaddings: () => paddings }) };
      return builder;
    },
  };
  const platform = { os: { name: "Android" }, android } as unknown as Awaited<ReturnType<NonNullable<Parameters<typeof createNativeSessionStorage>[0]["platform"]>>>;
  const adapter = (baseUrl = "https://example.test", installation = "synthetic-install-A") => createNativeSessionStorage({ baseUrl, installationId: () => installation, platform: async () => platform });
  return { adapter, platform, preferences, keys, fail, android, classes, setHost: (value: string) => { host = value; } };
}
const persisted = { schema: 1, refreshToken: "synthetic-only-refresh", tokenType: "Bearer",
  user: { userId: 7101, countryCode: "+86", phone: "13800007101", nickname: "测试 · Việt · 🌏", onboardingComplete: true } };
afterEach(() => vi.unstubAllGlobals());

describe("Android OS-encrypted native refresh persistence", () => {
  it("persists only encrypted refresh data and reopens it in a fresh vault with no access token", async () => {
    const h = platformHarness(), adapter = h.adapter();
    expect(() => adapter.get()).toThrow("NATIVE_SESSION_STORAGE_UNAVAILABLE");
    await adapter.ready();
    const vault = createSessionVault(adapter, { deferHydration: true }); vault.hydrate();
    vault.save({ ...persisted, accessToken: "synthetic-only-access" });
    const disk = JSON.stringify([...h.preferences.values()].map(value => [...value]));
    expect(disk).not.toContain("synthetic-only-refresh"); expect(disk).not.toContain("synthetic-only-access"); expect(disk).not.toContain(persisted.user.nickname);
    const reopened = h.adapter(); await reopened.ready();
    const cold = createSessionVault(reopened, { deferHydration: true }); cold.hydrate();
    expect(cold.read()).toEqual({ accessToken: "", refreshToken: persisted.refreshToken, tokenType: "Bearer", user: persisted.user });
    const old = cold.revision();
    expect(cold.refreshIfUnchanged({ ...persisted, accessToken: "synthetic-next-access", refreshToken: "synthetic-rotated-refresh" }, old)).toBe(true);
    const rotated = h.adapter(); await rotated.ready();
    expect(rotated.get()).toEqual(expect.objectContaining({ refreshToken: "synthetic-rotated-refresh" }));
    expect(rotated.get()).not.toHaveProperty("accessToken");
  });

  it("isolates origin, native host, and installation while preserving the original scope", async () => {
    const h = platformHarness(), original = h.adapter(); await original.ready(); original.set(persisted);
    for (const adapter of [h.adapter("https://other.test"), h.adapter("https://example.test", "synthetic-install-B")]) { await adapter.ready(); expect(adapter.get()).toBeNull(); }
    h.setHost("synthetic.other.host"); const other = h.adapter(); await other.ready(); expect(other.get()).toBeNull();
    h.setHost("io.dcloud.HBuilder"); const same = h.adapter("https://example.test/"); await same.ready(); expect(same.get()).toEqual(persisted);
  });

  it("rejects tampered ciphertext and reports bridge errors without credential text", async () => {
    const h = platformHarness(), adapter = h.adapter(); await adapter.ready(); adapter.set(persisted);
    const prefs = [...h.preferences.values()][0], envelope = JSON.parse(prefs.get("record")!);
    envelope.sealed = Buffer.from("synthetic tampered ciphertext").toString("base64"); prefs.set("record", JSON.stringify(envelope));
    expect(() => adapter.get()).toThrow("NATIVE_SESSION_STORAGE_UNAVAILABLE");
    h.fail.reads = true;
    expect(() => adapter.get()).toThrow("NATIVE_SESSION_STORAGE_UNAVAILABLE");
  });

  it("roundtrips Chinese, Vietnamese and emoji without browser encoding globals", async () => {
    for (const name of ["TextEncoder", "TextDecoder", "btoa", "atob"]) vi.stubGlobal(name, undefined);
    const h = platformHarness(), adapter = h.adapter(); await adapter.ready(); adapter.set(persisted);
    const reopened = h.adapter(); await reopened.ready(); expect(reopened.get()).toEqual(persisted);
  });

  it("rejects invalid UTF-8 bytes returned from native decryption", async () => {
    const h = platformHarness(), adapter = h.adapter(); await adapter.ready(); adapter.set(persisted);
    const invoke = h.android.invoke.getMockImplementation()!;
    h.android.invoke.mockImplementation((target, method, ...args) => method === "doFinal" ? Buffer.from([0xc3, 0x28]) : invoke(target, method, ...args));
    expect(() => adapter.get()).toThrow("NATIVE_SESSION_STORAGE_UNAVAILABLE");
  });

  it.each(["deleteKey", "commit"] as const)("surfaces %s failure, prevents old restoration, and completes cleanup at startup", async failure => {
    const h = platformHarness(), adapter = h.adapter(); await adapter.ready(); adapter.set(persisted);
    h.fail[failure] = true;
    expect(() => adapter.remove()).toThrow("NATIVE_SESSION_STORAGE_UNAVAILABLE");
    // A tombstone or deleted key is a confirmed durable barrier, not a false
    // claim that every platform delete completed.
    const blocked = h.adapter(); await blocked.ready(); expect(() => blocked.get()).toThrow("NATIVE_SESSION_STORAGE_UNAVAILABLE");
    h.fail[failure] = false;
    const retry = h.adapter(); await retry.ready();
    expect(retry.get()).toBeNull();
    expect(h.keys.size).toBe(0);
    retry.set({ ...persisted, user: { ...persisted.user, userId: 7102 } });
    expect(retry.get()).toEqual(expect.objectContaining({ user: expect.objectContaining({ userId: 7102 }) }));
  });

  it("does not claim durable logout when all native mutations fail", async () => {
    const h = platformHarness(), adapter = h.adapter(); await adapter.ready(); adapter.set(persisted);
    h.fail.commit = h.fail.deleteKey = true;
    const vault = createSessionVault(adapter, { deferHydration: true }); vault.hydrate();
    expect(() => vault.clear()).toThrow("NATIVE_SESSION_STORAGE_UNAVAILABLE");
    expect(vault.read()).toBeNull();
    expect(h.keys.size).toBe(1); // No mutation succeeded; a durable logout is unconfirmed.
  });

  it.each([false, true])("logs out its rotated original chain and surfaces native deletion failure=%s", async failDeletion => {
    const h = platformHarness(), adapter = h.adapter(); await adapter.ready();
    const vault = createSessionVault(adapter, { deferHydration: true }); vault.hydrate();
    vault.save({ ...persisted, accessToken: "synthetic-original-access" });
    let finish!: () => void;
    const request = vi.fn((input: { url: string }) => input.url.endsWith("/logout")
      ? new Promise<{ status: number; data: unknown; headers: {} }>(resolve => { finish = () => resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: null }, headers: {} }); })
      : Promise.resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: { ...persisted, refreshToken: "synthetic-rotated-refresh", accessToken: "synthetic-rotated-access" } }, headers: {} }));
    const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request } });
    const auth = createAuthApi(client, vault), revision = vault.revision();
    const logout = auth.logout();
    await client.refreshSession();
    expect(vault.revision()).toBe(revision + 1); expect(vault.isRefreshContinuation(revision)).toBe(true);
    h.fail.deleteKey = failDeletion;
    finish();
    if (failDeletion) await expect(logout).rejects.toThrow("NATIVE_SESSION_STORAGE_UNAVAILABLE");
    else await logout;
    expect(vault.read()).toBeNull();
    h.fail.deleteKey = false;
    const reopened = h.adapter(); await reopened.ready(); expect(reopened.get()).toBeNull();
    expect(h.keys.size).toBe(0);
  });

  it.each([7101, 7102])("keeps a server-accepted new login for owner %s after old logout", async userId => {
    const h = platformHarness(), adapter = h.adapter(); await adapter.ready();
    const vault = createSessionVault(adapter, { deferHydration: true }); vault.hydrate();
    vault.save({ ...persisted, accessToken: "synthetic-original-access" });
    let finish!: () => void;
    const request = vi.fn((input: { url: string }) => input.url.endsWith("/logout")
      ? new Promise<{ status: number; data: unknown; headers: {} }>(resolve => { finish = () => resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: null }, headers: {} }); })
      : Promise.resolve({ status: 200, data: { code: 0, message: "SYNTHETIC_RESPONSE", data: { ...persisted, refreshToken: "synthetic-new-login-refresh", accessToken: "synthetic-new-login-access", user: { ...persisted.user, userId } } }, headers: {} }));
    const auth = createAuthApi(createApiClient({ baseUrl: "https://example.test", vault, transport: { request } }), vault);
    const revision = vault.revision(), logout = auth.logout();
    await auth.login({ countryCode: "+86", phone: persisted.user.phone, password: "SYNTHETIC-LOCAL-ONLY" });
    expect(vault.isRefreshContinuation(revision)).toBe(false);
    finish(); await logout;
    expect(vault.read()?.accessToken).toBe("synthetic-new-login-access");
    const reopened = h.adapter(); await reopened.ready(); expect(reopened.get()).toEqual(expect.objectContaining({ refreshToken: "synthetic-new-login-refresh", user: expect.objectContaining({ userId }) }));
  });

  it.each(["getString", "commit", "doFinal"])("rejects a thenable %s without treating it as native success", async method => {
    const h = platformHarness(), adapter = h.adapter(); await adapter.ready(); adapter.set(persisted);
    h.fail.asyncMethod = method;
    expect(() => method === "getString" ? adapter.get() : adapter.set(persisted)).toThrow("NATIVE_SESSION_STORAGE_UNAVAILABLE");
  });

  it("requires actual key spec readback before generating a key", async () => {
    const h = platformHarness(), adapter = h.adapter(); await adapter.ready(); h.fail.spec = true;
    expect(() => adapter.set(persisted)).toThrow("NATIVE_SESSION_STORAGE_UNAVAILABLE");
    expect(h.keys.size).toBe(0);
  });

  it("waits for plusready rather than reading or deleting through an absent bridge", async () => {
    const h = platformHarness(); let listener!: () => void;
    vi.stubGlobal("plus", undefined); vi.stubGlobal("document", { addEventListener: vi.fn((_name, callback) => { listener = callback; }) });
    const adapter = createNativeSessionStorage({ baseUrl: "https://example.test", installationId: () => "synthetic-install" });
    const ready = adapter.ready(); expect(h.android.invoke).not.toHaveBeenCalled();
    vi.stubGlobal("plus", h.platform); listener(); await ready;
    expect(adapter.get()).toBeNull();
  });

  it.each(["iOS", "old Android"])("keeps %s memory-only instead of using ordinary credential storage", async target => {
    const h = platformHarness(); if (target === "iOS") h.platform.os!.name = "iOS";
    else (h.classes["android.os.Build$VERSION"] as { SDK_INT: number }).SDK_INT = 22;
    const adapter = h.adapter(); await adapter.ready(); adapter.set(persisted);
    expect(adapter.get()).toBeUndefined(); expect(h.preferences.size).toBe(0); expect(h.keys.size).toBe(0);
  });
});
