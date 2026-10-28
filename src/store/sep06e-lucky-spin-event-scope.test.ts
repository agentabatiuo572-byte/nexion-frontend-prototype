import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { EventSpinState } from "@/api/events-api";
import { ApiError } from "@/api/errors";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  apiRuntimeConfig: { environment: "test", baseUrl: "https://api.test" },
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
    eventId: "8",
    serverDate: "2026-09-06",
    nextResetAtUtc: "2026-09-07T00:00:00Z",
    freeAvailable: true,
    bonusTickets: 0,
    availableSpins: 1,
    segments: [{
      tierId,
      rewardType: "UVT",
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
  remote.apiRuntimeConfig.environment = "test"; remote.apiRuntimeConfig.baseUrl = "https://api.test";
  remote.eventsApi.state.mockReset();
  remote.eventsApi.spinState.mockReset();
  remote.eventsApi.spin.mockReset();
  remote.eventsApi.state.mockResolvedValue({});
});

describe("Lucky Spin selected-event isolation", () => {
  it.each(["NEX", "UNKNOWN"])("does not turn retired or unknown wheel asset %s into UVT", async rewardType => {
    const snapshot = state("evt-spring", "tier");
    snapshot.segments[0].rewardType = rewardType;
    remote.eventsApi.spinState.mockResolvedValue(snapshot);
    const spin = useLuckySpin(); spin.openSheet("evt-spring"); await flush();
    expect(spin.remoteSegments).toEqual([]);
    expect(spin.remoteError).toBe(true);
  });

  it.each([
    new ApiError({kind:"auth",status:401,message:"AUTH_REQUIRED"}),
    new ApiError({kind:"http",status:400,message:"BAD_REQUEST"}),
    new ApiError({kind:"business",status:200,code:409,message:"WHEEL_DAILY_LIMIT_REACHED"}),
  ])("retains the original unknown intent through restart and a rejected replay", async rejection => {
    remote.eventsApi.spinState.mockResolvedValue({...state("evt-spring", "tier"),freeAvailable:false,bonusTickets:2,availableSpins:2});
    remote.eventsApi.spin.mockRejectedValueOnce(new Error("lost reply")).mockRejectedValueOnce(rejection)
      .mockResolvedValueOnce({eventId:"evt-spring",tierId:"tier",rewardType:"UVT",rewardAmount:5,rewardName:"5 NEX"});
    const first = useLuckySpin(); first.bindAccount("account-a"); first.openSheet("evt-spring"); await flush();
    await first.spinRemote("evt-spring"); const key = first.pendingSpin!.key;
    first.closeSheet(); setActivePinia(createPinia());
    const resumed = useLuckySpin(); resumed.bindAccount("account-a"); resumed.openSheet("evt-spring"); await flush();
    expect(resumed.pendingSpin?.key).toBe(key);
    expect((await resumed.spinRemote("evt-spring")).failure?.ambiguous).toBe(true);
    expect(resumed.pendingSpin?.key).toBe(key);
    expect((await resumed.spinRemote("evt-spring")).ok).toBe(true);
    expect(remote.eventsApi.spin.mock.calls.map(call=>call[1])).toEqual([key,key,key]);
    expect(resumed.pendingSpin).toBeNull();
  });

  it("keeps each account, API environment, and event's pending key through switches", async () => {
    remote.eventsApi.spinState.mockImplementation(async event=>state(event,"tier"));
    remote.eventsApi.spin.mockRejectedValue(new Error("unknown"));
    const spin = useLuckySpin(); spin.bindAccount("account-a"); spin.openSheet("evt-a"); await flush();
    await spin.spinRemote("evt-a"); const a = spin.pendingSpin!.key;
    spin.bindAccount("account-b"); spin.openSheet("evt-a"); await flush();
    expect(spin.pendingSpin).toBeNull(); await spin.spinRemote("evt-a"); const b = spin.pendingSpin!.key;
    spin.bindAccount("account-a"); spin.openSheet("evt-a"); await flush(); expect(spin.pendingSpin!.key).toBe(a);
    spin.openSheet("evt-b"); await flush(); expect(spin.pendingSpin).toBeNull(); await spin.spinRemote("evt-b"); const eventB=spin.pendingSpin!.key;
    remote.apiRuntimeConfig.baseUrl="https://other.test"; spin.openSheet("evt-a"); await flush();
    expect(spin.pendingSpin).toBeNull(); await spin.spinRemote("evt-a"); const otherApi=spin.pendingSpin!.key;
    remote.apiRuntimeConfig.baseUrl="https://api.test"; remote.apiRuntimeConfig.environment="production";
    spin.openSheet("evt-a"); await flush(); expect(spin.pendingSpin).toBeNull(); await spin.spinRemote("evt-a"); const production=spin.pendingSpin!.key;
    remote.apiRuntimeConfig.environment="test"; spin.openSheet("evt-a"); await flush(); expect(spin.pendingSpin!.key).toBe(a);
    spin.bindAccount("account-b"); spin.openSheet("evt-a"); await flush(); expect(spin.pendingSpin!.key).toBe(b);
    expect(new Set([a,b,eventB,otherApi,production]).size).toBe(5);
  });

  it("never POSTs a pending key across UTC days or matches an unrelated history receipt", async () => {
    remote.eventsApi.spinState.mockResolvedValue(state("evt-spring","tier"));
    remote.eventsApi.spin.mockRejectedValueOnce(new Error("unknown")).mockRejectedValue(new ApiError({kind:"http",status:409,message:"IDEMPOTENCY_CONFLICT"}));
    const spin=useLuckySpin(); spin.openSheet("evt-spring"); await flush(); await spin.spinRemote("evt-spring");
    const key=spin.pendingSpin!.key;
    remote.eventsApi.spinState.mockResolvedValue({...state("evt-spring","tier"),serverDate:"2026-09-07",history:[{spinId:"unrelated",spinDate:"2026-09-06",sourceType:"DAILY",tierId:"tier",rewardType:"UVT",rewardAmount:5,rewardName:"5 NEX",downgraded:false,downgradeReason:"NONE",awardedAt:"2026-09-06T12:00:00Z"}]});
    await spin.refreshRemoteState();
    for(let retry=0;retry<2;retry++) expect((await spin.spinRemote("evt-spring")).failure).toMatchObject({ambiguous:true,messageKey:"spinReview"});
    expect(spin.pendingSpin).toMatchObject({key,serverDate:"2026-09-06"});
    expect(remote.eventsApi.spin.mock.calls.map(call=>call[1])).toEqual([key]);
  });

  it("never POSTs a pending key when the current authoritative date cannot be read", async () => {
    remote.eventsApi.spinState.mockResolvedValue(state("evt-spring","tier"));
    remote.eventsApi.spin.mockRejectedValue(new Error("unknown"));
    const spin=useLuckySpin(); spin.openSheet("evt-spring"); await flush(); await spin.spinRemote("evt-spring");
    const key=spin.pendingSpin!.key; remote.eventsApi.spinState.mockRejectedValue(new Error("read offline"));
    expect((await spin.spinRemote("evt-spring",true)).failure?.ambiguous).toBe(true);
    expect(spin.pendingSpin!.key).toBe(key); expect(remote.eventsApi.spin).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when pending storage cannot be read or written", async () => {
    remote.eventsApi.spinState.mockResolvedValue(state("evt-spring","tier"));
    const spin=useLuckySpin(); spin.openSheet("evt-spring"); await flush();
    vi.mocked(uni.setStorageSync).mockImplementationOnce(()=>{throw new Error("disk unavailable");});
    expect((await spin.spinRemote("evt-spring")).ok).toBe(false); expect(remote.eventsApi.spin).not.toHaveBeenCalled();
    vi.mocked(uni.getStorageSync).mockImplementationOnce(()=>{throw new Error("read unavailable");});
    expect((await spin.spinRemote("evt-spring")).ok).toBe(false); expect(remote.eventsApi.spin).not.toHaveBeenCalled();
    expect(spin.pendingStorageError).toBe(true);
  });

  it("never turns a recovery-only action into a fresh spin if no pending intent remains", async () => {
    remote.eventsApi.spinState.mockResolvedValue({...state("evt-spring","tier"),freeAvailable:false,bonusTickets:2,availableSpins:2});
    const spin=useLuckySpin(); spin.openSheet("evt-spring"); await flush();
    expect((await spin.spinRemote("evt-spring",true)).ok).toBe(false);
    expect(remote.eventsApi.spin).not.toHaveBeenCalled();
  });

  it.each(["WHEEL_PAYOUT_MUTEX_UNAVAILABLE", "WHEEL_COMFORT_TIER_MISSING"])("refreshes authoritative state after definite %s rejection", async businessCode => {
    remote.eventsApi.spinState.mockResolvedValue(state("evt-spring", "tier"));
    remote.eventsApi.spin.mockRejectedValue(new ApiError({ kind: "http", status: 409, code: 409, message: businessCode }));
    const spin = useLuckySpin(); spin.openSheet("evt-spring"); await flush();
    const result = await spin.spinRemote("evt-spring");
    expect(result.failure).toMatchObject({ kind: "http", status: 409, code: 409, businessCode, ambiguous: false, messageKey: "spinUnavailable" });
    expect(spin.remoteFailure).toEqual(result.failure);
    expect(remote.eventsApi.spinState).toHaveBeenCalledTimes(2);
    expect(spin.availableSpins()).toBe(1); expect(spin.phase).toBe("idle"); expect(spin.lastWonPrizeId).toBeNull();
  });

  it.each([new Error("response lost with secret body"), new ApiError({kind:"http",status:409,message:"IDEMPOTENCY_CONFLICT"})])("keeps an unknown original attempt replayable after zero/ended refresh", async cause => {
    remote.eventsApi.spinState.mockResolvedValue(state("evt-spring", "tier"));
    remote.eventsApi.spin.mockRejectedValueOnce(cause).mockResolvedValue({eventId:"evt-spring",tierId:"tier",rewardType:"UVT",rewardAmount:5,rewardName:"5 NEX"});
    const spin = useLuckySpin(); spin.openSheet("evt-spring"); await flush();
    expect((await spin.spinRemote("evt-spring")).failure?.ambiguous).toBe(true);
    expect(JSON.stringify(spin.remoteFailure)).not.toContain("secret body");
    remote.eventsApi.spinState.mockResolvedValue({...state("evt-spring", "tier"),freeAvailable:false,availableSpins:0,ended:true,segments:[]});
    await spin.refreshRemoteState();
    expect((await spin.spinRemote("evt-spring")).ok).toBe(true);
    expect(remote.eventsApi.spin.mock.calls.map(call=>call[1])).toEqual([remote.eventsApi.spin.mock.calls[0][1],remote.eventsApi.spin.mock.calls[0][1]]);
  });

  it("does not attach a late failed spin to another account", async () => {
    remote.eventsApi.spinState.mockResolvedValue(state("evt-spring", "tier"));
    let reject!: (cause: unknown) => void;
    remote.eventsApi.spin.mockReturnValue(new Promise((_resolve, fail)=>{reject=fail;}));
    const spin = useLuckySpin(); spin.openSheet("evt-spring"); await flush();
    const pending = spin.spinRemote("evt-spring"); spin.bindAccount("other-user");
    reject(new ApiError({kind:"http",status:409,message:"WHEEL_PAYOUT_MUTEX_UNAVAILABLE"}));
    expect(await pending).toMatchObject({ok:false,stale:true}); expect(spin.remoteFailure).toBeNull();
    expect(remote.eventsApi.spinState).toHaveBeenCalledTimes(1);
  });
  it("keeps the awarded receipt visible if the configured pool changed during the request", async () => {
    remote.eventsApi.spinState.mockResolvedValue(state("evt-autumn", "old-tier"));
    remote.eventsApi.spin.mockResolvedValue({ eventId: "evt-autumn", tierId: "new-tier", rewardType: "USDT", rewardAmount: 20, rewardName: "20 USDT" });
    const spin = useLuckySpin();
    spin.openSheet("evt-autumn");
    await flush();
    await expect(spin.spinRemote("evt-autumn")).resolves.toMatchObject({ ok: true, prizeId: "new-tier" });
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
    expect(await spin.spinRemote("evt-old")).toMatchObject({ ok: false });
    expect(remote.eventsApi.spin).not.toHaveBeenCalled();
  });

  it("loads and spins the event code selected by the CTA", async () => {
    remote.eventsApi.spinState.mockResolvedValue(state("evt-autumn", "tier-autumn"));
    remote.eventsApi.spin.mockResolvedValue({ eventId: "evt-autumn", tierId: "tier-autumn", rewardType: "UVT", rewardAmount: 5, rewardName: "5 NEX" });
    const spin = useLuckySpin() as EventScopedSpin;

    spin.openSheet("evt-autumn");
    await flush();
    await expect(spin.spinRemote("evt-autumn")).resolves.toMatchObject({
      ok: true,
      prizeId: "tier-autumn",
    });

    expect(remote.eventsApi.spinState).toHaveBeenCalledWith("evt-autumn");
    expect(remote.eventsApi.spin).toHaveBeenCalledWith("evt-autumn", expect.stringMatching(/^lucky-spin:/));
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
    const request = spin.spinRemote("evt-spring");
    if (superseding === "switch") spin.openSheet("evt-summer");
    else spin.closeSheet();
    result.resolve({ tierId: "tier-evt-spring" });

    await expect(request).resolves.toMatchObject({ ok: false, stale: true });
    expect(spin.phase).toBe("idle");
    expect(spin.lastWonPrizeId).toBeNull();
  });
});
