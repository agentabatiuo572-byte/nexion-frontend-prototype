import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, disposePinia, setActivePinia, type Pinia } from "pinia";
import { advanceRuntimeRevision } from "@/api/order-api";

const commissionRuntime = vi.hoisted(() => ({
  remoteApiEnabled: true,
  commissionConfigApi: { rates: vi.fn(), binary: vi.fn() },
  teamInsightsApi: { commissions: vi.fn() },
}));

const vRankRuntime = vi.hoisted(() => ({
  remoteApiEnabled: true,
  vRankApi: { ladder: vi.fn(), current: vi.fn() },
}));

vi.mock("@/api/runtime", () => ({ ...commissionRuntime, ...vRankRuntime }));

const { useCommission } = await import("./commission");
const { useVRank } = await import("./v-rank");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function event(id: string) {
  return {
    id,
    kind: "unilevel" as const,
    sourceUserName: id,
    amountUSDT: 10,
    amountNEX: 0,
    ts: 1,
    unlockAt: 2,
    status: "cooling" as const,
  };
}

function commissionPage(id: string, page: number, totalRows: number) {
  const events = [event(id)];
  const emptyBucket = { usdt: 0, nex: 0, count: 0 };
  return {
    source: "server",
    serverCanonical: true,
    sourceEnvironment: "SANDBOX" as const,
    runId: "sep06g",
    events,
    page,
    pageSize: 20,
    totalRows,
    generatedAt: "2026-09-06T00:00:00.000Z",
    snapshotAt: `2026-09-06T00:00:0${page}.000Z`,
    aggregate: {
      totalUSDT: 10,
      totalNEX: 0,
      directUSDT: 10,
      extendedUSDT: 0,
      contributorCount: 1,
      monthUSDT: 10,
      monthNEX: 0,
      todayUSDT: 10,
      unlockedUSDT: 0,
      unlockedNEX: 0,
      coolingUSDT: 10,
      eventCount: 1,
      nextUnlockAt: 2,
      byKind: {
        unilevel: { usdt: 10, nex: 0, count: 1 },
        binary: emptyBucket,
        peer: emptyBucket,
        cultivation: emptyBucket,
        leadership: emptyBucket,
        genesis: emptyBucket,
      },
    },
  };
}

function binary(source: string) {
  return {
    source,
    serverCanonical: true,
    sourceEnvironment: "SANDBOX" as const,
    runId: "sep06g",
    asOfDate: "2026-09-06",
    trackA: 0,
    trackB: 0,
    trackAMembers: 0,
    trackBMembers: 0,
    autoPlacedMembers: 0,
    matchRate: 0,
    threshold: 0,
    dailyCap: 0,
    periodCap: 0,
    estimatedAmountUsdt: 0,
    settlePeriod: "daily" as const,
    residualPolicy: "carryForward" as const,
    spilloverEnabled: false,
    gvReset: "2026-09-06T00:00:00.000Z",
    paused: false,
    blockedReason: "",
    recentMatches: [],
  };
}

function ladder(title: string) {
  return {
    source: "server",
    prizeName: title,
    capabilities: { peer: false, genesis: false },
    ranks: Array.from({ length: 13 }, (_, v) => ({
      v,
      title: `${title} V${v}`,
      cnTitle: `${title} V${v}`,
      directBonus: 0,
      unilevelDepth: 1,
      peerBonus: 0,
      leadershipVotes: 0,
      cultivationBonus: 0,
      rewards: [],
      visible: true,
    })),
  };
}

function current(rankCode: string) {
  return {
    source: "server",
    rankCode,
    progress: { selfBuyUSD: 0, directRefs: 0, teamVolumeUSD: 0, vDownlineCounts: {} },
  };
}

let testPinia: Pinia;
beforeEach(() => {
  vi.resetAllMocks();
  testPinia = createPinia();
  setActivePinia(testPinia);
});
afterEach(() => disposePinia(testPinia));

describe("Sep 06G same-account request generation fences", () => {
  it.each([
    ["account", "success"], ["account", "failure"],
    ["runtime", "success"], ["runtime", "failure"],
  ] as const)("keeps the new binary scope joinable after old %s scope %s", async (change, outcome) => {
    const oldRead = deferred<ReturnType<typeof binary>>();
    const currentRead = deferred<ReturnType<typeof binary>>();
    commissionRuntime.commissionConfigApi.rates.mockResolvedValue({});
    commissionRuntime.teamInsightsApi.commissions.mockResolvedValue(commissionPage("current-event", 1, 1));
    commissionRuntime.commissionConfigApi.binary
      .mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(currentRead.promise);
    const store = useCommission();
    store.bindAccount("account-a");
    const first = store.refreshCanonicalBinary();
    if (change === "account") store.bindAccount("account-b");
    else advanceRuntimeRevision();
    const second = store.refreshCanonicalBinary();
    expect(commissionRuntime.commissionConfigApi.binary).toHaveBeenCalledTimes(2);
    if (outcome === "success") oldRead.resolve(binary("stale"));
    else oldRead.reject(new Error("stale read failed"));
    await first;
    expect(store.binaryStatus).toBe("loading");
    expect(store.binarySnapshot).toBeNull();
    let joinedSettled = false;
    const joined = store.refreshCanonicalBinary().then(() => { joinedSettled = true; });
    await flush();
    expect(joinedSettled).toBe(false);
    expect(commissionRuntime.commissionConfigApi.binary).toHaveBeenCalledTimes(2);
    currentRead.resolve(binary("current"));
    await Promise.all([second, joined]);
    expect(store.binaryStatus).toBe("ready");
    expect(store.binarySnapshot?.source).toBe("current");
    commissionRuntime.commissionConfigApi.binary.mockResolvedValueOnce(binary("fresh"));
    await store.refreshCanonicalBinary();
    expect(commissionRuntime.commissionConfigApi.binary).toHaveBeenCalledTimes(3);
    expect(store.binarySnapshot?.source).toBe("fresh");
  });

  it("can retry a synchronous binary reader failure without retaining a settled flight", async () => {
    commissionRuntime.commissionConfigApi.binary.mockImplementationOnce(() => { throw new Error("reader unavailable"); });
    const store = useCommission();
    await store.refreshCanonicalBinary();
    expect(store.binaryStatus).toBe("error");
    commissionRuntime.commissionConfigApi.binary.mockResolvedValueOnce(binary("recovered"));
    await store.refreshCanonicalBinary();
    expect(commissionRuntime.commissionConfigApi.binary).toHaveBeenCalledTimes(2);
    expect(store.binarySnapshot?.source).toBe("recovered");
  });

  it("coalesces concurrent same-scope F3 reads into one request", async () => {
    const pending = deferred<ReturnType<typeof binary>>();
    commissionRuntime.commissionConfigApi.binary.mockReturnValue(pending.promise);
    const store = useCommission();

    const first = store.refreshCanonicalBinary();
    const second = store.refreshCanonicalBinary();
    expect(commissionRuntime.commissionConfigApi.binary).toHaveBeenCalledTimes(1);

    pending.resolve(binary("coalesced-binary"));
    await Promise.all([first, second]);
    expect(store.binarySnapshot?.source).toBe("coalesced-binary");
  });

  it("clears a confirmed F3 snapshot when the newest same-scope refresh fails", async () => {
    commissionRuntime.commissionConfigApi.binary
      .mockResolvedValueOnce(binary("confirmed-binary"))
      .mockRejectedValueOnce(new Error("newest binary read failed"));
    const store = useCommission();

    await store.refreshCanonicalBinary();
    expect(store.binarySnapshot?.source).toBe("confirmed-binary");

    await store.refreshCanonicalBinary();
    expect(store.binaryStatus).toBe("error");
    expect(store.binarySnapshot).toBeNull();
  });

  it("keeps the newer first page when an older same-account event refresh finishes last", async () => {
    const older = deferred<ReturnType<typeof commissionPage>>();
    const newer = deferred<ReturnType<typeof commissionPage>>();
    commissionRuntime.teamInsightsApi.commissions
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const store = useCommission();

    const first = store.refreshCanonicalEvents();
    const second = store.refreshCanonicalEvents();
    newer.resolve(commissionPage("newer-event", 1, 1));
    await second;
    older.resolve(commissionPage("older-event", 1, 1));
    await first;

    expect(store.events.map((item) => item.id)).toEqual(["newer-event"]);
  });

  it("keeps a newer same-account event success ready when the older request fails last", async () => {
    const older = deferred<ReturnType<typeof commissionPage>>();
    const newer = deferred<ReturnType<typeof commissionPage>>();
    commissionRuntime.teamInsightsApi.commissions
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const store = useCommission();

    const first = store.refreshCanonicalEvents();
    const second = store.refreshCanonicalEvents();
    newer.resolve(commissionPage("newer-event", 1, 1));
    await second;
    older.reject(new Error("older events failed"));
    await first;

    expect(store.eventsStatus).toBe("ready");
    expect(store.events.map((item) => item.id)).toEqual(["newer-event"]);
  });

  it("does not append a stale same-account load-more page after a newer first-page refresh", async () => {
    const latePage = deferred<ReturnType<typeof commissionPage>>();
    commissionRuntime.teamInsightsApi.commissions
      .mockResolvedValueOnce(commissionPage("initial-event", 1, 40))
      .mockReturnValueOnce(latePage.promise)
      .mockResolvedValueOnce(commissionPage("fresh-event", 1, 1));
    const store = useCommission();

    await store.refreshCanonicalEvents();
    const pendingMore = store.loadMoreCanonicalEvents();
    await store.refreshCanonicalEvents();
    latePage.resolve(commissionPage("stale-page-two", 2, 40));
    await pendingMore;

    expect(store.events.map((item) => item.id)).toEqual(["fresh-event"]);
  });

  it("does not turn a fresh list into an error when a superseded load-more request fails", async () => {
    const latePage = deferred<ReturnType<typeof commissionPage>>();
    commissionRuntime.teamInsightsApi.commissions
      .mockResolvedValueOnce(commissionPage("initial-event", 1, 40))
      .mockReturnValueOnce(latePage.promise)
      .mockResolvedValueOnce(commissionPage("fresh-event", 1, 1));
    const store = useCommission();

    await store.refreshCanonicalEvents();
    const pendingMore = store.loadMoreCanonicalEvents();
    await store.refreshCanonicalEvents();
    latePage.reject(new Error("stale page failed"));
    await pendingMore;

    expect(store.eventsStatus).toBe("ready");
    expect(store.eventsLoadMoreStatus).toBe("idle");
    expect(store.events.map((item) => item.id)).toEqual(["fresh-event"]);
  });

  it("does not let an older same-account V-rank failure clear a newer successful snapshot", async () => {
    const oldLadder = deferred<ReturnType<typeof ladder>>();
    const oldCurrent = deferred<ReturnType<typeof current>>();
    const newLadder = deferred<ReturnType<typeof ladder>>();
    const newCurrent = deferred<ReturnType<typeof current>>();
    vRankRuntime.vRankApi.ladder
      .mockReturnValueOnce(oldLadder.promise)
      .mockReturnValueOnce(newLadder.promise);
    vRankRuntime.vRankApi.current
      .mockReturnValueOnce(oldCurrent.promise)
      .mockReturnValueOnce(newCurrent.promise);
    const store = useVRank();

    const first = store.refreshCanonicalVRank();
    const second = store.refreshCanonicalVRank();
    newLadder.resolve(ladder("newer"));
    newCurrent.resolve(current("V4"));
    await second;
    oldLadder.resolve(ladder("older"));
    oldCurrent.reject(new Error("older request failed"));
    await first;

    expect(store.remoteReady).toBe(true);
    expect(store.remoteError).toBeNull();
    expect(store.prizeName).toBe("newer");
    expect(store.capabilities).toEqual({ peer: false, genesis: false });
    expect(store.myRank).toBe(4);
  });

  it("keeps commission and V-rank snapshots fenced after switching accounts", async () => {
    const oldBinary = deferred<ReturnType<typeof binary>>();
    const newBinary = deferred<ReturnType<typeof binary>>();
    const oldEvents = deferred<ReturnType<typeof commissionPage>>();
    const newEvents = deferred<ReturnType<typeof commissionPage>>();
    const oldLadder = deferred<ReturnType<typeof ladder>>();
    const newLadder = deferred<ReturnType<typeof ladder>>();
    const oldCurrent = deferred<ReturnType<typeof current>>();
    const newCurrent = deferred<ReturnType<typeof current>>();
    commissionRuntime.commissionConfigApi.rates.mockResolvedValue({});
    commissionRuntime.commissionConfigApi.binary
      .mockReturnValueOnce(oldBinary.promise)
      .mockReturnValueOnce(newBinary.promise);
    commissionRuntime.teamInsightsApi.commissions
      .mockReturnValueOnce(oldEvents.promise)
      .mockReturnValueOnce(newEvents.promise);
    vRankRuntime.vRankApi.ladder
      .mockReturnValueOnce(oldLadder.promise)
      .mockReturnValueOnce(newLadder.promise);
    vRankRuntime.vRankApi.current
      .mockReturnValueOnce(oldCurrent.promise)
      .mockReturnValueOnce(newCurrent.promise);
    const commission = useCommission();
    const vRank = useVRank();

    commission.bindAccount("account-a");
    commission.bindAccount("account-b");
    vRank.bindAccount("account-a");
    vRank.bindAccount("account-b");
    newBinary.resolve(binary("account-b"));
    newEvents.resolve(commissionPage("account-b-event", 1, 1));
    newLadder.resolve(ladder("account-b"));
    newCurrent.resolve(current("V5"));
    await flush();
    oldBinary.reject(new Error("account-a binary failed"));
    oldEvents.reject(new Error("account-a events failed"));
    oldLadder.resolve(ladder("account-a"));
    oldCurrent.reject(new Error("account-a V-rank failed"));
    await flush();

    expect(commission.binarySnapshot?.source).toBe("account-b");
    expect(commission.events.map((item) => item.id)).toEqual(["account-b-event"]);
    expect(vRank.remoteReady).toBe(true);
    expect(vRank.remoteError).toBeNull();
    expect(vRank.prizeName).toBe("account-b");
    expect(vRank.myRank).toBe(5);
  });
});
