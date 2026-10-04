import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  eventsApi: {
    state: vi.fn(),
    join: vi.fn(),
    claim: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useEventQuest } = await import("./event-quest");

function event(eventCode: string, userStatus: "AVAILABLE" | "JOINED" | "CLAIMABLE" | "CLAIMED") {
  return {
    eventCode,
    kind: "boost" as const,
    state: "ongoing" as const,
    title: eventCode,
    subtitle: "canonical event",
    rewardName: "USDT reward",
    rewardType: "USDT",
    rewardAmount: 12.5,
    featured: false,
    trackable: true,
    targetValue: 1,
    progressValue: 1,
    userStatus,
    geo: "",
    href: "/pages/store/store",
    startsAt: null,
    endsAt: null,
  };
}

function snapshot(...events: ReturnType<typeof event>[]) {
  return { events, serverTimeUtc: "2026-09-01T00:00:00Z", source: "nx_event" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  setActivePinia(createPinia());
  remote.eventsApi.state.mockReset();
  remote.eventsApi.join.mockReset();
  remote.eventsApi.claim.mockReset();
});

describe("event quest remote write recovery", () => {
  it("keeps a canonical USDT claim confirmed when its readback fails", async () => {
    const store = useEventQuest();
    await store.refreshRemote();
    remote.eventsApi.claim.mockResolvedValue({
      eventId: "usdt-event",
      rewardType: "USDT",
      rewardAmount: 12.5,
      badgeCode: null,
    });
    remote.eventsApi.state.mockRejectedValueOnce(new Error("readback unavailable"));

    await expect(store.claimRemote("usdt-event")).resolves.toBe(true);

    expect(store.isJoined("usdt-event")).toBe(true);
    expect(store.isClaimed("usdt-event")).toBe(true);
    expect(remote.eventsApi.claim).toHaveBeenCalledWith("usdt-event", "h4-event-claim:usdt-event");
  });

  it("does not let an older same-account GET replace a newer canonical state", async () => {
    const store = useEventQuest();
    const older = deferred<ReturnType<typeof snapshot>>();
    remote.eventsApi.state
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(snapshot(event("new-event", "CLAIMED")));

    const first = store.refreshRemote();
    const second = store.refreshRemote();
    await expect(second).resolves.toBe(true);
    older.resolve(snapshot(event("old-event", "AVAILABLE")));
    await expect(first).resolves.toBe(false);

    expect(store.isClaimed("new-event")).toBe(true);
    expect(store.isJoined("old-event")).toBe(false);
  });

  it("does not apply an old account GET after the account changes", async () => {
    const store = useEventQuest();
    const stale = deferred<ReturnType<typeof snapshot>>();
    remote.eventsApi.state
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(snapshot(event("account-b", "JOINED")));

    store.bindAccount("account-a");
    store.bindAccount("account-b");
    await flush();
    stale.resolve(snapshot(event("account-a", "CLAIMED")));
    await flush();

    expect(store.isJoined("account-b")).toBe(true);
    expect(store.isClaimed("account-a")).toBe(false);
  });
});
