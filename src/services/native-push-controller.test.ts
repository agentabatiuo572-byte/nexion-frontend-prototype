import { describe, expect, it, vi } from "vitest";
import { createSessionVault, type SessionSnapshot } from "@/api/session-vault";
import { createAuthApi } from "@/api/auth-api";
import { createApiClient, type ApiClient, type ApiRequest } from "@/api/api-client";
import { ApiError } from "@/api/errors";
import { createNativePushController, pushNotificationId, safePushRoute, validNativePushToken, type NativePushPort } from "./native-push-controller";
import pages from "@/pages.json";

const snapshot = (userId = 7): SessionSnapshot => ({ accessToken: `test-access-${userId}`, refreshToken: `test-refresh-${userId}`,
  tokenType: "Bearer", sessionGroup: "APP", installationId: "test-install", appSessionVersion: 1, sessionChainId: `test-chain-${userId}`,
  user: { userId, phone: "00000000000", countryCode: "+86", nickname: "Test", onboardingComplete: true } });
const turn = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function harness(loggedIn = true) {
  const vault = createSessionVault();
  if (loggedIn) vault.save(snapshot());
  let callback!: (event: { type: string; data: unknown }) => void;
  const request = vi.fn(async (input: ApiRequest): Promise<unknown> => input.path.startsWith("/api/me/push-notifications/") && input.method !== "POST"
    ? { notificationId: "note-1", route: "/pages/earn/device-detail?id=device-7" } : { registered: true });
  const client = { request } as unknown as ApiClient;
  const port: NativePushPort = {
    platform: "android", appVersion: "1.0.0", installationId: () => "test-install", bindingToken: vi.fn(() => "a".repeat(64)),
    permission: vi.fn(async () => "granted" as const), token: vi.fn(async () => ({ token: "fcm:" + "a".repeat(140), provider: "FCM" as const })),
    registrationUnavailable: vi.fn(), stop: vi.fn(), listen: cb => { callback = cb; }, navigate: vi.fn(async () => true), canNavigate: () => true, received: vi.fn(),
  };
  const push = createNativePushController(client, vault, port);
  vault.subscribe!(push.sessionChanged);
  push.start();
  return { push, vault, request, client, port, click: (data: unknown = { payload: { notificationId: "note-1" } }) => callback({ type: "click", data }),
    rotated: () => callback({ type: "token", data: {} }), receive: () => callback({ type: "receive", data: { payload: '{"notificationId":"note-1"}' } }) };
}
describe("native push trust and lifecycle", () => {
  it("registers the exact current APP install with proof and actual permission", async () => {
    const h = harness(); await turn();
    expect(h.request).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/me/push-installations/test-install", method: "PUT", authenticated: false,
      headers: { Authorization: "Bearer test-access-7", "X-Push-Binding-Token": "a".repeat(64) },
      body: { clientId: "fcm:" + "a".repeat(140), provider: "FCM", platform: "android", permission: "granted", appVersion: "1.0.0" } }));
  });
  it("revokes denied permission without requiring an APNs or FCM token", async () => {
    const h = harness(false); h.port.permission = vi.fn(async () => "denied" as const); h.vault.save(snapshot()); await turn();
    expect(h.request).toHaveBeenCalledWith(expect.objectContaining({ method: "DELETE", path: "/api/me/push-installations/test-install" }));
    expect(h.port.token).not.toHaveBeenCalled(); expect(h.port.stop).toHaveBeenCalledOnce();
    h.port.permission = vi.fn(async () => "granted" as const); h.push.foreground(); await turn();
    expect(h.request.mock.calls.some(([r]) => r.method === "PUT")).toBe(true);
  });
  it("exposes a failed binding request and clears it only after a successful retry", async () => {
    const h = harness(false); h.request.mockRejectedValueOnce(new Error("network"));
    h.vault.save(snapshot()); await turn();
    expect(h.port.registrationUnavailable).toHaveBeenLastCalledWith(true);
    h.push.foreground(); await turn();
    expect(h.port.registrationUnavailable).toHaveBeenLastCalledWith(false);
    expect(h.request.mock.calls.filter(([r]) => r.method === "PUT")).toHaveLength(2);
  });
  it.each(["success", "failure"] as const)("does not publish stale binding %s after account switch", async outcome => {
    const h = harness(false), old = deferred<unknown>(), next = deferred<unknown>();
    h.request.mockImplementationOnce(async () => { await old.promise; if (outcome === "failure") throw new Error("old failure"); return null; })
      .mockImplementationOnce(() => next.promise);
    h.vault.save(snapshot()); await turn(); h.vault.save(snapshot(8));
    old.resolve(null); await turn(); await turn();
    expect(h.port.registrationUnavailable).not.toHaveBeenCalled();
    next.resolve(null); await turn();
    expect(h.port.registrationUnavailable).toHaveBeenCalledExactlyOnceWith(false);
    expect(h.request.mock.calls[1][0].headers?.Authorization).toBe("Bearer test-access-8");
  });
  it("refreshes rotating native tokens on foreground", async () => {
    const h = harness(); await turn(); h.port.token = vi.fn(async () => ({ token: "rotated:" + "b".repeat(140), provider: "FCM" as const })); h.push.foreground(); await turn();
    expect(h.request.mock.calls.filter(([r]) => r.method === "PUT").map(([r]) => (r.body as { clientId: string }).clientId)).toEqual(["fcm:" + "a".repeat(140), "rotated:" + "b".repeat(140)]);
  });
  it("registers actual iOS APNs tokens and makes provider part of the registration cache", async () => {
    const h = harness(false);
    h.port.platform = "ios";
    h.port.token = vi.fn(async () => ({ token: "ab".repeat(32), provider: "APNS" as const }));
    h.vault.save(snapshot()); await turn();
    expect(h.request.mock.calls.find(([r]) => r.method === "PUT")?.[0].body).toMatchObject({ provider: "APNS", platform: "ios", clientId: "ab".repeat(32) });
    h.port.platform = "android";
    h.port.token = vi.fn(async () => ({ token: "fcmtoken:" + "b".repeat(1024), provider: "FCM" as const }));
    h.rotated(); await turn();
    expect(h.request.mock.calls.filter(([r]) => r.method === "PUT").map(([r]) => (r.body as any).provider)).toEqual(["APNS", "FCM"]);
  });
  it("resyncs a token rotation received while registration is still in flight", async () => {
    const h = harness(false), pending = deferred<unknown>();
    h.request.mockImplementationOnce(() => pending.promise);
    h.vault.save(snapshot()); await turn();
    h.port.token = vi.fn(async () => ({ token: "rotated:" + "b".repeat(140), provider: "FCM" as const }));
    h.rotated(); pending.resolve(null); await turn(); await turn();
    expect(h.request.mock.calls.filter(([r]) => r.method === "PUT").map(([r]) => (r.body as any).clientId)).toEqual(["fcm:" + "a".repeat(140), "rotated:" + "b".repeat(140)]);
  });
  it.each([
    { token: "local-fake-cid", provider: "FCM" },
    { token: "a".repeat(64), provider: "APNS" },
    { token: "x:" + "b".repeat(140), provider: "UNIPUSH" },
  ])("does not register malformed or platform-mismatched native tokens %j", async native => {
    const h = harness(false); h.port.token = vi.fn(async () => native as any);
    h.vault.save(snapshot()); await turn(); expect(h.request).not.toHaveBeenCalled();
  });
  it("leaves inbox available and retries SDK/configuration failure only at foreground", async () => {
    const h = harness(false); h.port.token = vi.fn(async () => { throw new Error("CONFIG_MISSING"); });
    h.vault.save(snapshot()); await turn(); expect(h.request).not.toHaveBeenCalled();
    h.port.token = vi.fn(async () => ({ token: "fcm:" + "a".repeat(140), provider: "FCM" as const }));
    h.push.foreground(); await turn(); expect(h.request).toHaveBeenCalledOnce();
  });
  it("never binds a different or non-APP server installation", async () => {
    const h = harness(false); h.vault.save({ ...snapshot(), installationId: "other" }); await turn(); expect(h.request).not.toHaveBeenCalled();
    h.vault.save({ ...snapshot(), sessionGroup: "H5" }); await turn(); expect(h.request).not.toHaveBeenCalled();
  });
  it("receives without navigating and resolves click through captured authorization", async () => {
    const h = harness(); await turn(); h.receive(); await turn();
    expect(h.port.received).toHaveBeenCalledOnce(); expect(h.port.navigate).not.toHaveBeenCalled();
    h.click({ payload: { notificationId: "note-1", url: "https://untrusted.invalid" } }); await turn();
    expect(h.port.navigate).toHaveBeenCalledWith("/pages/earn/device-detail?id=device-7");
    expect(h.request).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/me/push-notifications/note-1/opened", method: "POST", body: { installationId: "test-install" } }));
    h.click(); await turn(); expect(h.port.navigate).toHaveBeenCalledOnce();
  });
  it("opens the exact withdrawal returned by the authenticated notification resolver", async () => {
    const h = harness(); await turn();
    h.request.mockResolvedValueOnce({ notificationId: "note-1", route: "/pages/me/wallet-withdraw-tracking?id=WD-OWNED" });
    h.click(); await turn();
    expect(h.port.navigate).toHaveBeenCalledExactlyOnceWith("/pages/me/wallet-withdraw-tracking?id=WD-OWNED");
  });
  it("keeps cold clicks pending until authenticated UI restoration finishes", async () => {
    const h = harness(false); let ready = false; h.port.canNavigate = () => ready;
    h.click(); await turn(); expect(h.request).not.toHaveBeenCalled();
    h.vault.save(snapshot()); await turn(); expect(h.port.navigate).not.toHaveBeenCalled();
    ready = true; await h.push.flush(); expect(h.port.navigate).toHaveBeenCalledOnce();
  });
  it("drops queued notifications on logout/account switch", async () => {
    const h = harness(); await turn(); h.port.canNavigate = () => false; h.click();
    h.vault.clear(); h.vault.save(snapshot(8)); h.port.canNavigate = () => true; await h.push.flush();
    expect(h.port.navigate).not.toHaveBeenCalled();
  });
  it("fences stale token callbacks after switching account", async () => {
    const h = harness(false), cid = deferred<{ token: string; provider: "FCM" }>(); h.port.token = () => cid.promise;
    h.vault.save(snapshot()); await turn(); h.vault.save(snapshot(8)); cid.resolve({ token: "old:" + "c".repeat(140), provider: "FCM" }); await turn();
    expect(h.request.mock.calls.some(([r]) => r.headers?.Authorization === "Bearer test-access-7")).toBe(false);
    expect(h.request).toHaveBeenCalledWith(expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-access-8" }) }));
  });
  it("fences an old denied permission callback before stopping SDK or revoking the next account", async () => {
    const h = harness(false), permission = deferred<"denied">(); h.port.permission = () => permission.promise;
    h.vault.save(snapshot()); await turn();
    h.port.permission = vi.fn(async () => "granted" as const); h.vault.save(snapshot(8));
    permission.resolve("denied"); await turn(); await turn();
    expect(h.port.stop).not.toHaveBeenCalled();
    expect(h.request.mock.calls.some(([r]) => r.method === "DELETE" || r.headers?.Authorization === "Bearer test-access-7")).toBe(false);
    expect(h.request).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT", headers: expect.objectContaining({ Authorization: "Bearer test-access-8" }) }));
  });
  it("does not initialize a token or bind an unknown system permission", async () => {
    const h = harness(false); h.port.permission = vi.fn(async () => "unknown" as const);
    h.vault.save(snapshot()); await turn(); expect(h.port.token).not.toHaveBeenCalled(); expect(h.request).not.toHaveBeenCalled();
  });
  it("registers after cold native hydration refresh acquires its first access token", async () => {
    const h = harness(false);
    h.vault.save(snapshot());
    await turn();
    h.request.mockClear();
    h.vault.clear();
    const cold = createSessionVault({ get: () => ({ ...snapshot(), schema: 1 }), set() {}, remove() {} });
    const push = createNativePushController(h.client, cold, h.port); cold.subscribe!(push.sessionChanged); push.start();
    expect(cold.read()?.accessToken).toBe("");
    cold.refreshIfUnchanged(snapshot(), cold.revision()); await turn();
    expect(h.request).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT" }));
  });
  it("uses real ApiClient full /api URLs and the backend string ID response shape", async () => {
    const h = harness(); await turn();
    const transport = { request: vi.fn(async (input: { url: string; method: string }) => ({ status: 200,
      data: { code: 0, message: "OK", data: input.url.endsWith("/123") ? { notificationId: "123", route: "/pages/support/chat?cid=conv-123" } : null }, headers: {} })) };
    const client = createApiClient({ baseUrl: "https://api.example.test", transport, vault: h.vault });
    let click!: (event: { type: string; data: unknown }) => void;
    const push = createNativePushController(client, h.vault, { ...h.port, listen: callback => { click = callback; } }); push.start(); await turn();
    click({ type: "click", data: { payload: { notificationId: "123" } } }); await turn();
    expect(transport.request.mock.calls.map(([r]) => r.url)).toEqual([
      "https://api.example.test/api/me/push-installations/test-install", "https://api.example.test/api/me/push-notifications/123", "https://api.example.test/api/me/push-notifications/123/opened",
    ]);
    expect(transport.request.mock.calls[0][0]).toMatchObject({ body: { clientId: "fcm:" + "a".repeat(140), provider: "FCM", platform: "android" } });
    expect(h.port.navigate).toHaveBeenCalledWith("/pages/support/chat?cid=conv-123");
  });
  it("refreshes an expired click Bearer through the real ApiClient then navigates once", async () => {
    const h = harness(); await turn(); let click!: (event: { type: string; data: unknown }) => void;
    const unauthorized = vi.fn();
    const transport = { request: vi.fn(async (input: { url: string; method: string; headers: Record<string, string> }) => {
      const resolving = input.url.endsWith("/123");
      if (resolving && input.headers.Authorization === "Bearer test-access-7") return { status: 401, data: { code: 401, message: "USER_AUTH_REQUIRED", data: null }, headers: {} };
      return { status: 200, data: { code: 0, message: "OK", data: input.url.endsWith("/refresh")
        ? { ...snapshot(), accessToken: "rotated-access-7" } : resolving ? { notificationId: "123", route: "/pages/me/security" } : null }, headers: {} };
    }) };
    const client = createApiClient({ baseUrl: "https://api.example.test", transport, vault: h.vault, onUnauthorized: unauthorized });
    const push = createNativePushController(client, h.vault, { ...h.port, listen: callback => { click = callback; } });
    h.vault.subscribe!(push.sessionChanged); push.start(); await turn();
    click({ type: "click", data: { payload: { notificationId: "123" } } }); await turn(); await turn();
    expect(h.port.navigate).toHaveBeenCalledOnce(); expect(unauthorized).not.toHaveBeenCalled();
    expect(transport.request.mock.calls.filter(([r]) => r.url.endsWith("/123")).map(([r]) => r.headers.Authorization)).toEqual(["Bearer test-access-7", "Bearer rotated-access-7"]);
    expect(transport.request.mock.calls.find(([r]) => r.url.endsWith("/opened"))?.[0].headers.Authorization).toBe("Bearer rotated-access-7");
    expect(transport.request.mock.calls.filter(([r]) => r.url.endsWith("/refresh"))).toHaveLength(1);
  });
  it("refreshes an expired installation registration Bearer and retries only once", async () => {
    const h = harness(); await turn();
    const transport = { request: vi.fn(async (input: { url: string; headers: Record<string, string> }) => {
      if (input.url.includes("/push-installations/") && input.headers.Authorization === "Bearer test-access-7") return { status: 401, data: { code: 401, message: "USER_AUTH_REQUIRED", data: null }, headers: {} };
      return { status: 200, data: { code: 0, message: "OK", data: input.url.endsWith("/refresh") ? { ...snapshot(), accessToken: "rotated-access-7" } : null }, headers: {} };
    }) };
    const client = createApiClient({ baseUrl: "https://api.example.test", transport, vault: h.vault });
    const push = createNativePushController(client, h.vault, h.port); h.vault.subscribe!(push.sessionChanged); push.start(); await turn(); await turn();
    expect(transport.request.mock.calls.filter(([r]) => r.url.includes("/push-installations/")).map(([r]) => r.headers.Authorization)).toEqual(["Bearer test-access-7", "Bearer rotated-access-7"]);
    expect(transport.request.mock.calls.filter(([r]) => r.url.endsWith("/refresh"))).toHaveLength(1);
  });
  it("never retries the old click under another account when refresh is overtaken by login", async () => {
    const h = harness(); await turn(); const refreshed = deferred<any>(); let click!: (event: { type: string; data: unknown }) => void;
    const unauthorized = vi.fn();
    const transport = { request: vi.fn(async (input: { url: string; headers: Record<string, string> }) => {
      if (input.url.endsWith("/refresh")) return refreshed.promise;
      if (input.url.endsWith("/123")) return { status: 401, data: { code: 401, message: "USER_AUTH_REQUIRED", data: null }, headers: {} };
      return { status: 200, data: { code: 0, message: "OK", data: null }, headers: {} };
    }) };
    const client = createApiClient({ baseUrl: "https://api.example.test", transport, vault: h.vault, onUnauthorized: unauthorized });
    const push = createNativePushController(client, h.vault, { ...h.port, listen: callback => { click = callback; } });
    h.vault.subscribe!(push.sessionChanged); push.start(); await turn(); click({ type: "click", data: { notificationId: "123" } }); await turn();
    expect(transport.request.mock.calls.filter(([r]) => r.url.endsWith("/refresh"))).toHaveLength(1);
    h.vault.save(snapshot(8)); refreshed.resolve({ status: 200, data: { code: 0, message: "OK", data: { ...snapshot(), accessToken: "rotated-access-7" } }, headers: {} }); await turn(); await turn();
    expect(h.port.navigate).not.toHaveBeenCalled(); expect(unauthorized).not.toHaveBeenCalled(); expect(h.vault.read()?.user.userId).toBe(8);
    expect(transport.request.mock.calls.filter(([r]) => r.url.endsWith("/123"))).toHaveLength(1);
    expect(transport.request.mock.calls.some(([r]) => r.headers.Authorization === "Bearer rotated-access-7")).toBe(false);
  });
  it("fences a stale authorized route response after account switch", async () => {
    const h = harness(); await turn(); const route = deferred<unknown>(); h.request.mockImplementationOnce(() => route.promise);
    h.click(); await turn(); h.vault.save(snapshot(8)); route.resolve({ notificationId: "note-1", route: "/pages/me/security" }); await turn();
    expect(h.port.navigate).not.toHaveBeenCalled(); expect(h.request.mock.calls.filter(([r]) => r.path.endsWith("/opened"))).toHaveLength(0);
  });
  it("drains a newer click after the in-flight previous route response without a foreground tick", async () => {
    const h = harness(); await turn(); const first = deferred<unknown>();
    h.request.mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ notificationId: "note-2", route: "/pages/me/security" });
    h.click({ notificationId: "note-1" }); await turn();
    h.click({ notificationId: "note-2" }); await turn();
    first.resolve({ notificationId: "note-1", route: "/pages/me/wallet-bills" }); await turn(); await turn();
    expect(h.port.navigate).toHaveBeenCalledOnce(); expect(h.port.navigate).toHaveBeenCalledWith("/pages/me/security");
    expect(h.request.mock.calls.filter(([r]) => r.path.endsWith("/opened")).map(([r]) => r.path)).toEqual(["/api/me/push-notifications/note-2/opened"]);
  });
  it.each([401, 403, 404])("preserves a newer pending click when the old click resolves with %s", async status => {
    const h = harness(); await turn(); const first = deferred<unknown>();
    h.client.refreshSession = vi.fn(async () => snapshot());
    h.request.mockImplementation(async input => {
      if (input.path.endsWith("/note-1")) { await first.promise; throw new ApiError({ kind: "http", status, message: "denied" }); }
      return input.path.endsWith("/note-2") ? { notificationId: "note-2", route: "/pages/me/security" } : null;
    });
    h.click({ notificationId: "note-1" }); await turn(); h.click({ notificationId: "note-2" });
    first.resolve(null); await turn(); await turn();
    expect(h.port.navigate).toHaveBeenCalledOnce(); expect(h.port.navigate).toHaveBeenCalledWith("/pages/me/security");
    expect(h.request.mock.calls.filter(([r]) => r.path.endsWith("/opened")).map(([r]) => r.path)).toEqual(["/api/me/push-notifications/note-2/opened"]);
  });
  it("does not replace login with a late unauthenticated callback", async () => {
    const h = harness(); await turn(); const route = deferred<unknown>(); h.request.mockImplementationOnce(() => route.promise);
    h.click(); await turn(); h.vault.clear(); route.resolve({ notificationId: "note-1", route: "/pages/me/security" }); await turn();
    expect(h.port.navigate).not.toHaveBeenCalled();
  });
  it.each([403, 404])("drops stale or unauthorized IDs (%s)", async status => {
    const h = harness(); await turn(); h.request.mockRejectedValueOnce(new ApiError({ kind: "http", status, message: "denied" }));
    h.click(); await turn(); const calls = h.request.mock.calls.length; h.push.foreground(); await turn();
    expect(h.port.navigate).not.toHaveBeenCalled(); expect(h.request.mock.calls.length).toBe(calls);
  });
  it("retries transport failure on foreground without retrying every route tick", async () => {
    const h = harness(); await turn(); h.request.mockRejectedValueOnce(new Error("offline")); h.click(); await turn();
    const calls = h.request.mock.calls.length; await h.push.flush(); await h.push.flush(); expect(h.request.mock.calls.length).toBe(calls);
    h.push.foreground(); await turn(); expect(h.port.navigate).toHaveBeenCalledOnce();
  });
  it("resumes a click after a transient navigation guard clears in the same foreground", async () => {
    const h = harness(); await turn(); let ready = true; h.port.canNavigate = () => ready;
    const resolving = deferred<unknown>(); h.request.mockImplementationOnce(() => resolving.promise);
    h.click(); await turn(); ready = false;
    resolving.resolve({ notificationId: "note-1", route: "/pages/me/security" }); await turn();
    const count = h.request.mock.calls.length; await h.push.flush(); await h.push.flush();
    expect(h.request.mock.calls.length).toBe(count); expect(h.port.navigate).not.toHaveBeenCalled();
    ready = true; await h.push.flush(); expect(h.port.navigate).toHaveBeenCalledOnce();
  });
  it("retries a lost opened receipt on foreground without reopening the page", async () => {
    const h = harness(); await turn();
    h.request.mockResolvedValueOnce({ notificationId: "note-1", route: "/pages/me/security" }).mockRejectedValueOnce(new Error("offline"));
    h.click(); await turn(); expect(h.port.navigate).toHaveBeenCalledOnce();
    h.push.foreground(); await turn(); expect(h.port.navigate).toHaveBeenCalledOnce();
    expect(h.request.mock.calls.filter(([r]) => r.path.endsWith("/opened"))).toHaveLength(2);
  });
  it("revokes with captured old auth before logout clears it", async () => {
    const h = harness(); await turn(); const deleted = deferred<unknown>();
    h.request.mockImplementationOnce(() => deleted.promise);
    const logout = createAuthApi(h.client, h.vault, { beforeSessionEnd: h.push.revoke }).logout(); await turn();
    expect(h.vault.read()?.user.userId).toBe(7);
    expect(h.request.mock.calls.at(-1)?.[0]).toMatchObject({ method: "DELETE", path: "/api/me/push-installations/test-install", headers: { Authorization: "Bearer test-access-7" } });
    deleted.resolve(null); await logout; expect(h.vault.read()).toBeNull();
    h.click(); await turn(); expect(h.port.navigate).not.toHaveBeenCalled();
  });
  it("rejects unsafe server routes and mismatched resolver IDs", async () => {
    for (const result of [{ notificationId: "note-1", route: "https://untrusted.invalid" }, { notificationId: "another", route: "/pages/me/security" }]) {
      const h = harness(); await turn(); h.request.mockResolvedValueOnce(result); h.click(); await turn(); expect(h.port.navigate).not.toHaveBeenCalled();
    }
  });
});
describe("push input boundaries", () => {
  it.each([32, 64, 128, 4096])("accepts APNs variable-length hexadecimal tokens of %s characters", length => {
    expect(validNativePushToken({ token: "ab".repeat(length / 2), provider: "APNS" }, "ios")).toBe(true);
  });
  it.each(["", "a".repeat(33), "z".repeat(64), "ab".repeat(2049)])("rejects malformed or oversized APNs token %s", token => {
    expect(validNativePushToken({ token, provider: "APNS" }, "ios")).toBe(false);
  });
  it.each([null, [], "{", { payload: "bad" }, { payload: { notificationId: "../escape" } }, { notificationId: 3 }, { url: "/pages/me/security" }])("rejects malformed provider data %j", data => expect(pushNotificationId(data)).toBeNull());
  it("accepts supported provider wrappers", () => {
    expect(pushNotificationId('{"notificationId":"note-1"}')).toBe("note-1");
    expect(pushNotificationId({ payload: '{"notificationId":"note-1"}', title: "ignored" })).toBe("note-1");
  });
  it.each(["https://untrusted.invalid", "uvel://pay", "/pages/me/wallet-withdraw?amount=5", "/pages/me/security?url=https://bad", "/pages/me/support?conversationId=x&conversationId=y", "/pages/me/support?conversationId=%2Fother", "__proto__", "/pages/me/security#bad", "/pages/login/login"])("rejects unsafe route %s", route => expect(safePushRoute(route)).toBe(false));
  it.each(["", "?", "?id=", "?order=WD-OWNED", "?id=WD-OWNED&id=WD-OTHER", "?id=WD-OWNED&amount=5", "?id=%2Fother", "?id=WD-owned", "?id=WD-", "?id=WD_OWNED"])("rejects an ambiguous withdrawal push destination %s", query => {
    expect(safePushRoute(`/pages/me/wallet-withdraw-tracking${query}`)).toBe(false);
  });
  it("accepts only the canonical withdrawal number length range", () => {
    expect(safePushRoute("/pages/me/wallet-withdraw-tracking?id=WD-1")).toBe(true);
    expect(safePushRoute(`/pages/me/wallet-withdraw-tracking?id=WD-${"A".repeat(93)}`)).toBe(true);
    expect(safePushRoute(`/pages/me/wallet-withdraw-tracking?id=WD-${"A".repeat(94)}`)).toBe(false);
  });
  it("allowlisted entry points exist in the actual page registry", () => {
    for (const route of ["/pages/me/security", "/pages/me/notifications", "/pages/me/wallet-bills", "/pages/me/wallet-withdraw-tracking?id=WD-OWNED", "/pages/me/trial", "/pages/support/chat?cid=test-conversation", "/pages/earn/device-detail?id=test-device"]) {
      expect(safePushRoute(route)).toBe(true);
      expect(pages.pages.some(page => `/${page.path}` === route.split("?")[0])).toBe(true);
    }
  });
});
