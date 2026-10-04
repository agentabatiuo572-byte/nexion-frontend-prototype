import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { NotificationPreferences } from "@/api/notification-preferences-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  notificationPreferencesApi: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { usePreferences } = await import("./preferences");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function canonical(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    commission: true, team: true, staking: true, market: true, genesis: true, system: true,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  remote.notificationPreferencesApi.get.mockReset();
  remote.notificationPreferencesApi.patch.mockReset();
});

describe("notification preference remote generation", () => {
  it("retains a confirmed legacy system value on read or patch failure", async () => {
    remote.notificationPreferencesApi.get.mockResolvedValueOnce(canonical({ system: false })).mockRejectedValueOnce(new Error("unavailable"));
    remote.notificationPreferencesApi.patch.mockRejectedValueOnce(new Error("unavailable"));
    const store = usePreferences();
    await store.refreshRemote();
    expect(store.notifPrefs.system).toBe(false);
    await store.refreshRemote();
    expect(store.notifPrefs.system).toBe(false);
    await store.toggleNotifKind("system");
    expect(store.notifPrefs.system).toBe(false);
    expect(store.error).not.toBeNull();
  });

  it("does not resurrect a recovered mutation failure after a later successful change", async () => {
    remote.notificationPreferencesApi.get.mockResolvedValue(canonical());
    remote.notificationPreferencesApi.patch.mockRejectedValueOnce(new Error("NOTIFICATION_PREFERENCES_UPDATE_FAILED"));
    const store = usePreferences();
    store.bindAccount("account-A");
    await Promise.resolve();
    await store.toggleNotifKind("commission");
    expect(store.error).toBe("updateFailed");
    await store.refreshRemote();
    expect(store.error).toBeNull();
    remote.notificationPreferencesApi.patch.mockResolvedValueOnce(canonical({ team: false }));
    await store.toggleNotifKind("team");
    expect(store.error).toBeNull();
    expect(store.notifPrefs.team).toBe(false);
  });

  it("does not confirm defaults before the initial read or after its failure", async () => {
    const get = deferred<NotificationPreferences>();
    remote.notificationPreferencesApi.get.mockReturnValueOnce(get.promise);
    const store = usePreferences();
    store.bindAccount("account-A");
    expect(store.remoteReady).toBe(false);
    get.reject(new Error("NETWORK_ERROR"));
    await Promise.resolve();
    expect(store.remoteReady).toBe(false);
    expect(store.error).not.toBeNull();
    remote.notificationPreferencesApi.get.mockResolvedValueOnce(canonical({ market: false }));
    await store.refreshRemote();
    expect(store.remoteReady).toBe(true);
    expect(store.notifPrefs.market).toBe(false);
  });

  it("keeps confirmed settings on retry failure but clears readiness on account change", async () => {
    remote.notificationPreferencesApi.get.mockResolvedValueOnce(canonical({ market: false }));
    const store = usePreferences();
    store.bindAccount("account-A");
    await Promise.resolve();
    expect(store.remoteReady).toBe(true);
    remote.notificationPreferencesApi.get.mockRejectedValueOnce(new Error("NETWORK_ERROR"));
    await store.refreshRemote();
    expect(store.remoteReady).toBe(true);
    expect(store.notifPrefs.market).toBe(false);
    const next = deferred<NotificationPreferences>();
    remote.notificationPreferencesApi.get.mockReturnValueOnce(next.promise);
    store.bindAccount("account-B");
    expect(store.remoteReady).toBe(false);
    next.resolve(canonical());
    await Promise.resolve();
    expect(store.remoteReady).toBe(true);
  });

  it("does not confirm a new account using an old account read response", async () => {
    const old = deferred<NotificationPreferences>();
    const next = deferred<NotificationPreferences>();
    remote.notificationPreferencesApi.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const store = usePreferences();
    store.bindAccount("account-A");
    store.bindAccount("account-B");
    old.resolve(canonical({ market: false }));
    await Promise.resolve();
    expect(store.remoteReady).toBe(false);
    next.resolve(canonical());
    await Promise.resolve();
    expect(store.remoteReady).toBe(true);
  });

  it("drops an old GET response after a same-account PATCH starts", async () => {
    const get = deferred<NotificationPreferences>();
    const patch = deferred<NotificationPreferences>();
    remote.notificationPreferencesApi.get.mockReturnValueOnce(get.promise);
    remote.notificationPreferencesApi.patch.mockReturnValueOnce(patch.promise);
    const store = usePreferences();

    store.bindAccount("account-A");
    const pendingPatch = store.toggleNotifKind("commission");
    patch.resolve(canonical({ commission: false }));
    await pendingPatch;
    get.resolve(canonical({ commission: true }));
    await Promise.resolve();

    expect(store.notifPrefs.commission).toBe(false);
    expect(store.loading).toBe(false);
  });

  it("serializes rapid mutations and keeps a failed earlier change visible for recovery", async () => {
    const first = deferred<NotificationPreferences>();
    const second = deferred<NotificationPreferences>();
    remote.notificationPreferencesApi.get.mockResolvedValue(canonical());
    remote.notificationPreferencesApi.patch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const store = usePreferences();
    store.bindAccount("account-A");

    const pendingFirst = store.toggleNotifKind("commission");
    const pendingSecond = store.toggleNotifKind("team");

    await Promise.resolve();
    expect(remote.notificationPreferencesApi.patch).toHaveBeenCalledTimes(1);
    first.reject(new Error("NOTIFICATION_PREFERENCES_UPDATE_FAILED"));
    await pendingFirst;

    expect(store.notifPrefs.commission).toBe(true);
    expect(store.notifPrefs.team).toBe(false);
    expect(store.error).toBe("updateFailed");
    expect(remote.notificationPreferencesApi.patch).toHaveBeenCalledTimes(2);

    second.resolve(canonical({ team: false }));
    await pendingSecond;

    expect(store.notifPrefs.commission).toBe(true);
    expect(store.notifPrefs.team).toBe(false);
    expect(store.error).toBe("updateFailed");
  });

  it("does not execute a queued mutation after its account scope changes", async () => {
    const first = deferred<NotificationPreferences>();
    remote.notificationPreferencesApi.get.mockResolvedValue(canonical());
    remote.notificationPreferencesApi.patch.mockReturnValueOnce(first.promise);
    const store = usePreferences();
    store.bindAccount("account-A");

    const pendingFirst = store.toggleNotifKind("commission");
    const queuedSecond = store.toggleNotifKind("team");
    await Promise.resolve();
    expect(remote.notificationPreferencesApi.patch).toHaveBeenCalledTimes(1);

    store.bindAccount("account-B");
    first.resolve(canonical({ commission: false }));
    await Promise.all([pendingFirst, queuedSecond]);

    expect(remote.notificationPreferencesApi.patch).toHaveBeenCalledTimes(1);
    expect(store.notifPrefs).toEqual(canonical());
    expect(store.error).toBeNull();
  });

  it("does not make a new account wait for an old account's in-flight mutation", async () => {
    const accountA = deferred<NotificationPreferences>();
    const accountB = deferred<NotificationPreferences>();
    remote.notificationPreferencesApi.get.mockResolvedValue(canonical());
    remote.notificationPreferencesApi.patch
      .mockReturnValueOnce(accountA.promise)
      .mockReturnValueOnce(accountB.promise);
    const store = usePreferences();
    store.bindAccount("account-A");

    const pendingA = store.toggleNotifKind("commission");
    await Promise.resolve();
    expect(remote.notificationPreferencesApi.patch).toHaveBeenCalledTimes(1);

    store.bindAccount("account-B");
    const pendingB = store.toggleNotifKind("team");
    await Promise.resolve();

    expect(remote.notificationPreferencesApi.patch).toHaveBeenCalledTimes(2);
    accountB.resolve(canonical({ team: false }));
    await pendingB;
    accountA.resolve(canonical({ commission: false }));
    await pendingA;
    expect(store.notifPrefs).toEqual(canonical({ team: false }));
  });

  it("drops a retry read that began while a PATCH was still pending", async () => {
    const patch = deferred<NotificationPreferences>();
    const oldRead = deferred<NotificationPreferences>();
    remote.notificationPreferencesApi.get
      .mockResolvedValueOnce(canonical())
      .mockReturnValueOnce(oldRead.promise);
    remote.notificationPreferencesApi.patch.mockReturnValueOnce(patch.promise);
    const store = usePreferences();
    store.bindAccount("account-A");
    await Promise.resolve();

    const pendingPatch = store.toggleNotifKind("commission");
    await Promise.resolve();
    const pendingRetry = store.refreshRemote();
    patch.resolve(canonical({ commission: false }));
    await pendingPatch;

    oldRead.resolve(canonical({ commission: true }));
    await pendingRetry;

    expect(store.notifPrefs.commission).toBe(false);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("keeps the newest same-account GET snapshot when an older GET resolves last", async () => {
    const oldRead = deferred<NotificationPreferences>();
    const newestRead = deferred<NotificationPreferences>();
    remote.notificationPreferencesApi.get
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newestRead.promise);
    const store = usePreferences();

    const pendingOld = store.refreshRemote();
    const pendingNewest = store.refreshRemote();
    newestRead.resolve(canonical({ commission: false }));
    await pendingNewest;
    oldRead.resolve(canonical({ commission: true }));
    await pendingOld;

    expect(store.notifPrefs.commission).toBe(false);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it("does not surface an older same-account GET failure after a newer GET succeeds", async () => {
    const oldRead = deferred<NotificationPreferences>();
    const newestRead = deferred<NotificationPreferences>();
    remote.notificationPreferencesApi.get
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newestRead.promise);
    const store = usePreferences();

    const pendingOld = store.refreshRemote();
    const pendingNewest = store.refreshRemote();
    newestRead.resolve(canonical({ market: false }));
    await pendingNewest;
    oldRead.reject(new Error("NOTIFICATION_PREFERENCES_UPDATE_FAILED"));
    await pendingOld;

    expect(store.notifPrefs.market).toBe(false);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });
});
