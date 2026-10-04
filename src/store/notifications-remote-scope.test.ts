import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { CanonicalNotificationPage } from "@/api/notification-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  notificationApi: {
    page: vi.fn(async (): Promise<CanonicalNotificationPage> => ({ items: [], unread: 0, nextCursor: null })),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    clearRead: vi.fn(),
    recordAction: vi.fn(),
  },
}));
const storage = vi.hoisted(() => ({
  readAccountRow: vi.fn(() => ({
    items: [{
      id: "local-only", kind: "system", priority: "normal", title: "local",
      ts: 1, readAt: null,
    }],
  })),
  writeAccountRow: vi.fn(),
}));

vi.mock("@/api/runtime", () => remote);
vi.mock("./account-scoped-storage", () => storage);

const { useNotifications } = await import("./notifications");

beforeEach(() => {
  setActivePinia(createPinia());
  storage.readAccountRow.mockClear();
  storage.writeAccountRow.mockClear();
  remote.notificationApi.page.mockReset().mockResolvedValue({ items: [], unread: 0, nextCursor: null });
  remote.notificationApi.markRead.mockReset();
  remote.notificationApi.markAllRead.mockReset();
  remote.notificationApi.clearRead.mockReset();
  remote.notificationApi.recordAction.mockReset();
});

describe("notifications remote authority", () => {
  it("keeps the last good snapshot when a refresh fails", async () => {
    remote.notificationApi.page
      .mockResolvedValueOnce({
        items: [{
          id: 7, kind: "system", priority: "normal", title: "Last good", body: "",
          ctaLabel: "", ctaHref: "", createdAt: 7, readAt: null,
        }],
        unread: 1,
        nextCursor: "next-7",
      })
      .mockRejectedValueOnce(new Error("refresh unavailable"));
    const store = useNotifications();
    await store.refreshRemote();

    await store.refreshRemote();

    expect(store.items.map((item) => item.id)).toEqual(["7"]);
    expect(store.unread).toBe(1);
    expect(store.nextCursor).toBe("next-7");
    expect(store.error).toBe("refresh unavailable");
  });

  it("keeps the newest refresh when an older same-account request finishes last", async () => {
    let resolveFirst!: (page: CanonicalNotificationPage) => void;
    let resolveSecond!: (page: CanonicalNotificationPage) => void;
    const first = new Promise<CanonicalNotificationPage>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<CanonicalNotificationPage>((resolve) => { resolveSecond = resolve; });
    remote.notificationApi.page
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second);
    const store = useNotifications();

    const older = store.refreshRemote();
    const newer = store.refreshRemote();
    resolveSecond({
      items: [{ id: 2, kind: "system", priority: "normal", title: "new", body: "", ctaLabel: "", ctaHref: "", createdAt: 2, readAt: null }],
      unread: 1,
      nextCursor: null,
    });
    await newer;
    resolveFirst({
      items: [{ id: 1, kind: "system", priority: "normal", title: "old", body: "", ctaLabel: "", ctaHref: "", createdAt: 1, readAt: null }],
      unread: 1,
      nextCursor: null,
    });
    await older;

    expect(store.items.map((item) => item.id)).toEqual(["2"]);
    expect(store.loading).toBe(false);
  });

  it("does not hydrate local notification rows before the server snapshot", async () => {
    const store = useNotifications();

    expect(storage.readAccountRow).not.toHaveBeenCalled();
    expect(store.items).toEqual([]);
    expect(store.unread).toBe(0);

    store.bindAccount("remote-account");
    await Promise.resolve();

    expect(storage.readAccountRow).not.toHaveBeenCalled();
    expect(store.items).toEqual([]);
    expect(store.unread).toBe(0);
  });

  it("keeps a successful CTA route when its secondary read acknowledgement fails", async () => {
    remote.notificationApi.page.mockResolvedValue({
      items: [{
        id: 41, kind: "system", priority: "normal", title: "Canonical CTA", body: "",
        ctaLabel: "Open", ctaHref: "/pages/store/store", createdAt: 1, readAt: null,
      }],
      unread: 1,
      nextCursor: null,
    });
    remote.notificationApi.recordAction.mockResolvedValue({
      notificationId: 41,
      action: "cta",
      route: "/pages/store/store",
      recorded: true,
    });
    remote.notificationApi.markRead.mockRejectedValue(new Error("read acknowledgement unavailable"));
    const store = useNotifications();
    await store.refreshRemote();

    await expect(store.recordCta("41")).resolves.toBe("/pages/store/store");

    expect(store.error).toBe("read acknowledgement unavailable");
    expect(store.unread).toBe(1);
    expect(remote.notificationApi.recordAction).toHaveBeenCalledWith(41, "cta", "notification-cta-41");
  });

  it("surfaces a read failure without changing the local canonical snapshot", async () => {
    remote.notificationApi.page.mockResolvedValue({
      items: [{
        id: 42, kind: "system", priority: "normal", title: "Unread", body: "",
        ctaLabel: "", ctaHref: "", createdAt: 1, readAt: null,
      }],
      unread: 1,
      nextCursor: null,
    });
    remote.notificationApi.markRead.mockRejectedValue(new Error("write unavailable"));
    const store = useNotifications();
    await store.refreshRemote();

    await expect(store.markRead("42")).resolves.toBe(false);

    expect(store.items[0]?.readAt).toBeNull();
    expect(store.unread).toBe(1);
    expect(store.error).toBe("write unavailable");
  });

  it("does not let a stale load-more snapshot undo a confirmed read", async () => {
    let resolveLoadMore!: (page: CanonicalNotificationPage) => void;
    remote.notificationApi.page
      .mockResolvedValueOnce({
        items: [{
          id: 51, kind: "system", priority: "normal", title: "Unread", body: "",
          ctaLabel: "", ctaHref: "", createdAt: 1, readAt: null,
        }],
        unread: 1,
        nextCursor: "next-1",
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLoadMore = resolve; }));
    remote.notificationApi.markRead.mockResolvedValue(undefined);
    const store = useNotifications();
    await store.refreshRemote();

    const staleLoadMore = store.loadMoreRemote();
    await store.markRead("51");
    resolveLoadMore({
      items: [{
        id: 52, kind: "system", priority: "normal", title: "Stale", body: "",
        ctaLabel: "", ctaHref: "", createdAt: 2, readAt: null,
      }],
      unread: 2,
      nextCursor: null,
    });
    await staleLoadMore;

    expect(store.items.map((item) => item.id)).toEqual(["51"]);
    expect(store.items[0]?.readAt).not.toBeNull();
    expect(store.unread).toBe(0);
    expect(store.loading).toBe(false);
  });

  it("does not let a stale refresh undo confirmed mark-all or clear-read writes", async () => {
    let resolveMarkAllRefresh!: (page: CanonicalNotificationPage) => void;
    let resolveClearRefresh!: (page: CanonicalNotificationPage) => void;
    remote.notificationApi.page
      .mockResolvedValueOnce({
        items: [{
          id: 61, kind: "system", priority: "normal", title: "Unread", body: "",
          ctaLabel: "", ctaHref: "", createdAt: 1, readAt: null,
        }],
        unread: 1,
        nextCursor: null,
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveMarkAllRefresh = resolve; }))
      .mockResolvedValueOnce({ items: [{ id: 61, kind: "system", priority: "normal", title: "Read", body: "", ctaLabel: "", ctaHref: "", createdAt: 1, readAt: 2 }], unread: 0, nextCursor: null })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveClearRefresh = resolve; }));
    remote.notificationApi.markAllRead.mockResolvedValue(undefined);
    remote.notificationApi.clearRead.mockResolvedValue(undefined);
    const store = useNotifications();
    await store.refreshRemote();

    const staleMarkAllRefresh = store.refreshRemote();
    await store.markAllRead();
    resolveMarkAllRefresh({
      items: [{
        id: 61, kind: "system", priority: "normal", title: "Stale unread", body: "",
        ctaLabel: "", ctaHref: "", createdAt: 1, readAt: null,
      }],
      unread: 1,
      nextCursor: null,
    });
    await staleMarkAllRefresh;
    expect(store.unread).toBe(0);
    expect(store.loading).toBe(false);

    const staleClearRefresh = store.refreshRemote();
    await store.clearRead();
    resolveClearRefresh({
      items: [{
        id: 61, kind: "system", priority: "normal", title: "Stale read", body: "",
        ctaLabel: "", ctaHref: "", createdAt: 1, readAt: 2,
      }],
      unread: 0,
      nextCursor: null,
    });
    await staleClearRefresh;
    expect(store.items).toEqual([]);
    expect(store.loading).toBe(false);
  });

  it("queues a refresh started after mark-read until the write has settled", async () => {
    let resolveMarkRead!: () => void;
    const markReadPending = new Promise<void>((resolve) => { resolveMarkRead = resolve; });
    remote.notificationApi.page
      .mockResolvedValueOnce({
        items: [{
          id: 71, kind: "system", priority: "normal", title: "Unread", body: "",
          ctaLabel: "", ctaHref: "", createdAt: 1, readAt: null,
        }],
        unread: 1,
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [{
          id: 71, kind: "system", priority: "normal", title: "Read", body: "",
          ctaLabel: "", ctaHref: "", createdAt: 1, readAt: 2,
        }],
        unread: 0,
        nextCursor: null,
      });
    remote.notificationApi.markRead.mockImplementationOnce(() => markReadPending);
    const store = useNotifications();
    await store.refreshRemote();

    const mutation = store.markRead("71");
    const refresh = store.refreshRemote();
    await Promise.resolve();
    expect(remote.notificationApi.page).toHaveBeenCalledTimes(1);

    resolveMarkRead();
    await mutation;
    await refresh;
    expect(store.items[0]?.readAt).toBe(2);
    expect(store.unread).toBe(0);
  });

  it("serializes mark-all and clear-read writes in user intent order", async () => {
    let resolveMarkAll!: () => void;
    const markAllPending = new Promise<void>((resolve) => { resolveMarkAll = resolve; });
    remote.notificationApi.page.mockResolvedValueOnce({
      items: [
        { id: 81, kind: "system", priority: "normal", title: "Unread", body: "", ctaLabel: "", ctaHref: "", createdAt: 1, readAt: null },
        { id: 82, kind: "system", priority: "normal", title: "Read", body: "", ctaLabel: "", ctaHref: "", createdAt: 2, readAt: 2 },
      ],
      unread: 1,
      nextCursor: null,
    });
    remote.notificationApi.markAllRead.mockImplementationOnce(() => markAllPending);
    remote.notificationApi.clearRead.mockResolvedValueOnce(undefined);
    const store = useNotifications();
    await store.refreshRemote();

    const markAll = store.markAllRead();
    const clear = store.clearRead();
    await Promise.resolve();
    expect(remote.notificationApi.markAllRead).toHaveBeenCalledTimes(1);
    expect(remote.notificationApi.clearRead).not.toHaveBeenCalled();

    resolveMarkAll();
    await markAll;
    await clear;
    expect(remote.notificationApi.clearRead).toHaveBeenCalledTimes(1);
    expect(store.items).toEqual([]);
    expect(store.unread).toBe(0);
  });

  it("queues CTA recording and its read acknowledgement before a later refresh", async () => {
    let resolveAction!: (value: { notificationId: number; action: "cta"; route: string; recorded: boolean }) => void;
    const actionPending = new Promise<{ notificationId: number; action: "cta"; route: string; recorded: boolean }>((resolve) => { resolveAction = resolve; });
    remote.notificationApi.page
      .mockResolvedValueOnce({
        items: [{
          id: 91, kind: "system", priority: "normal", title: "CTA", body: "",
          ctaLabel: "Open", ctaHref: "/pages/store/store", createdAt: 1, readAt: null,
        }],
        unread: 1,
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [{
          id: 91, kind: "system", priority: "normal", title: "CTA", body: "",
          ctaLabel: "Open", ctaHref: "/pages/store/store", createdAt: 1, readAt: 2,
        }],
        unread: 0,
        nextCursor: null,
      });
    remote.notificationApi.recordAction.mockImplementationOnce(() => actionPending);
    remote.notificationApi.markRead.mockResolvedValueOnce(undefined);
    const store = useNotifications();
    await store.refreshRemote();

    const action = store.recordCta("91");
    const refresh = store.refreshRemote();
    await Promise.resolve();
    expect(remote.notificationApi.page).toHaveBeenCalledTimes(1);

    resolveAction({ notificationId: 91, action: "cta", route: "/pages/store/store", recorded: true });
    await expect(action).resolves.toBe("/pages/store/store");
    await refresh;
    expect(remote.notificationApi.markRead).toHaveBeenCalledWith(91);
    expect(store.items[0]?.readAt).toBe(2);
    expect(store.unread).toBe(0);
  });
});

describe("global notification totals and head refresh", () => {
  const row = (id: number, readAt: number | null = null) => ({ id, kind: "wallet", priority: "normal" as const,
    title: String(id), body: "", ctaLabel: "", ctaHref: "", createdAt: id, readAt });

  it("decrements a paginated global total once across duplicate reads and CTA", async () => {
    remote.notificationApi.page.mockResolvedValueOnce({ items: [row(1), row(2)], unread: 11, nextCursor: "older" });
    remote.notificationApi.recordAction.mockResolvedValue({ route: "/pages/me/wallet" });
    const store = useNotifications();
    await store.refreshRemote();
    expect(store.items[0].rawKind).toBe("wallet");
    await Promise.all([store.markRead("1"), store.markRead("1")]);
    expect(store.unread).toBe(10);
    expect(remote.notificationApi.markRead).toHaveBeenCalledTimes(1);
    await store.recordCta("1");
    expect(store.unread).toBe(10);
    await store.recordCta("2");
    expect(store.unread).toBe(9);
  });

  it("retains loaded historical rows and the older cursor on a head refresh", async () => {
    remote.notificationApi.page
      .mockResolvedValueOnce({ items: [row(4), row(3)], unread: 9, nextCursor: "3" })
      .mockResolvedValueOnce({ items: [row(2), row(1)], unread: 9, nextCursor: "1" })
      .mockResolvedValueOnce({ items: [row(5), row(4)], unread: 10, nextCursor: "4" });
    const store = useNotifications();
    await store.refreshRemote(); await store.loadMoreRemote(); await store.refreshRemote();
    expect(store.items.map(item => item.id)).toEqual(["5", "4", "3", "2", "1"]);
    expect(store.nextCursor).toBe("1");
    expect(store.unread).toBe(10);
  });

  it("keeps an exhausted historical cursor exhausted when a new head arrives", async () => {
    remote.notificationApi.page
      .mockResolvedValueOnce({ items: [row(2)], unread: 2, nextCursor: "2" })
      .mockResolvedValueOnce({ items: [row(1)], unread: 2, nextCursor: null })
      .mockResolvedValueOnce({ items: [row(3), row(2)], unread: 3, nextCursor: "2" });
    const store = useNotifications();
    await store.refreshRemote(); await store.loadMoreRemote(); await store.refreshRemote();
    expect(store.items.map(item => item.id)).toEqual(["3", "2", "1"]);
    expect(store.nextCursor).toBeNull();
  });

  it("reconciles mark-all outside the write queue and counts newly arriving unread", async () => {
    remote.notificationApi.page
      .mockResolvedValueOnce({ items: [row(1)], unread: 11, nextCursor: "1" })
      .mockResolvedValueOnce({ items: [row(2), row(1, 2)], unread: 1, nextCursor: null });
    const store = useNotifications();
    await store.refreshRemote(); await store.markAllRead();
    expect(store.unread).toBe(1);
    expect(store.items[0].readAt).toBeNull();
  });

  it("fills an offline arrival gap without losing or misordering loaded history", async () => {
    remote.notificationApi.page
      .mockResolvedValueOnce({ items: [row(4), row(3)], unread: 4, nextCursor: "3" })
      .mockResolvedValueOnce({ items: [row(2), row(1)], unread: 4, nextCursor: null })
      .mockResolvedValueOnce({ items: [row(8), row(7)], unread: 8, nextCursor: "7" })
      .mockResolvedValueOnce({ items: [row(6), row(5)], unread: 8, nextCursor: "5" })
      .mockResolvedValueOnce({ items: [row(4), row(3)], unread: 8, nextCursor: "3" })
      .mockResolvedValueOnce({ items: [row(2), row(1)], unread: 8, nextCursor: null });
    const store = useNotifications();
    await store.refreshRemote(); await store.loadMoreRemote(); await store.refreshRemote();
    expect(store.nextCursor).toBe("7");
    await store.loadMoreRemote(); await store.loadMoreRemote(); await store.loadMoreRemote();
    expect(store.items.map(item => item.id)).toEqual(["8", "7", "6", "5", "4", "3", "2", "1"]);
    expect(store.nextCursor).toBeNull();
  });

  it.each(["markAllRead", "clearRead"] as const)("does not start a late %s reconciliation after leaving the foreground", async action => {
    remote.notificationApi.page.mockResolvedValueOnce({ items: [row(1)], unread: 1, nextCursor: null });
    let resolve!: () => void;
    remote.notificationApi[action].mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    const store = useNotifications();
    await store.refreshRemote();
    const pending = store[action]();
    await Promise.resolve();
    store.cancelRefresh();
    resolve(); await pending;
    expect(remote.notificationApi.page).toHaveBeenCalledTimes(1);
    expect(store.loading).toBe(false);
  });

  it("keeps unread and server-retained read rows after clear-read", async () => {
    const locked = { ...row(2, 1), priority: "critical" as const };
    remote.notificationApi.page
      .mockResolvedValueOnce({ items: [row(3, 1), locked, row(1)], unread: 11, nextCursor: "1" })
      .mockResolvedValueOnce({ items: [locked, row(1)], unread: 11, nextCursor: "1" });
    const store = useNotifications();
    await store.refreshRemote(); await store.clearRead();
    expect(store.unread).toBe(11);
    expect(store.items.map(item => item.id)).toEqual(["2", "1"]);
  });

  it("rejects a foreground read after cancellation and does not reload on logout", async () => {
    let resolve!: (value: CanonicalNotificationPage) => void;
    remote.notificationApi.page.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const store = useNotifications();
    const pending = store.refreshRemote();
    store.cancelRefresh();
    resolve({ items: [row(1)], unread: 1, nextCursor: null });
    await pending;
    expect(store.items).toEqual([]);
    expect(store.loading).toBe(false);
    store.bindAccount("default");
    expect(remote.notificationApi.page).toHaveBeenCalledTimes(1);
  });
});

describe("account-wide unread categories", () => {
  const row = (id: number, kind = "wallet", readAt: number | null = null) => ({ id, kind, priority: "normal" as const,
    title: String(id), body: "", ctaLabel: "", ctaHref: "", createdAt: id, readAt });
  const empty = { finance: 0, device: 0, team: 0, rewards: 0, system: 0 };

  it("includes unseen kinds beyond the first 100 rows and keeps the server total exact", async () => {
    remote.notificationApi.page.mockResolvedValueOnce({
      items: Array.from({ length: 100 }, (_, index) => row(index + 1)),
      unread: 111, unreadByKind: { wallet: 100, device: 7, team: 2, reward: 1, future_event: 1 }, nextCursor: "older",
    });
    const store = useNotifications();
    await store.refreshRemote();
    expect(store.items).toHaveLength(100);
    expect(store.unread).toBe(111);
    expect(store.unreadByCategory).toEqual({ finance: 100, device: 7, team: 2, rewards: 1, system: 1 });
    expect(store.unreadByCategoryExact).toBe(true);
  });

  it("keeps a category unread for another raw kind and decrements each confirmed read only once", async () => {
    remote.notificationApi.page.mockResolvedValueOnce({ items: [row(1), row(2, "commission")],
      unread: 3, unreadByKind: { wallet: 1, commission: 2 }, nextCursor: "older" })
      .mockResolvedValueOnce({ items: [row(1, 'wallet', 1), row(2, 'commission')], unread: 2, unreadByKind: { commission: 2 }, nextCursor: 'older' })
      .mockResolvedValueOnce({ items: [row(1, 'wallet', 1), row(2, 'commission')], unread: 2, unreadByKind: { commission: 2 }, nextCursor: 'older' })
      .mockResolvedValueOnce({ items: [row(1, 'wallet', 1), row(2, 'commission', 2)], unread: 1, unreadByKind: { commission: 1 }, nextCursor: 'older' });
    remote.notificationApi.recordAction.mockResolvedValue({ route: "/pages/me/wallet" });
    const store = useNotifications();
    await store.refreshRemote();
    await Promise.all([store.markRead("1"), store.markRead("1")]);
    expect(store.unreadByCategory.finance).toBe(2);
    expect(store.unread).toBe(2);
    await store.recordCta("1");
    expect(store.unreadByCategory.finance).toBe(2);
    await store.recordCta("2");
    expect(store.unreadByCategory.finance).toBe(1);
    expect(store.unread).toBe(1);
  });

  it("retains the last good summary when refresh or read acknowledgements fail", async () => {
    remote.notificationApi.page.mockResolvedValueOnce({ items: [row(1)], unread: 2,
      unreadByKind: { wallet: 1, device: 1 }, nextCursor: "older" }).mockRejectedValue(new Error("offline"));
    remote.notificationApi.markRead.mockRejectedValue(new Error("read failed"));
    const store = useNotifications();
    await store.refreshRemote();
    await store.markRead("1");
    expect(store.unreadByCategory).toEqual({ ...empty, finance: 1, device: 1 });
    await store.refreshRemote();
    expect(store.unreadByCategory).toEqual({ ...empty, finance: 1, device: 1 });
    expect(store.unread).toBe(2);
    expect(store.unreadByCategoryExact).toBe(true);
  });

  it("zeros every category after confirmed mark-all even when its refresh fails", async () => {
    remote.notificationApi.page.mockResolvedValueOnce({ items: [row(1)], unread: 2,
      unreadByKind: { wallet: 1, device: 1 }, nextCursor: "older" }).mockRejectedValue(new Error("offline"));
    const store = useNotifications();
    await store.refreshRemote();
    await store.markAllRead();
    expect(store.unread).toBe(0);
    expect(store.unreadByCategory).toEqual(empty);
    expect(store.unreadByCategoryExact).toBe(true);
  });

  it("leaves unread groups untouched when clear-read reconciliation fails", async () => {
    remote.notificationApi.page.mockResolvedValueOnce({ items: [row(1), row(2, "device", 2)], unread: 2,
      unreadByKind: { wallet: 1, team: 1 }, nextCursor: "older" }).mockRejectedValue(new Error("offline"));
    const store = useNotifications();
    await store.refreshRemote();
    await store.clearRead();
    expect(store.unread).toBe(2);
    expect(store.unreadByCategory).toEqual({ ...empty, finance: 1, team: 1 });
  });

  it.each(["markAllRead", "clearRead"] as const)("preserves groups when %s itself fails", async action => {
    remote.notificationApi.page.mockResolvedValueOnce({ items: [row(1)], unread: 2,
      unreadByKind: { wallet: 1, team: 1 }, nextCursor: "older" });
    remote.notificationApi[action].mockRejectedValue(new Error("write failed"));
    const store = useNotifications();
    await store.refreshRemote();
    expect(await store[action]()).toBe(false);
    expect(store.unread).toBe(2);
    expect(store.unreadByCategory).toEqual({ ...empty, finance: 1, team: 1 });
    expect(store.items[0].readAt).toBeNull();
  });

  it("does not consume a category when a confirmed CTA's read acknowledgement fails", async () => {
    remote.notificationApi.page.mockResolvedValueOnce({ items: [row(1)], unread: 2,
      unreadByKind: { wallet: 1, team: 1 }, nextCursor: "older" });
    remote.notificationApi.recordAction.mockResolvedValue({ route: "/pages/me/wallet" });
    remote.notificationApi.markRead.mockRejectedValue(new Error("read failed"));
    const store = useNotifications();
    await store.refreshRemote();
    expect(await store.recordCta("1")).toBe("/pages/me/wallet");
    expect(store.unread).toBe(2);
    expect(store.unreadByCategory).toEqual({ ...empty, finance: 1, team: 1 });
  });

  it("takes fresh summary values from a tail page and a later head instead of retaining vanished groups", async () => {
    remote.notificationApi.page
      .mockResolvedValueOnce({ items: [row(3)], unread: 3, unreadByKind: { wallet: 1, device: 2 }, nextCursor: "3" })
      .mockResolvedValueOnce({ items: [row(2, "device")], unread: 2, unreadByKind: { wallet: 1, device: 1 }, nextCursor: null })
      .mockResolvedValue({ items: [row(4, "team"), row(3, "wallet", 1)], unread: 1, unreadByKind: { team: 1 }, nextCursor: "3" });
    const store = useNotifications();
    await store.refreshRemote(); await store.loadMoreRemote();
    expect(store.unreadByCategory).toEqual({ ...empty, finance: 1, device: 1 });
    await store.refreshRemote();
    expect(store.unreadByCategory).toEqual({ ...empty, team: 1 });
    expect(store.unread).toBe(1);
    await store.markRead("2");
    expect(store.unreadByCategory).toEqual({ ...empty, team: 1 });
    expect(store.unread).toBe(1);
  });

  it("falls back only to known loaded unread kinds when a new response omits its summary", async () => {
    remote.notificationApi.page
      .mockResolvedValueOnce({ items: [row(1)], unread: 5, unreadByKind: { wallet: 1, device: 4 }, nextCursor: "older" })
      .mockResolvedValueOnce({ items: [row(1), row(2, "unknown_event")], unread: 5, nextCursor: "older" });
    const store = useNotifications();
    await store.refreshRemote(); await store.refreshRemote();
    expect(store.unread).toBe(5);
    expect(store.unreadByCategory).toEqual({ ...empty, finance: 1, system: 1 });
    expect(store.unreadByCategoryExact).toBe(false);
    await store.markRead("1");
    expect(store.unreadByCategory).toEqual({ ...empty, system: 1 });
    expect(store.unread).toBe(4);
  });

  it("clears every dot when the authoritative total is zero even with stale retained history", async () => {
    remote.notificationApi.page
      .mockResolvedValueOnce({ items: [row(2)], unread: 2, nextCursor: "2" })
      .mockResolvedValueOnce({ items: [row(1, "device")], unread: 2, nextCursor: null })
      .mockResolvedValueOnce({ items: [row(2, "wallet", 2)], unread: 0, nextCursor: "2" });
    const store = useNotifications();
    await store.refreshRemote(); await store.loadMoreRemote(); await store.refreshRemote();
    expect(store.unread).toBe(0);
    expect(store.unreadByCategory).toEqual(empty);
    expect(store.unreadByCategoryExact).toBe(true);
  });

  it("resets groups on account switch and ignores the old account's late summary and read", async () => {
    let resolveOld!: (value: CanonicalNotificationPage) => void;
    let resolveRead!: () => void;
    remote.notificationApi.page
      .mockResolvedValueOnce({ items: [row(1)], unread: 2, unreadByKind: { wallet: 1, device: 1 }, nextCursor: "older" })
      .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ items: [row(9, "team")], unread: 1, unreadByKind: { team: 1 }, nextCursor: null });
    remote.notificationApi.markRead.mockReturnValueOnce(new Promise<void>(resolve => { resolveRead = resolve; }));
    const store = useNotifications();
    await store.refreshRemote();
    const oldRefresh = store.refreshRemote();
    const oldRead = store.markRead("1");
    await Promise.resolve();
    store.bindAccount("account-b");
    expect(store.unreadByCategory).toEqual(empty);
    await Promise.resolve();
    resolveRead(); await oldRead;
    resolveOld({ items: [row(1)], unread: 50, unreadByKind: { wallet: 50 }, nextCursor: "older" });
    await oldRefresh;
    expect(store.unreadByCategory).toEqual({ ...empty, team: 1 });
    expect(store.unread).toBe(1);
    expect(store.items.map(item => item.id)).toEqual(["9"]);
  });

  it.each(['markRead', 'recordCta', 'recordSwipeConversion'] as const)('%s cannot consume another unread of the same kind when old history was read elsewhere', async action => {
    remote.notificationApi.page
      .mockResolvedValueOnce({ items: [row(3)], unread: 2, unreadByKind: { wallet: 2 }, nextCursor: '3' })
      .mockResolvedValueOnce({ items: [row(2)], unread: 2, unreadByKind: { wallet: 2 }, nextCursor: null })
      .mockResolvedValue({ items: [row(3)], unread: 1, unreadByKind: { wallet: 1 }, nextCursor: '3' });
    remote.notificationApi.recordAction.mockResolvedValue({ route: '/pages/me/wallet' });
    const store = useNotifications();
    await store.refreshRemote(); await store.loadMoreRemote(); await store.refreshRemote();
    expect(store.items.find(item => item.id === '2')?.readAt).toBeNull();
    await store[action]('2');
    expect(store.items.find(item => item.id === '3')?.readAt).toBeNull();
    expect(store.unread).toBe(1);
    expect(store.unreadByCategory.finance).toBe(1);
    expect(store.unreadByCategoryExact).toBe(true);
  });

  it('preserves the last summary when confirmation succeeds but its reconciliation fails', async () => {
    remote.notificationApi.page.mockResolvedValueOnce({ items: [row(1)], unread: 2, unreadByKind: { wallet: 2 }, nextCursor: '1' })
      .mockRejectedValueOnce(new Error('summary offline'));
    const store = useNotifications();
    await store.refreshRemote(); await store.markRead('1');
    expect(store.items[0].readAt).not.toBeNull();
    expect(store.unread).toBe(2);
    expect(store.unreadByCategory.finance).toBe(2);
    expect(store.error).toBe('summary offline');
  });

  it('ignores a late post-read summary after switching accounts', async () => {
    let complete!: (page: CanonicalNotificationPage) => void;
    remote.notificationApi.page.mockResolvedValueOnce({ items: [row(1)], unread: 1, unreadByKind: { wallet: 1 }, nextCursor: null })
      .mockImplementationOnce(() => new Promise<CanonicalNotificationPage>(resolve => { complete = resolve; }))
      .mockResolvedValue({ items: [row(9, 'team')], unread: 1, unreadByKind: { team: 1 }, nextCursor: null });
    const store = useNotifications();
    await store.refreshRemote();
    const reading = store.markRead('1');
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    store.bindAccount('account-b');
    await vi.waitFor(() => expect(store.unreadByCategory.team).toBe(1));
    complete({ items: [], unread: 0, unreadByKind: {}, nextCursor: null });
    await reading;
    expect(store.unread).toBe(1);
    expect(store.unreadByCategory).toEqual({ ...empty, team: 1 });
  });
});
