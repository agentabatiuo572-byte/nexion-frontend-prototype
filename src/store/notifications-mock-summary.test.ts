import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/api/runtime", () => ({ remoteApiEnabled: false, notificationApi: {} }));
const storage = vi.hoisted(() => ({ readAccountRow: vi.fn(), writeAccountRow: vi.fn() }));
vi.mock("./account-scoped-storage", () => storage);
const { useNotifications } = await import("./notifications");

beforeEach(() => {
  setActivePinia(createPinia());
  storage.readAccountRow.mockReset();
  storage.writeAccountRow.mockReset();
});

describe("mock notification category totals", () => {
  it("derives every category from all local rows through push, read, delete and mark-all", async () => {
    const store = useNotifications();
    store.push({ id: "wallet-a", kind: "commission", title: "First" });
    store.push({ id: "wallet-b", kind: "staking", title: "Second" });
    store.push({ id: "reward", kind: "genesis", title: "Reward" });
    store.push({ id: "system", kind: "system", title: "System" });
    expect(store.unreadByCategory).toEqual({ finance: 2, device: 0, team: 0, rewards: 1, system: 1 });
    expect(store.unreadByCategoryExact).toBe(true);
    expect(store.unread).toBe(4);
    await store.markRead("wallet-a"); await store.clearRead();
    expect(store.unreadByCategory.finance).toBe(1);
    expect(store.unread).toBe(3);
    store.removeOne("reward");
    expect(store.unreadByCategory.rewards).toBe(0);
    await store.markAllRead();
    expect(store.unreadByCategory).toEqual({ finance: 0, device: 0, team: 0, rewards: 0, system: 0 });
    expect(store.unread).toBe(0);
    expect(storage.writeAccountRow).toHaveBeenCalled();
  });

  it("rebuilds categories from the bound account's persisted rows including unknown raw kinds", () => {
    storage.readAccountRow.mockReturnValueOnce({ items: [{ id: "a", kind: "system", rawKind: "device",
      priority: "normal", title: "Device", ts: 1, readAt: null }] })
      .mockReturnValueOnce({ items: [{ id: "b", kind: "system", rawKind: "future_event",
        priority: "normal", title: "Future", ts: 1, readAt: null }] });
    const store = useNotifications();
    expect(store.unreadByCategory.device).toBe(1);
    store.bindAccount("account-b");
    expect(store.unreadByCategory).toEqual({ finance: 0, device: 0, team: 0, rewards: 0, system: 1 });
    expect(store.unread).toBe(1);
    store.clearAll();
    expect(store.unread).toBe(0);
    expect(store.unreadByCategory.system).toBe(0);
  });
});
