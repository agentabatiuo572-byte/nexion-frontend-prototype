import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createApiClient, type HttpRequest } from "@/api/api-client";
import { createPointsApi } from "@/api/points-api";
import { createSessionVault } from "@/api/session-vault";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  sessionUserId: 1 as number | null,
  sessionVault: { read: (): {user:{userId:number}} | null => remote.sessionUserId === null ? null : {user:{userId:remote.sessionUserId}} },
  pointsApi: {
    state: vi.fn(),
    checkIn: vi.fn(),
    claimMilestone: vi.fn(),
    useSaver: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useNexFaucet } = await import("./nex-faucet");
function createBoundStore() {
  const store = useNexFaucet();
  store.bindAccount('user:1');
  return store;
}

function dailySnapshot(currentStreak = 3, serverDate = "2026-08-22", checkedInToday = false) {
  return {
    serverDate,
    nextResetAtUtc: "2026-08-23T00:00:00Z",
    streak: {
      currentStreak,
      longestStreak: 5,
      streakSavers: 1,
      lastCheckInDate: "2026-08-21",
      checkedInToday,
    },
    dailyMilestones: [{
      milestoneId: 7,
      milestoneDay: 3,
      rewardType: "NEX",
      rewardAmount: "1",
      rewardLabel: "+1 NEX",
      status: "AVAILABLE",
    }],
    powerUps: [],
    rules: [{ key: "baseNex", value: "2" }],
    topStreakers: [{ rank: 1, nickname: "NexGrid User", streakDays: 5 }],
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function checkInWire(status: number, message: string, gate?: Promise<void>) {
  const vault = createSessionVault();
  vault.save({ accessToken: "unit-access", refreshToken: "unit-refresh", tokenType: "Bearer",
    user: { userId: 1, countryCode: "+86", phone: "13800000001", nickname: "Test", onboardingComplete: true } });
  const request = vi.fn(async (input: HttpRequest) => {
    if (input.method !== "POST" || new URL(input.url).pathname !== "/api/points/sign-in") throw new Error("Unexpected points request");
    if (gate) await gate;
    return { status, headers: {}, data: { code: 422, message, data: null } };
  });
  const api = createPointsApi(createApiClient({ baseUrl: "https://example.test", vault, transport: { request } }));
  return { api, request };
}

beforeEach(() => {
  setActivePinia(createPinia());
  remote.sessionUserId = 1;
  remote.pointsApi.state.mockReset();
  remote.pointsApi.checkIn.mockReset();
  remote.pointsApi.claimMilestone.mockReset();
  remote.pointsApi.useSaver.mockReset();
});

describe("NEX faucet remote failure resilience", () => {
  it('shares the pending bound-account read with the page instead of racing another read', async () => {
    const pending = deferred<ReturnType<typeof dailySnapshot>>();
    remote.pointsApi.state.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('second read failed'));
    const store = createBoundStore();
    const pageRead = store.ensureRemote();
    expect(remote.pointsApi.state).toHaveBeenCalledTimes(1);
    pending.resolve(dailySnapshot(4));
    expect(await pageRead).toBe(true);
    expect(store.remoteReadState).toBe('ready');
    expect(store.signInStreak).toBe(4);
    await store.ensureRemote();
    expect(remote.pointsApi.state).toHaveBeenCalledTimes(2);
    expect(store.remoteReadState).toBe('error');
  });
  it('does not issue a protected bootstrap read before a matching session is bound', async () => {
    remote.sessionUserId = null;
    remote.pointsApi.state.mockResolvedValue(dailySnapshot());
    const store = useNexFaucet();
    await flush();
    expect(store.remoteReadState).toBe('idle');
    expect(remote.pointsApi.state).not.toHaveBeenCalled();
    store.bindAccount('user:1'); await flush();
    expect(remote.pointsApi.state).not.toHaveBeenCalled();
    remote.sessionUserId = 1; store.bindAccount('user:1'); await flush();
    expect(remote.pointsApi.state).toHaveBeenCalledTimes(1);
    expect(store.remoteReadState).toBe('ready');
  });
  it("separates unknown, failed and confirmed-zero streak reads", async () => {
    const pending = deferred<ReturnType<typeof dailySnapshot>>();
    remote.pointsApi.state.mockReturnValueOnce(pending.promise);
    const store = createBoundStore();
    expect(store.remoteReadState).toBe("loading");
    pending.resolve(dailySnapshot(0)); await flush();
    expect(store.remoteReadState).toBe("ready"); expect(store.signInStreak).toBe(0);
    remote.pointsApi.state.mockRejectedValueOnce(new Error("offline"));
    await store.refreshRemote(); expect(store.remoteReadState).toBe("error");
    remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(2));
    await store.refreshRemote(); expect(store.remoteReadState).toBe("ready");
    expect(store.signInStreak).toBe(2);
  });
  it("does not let an old account failure erase the new account ready status", async () => {
    let rejectOld!: (error: Error) => void;
    remote.pointsApi.state.mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }))
      .mockResolvedValueOnce(dailySnapshot(8));
    const store = createBoundStore(); remote.sessionUserId = 2; store.bindAccount("user:2"); await flush();
    expect(store.remoteReadState).toBe("ready");
    rejectOld(new Error("old offline")); await flush();
    expect(store.remoteReadState).toBe("ready"); expect(store.signInStreak).toBe(8);
  });
  it("keeps the last confirmed daily state when check-in is rejected", async () => {
    remote.pointsApi.state.mockResolvedValue(dailySnapshot());
    const store = createBoundStore();
    await flush();

    expect(store.signInStreak).toBe(3);
    expect(store.remoteMilestones).toHaveLength(1);
    expect(store.remoteRules).toEqual([{ key: "baseNex", value: "2" }]);

    remote.pointsApi.checkIn.mockRejectedValue(new Error("B1_COVERAGE_DATA_UNAVAILABLE"));
    await expect(store.checkInRemote()).resolves.toMatchObject({ ok: false });

    expect(store.signInStreak).toBe(3);
    expect(store.remoteMilestones).toHaveLength(1);
    expect(store.remoteRules).toEqual([{ key: "baseNex", value: "2" }]);
  });

  const coverageCases = [422, 200].flatMap(status =>
    ["B1_COVERAGE_BELOW_REDLINE", "B1_COVERAGE_DATA_UNAVAILABLE"].map(reason => [status, reason] as const));
  it.each(coverageCases)("preserves the settled HTTP %s %s reason without changing confirmed daily facts", async (status, reason) => {
    remote.pointsApi.state.mockResolvedValue(dailySnapshot());
    const store = createBoundStore(); await flush();
    const wire = checkInWire(status, reason);
    remote.pointsApi.checkIn.mockImplementation(wire.api.checkIn);
    const before = { streak: store.signInStreak, checked: store.remoteCheckedInToday, last: store.lastSignedInAt };
    await expect(store.checkInRemote()).resolves.toEqual({ ok: false, gained: 0, streak: 0, multiplier: 1, reason });
    expect({ streak: store.signInStreak, checked: store.remoteCheckedInToday, last: store.lastSignedInAt }).toEqual(before);
    expect(store.remoteReadState).toBe("ready");
    expect(wire.request).toHaveBeenCalledOnce();
    expect(wire.request.mock.calls[0][0].headers["Idempotency-Key"]).toBe("h5-check-in:2026-08-22");
  });

  it.each([[503, "B1_COVERAGE_BELOW_REDLINE"], [422, "OTHER_REJECTION"]] as const)("does not approve unknown HTTP %s %s as a coverage block", async (status, message) => {
    remote.pointsApi.state.mockResolvedValue(dailySnapshot());
    const store = createBoundStore(); await flush();
    const wire = checkInWire(status, message);
    remote.pointsApi.checkIn.mockImplementation(wire.api.checkIn);
    await expect(store.checkInRemote()).resolves.toEqual({ ok: false, gained: 0, streak: 0, multiplier: 1 });
    expect(store.signInStreak).toBe(3); expect(store.remoteCheckedInToday).toBe(false);
    expect(wire.request).toHaveBeenCalledOnce();
  });

  it("does not classify an untyped matching error string as a settled coverage block", async () => {
    remote.pointsApi.state.mockResolvedValue(dailySnapshot());
    const store = createBoundStore(); await flush();
    remote.pointsApi.checkIn.mockRejectedValue(new Error("B1_COVERAGE_BELOW_REDLINE"));
    await expect(store.checkInRemote()).resolves.toEqual({ ok: false, gained: 0, streak: 0, multiplier: 1 });
    expect(store.signInStreak).toBe(3); expect(store.remoteCheckedInToday).toBe(false);
  });

  it("does not carry a late coverage rejection into another bound account", async () => {
    remote.pointsApi.state.mockResolvedValue(dailySnapshot());
    const store = createBoundStore(); await flush();
    const gate = deferred<void>(), wire = checkInWire(422, "B1_COVERAGE_BELOW_REDLINE", gate.promise);
    remote.pointsApi.checkIn.mockImplementation(wire.api.checkIn);
    const result = store.checkInRemote(); await flush();
    expect(wire.request).toHaveBeenCalledOnce();
    remote.sessionUserId = 2; remote.pointsApi.state.mockResolvedValue(dailySnapshot(8)); store.bindAccount("user:2");
    await flush(); gate.resolve();
    await expect(result).resolves.toEqual({ ok: false, gained: 0, streak: 0, multiplier: 1 });
    expect(store.signInStreak).toBe(8); expect(store.remoteReadState).toBe("ready");
  });

  it("keeps the last confirmed daily state when a state refresh fails", async () => {
    remote.pointsApi.state.mockResolvedValue(dailySnapshot());
    const store = createBoundStore();
    await flush();

    remote.pointsApi.state.mockRejectedValueOnce(new Error("temporary network failure"));
    await expect(store.refreshRemote()).resolves.toBe(false);

    expect(store.signInStreak).toBe(3);
    expect(store.remoteMilestones).toHaveLength(1);
  });

  it("uses the server business date and treats a canonical write as successful even when its follow-up refresh fails", async () => {
    remote.pointsApi.state
      .mockResolvedValueOnce(dailySnapshot(3, "2026-08-21"))
      .mockResolvedValueOnce(dailySnapshot(3, "2026-08-22"))
      .mockRejectedValueOnce(new Error("refresh unavailable"));
    const store = createBoundStore();
    await flush();
    remote.pointsApi.checkIn.mockResolvedValue({
      checkInDate: "2026-08-22",
      rewardNex: 2,
      streakDays: 4,
      multiplier: 1,
    });
    await expect(store.checkInRemote()).resolves.toMatchObject({ ok: true, gained: 2, streak: 4 });

    expect(remote.pointsApi.checkIn).toHaveBeenCalledWith("h5-check-in:2026-08-22");
    expect(store.signInStreak).toBe(4);
    expect(store.remoteCheckedInToday).toBe(true);
    expect(store.remoteMilestones).toHaveLength(1);
  });

  it("takes both daily UI boundary facts from the canonical snapshot", async () => {
    remote.pointsApi.state.mockResolvedValue(dailySnapshot(3, "2026-08-22", true));
    const store = createBoundStore();
    await flush();

    expect(store.remoteCheckedInToday).toBe(true);
    expect(store.remoteNextResetAt).toBe(Date.parse("2026-08-23T00:00:00Z"));
  });

  it("refreshes the server business date before a streak saver command and keeps write success when readback fails", async () => {
    remote.pointsApi.state
      .mockResolvedValueOnce(dailySnapshot(0, "2026-08-22"))
      .mockResolvedValueOnce(dailySnapshot(0, "2026-08-23"))
      .mockRejectedValueOnce(new Error("refresh unavailable"));
    const store = createBoundStore();
    await flush();
    remote.pointsApi.useSaver.mockResolvedValue({
      restoredStreak: 2,
      streakSavers: 0,
      effectiveLastCheckInDate: "2026-08-22",
    });

    await expect(store.useSaverRemote()).resolves.toBe(true);

    expect(remote.pointsApi.useSaver).toHaveBeenCalledWith("h5-streak-saver:2026-08-23");
    expect(store.signInStreak).toBe(2);
    expect(store.streakSavers).toBe(0);
  });

  it("keeps a canonical milestone claim successful when readback fails", async () => {
    remote.pointsApi.state
      .mockResolvedValueOnce(dailySnapshot())
      .mockRejectedValueOnce(new Error("refresh unavailable"));
    const store = createBoundStore();
    await flush();
    remote.pointsApi.claimMilestone.mockResolvedValue({
      milestoneId: 7,
      milestoneDay: 3,
      rewardType: "NEX",
      rewardAmount: 1,
      badgeCode: null,
      spinTickets: 0,
    });

    await expect(store.claimMilestoneRemote(3)).resolves.toBe(true);

    expect(store.claimedMilestones).toContain(3);
    expect(store.remoteMilestones[0]?.status).toBe("CLAIMED");
  });

  it("does not let an older same-account refresh overwrite a newer snapshot", async () => {
    remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(1));
    const store = createBoundStore();
    await flush();
    const older = deferred<ReturnType<typeof dailySnapshot>>();
    const newer = deferred<ReturnType<typeof dailySnapshot>>();
    remote.pointsApi.state.mockReset();
    remote.pointsApi.state.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    const olderRefresh = store.refreshRemote();
    const newerRefresh = store.refreshRemote();
    newer.resolve(dailySnapshot(5));
    await expect(newerRefresh).resolves.toBe(true);
    older.resolve(dailySnapshot(2));
    await expect(olderRefresh).resolves.toBe(false);

    expect(store.signInStreak).toBe(5);
  });
});
