import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { createSessionVault } from "./session-vault";
import { discardRotationNonce } from "./session-rotation-nonce";

const user = { userId: 7, countryCode: "+86", phone: "13800000007", nickname: "Fixture", onboardingComplete: true };
const snapshot = { accessToken: "old", refreshToken: "", tokenType: "Bearer",
  refreshCredentialMode: "cookie" as const, user };
const response = (token: string) => ({ status: 200, data: { code: 0, message: "success", data: {
  accessToken: token, refreshToken: null, tokenType: "Bearer", user,
} }, headers: {} });

function browser() {
  const values = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
  let tail: Promise<unknown> = Promise.resolve();
  vi.stubGlobal("navigator", { locks: { request: (_name: string, work: () => Promise<unknown>) => {
    const result = tail.then(work, work);
    tail = result.then(() => undefined, () => undefined);
    return result;
  } } });
  return values;
}

function client(request: (http: { headers: Record<string, string> }) => Promise<{
  status: number; data: unknown; headers: Record<string, string>;
}>) {
  const vault = createSessionVault();
  vault.save(snapshot);
  return createApiClient({ baseUrl: "https://example.test", vault, transport: { request },
    refreshCredentialMode: "cookie" });
}

afterEach(() => { discardRotationNonce(); vi.unstubAllGlobals(); });

describe("H5 rotation recovery nonce", () => {
  it("reuses the same stored proof after a lost Set-Cookie response, then clears it", async () => {
    const values = browser();
    let calls = 0;
    const sent: string[] = [];
    const request = vi.fn(async (http: { headers: Record<string, string> }) => {
      sent.push(http.headers["X-NexGrid-Rotation-Key"]);
      if (++calls === 1) throw new Error("server rotated, response lost during reload");
      return response("recovered");
    });
    await expect(client(request).refreshSession()).rejects.toThrow();
    expect(values.size).toBe(1);
    await expect(client(request).refreshSession()).resolves.toMatchObject({ accessToken: "recovered" });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(sent[1]).toBe(sent[0]);
    expect(values.size).toBe(0);
  });

  it("serializes two tabs and gives the second rotation a fresh nonce", async () => {
    const values = browser();
    const sent: string[] = [];
    const request = vi.fn(async (http: { headers: Record<string, string> }) => {
      sent.push(http.headers["X-NexGrid-Rotation-Key"]);
      return response(`access-${sent.length}`);
    });
    const a = client(request), b = client(request);
    await Promise.all([a.refreshSession(), b.refreshSession()]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).not.toBe(sent[1]);
    expect(values.size).toBe(0);
  });

  it("never sends a cookie rotation if the nonce cannot be persisted", async () => {
    const values = browser();
    vi.stubGlobal("window", { localStorage: {
      getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {},
    } });
    const request = vi.fn(async () => response("unsafe"));
    await expect(client(request).refreshSession()).rejects.toThrow("COOKIE_ROTATION_STORAGE_UNAVAILABLE");
    expect(request).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  it("retries a superseded rotation once with the shared cookie and the same nonce", async () => {
    const values = browser();
    const sent: string[] = [];
    const request = vi.fn(async (http: { headers: Record<string, string> }) => {
      sent.push(http.headers["X-NexGrid-Rotation-Key"]);
      return sent.length === 1
        ? { status: 200, data: { code: 409, message: "USER_REFRESH_ROTATION_SUPERSEDED", data: null }, headers: {} }
        : response("newer-cookie-access");
    });

    await expect(client(request).refreshSession()).resolves.toMatchObject({ accessToken: "newer-cookie-access" });
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe(sent[0]);
    expect(values.size).toBe(0);
  });

  it("ends local recovery after two superseded responses without revoking the server chain", async () => {
    const values = browser();
    const request = vi.fn(async () => ({ status: 200,
      data: { code: 409, message: "USER_REFRESH_ROTATION_SUPERSEDED", data: null }, headers: {} }));

    await expect(client(request).refreshSession()).rejects.toThrow("SESSION_EXPIRED");
    expect(request).toHaveBeenCalledTimes(2);
    expect(values.size).toBe(0);
  });
});
