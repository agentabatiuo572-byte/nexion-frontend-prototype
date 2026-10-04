import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { PaymentMethodCard } from "@/api/payment-method-api";
import type { CanonicalNotificationPage, NotificationActionResult } from "@/api/notification-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  paymentMethodApi: {
    list: vi.fn(),
    bind: vi.fn(),
    unbind: vi.fn(),
    setDefault: vi.fn(),
  },
  notificationApi: {
    page: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    clearRead: vi.fn(),
    recordAction: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useCards } = await import("./cards");
const { useNotifications } = await import("./notifications");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function card(account: string, isDefault = true): PaymentMethodCard {
  return {
    tokenId: account === "A" ? "101" : "202",
    version: 1,
    brand: "visa",
    last4: account === "A" ? "1111" : "2222",
    expiry: "12/30",
    holder: `${account} Holder`,
    status: "BOUND",
    isDefault,
    boundAt: "2026-08-16T00:00:00.000Z",
    source: "provider",
    sandbox: false,
    providerCanonical: true,
  };
}

function page(account: string, nextCursor: string | null = null): CanonicalNotificationPage {
  const id = account === "A" ? 11 : 22;
  return {
    items: [{
      id,
      kind: "system",
      priority: "normal",
      title: `${account} notification`,
      body: "body",
      ctaLabel: "Open",
      ctaHref: `/me/${account.toLowerCase()}`,
      createdAt: 1_755_292_800_000,
      readAt: null,
    }],
    nextCursor,
    unread: 1,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  remote.paymentMethodApi.list.mockResolvedValue([]);
  remote.paymentMethodApi.unbind.mockResolvedValue(undefined);
  remote.paymentMethodApi.setDefault.mockResolvedValue(undefined);
  remote.notificationApi.page.mockResolvedValue(page("B"));
  remote.notificationApi.markRead.mockResolvedValue(undefined);
  remote.notificationApi.markAllRead.mockResolvedValue(0);
  remote.notificationApi.clearRead.mockResolvedValue(0);
});

describe("remote account fences", () => {
  it("keeps persisted notification wording exactly as returned by the server", async () => {
    const original = page("B");
    original.items[0].title = "风险披露已更新";
    original.items[0].body = "Welcome to " + "Nex" + "Grid";
    remote.notificationApi.page.mockResolvedValueOnce(original);
    const store = useNotifications();
    await store.refreshRemote();
    expect(store.items[0]).toMatchObject({
      title: original.items[0].title,
      body: original.items[0].body,
      readAt: null,
      ctaHref: original.items[0].ctaHref,
    });
  });

  it("drops a late card list from the previous account", async () => {
    const store = useCards();
    await flush();
    const first = deferred<PaymentMethodCard[]>();
    const second = deferred<PaymentMethodCard[]>();
    remote.paymentMethodApi.list.mockReset();
    remote.paymentMethodApi.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    store.bindAccount("A");
    store.bindAccount("B");
    second.resolve([card("B")]);
    await flush();
    first.resolve([card("A")]);
    await flush();

    expect(store.cards.map((item) => item.holder)).toEqual(["B Holder"]);
    expect(store.defaultTokenId).toBe("202");
  });

  it("does not read back a card mutation after the account changes", async () => {
    const store = useCards();
    await flush();
    remote.paymentMethodApi.list.mockResolvedValue([card("A")]);
    store.bindAccount("A");
    await flush();
    const mutation = deferred<void>();
    remote.paymentMethodApi.setDefault.mockReturnValueOnce(mutation.promise);
    const pending = store.setDefault("101");

    remote.paymentMethodApi.list.mockResolvedValue([card("B")]);
    store.bindAccount("B");
    await flush();
    mutation.resolve();
    await pending;
    await flush();

    expect(remote.paymentMethodApi.list).toHaveBeenCalledTimes(3);
    expect(store.cards.map((item) => item.holder)).toEqual(["B Holder"]);
    expect(store.defaultTokenId).toBe("202");
  });

  it("drops a late notification page and failure after switching accounts", async () => {
    const store = useNotifications();
    const first = deferred<CanonicalNotificationPage>();
    const second = deferred<CanonicalNotificationPage>();
    remote.notificationApi.page.mockReset();
    remote.notificationApi.page.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    store.bindAccount("A");
    store.bindAccount("B");
    second.resolve(page("B"));
    await flush();
    first.reject(new Error("A request failed"));
    await flush();

    expect(store.items.map((item) => item.title)).toEqual(["B notification"]);
    expect(store.error).toBeNull();
  });

  it("drops a late notification pagination page after switching accounts", async () => {
    const store = useNotifications();
    const latePage = deferred<CanonicalNotificationPage>();
    remote.notificationApi.page.mockReset();
    remote.notificationApi.page
      .mockResolvedValueOnce(page("A", "A-next"))
      .mockReturnValueOnce(latePage.promise)
      .mockResolvedValueOnce(page("B"));

    store.bindAccount("A");
    await flush();
    const pending = store.loadMoreRemote();
    store.bindAccount("B");
    await flush();
    latePage.resolve(page("A"));
    await pending;
    await flush();

    expect(store.items.map((item) => item.title)).toEqual(["B notification"]);
    expect(store.nextCursor).toBeNull();
  });

  it("drops a late notification action route and mark-read mutation", async () => {
    const store = useNotifications();
    remote.notificationApi.page.mockResolvedValueOnce(page("A"));
    store.bindAccount("A");
    await flush();
    const action = deferred<NotificationActionResult>();
    remote.notificationApi.recordAction.mockReturnValueOnce(action.promise);
    const pending = store.recordCta("11");

    remote.notificationApi.page.mockResolvedValueOnce(page("B"));
    store.bindAccount("B");
    await flush();
    action.resolve({ notificationId: 11, action: "cta", route: "/me/a", recorded: true });

    await expect(pending).resolves.toBeNull();
    expect(remote.notificationApi.markRead).not.toHaveBeenCalled();
    expect(store.items.map((item) => item.title)).toEqual(["B notification"]);
  });
});
