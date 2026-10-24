import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { EventSpinState } from "@/api/events-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  eventsApi: {
    state: vi.fn(),
    spinState: vi.fn(),
    spin: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useLuckySpin } = await import("./lucky-spin");

type EventScopedSpin = ReturnType<typeof useLuckySpin> & {
  openSheet(eventCode: string): void;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function state(eventCode: string, tierId: string): EventSpinState {
  return {
    eventCode,
    eventId: `${eventCode}-id`,
    serverDate: "2026-09-06",
    nextResetAtUtc: "2026-09-07T00:00:00Z",
    freeAvailable: true,
    bonusTickets: 0,
    availableSpins: 1,
    segments: [{
      tierId,
      rewardType: "NEX",
      rewardAmount: 5,
      rewardName: tierId,
      realOutflow: false,
      displayOrder: 1,
    }],
    history: [],
    source: "server",
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  const storage = new Map<string, unknown>();
  vi.stubGlobal("uni", {
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, structuredClone(value))),
  });
  setActivePinia(createPinia());
  remote.eventsApi.state.mockReset();
  remote.eventsApi.spinState.mockReset();
  remote.eventsApi.spin.mockReset();
  remote.eventsApi.state.mockResolvedValue({});
});

describe("Lucky Spin selected-event isolation", () => {
  it("keeps the awarded receipt visible if the configured pool changed during the request", async () => {
    remote.eventsApi.spinState.mockResolvedValue(state("evt-autumn", "old-tier"));
    remote.eventsApi.spin.mockResolvedValue({ tierId: "new-tier", rewardType: "USDT", rewardAmount: 20, rewardName: "20 USDT" });
    const spin = useLuckySpin();
    spin.openSheet("evt-autumn");
    await flush();
    await expect(spin.spinRemote("evt-autumn", "key")).resolves.toMatchObject({ ok: true, prizeId: "new-tier" });
    await flush();
    expect(spin.remoteSegments.find(prize => prize.id === "new-tier")).toMatchObject({ amount: 20, kind: "usdt", rewardName: "20 USDT" });
  });
  it("keeps a failed load retryable instead of showing exhausted spins", async () => {
    remote.eventsApi.spinState.mockRejectedValueOnce(new Error("offline"));
    const spin = useLuckySpin();
    spin.openSheet("evt-autumn");
    await flush();
    expect(spin.remoteLoading).toBe(false);
    expect(spin.remoteError).toBe(true);
    remote.eventsApi.spinState.mockResolvedValue(state("evt-autumn", "tier-autumn"));
    await spin.refreshRemoteState();
    expect(spin.remoteError).toBe(false);
    expect(spin.availableSpins()).toBe(1);
  });

  it("shows historical results without enabling an ended wheel", async () => {
    remote.eventsApi.spinState.mockResolvedValue({ ...state("evt-old", "old-tier"),
      ended: true, availableSpins: 0, freeAvailable: false, segments: [] });
    const spin = useLuckySpin();
    spin.openSheet("evt-old");
    await flush();
    expect(spin.remoteEnded).toBe(true);
    expect(await spin.spinRemote("evt-old", "key")).toMatchObject({ ok: false });
    expect(remote.eventsApi.spin).not.toHaveBeenCalled();
  });

  it("loads and spins the event code selected by the CTA", async () => {
    remote.eventsApi.spinState.mockResolvedValue(state("evt-autumn", "tier-autumn"));
    remote.eventsApi.spin.mockResolvedValue({ tierId: "tier-autumn", rewardType: "NEX", rewardAmount: 5, rewardName: "5 NEX" });
    const spin = useLuckySpin() as EventScopedSpin;

    spin.openSheet("evt-autumn");
    await flush();
    await expect(spin.spinRemote("evt-autumn", "spin-key")).resolves.toMatchObject({
      ok: true,
      prizeId: "tier-autumn",
    });

    expect(remote.eventsApi.spinState).toHaveBeenCalledWith("evt-autumn");
    expect(remote.eventsApi.spin).toHaveBeenCalledWith("evt-autumn", "spin-key");
    expect(spin.remoteSegments[0]?.id).toBe("tier-autumn");
  });

  it("does not let a late state read replace the newly selected event", async () => {
    const first = deferred<EventSpinState>();
    remote.eventsApi.spinState.mockImplementation((eventCode: string) => (
      eventCode === "evt-spring" ? first.promise : Promise.resolve(state("evt-summer", "tier-summer"))
    ));
    const spin = useLuckySpin() as EventScopedSpin;

    spin.openSheet("evt-spring");
    await flush();
    spin.openSheet("evt-summer");
    await flush();
    first.resolve(state("evt-spring", "tier-spring"));
    await flush();

    expect(remote.eventsApi.spinState).toHaveBeenNthCalledWith(1, "evt-spring");
    expect(remote.eventsApi.spinState).toHaveBeenLastCalledWith("evt-summer");
    expect(spin.remoteSegments.map((segment) => segment.id)).toEqual(["tier-summer"]);
  });

  it.each(["switch", "close"] as const)("marks a late %s-superseded spin response stale", async (superseding) => {
    remote.eventsApi.spinState.mockImplementation((eventCode: string) => Promise.resolve(state(eventCode, `tier-${eventCode}`)));
    const result = deferred<{ tierId: string }>();
    remote.eventsApi.spin.mockReturnValue(result.promise);
    const spin = useLuckySpin() as EventScopedSpin;

    spin.openSheet("evt-spring");
    await flush();
    const request = spin.spinRemote("evt-spring", "spin-key");
    if (superseding === "switch") spin.openSheet("evt-summer");
    else spin.closeSheet();
    result.resolve({ tierId: "tier-evt-spring" });

    await expect(request).resolves.toMatchObject({ ok: false, stale: true });
    expect(spin.phase).toBe("idle");
    expect(spin.lastWonPrizeId).toBeNull();
  });
});
