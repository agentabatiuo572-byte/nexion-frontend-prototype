import type { ApiClient, ApiRequest } from "@/api/api-client";
import type { SessionSnapshot, SessionVault } from "@/api/session-vault";
import { ApiError } from "@/api/errors";

export type PushPermission = "granted" | "denied" | "unknown";
export interface NativePushPort {
  platform: "android" | "ios";
  appVersion: string;
  installationId(): string;
  bindingToken(): string;
  permission(request: boolean): Promise<PushPermission>;
  clientId(): Promise<string>;
  listen(callback: (event: { type: string; data: unknown }) => void): void;
  navigate(route: string): Promise<boolean>;
  canNavigate(): boolean;
  received(): void;
}

/** Provider payload is an identifier, never a navigation command. */
export function pushNotificationId(value: unknown): string | null {
  try {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const payload = "payload" in data ? (data as { payload: unknown }).payload : data;
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    const id = parsed?.notificationId;
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
  } catch { return null; }
}

// Explicit read-only entry points. No payment/activation commands or arbitrary query keys.
const ROUTES: Record<string, readonly string[]> = {
  "/pages/me/notifications": [],
  "/pages/me/security": [],
  "/pages/me/wallet-bills": [],
  "/pages/support/chat": ["cid"],
  "/pages/me/trial": [],
  "/pages/earn/device-detail": ["id"],
};
export function safePushRoute(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512 || /[\\#\s]/.test(value)) return false;
  const [path, query, extra] = value.split("?");
  const keys = Object.prototype.hasOwnProperty.call(ROUTES, path) ? ROUTES[path] : undefined;
  if (!keys || extra !== undefined) return false;
  if (!query) return true;
  const seen = new Set<string>();
  return query.split("&").every(pair => {
    const [key, val, overflow] = pair.split("=");
    if (!keys.includes(key) || seen.has(key) || !val || overflow !== undefined || !/^[A-Za-z0-9_-]{1,128}$/.test(val)) return false;
    seen.add(key); return true;
  });
}

export function createNativePushController(client: ApiClient, vault: SessionVault, port: NativePushPort) {
  let started = false, epoch = 0, blocked = false, syncing = false, opening = false;
  let pending: { id: string; epoch: number; userId?: number | string } | null = null;
  const opened = new Set<string>();
  let registered = "", retryAllowed = true;
  const current = (snapshot: SessionSnapshot, captured: number) => !blocked && epoch === captured
    && vault.read()?.user.userId === snapshot.user.userId
    && vault.read()?.sessionChainId === snapshot.sessionChainId;
  const headers = (snapshot: SessionSnapshot) => ({ Authorization: `Bearer ${snapshot.accessToken}` });
  async function authenticatedRequest<T>(request: ApiRequest, snapshot: SessionSnapshot, captured: number): Promise<T> {
    const send = () => {
      if (!current(snapshot, captured)) throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_PUSH" });
      return client.request<T>({ ...request, authenticated: false,
        headers: { ...request.headers, ...headers(vault.read()!) } });
    };
    try { return await send(); }
    catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 401 && error.code !== 401) || !current(snapshot, captured)) throw error;
      // Use the existing shared refresh/CAS flow. Its continuation keeps this
      // account epoch; a different login makes the retry ineligible.
      await client.refreshSession();
      return send();
    }
  }
  function installation(snapshot: SessionSnapshot): string | null {
    return snapshot.sessionGroup === "APP" && snapshot.installationId && snapshot.installationId === port.installationId() ? snapshot.installationId : null;
  }
  async function flush() {
    const snapshot = vault.read();
    if (opening || blocked || !retryAllowed || !snapshot?.accessToken || !pending || !port.canNavigate()) return;
    const click = pending, captured = epoch;
    if (click.epoch !== captured || (click.userId !== undefined && click.userId !== snapshot.user.userId)) { pending = null; return; }
    click.userId = snapshot.user.userId;
    opening = true;
    retryAllowed = false;
    try {
      const result = await authenticatedRequest<{ notificationId: string; route: string }>({
        path: `/api/me/push-notifications/${click.id}`,
      }, snapshot, captured);
      if (!current(snapshot, captured) || pending !== click) return;
      if (!port.canNavigate()) { retryAllowed = true; return; }
      if (result.notificationId !== click.id || !safePushRoute(result.route)) { pending = null; return; }
      const key = `${snapshot.user.userId}:${click.id}`;
      if (!opened.has(key)) {
        if (!await port.navigate(result.route) || !current(snapshot, captured)) return;
        opened.add(key);
      }
      const id = installation(snapshot);
      if (id) await authenticatedRequest({ path: `/api/me/push-notifications/${click.id}/opened`, method: "POST",
        body: { installationId: id } }, snapshot, captured);
      if (current(snapshot, captured) && pending === click) pending = null;
    } catch (error) {
      if (current(snapshot, captured) && error instanceof ApiError
        && [401, 403, 404].includes(error.status ?? error.code ?? 0)) pending = null;
    } finally { opening = false; if (epoch !== captured) void flush(); }
  }
  async function sync(requestPermission = false) {
    const snapshot = vault.read(), captured = epoch;
    if (syncing || blocked || !snapshot?.accessToken) return;
    const id = installation(snapshot);
    if (!id) return;
    syncing = true;
    try {
      const permission = await port.permission(requestPermission);
      if (!current(snapshot, captured)) return;
      const clientId = await port.clientId();
      if (!clientId || !current(snapshot, captured)) return;
      const key = JSON.stringify([snapshot.user.userId, snapshot.sessionChainId, id, clientId, permission]);
      if (key === registered) return;
      // Persist proof before the first request so a lost response can be retried.
      const token = port.bindingToken();
      await authenticatedRequest({ path: `/api/me/push-installations/${encodeURIComponent(id)}`, method: "PUT",
        headers: { "X-Push-Binding-Token": token },
        body: { clientId, platform: port.platform, permission, appVersion: port.appVersion } }, snapshot, captured);
      if (current(snapshot, captured)) registered = key;
    } catch { /* CID/configuration/network failure is retried on foreground; inbox stays available. */ }
    finally {
      syncing = false;
      // A new login may arrive while the old CID callback is pending.
      if (epoch !== captured && !blocked && vault.read()?.accessToken) void sync(true);
    }
  }
  async function revoke(snapshot: SessionSnapshot) {
    blocked = true; epoch += 1; pending = null; registered = ""; opened.clear();
    const id = installation(snapshot);
    if (!id || !snapshot.accessToken) return;
    try {
      await client.request({ path: `/api/me/push-installations/${encodeURIComponent(id)}`, method: "DELETE", authenticated: false,
        headers: { ...headers(snapshot), "X-Push-Binding-Token": port.bindingToken() } });
    } catch { /* Backend delivery also requires the original current APP session. */ }
  }
  function sessionChanged(previous: SessionSnapshot | null, next: SessionSnapshot | null, continuation: boolean) {
    if (continuation) return;
    if (previous?.accessToken) { epoch += 1; pending = null; registered = ""; opened.clear(); }
    // A cold click before refresh is retained only for this boot's first authenticated identity.
    if (pending && next?.accessToken && pending.userId === undefined) pending.userId = next.user.userId;
    blocked = false;
    if (next?.accessToken) void sync(true);
  }
  return {
    revoke, sessionChanged, flush, sync,
    foreground() { retryAllowed = true; void sync(); void flush(); },
    start() {
      if (started) return;
      started = true;
      port.listen(event => {
        const id = pushNotificationId(event.data);
        if (!id) return;
        if (event.type === "receive") { port.received(); return; }
        if (event.type !== "click" || blocked) return;
        pending = { id, epoch, userId: vault.read()?.user.userId };
        retryAllowed = true;
        void flush();
      });
      void sync(true);
    },
  };
}
