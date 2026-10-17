import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, type HttpRequest } from "./api-client";
import { ApiError } from "./errors";
import { createSessionVault, type KeyValueStorage } from "./session-vault";

afterEach(() => vi.unstubAllGlobals());
const user = { userId: 1058, countryCode: "+86", phone: "18700001058", nickname: "Fixture", onboardingComplete: true };
const initial = { accessToken: "A0", refreshToken: "R0", tokenType: "Bearer", user };
const ok = (refreshToken: string) => ({ status: 200, headers: {}, data: { code: 0, message: "success",
  data: { ...initial, accessToken: "A1", refreshToken } } });
function disk() {
  let value: unknown;
  const storage: KeyValueStorage = { get: () => structuredClone(value), set: next => { value = structuredClone(next); }, remove: () => { value = undefined; } };
  return storage;
}

describe("native refresh intent recovery", () => {
  it.each([false, true])("recovers a committed rotation after response loss (restart=%s)", async (restart) => {
    const storage = disk();
    let vault = createSessionVault(storage);
    vault.save(initial);
    let rotated = false;
    let firstNonce: string | undefined;
    let inserts = 0;
    const request = vi.fn(async (req: HttpRequest) => {
      expect(req.body).toEqual({ refreshToken: "R0" });
      const nonce = req.headers["X-NexGrid-Rotation-Key"];
      if (!rotated) {
        rotated = true; inserts += 1; firstNonce = nonce;
        throw new ApiError({ kind: "network", message: "REQUEST_TIMEOUT", retryable: true });
      }
      if (nonce && nonce === firstNonce) return ok("R1");
      return { status: 401, headers: {}, data: { code: 401, message: "USER_REFRESH_TOKEN_REUSE_DETECTED", data: null } };
    });
    const client = () => createApiClient({ baseUrl: "https://example.test", vault, transport: { request }, nativeRefreshRecovery: true });
    let api = client();
    await expect(api.refreshSession()).rejects.toThrow("REQUEST_TIMEOUT");
    expect(vault.read()?.refreshToken).toBe("R0");
    if (restart) { vault = createSessionVault(storage); api = client(); }
    await expect(api.refreshSession()).resolves.toMatchObject({ refreshToken: "R1" });
    expect(firstNonce).toMatch(/^[0-9a-f]{64}$/);
    expect(inserts).toBe(1);
    expect(storage.get()).toMatchObject({ refreshToken: "R1" });
    expect(storage.get()).not.toHaveProperty("refreshRotationNonce");
  });

  it("persists before transport, shares one request, then creates a fresh intent for the successor", async () => {
    const storage = disk(), vault = createSessionVault(storage); vault.save(initial);
    let finish!: (value: ReturnType<typeof ok>) => void;
    const request = vi.fn((req: HttpRequest) => {
      expect(storage.get()).toMatchObject({ refreshToken: (req.body as { refreshToken: string }).refreshToken,
        refreshRotationNonce: req.headers["X-NexGrid-Rotation-Key"] });
      return new Promise<ReturnType<typeof ok>>(resolve => { finish = resolve; });
    });
    const api = createApiClient({ baseUrl: "https://example.test", vault, transport: { request }, nativeRefreshRecovery: true });
    const first = api.refreshSession(), concurrent = api.refreshSession();
    expect(request).toHaveBeenCalledTimes(1);
    const firstNonce = request.mock.calls[0]![0].headers["X-NexGrid-Rotation-Key"];
    finish(ok("R1")); await Promise.all([first, concurrent]);
    const next = api.refreshSession();
    expect(request.mock.calls[1]![0].body).toEqual({ refreshToken: "R1" });
    expect(request.mock.calls[1]![0].headers["X-NexGrid-Rotation-Key"]).not.toBe(firstNonce);
    finish(ok("R2")); await next;
  });

  it.each(["entropy", "storage"])("does not send or destroy R0 when intent %s is unavailable", async (failure) => {
    const storage = disk(), vault = createSessionVault(storage); vault.save(initial);
    if (failure === "entropy") { vi.stubGlobal("crypto", {}); vi.stubGlobal("plus", undefined); }
    else storage.set = () => { throw new Error("write unavailable"); };
    const request = vi.fn();
    const api = createApiClient({ baseUrl: "https://example.test", vault, transport: { request }, nativeRefreshRecovery: true });
    await expect(api.refreshSession()).rejects.toThrow("NATIVE_REFRESH_INTENT_UNAVAILABLE");
    expect(request).not.toHaveBeenCalled(); expect(vault.read()?.refreshToken).toBe("R0");
  });

  it("uses Android secure UUID when Web Crypto is absent, without Math.random", () => {
    vi.stubGlobal("crypto", {});
    const invoke = vi.fn(() => "7a9bb4c6-55c7-4fbe-8c54-5b5bfbf60a01");
    vi.stubGlobal("plus", { android: { invoke } });
    const vault = createSessionVault(disk()); vault.save(initial);
    expect(vault.prepareRefreshRotation()).toMatch(/^[0-9a-f]{64}$/);
    expect(invoke.mock.calls).toEqual([["java.util.UUID", "randomUUID"], ["java.util.UUID", "randomUUID"]]);
  });

  it.each(["logout", "new login"])("discards the old intent on %s", (action) => {
    const storage = disk(), vault = createSessionVault(storage); vault.save(initial);
    const before = vault.prepareRefreshRotation();
    if (action === "logout") { vault.clear(); expect(storage.get()).toBeUndefined(); }
    vault.save({ ...initial, refreshToken: "new-login", user: { ...user, userId: 999 } });
    expect(storage.get()).not.toHaveProperty("refreshRotationNonce");
    expect(vault.prepareRefreshRotation()).not.toBe(before);
  });

  it.each([401, 403, 409])("only clears the old revision on terminal refresh outcome %s", async (status) => {
    const storage = disk(), vault = createSessionVault(storage); vault.save(initial);
    let finish!: (value: { status: number; headers: {}; data: { code: number; message: string; data: null } }) => void;
    const request = vi.fn(() => new Promise<any>(resolve => { finish = resolve; }));
    const onUnauthorized = vi.fn();
    const api = createApiClient({ baseUrl: "https://example.test", vault, transport: { request }, nativeRefreshRecovery: true, onUnauthorized });
    const first = api.refreshSession();
    vault.save({ ...initial, refreshToken: "new-login", user: { ...user, userId: 999 } });
    const newNonce = vault.prepareRefreshRotation();
    finish({ status, headers: {}, data: { code: status, message: status === 409 ? "USER_REFRESH_ROTATION_SUPERSEDED" : "USER_REFRESH_NOT_ALLOWED", data: null } });
    await expect(first).rejects.toThrow("SESSION_CHANGED_DURING_REFRESH");
    expect(vault.read()?.user.userId).toBe(999); expect(vault.prepareRefreshRotation()).toBe(newNonce);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("clears the matching intent on confirmed reuse rejection", async () => {
    const storage = disk(), vault = createSessionVault(storage); vault.save(initial);
    const onUnauthorized = vi.fn();
    const request = vi.fn(async () => ({ status: 401, headers: {}, data: { code: 401, message: "USER_REFRESH_TOKEN_REUSE_DETECTED", data: null } }));
    const api = createApiClient({ baseUrl: "https://example.test", vault, transport: { request }, nativeRefreshRecovery: true, onUnauthorized });
    await expect(api.refreshSession()).rejects.toThrow("SESSION_EXPIRED");
    expect(storage.get()).toBeUndefined(); expect(vault.read()).toBeNull(); expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("never commits a late successful response over a new account's pending intent", async () => {
    const storage = disk(), vault = createSessionVault(storage); vault.save(initial);
    let finish!: (value: ReturnType<typeof ok>) => void;
    const request = vi.fn(() => new Promise<ReturnType<typeof ok>>(resolve => { finish = resolve; }));
    const api = createApiClient({ baseUrl: "https://example.test", vault, transport: { request }, nativeRefreshRecovery: true });
    const first = api.refreshSession();
    vault.save({ ...initial, refreshToken: "new-login", user: { ...user, userId: 999 } });
    const newNonce = vault.prepareRefreshRotation(); finish(ok("R1"));
    await expect(first).rejects.toThrow("SESSION_CHANGED_DURING_REFRESH");
    expect(vault.read()?.user.userId).toBe(999); expect(vault.prepareRefreshRotation()).toBe(newNonce);
  });

  it("fails closed if successor persistence fails instead of publishing accepted credentials", async () => {
    const storage = disk(), vault = createSessionVault(storage); vault.save(initial);
    const request = vi.fn(async () => {
      storage.set = () => { throw new Error("durable write failed"); };
      return ok("R1");
    });
    const onSessionRefreshed = vi.fn();
    const api = createApiClient({ baseUrl: "https://example.test", vault, transport: { request }, nativeRefreshRecovery: true, onSessionRefreshed });
    await expect(api.refreshSession()).rejects.toThrow();
    expect(vault.read()).toBeNull(); expect(storage.get()).toBeUndefined();
    expect(onSessionRefreshed).not.toHaveBeenCalled();
  });

  it("rejects malformed persisted intent rather than issuing a different retry proof", () => {
    const storage = disk();
    storage.set({ ...initial, schema: 1, refreshRotationNonce: "malformed" });
    expect(createSessionVault(storage).read()).toBeNull(); expect(storage.get()).toBeUndefined();
  });
});
