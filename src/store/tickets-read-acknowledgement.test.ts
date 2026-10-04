import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ApiError } from "@/api/errors";
import { installSupportStorage } from "@/test/storage-setup";
import type { Ticket } from "@/domain/support";

installSupportStorage();

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  supportApi: {
    authorityRevision: vi.fn(),
    tickets: vi.fn(),
    ticket: vi.fn(),
    markTicketRead: vi.fn(),
    commandResult: vi.fn(async () => null),
    createTicket: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useTickets } = await import("./tickets");

function ticket(id: string, version: number, unread: number): Ticket {
  return {
    id,
    subject: `Ticket ${id}`,
    category: "technical",
    status: "open",
    priority: "normal",
    version,
    createdAt: 1_756_640_000_000,
    updatedAt: 1_756_640_000_000 + version,
    lastReplyAt: 1_756_640_000_000 + version,
    messageCount: 1,
    unread,
    owner: "Agent",
    messages: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  remote.supportApi.authorityRevision.mockResolvedValue("support-run-1");
  remote.supportApi.tickets.mockResolvedValue({ items: [], total: 0 });
  remote.supportApi.createTicket.mockReset();
});

describe("ticket read acknowledgement", () => {
  it("preserves an open detail window and older cursor when background headers refresh", async () => {
    const store = useTickets();
    const opened = { ...ticket("TK-A", 3, 1), messages: [{ id: "4", ts: 4, author: "agent" as const, body: "A real reply" }],
      historyTruncated: true, historyNextCursor: 4 };
    remote.supportApi.ticket.mockResolvedValueOnce(opened);
    remote.supportApi.tickets.mockResolvedValueOnce({ items: [ticket("TK-A", 4, 2)], total: 1 });
    await store.load("TK-A"); await store.refresh();
    expect(store.tickets[0].messages).toEqual(opened.messages);
    expect(store.tickets[0].historyNextCursor).toBe(4);
    expect(store.tickets[0].unread).toBe(2);
  });

  it("does not let a delayed list undo a newer acknowledged ticket version", async () => {
    const store = useTickets();
    const older = deferred<{ items: Ticket[]; total: number }>();
    remote.supportApi.ticket.mockResolvedValueOnce(ticket("TK-A", 3, 1));
    remote.supportApi.tickets.mockReturnValueOnce(older.promise);
    remote.supportApi.markTicketRead.mockResolvedValueOnce(ticket("TK-A", 4, 0));
    await store.load("TK-A");
    const pending = store.refresh();
    await vi.waitFor(() => expect(remote.supportApi.tickets).toHaveBeenCalledTimes(1));
    await store.markRead(store.tickets[0]);
    older.resolve({ items: [ticket("TK-A", 3, 1)], total: 1 }); await pending;
    expect(store.tickets[0].unread).toBe(0);
  });

  it("creates one ticket for concurrent identical sends without Web Crypto", async () => {
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal("TextEncoder", undefined);
    try {
      const store = useTickets();
      const created = deferred<Ticket>();
      remote.supportApi.createTicket.mockReturnValue(created.promise);
      const input = { category: "technical" as const, subject: "测试", body: "Need help 🧪" };

      const first = store.createTicket(input);
      const second = store.createTicket(input);
      await vi.waitFor(() => expect(remote.supportApi.createTicket).toHaveBeenCalledTimes(1));
      expect(remote.supportApi.createTicket).toHaveBeenCalledTimes(1);
      created.resolve(ticket("TK-ONE", 1, 0));
      expect(await Promise.all([first, second])).toEqual(["TK-ONE", "TK-ONE"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shares an authoritative recovery with concurrent identical ticket sends", async () => {
    const store = useTickets();
    const sent = deferred<Ticket>();
    remote.supportApi.createTicket.mockReturnValue(sent.promise);
    remote.supportApi.commandResult.mockResolvedValueOnce({ kind: "ticket", ticket: ticket("TK-RECOVERED", 1, 0) } as never);
    const input = { category: "technical" as const, subject: "Same", body: "Same body" };
    const first = store.createTicket(input);
    const second = store.createTicket(input);
    await vi.waitFor(() => expect(remote.supportApi.createTicket).toHaveBeenCalledTimes(1));
    sent.reject(new ApiError({ kind: "network", message: "unknown" }));
    expect(await Promise.all([first, second])).toEqual(["TK-RECOVERED", "TK-RECOVERED"]);
    expect(remote.supportApi.createTicket).toHaveBeenCalledTimes(1);
  });

  it("reuses the native pending key after an unknown result and App restart", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("plus", {});
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key) ?? "",
      setStorageSync: (key: string, value: string) => storage.set(key, value),
    });
    try {
      const input = { category: "technical" as const, subject: "Native retry", body: "One message" };
      remote.supportApi.createTicket.mockRejectedValueOnce(new ApiError({ kind: "network", message: "unknown" }));
      const firstStore = useTickets(); firstStore.bindAccount("account-a");
      await expect(firstStore.createTicket(input)).rejects.toMatchObject({ kind: "network" });
      const firstKey = remote.supportApi.createTicket.mock.calls[0][1];
      expect([...storage.values()].some(value => value.includes(firstKey))).toBe(true);

      setActivePinia(createPinia());
      const restored = useTickets(); restored.bindAccount("account-a");
      remote.supportApi.createTicket.mockResolvedValueOnce(ticket("TK-ONE", 1, 0));
      await expect(restored.createTicket(input)).resolves.toBe("TK-ONE");
      expect(remote.supportApi.createTicket.mock.calls[1][1]).toBe(firstKey);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not send when native pending-key storage silently drops a write", async () => {
    vi.stubGlobal("plus", {});
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: () => undefined });
    try {
      const store = useTickets();
      await expect(store.createTicket({ category: "technical", subject: "Subject", body: "Body" }))
        .rejects.toThrow("SUPPORT_PENDING_PERSIST_FAILED");
      expect(remote.supportApi.createTicket).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not let a prior account epoch erase a newer uncertain ticket key", async () => {
    const store = useTickets();
    store.bindAccount("account-a");
    const old = deferred<Ticket>();
    remote.supportApi.createTicket.mockReturnValueOnce(old.promise);
    const oldDone = store.createTicket({ category: "technical", subject: "Old", body: "Old body" }).catch(error => error);
    await vi.waitFor(() => expect(remote.supportApi.createTicket).toHaveBeenCalledTimes(1));

    store.bindAccount("account-b"); store.bindAccount("account-a");
    remote.supportApi.createTicket.mockRejectedValueOnce(new ApiError({ kind: "network", message: "unknown" }));
    const input = { category: "technical" as const, subject: "New", body: "New body" };
    await expect(store.createTicket(input)).rejects.toMatchObject({ kind: "network" });
    const newerKey = remote.supportApi.createTicket.mock.calls[1][1];
    old.resolve(ticket("TK-OLD", 1, 0));
    await oldDone;

    setActivePinia(createPinia());
    const restored = useTickets(); restored.bindAccount("account-a");
    remote.supportApi.createTicket.mockResolvedValueOnce(ticket("TK-NEW", 1, 0));
    await expect(restored.createTicket(input)).resolves.toBe("TK-NEW");
    expect(remote.supportApi.createTicket.mock.calls[2][1]).toBe(newerKey);
  });

  it("rejects a late detail response after an account switch instead of returning an unusable ticket", async () => {
    const store = useTickets();
    const response = deferred<Ticket>();
    remote.supportApi.ticket.mockReturnValueOnce(response.promise);
    store.bindAccount("A");
    const pending = store.load("TK-A");
    const assertion = expect(pending).rejects.toThrow("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    await vi.waitFor(() => expect(remote.supportApi.ticket).toHaveBeenCalledTimes(1));
    store.bindAccount("B");
    response.resolve(ticket("TK-A", 1, 1));
    await assertion;
    expect(store.tickets).toEqual([]);
    expect(remote.supportApi.markTicketRead).not.toHaveBeenCalled();
  });

  it("adopts the server read snapshot only for the ticket version the user opened", async () => {
    const store = useTickets();
    const opened = ticket("TK-A", 3, 1);
    const acknowledged = ticket("TK-A", 4, 0);
    remote.supportApi.ticket.mockResolvedValue(opened);
    remote.supportApi.markTicketRead.mockResolvedValue(acknowledged);

    store.bindAccount("A");
    await store.load("TK-A");
    await store.markRead(opened);

    expect(remote.supportApi.markTicketRead).toHaveBeenCalledWith(opened);
    expect(store.tickets).toEqual([acknowledged]);
  });

  it("reads back a new agent reply after a 409 instead of applying the stale acknowledgement", async () => {
    const store = useTickets();
    const opened = ticket("TK-A", 3, 1);
    const newerReply = ticket("TK-A", 4, 2);
    remote.supportApi.ticket.mockResolvedValueOnce(opened).mockResolvedValueOnce(newerReply);
    remote.supportApi.markTicketRead.mockRejectedValue(new ApiError({ kind: "http", status: 409, message: "SUPPORT_TICKET_CONFLICT" }));

    store.bindAccount("A");
    await store.load("TK-A");
    await expect(store.markRead(opened)).rejects.toMatchObject({ status: 409 });

    expect(remote.supportApi.ticket).toHaveBeenCalledTimes(2);
    expect(store.tickets).toEqual([newerReply]);
  });

  it("does not apply a late read result to the next signed-in account", async () => {
    const store = useTickets();
    const opened = ticket("TK-A", 3, 1);
    const accountB = ticket("TK-B", 1, 1);
    const acknowledgment = deferred<Ticket>();
    remote.supportApi.ticket.mockResolvedValueOnce(opened).mockResolvedValueOnce(accountB);
    remote.supportApi.markTicketRead.mockReturnValueOnce(acknowledgment.promise);

    store.bindAccount("A");
    await store.load("TK-A");
    const pending = store.markRead(opened);
    store.bindAccount("B");
    await store.load("TK-B");
    acknowledgment.resolve(ticket("TK-A", 4, 0));
    await pending;

    expect(store.tickets).toEqual([accountB]);
  });

  it("rejects a create result that belongs to the previously signed-in account", async () => {
    const created = deferred<Ticket>();
    remote.supportApi.createTicket.mockReturnValue(created.promise);
    const store = useTickets();
    const pending = store.createTicket({ category: "technical", subject: "Subject", body: "Body" });
    await vi.waitFor(() => expect(remote.supportApi.createTicket).toHaveBeenCalledTimes(1));

    store.bindAccount("account-b");
    created.resolve(ticket("TK-ACCOUNT-A", 1, 0));

    await expect(pending).rejects.toThrow("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    expect(store.tickets).toEqual([]);
  });
});
