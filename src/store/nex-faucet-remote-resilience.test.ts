import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createApiClient, type HttpRequest } from "@/api/api-client";
import { createPointsApi } from "@/api/points-api";
import { createSessionVault } from "@/api/session-vault";
import { ApiError } from '@/api/errors';
import { advanceRuntimeRevision } from '@/api/order-api';

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  apiRuntimeConfig:{environment:"dev",baseUrl:"https://test.invalid"},
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
  it.each([0,2_000,undefined])('all Daily reads and unsent claims respect Retry-After %s',async delay=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(100_000);remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(2));const store=createBoundStore();await flush();
    remote.pointsApi.state.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:delay}));expect(await store.refreshRemote()).toBe(false);const calls=remote.pointsApi.state.mock.calls.length,wait=delay??30_000;
    if(wait>0){
      advanceRuntimeRevision();expect(await Promise.all([store.refreshRemote(),store.ensureRemote(),store.ensureRemote(10_000),store.claimMilestoneRemote(3)])).toEqual([false,false,false,false]);expect(await store.checkInRemote()).toMatchObject({ok:false});expect(await store.useSaverRemote()).toBe(false);
      expect(remote.pointsApi.checkIn).not.toHaveBeenCalled();expect(remote.pointsApi.claimMilestone).not.toHaveBeenCalled();expect(remote.pointsApi.useSaver).not.toHaveBeenCalled();expect(remote.pointsApi.state).toHaveBeenCalledTimes(calls);
      now.mockReturnValue(100_000+wait-1);expect(await store.refreshRemote()).toBe(false);
    }
    now.mockReturnValue(100_000+wait);remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(3));expect(await store.refreshRemote()).toBe(true);expect(remote.pointsApi.state).toHaveBeenCalledTimes(calls+1);now.mockRestore();
  });
  it('a confirmed check-in POST remains successful when its follow-up read is cooling, without replaying the POST',async()=>{
    remote.pointsApi.state.mockResolvedValue(dailySnapshot(2));const store=createBoundStore();await flush();const post=deferred<any>();remote.pointsApi.checkIn.mockReturnValueOnce(post.promise);const action=store.checkInRemote();await flush();expect(remote.pointsApi.checkIn).toHaveBeenCalledTimes(1);
    remote.pointsApi.state.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:60_000}));await store.refreshRemote();const calls=remote.pointsApi.state.mock.calls.length;
    post.resolve({checkInDate:'2026-08-22',streakDays:3,rewardNex:2,multiplier:1});expect(await action).toMatchObject({ok:true,gained:2,streak:3});expect(store.signInStreak).toBe(3);expect(store.remoteCheckedInToday).toBe(true);expect(remote.pointsApi.state).toHaveBeenCalledTimes(calls);expect(await store.refreshRemote()).toBe(false);expect(remote.pointsApi.checkIn).toHaveBeenCalledTimes(1);
  });
  it('binding a new Daily account clears cooldown, and its old 429 cannot poison that account',async()=>{
    remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(2));const store=createBoundStore();await flush();remote.pointsApi.state.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:60_000}));await store.refreshRemote();remote.sessionUserId=2;remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(4));store.bindAccount('user:2');await flush();expect(store.remoteReadState).toBe('ready');expect(store.signInStreak).toBe(4);
    let rejectOld!:(cause:unknown)=>void;remote.pointsApi.state.mockReturnValueOnce(new Promise((_done,fail)=>rejectOld=fail));const old=store.refreshRemote();remote.sessionUserId=3;remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(5));store.bindAccount('user:3');await flush();rejectOld(new ApiError({kind:'http',status:429,message:'old',retryAfterMs:60_000}));await old;
    remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(6));expect(await store.refreshRemote()).toBe(true);expect(store.signInStreak).toBe(6);
  });
  it('automatically reads the current runtime after an owned cold read expires, rejecting its old data',async()=>{
    const old=deferred<ReturnType<typeof dailySnapshot>>();remote.pointsApi.state.mockReturnValueOnce(old.promise).mockResolvedValueOnce(dailySnapshot(2));const store=createBoundStore();const joined=store.ensureRemote();advanceRuntimeRevision();old.resolve(dailySnapshot(99));expect(await joined).toBe(true);
    expect(store.remoteHasSnapshot).toBe(true);expect(store.signInStreak).toBe(2);expect(store.remoteReadState).toBe('ready');expect(remote.pointsApi.state).toHaveBeenCalledTimes(2);
  });
  it('joins an already current read when runtime changes again during recovery, without multiplying requests',async()=>{
    const first=deferred<any>(),second=deferred<any>(),latest=deferred<any>();remote.pointsApi.state.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(latest.promise);const store=createBoundStore();const original=store.ensureRemote();advanceRuntimeRevision();first.resolve(dailySnapshot(99));await flush();expect(remote.pointsApi.state).toHaveBeenCalledTimes(2);
    advanceRuntimeRevision();const current=store.ensureRemote(),alsoCurrent=store.ensureRemote();expect(remote.pointsApi.state).toHaveBeenCalledTimes(3);second.resolve(dailySnapshot(88));await flush();expect(remote.pointsApi.state).toHaveBeenCalledTimes(3);latest.resolve(dailySnapshot(2));expect(await Promise.all([original,current,alsoCurrent])).toEqual([true,true,true]);expect(store.signInStreak).toBe(2);expect(store.remoteReadState).toBe('ready');
  });
  it('keeps a stale-runtime HTTP429 cooling rather than launching recovery or leaving cold loading',async()=>{
    let reject!:(cause:unknown)=>void;remote.pointsApi.state.mockReturnValueOnce(new Promise((_yes,no)=>reject=no));const store=createBoundStore();const original=store.ensureRemote();advanceRuntimeRevision();reject(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:60_000}));expect(await original).toBe(false);expect(store.remoteReadState).toBe('error');expect(store.remoteHasSnapshot).toBe(false);expect(await store.ensureRemote()).toBe(false);expect(remote.pointsApi.state).toHaveBeenCalledTimes(1);
  });
  it('recovers an owned stale-runtime ordinary failure with one fresh read and stops if that current read fails',async()=>{
    let rejectOld!:(cause:unknown)=>void;remote.pointsApi.state.mockReturnValueOnce(new Promise((_yes,no)=>rejectOld=no)).mockRejectedValueOnce(new Error('current offline'));
    const store=createBoundStore(),original=store.ensureRemote();advanceRuntimeRevision();rejectOld(new Error('old offline'));expect(await original).toBe(false);expect(remote.pointsApi.state).toHaveBeenCalledTimes(2);expect(store.remoteReadState).toBe('error');expect(store.remoteHasSnapshot).toBe(false);
    remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(2));expect(await store.ensureRemote()).toBe(true);expect(remote.pointsApi.state).toHaveBeenCalledTimes(3);expect(store.signInStreak).toBe(2);
  });
  it('shares the current Home visit, reads normal reentry fresh, and honors 429 without skipping command refresh',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(100_000);remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(2));const store=createBoundStore();await flush();
    expect(store.remoteHasSnapshot).toBe(true);await store.ensureRemote(10_000);expect(remote.pointsApi.state).toHaveBeenCalledTimes(1);
    const {notifyPageActivation}=await import('@/lib/passive-tab-read');notifyPageActivation('home-reentry');now.mockReturnValue(101_000);let reject!:(error:unknown)=>void;remote.pointsApi.state.mockReturnValueOnce(new Promise((_yes,no)=>reject=no));
    const first=store.ensureRemote(10_000),second=store.ensureRemote(10_000);expect(remote.pointsApi.state).toHaveBeenCalledTimes(2);
    reject(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:2_000}));expect(await Promise.all([first,second])).toEqual([false,false]);expect(store.remoteHasSnapshot).toBe(true);expect(store.signInStreak).toBe(2);
    now.mockReturnValue(102_999);notifyPageActivation('earn-during-cooldown');await store.ensureRemote(10_000);expect(remote.pointsApi.state).toHaveBeenCalledTimes(2);
    now.mockReturnValue(103_000);notifyPageActivation('home-after-cooldown');remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(3));await store.ensureRemote(10_000);expect(remote.pointsApi.state).toHaveBeenCalledTimes(3);
    remote.pointsApi.state.mockRejectedValueOnce(new Error('offline'));await store.checkInRemote();expect(remote.pointsApi.state).toHaveBeenCalledTimes(4);expect(remote.pointsApi.checkIn).not.toHaveBeenCalled();now.mockRestore();
  });
  it.each([401,403])('clears confirmed presentation on exact HTTP %s',async status=>{
    remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(2));const store=createBoundStore();await flush();expect(store.remoteHasSnapshot).toBe(true);
    remote.pointsApi.state.mockRejectedValueOnce(new ApiError({kind:'http',status,message:'denied'}));await store.refreshRemote();expect(store.remoteHasSnapshot).toBe(false);expect(store.signInStreak).toBe(0);expect(store.remoteReadState).toBe('error');
  });
  it.each([401,403])('an owned stale-runtime HTTP %s clears private facts without a recovery read',async status=>{
    remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(7));const store=createBoundStore();await flush();expect(store.remoteHasSnapshot).toBe(true);
    let reject!:(cause:unknown)=>void;remote.pointsApi.state.mockReturnValueOnce(new Promise((_yes,no)=>reject=no)).mockResolvedValueOnce(dailySnapshot(99));const denied=store.refreshRemote();advanceRuntimeRevision();reject(new ApiError({kind:'http',status,message:'denied'}));expect(await denied).toBe(false);
    expect(store.remoteReadState).toBe('error');expect(store.remoteHasSnapshot).toBe(false);expect(store.signInStreak).toBe(0);expect(store.remoteRules).toEqual([]);expect(store.remoteMilestones).toEqual([]);expect(remote.pointsApi.state).toHaveBeenCalledTimes(2);
  });
  it.each([401,403])('an HTTP %s superseded by a current generation or account never clears the new owner',async status=>{
    let reject!:(cause:unknown)=>void;remote.pointsApi.state.mockReturnValueOnce(new Promise((_yes,no)=>reject=no));const store=createBoundStore();const old=store.ensureRemote();advanceRuntimeRevision();remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(2));expect(await store.ensureRemote()).toBe(true);
    reject(new ApiError({kind:'http',status,message:'old generation'}));await old;expect(store.remoteReadState).toBe('ready');expect(store.signInStreak).toBe(2);expect(store.remoteHasSnapshot).toBe(true);expect(remote.pointsApi.state).toHaveBeenCalledTimes(2);
    let rejectAccount!:(cause:unknown)=>void;remote.pointsApi.state.mockReturnValueOnce(new Promise((_yes,no)=>rejectAccount=no));const previous=store.refreshRemote();remote.sessionUserId=2;remote.pointsApi.state.mockResolvedValueOnce(dailySnapshot(3));store.bindAccount('user:2');await flush();rejectAccount(new ApiError({kind:'http',status,message:'old account'}));await previous;
    expect(store.remoteReadState).toBe('ready');expect(store.signInStreak).toBe(3);expect(store.remoteHasSnapshot).toBe(true);expect(remote.pointsApi.state).toHaveBeenCalledTimes(4);
  });
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
