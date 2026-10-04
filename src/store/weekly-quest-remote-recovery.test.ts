import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  questApi: { state: vi.fn(), claim: vi.fn() },
}));

vi.mock("@/api/runtime", () => remote);

import { useWeeklyQuest } from "./weekly-quest";
import { ApiError } from "@/api/errors";
import { peekWeeklyQuestCommandKey } from "@/lib/weekly-quest-command-key";

const current = {
  questCode: "H3_DEVICE_ACTIVATED",
  name: "Activate a device",
  layer: "WEEKLY_T1" as const,
  rewardNex: 100,
  status: "CLAIMABLE" as const,
  category: "explore" as const,
  actionRoute: "/pages/device/list",
  instanceKey: "WEEK:2026-W36",
  eligibleFrom: "2026-08-31T00:00:00+08:00",
  eligibleUntil: "2099-09-07T00:00:00+08:00",
  eligible: true,
};

function snapshot(status: "CLAIMABLE" | "CLAIMED" = "CLAIMABLE") {
  return {
    quests: [{ ...current, status }], promoBanner: null, questBonusMultiplier: 1,
    rhythmMonth: 7, source: "nx_mission + nx_user_mission", serverCanonical: true as const,
    sourceEnvironment: "PRODUCTION" as const, runId: "",
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("weekly quest remote claim recovery", () => {
  let storage: Map<string, unknown>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    });
    remote.questApi.state.mockReset();
    remote.questApi.claim.mockReset();
    setActivePinia(createPinia());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reuses the original key after an ambiguous response and Pinia restart", async () => {
    remote.questApi.state.mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error("readback unavailable"));
    const firstStore = useWeeklyQuest();
    firstStore.bindAccount("user:a");
    await flush();
    remote.questApi.claim.mockRejectedValueOnce(new Error("connection reset after send"));

    await expect(firstStore.claim(current)).resolves.toBe(false);
    const retained = peekWeeklyQuestCommandKey("user:a", current.questCode, current.instanceKey);
    expect(retained).toBeTruthy();

    setActivePinia(createPinia());
    remote.questApi.state.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot("CLAIMED"));
    remote.questApi.claim.mockResolvedValueOnce({
      questId: current.questCode, rewardNex: 100, status: "CLAIMED",
      instanceKey: current.instanceKey, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
    });
    const restarted = useWeeklyQuest();
    restarted.bindAccount("user:a");
    await flush();

    await expect(restarted.claim(current)).resolves.toBe(true);
    expect(remote.questApi.claim).toHaveBeenLastCalledWith(current.questCode, retained, current.instanceKey);
    expect(peekWeeklyQuestCommandKey("user:a", current.questCode, current.instanceKey)).toBeNull();
  });

  it("retires a retained key when authoritative refresh already reports claimed", async () => {
    const pendingStore = useWeeklyQuest();
    remote.questApi.state.mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error("readback unavailable"));
    pendingStore.bindAccount("user:a");
    await flush();
    remote.questApi.claim.mockRejectedValueOnce(new Error("connection reset after send"));
    await pendingStore.claim(current);
    expect(peekWeeklyQuestCommandKey("user:a", current.questCode, current.instanceKey)).toBeTruthy();

    setActivePinia(createPinia());
    remote.questApi.state.mockResolvedValueOnce(snapshot("CLAIMED"));
    const recovered = useWeeklyQuest();
    recovered.bindAccount("user:a");
    await flush();

    expect(recovered.snapshot?.quests[0]?.status).toBe("CLAIMED");
    expect(peekWeeklyQuestCommandKey("user:a", current.questCode, current.instanceKey)).toBeNull();
    expect(remote.questApi.claim).toHaveBeenCalledTimes(1);
  });

  it("retires a terminal unknown key only after the same instance is authoritatively still claimable", async () => {
    remote.questApi.state.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot());
    remote.questApi.claim.mockRejectedValueOnce(new ApiError({
      kind: "business", message: "IDEMPOTENCY_RESULT_UNKNOWN", code: 409,
    }));
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();

    await expect(store.claim(current)).resolves.toBe(false);
    expect(store.error).toBe("WEEKLY_QUEST_CLAIM_RETRY_REQUIRED");
    expect(peekWeeklyQuestCommandKey("user:a", current.questCode, current.instanceKey)).toBeNull();

    remote.questApi.state.mockResolvedValueOnce(snapshot("CLAIMED"));
    remote.questApi.claim.mockResolvedValueOnce({
      questId: current.questCode, rewardNex: 100, status: "CLAIMED",
      instanceKey: current.instanceKey, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
    });
    await expect(store.claim(current)).resolves.toBe(true);
    expect(remote.questApi.claim.mock.calls[1]?.[1]).not.toBe(remote.questApi.claim.mock.calls[0]?.[1]);
  });

  it("keeps the same key while the idempotency request is still in progress", async () => {
    remote.questApi.state.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot());
    remote.questApi.claim.mockRejectedValueOnce(new ApiError({
      kind: "business", message: "IDEMPOTENCY_REQUEST_IN_PROGRESS", code: 409,
    }));
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();

    await expect(store.claim(current)).resolves.toBe(false);
    expect(store.error).toBe("WEEKLY_QUEST_CLAIM_OUTCOME_UNKNOWN");
    expect(peekWeeklyQuestCommandKey("user:a", current.questCode, current.instanceKey)).toBeTruthy();
  });

  it("keeps a pending prior-week command isolated from the current-week claim", async () => {
    const prior = { ...current, instanceKey: "WEEK:2026-W35" };
    remote.questApi.state.mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error("readback unavailable"));
    remote.questApi.claim.mockRejectedValueOnce(new Error("connection reset after send"));
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();
    await store.claim(prior);
    const priorKey = peekWeeklyQuestCommandKey("user:a", prior.questCode, prior.instanceKey);

    remote.questApi.state.mockResolvedValueOnce(snapshot("CLAIMED"));
    remote.questApi.claim.mockResolvedValueOnce({
      questId: current.questCode, rewardNex: 100, status: "CLAIMED",
      instanceKey: current.instanceKey, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
    });
    await expect(store.claim(current)).resolves.toBe(true);

    expect(priorKey).toBeTruthy();
    expect(remote.questApi.claim).toHaveBeenLastCalledWith(
      current.questCode, expect.not.stringMatching(String(priorKey)), current.instanceKey,
    );
    expect(peekWeeklyQuestCommandKey("user:a", prior.questCode, prior.instanceKey)).toBe(priorKey);
  });

  it("does not post a claim when durable command storage is unavailable", async () => {
    remote.questApi.state.mockResolvedValueOnce(snapshot());
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();
    vi.stubGlobal("uni", {
      getStorageSync: () => { throw new Error("storage unavailable"); },
      setStorageSync: () => { throw new Error("storage unavailable"); },
      removeStorageSync: () => { throw new Error("storage unavailable"); },
    });

    await expect(store.claim(current)).resolves.toBe(false);
    expect(store.error).toBe("WEEKLY_QUEST_COMMAND_STORAGE_UNAVAILABLE");
    expect(remote.questApi.claim).not.toHaveBeenCalled();
  });

  it("does not leak an old account recovery error into a newly bound account", async () => {
    let resolveRecovery: (value: ReturnType<typeof snapshot>) => void = () => undefined;
    const delayedRecovery = new Promise<ReturnType<typeof snapshot>>((resolve) => {
      resolveRecovery = resolve;
    });
    const accountB = {
      ...snapshot(), quests: [{ ...current, name: "Account B quest" }],
    };
    remote.questApi.state
      .mockResolvedValueOnce(snapshot())
      .mockImplementationOnce(() => delayedRecovery)
      .mockResolvedValueOnce(accountB);
    remote.questApi.claim.mockRejectedValueOnce(new Error("connection reset after send"));
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();

    const oldClaim = store.claim(current);
    await flush();
    store.bindAccount("user:b");
    await flush();
    resolveRecovery(snapshot());

    await expect(oldClaim).resolves.toBe(false);
    expect(store.error).toBeNull();
    expect(store.snapshot?.quests[0]?.name).toBe("Account B quest");
    expect(peekWeeklyQuestCommandKey("user:a", current.questCode, current.instanceKey)).toBeTruthy();
  });

  it("keeps the last confirmed weekly snapshot when a refresh fails", async () => {
    remote.questApi.state.mockResolvedValueOnce(snapshot());
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();
    const confirmed = store.snapshot;

    remote.questApi.state.mockRejectedValueOnce(new Error("weekly service unavailable"));
    await expect(store.refresh()).resolves.toBe(false);

    expect(store.snapshot).toBe(confirmed);
    expect(store.snapshot?.quests[0]?.status).toBe("CLAIMABLE");
    expect(store.error).toBe("weekly service unavailable");
  });

  it("keeps all three weekly rows when one claim is rejected with 422", async () => {
    const rows = ["BROWSE_3_PRODUCTS", "CHECK_IN", "SHARE_STORE"].map((questCode) => ({
      ...current, questCode, layer: "WEEKLY_T2" as const, name: questCode,
    }));
    const confirmed = { ...snapshot(), quests: rows };
    remote.questApi.state.mockResolvedValueOnce(confirmed)
      .mockRejectedValueOnce(new Error("refresh temporarily unavailable"))
      .mockResolvedValueOnce(confirmed);
    remote.questApi.claim.mockRejectedValueOnce(new ApiError({
      kind: "business", message: "QUEST_PROGRESS_NOT_MET", code: 422,
    }));
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();
    const loaded = store.snapshot;

    await expect(store.claim(rows[0]!)).resolves.toBe(false);
    expect(store.snapshot).toBe(loaded);
    expect(store.tier2Quests.map((quest) => quest.questCode)).toEqual(rows.map((quest) => quest.questCode));
    expect(store.claimErrorQuestCode).toBe("BROWSE_3_PRODUCTS");
    expect(store.error).toBe("QUEST_PROGRESS_NOT_MET");
    expect(peekWeeklyQuestCommandKey("user:a", rows[0]!.questCode, rows[0]!.instanceKey)).toBeNull();
    expect(remote.questApi.claim).toHaveBeenCalledTimes(1);

    await expect(store.refresh()).resolves.toBe(false);
    expect(store.snapshot).toBe(loaded);
    expect(store.claimErrorQuestCode).toBe("BROWSE_3_PRODUCTS");
    expect(store.error).toBe("QUEST_PROGRESS_NOT_MET");

    await expect(store.refresh()).resolves.toBe(true);
    expect(store.claimErrorQuestCode).toBeNull();
    expect(store.tier2Quests).toHaveLength(3);
  });

  it("keeps the loaded rows for a transport-level HTTP 422 rejection", async () => {
    const confirmed = { ...snapshot(), quests: [{ ...current, layer: "WEEKLY_T2" as const }] };
    remote.questApi.state.mockResolvedValueOnce(confirmed);
    remote.questApi.claim.mockRejectedValueOnce(new ApiError({
      kind: "http", message: "HTTP_422", status: 422,
    }));
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();
    const loaded = store.snapshot;

    await expect(store.claim(confirmed.quests[0]!)).resolves.toBe(false);
    expect(store.snapshot).toBe(loaded);
    expect(store.claimErrorQuestCode).toBe(current.questCode);
    expect(store.error).toBe("HTTP_422");
    expect(remote.questApi.claim).toHaveBeenCalledTimes(1);
    expect(peekWeeklyQuestCommandKey("user:a", current.questCode, current.instanceKey)).toBeNull();
  });

  it("does not let a pre-claim GET erase a later 422 row failure", async () => {
    const confirmed = { ...snapshot(), quests: [{ ...current, layer: "WEEKLY_T2" as const }] };
    let finishOldRead: (value: typeof confirmed) => void = () => undefined;
    const oldRead = new Promise<typeof confirmed>((resolve) => { finishOldRead = resolve; });
    remote.questApi.state.mockResolvedValueOnce(confirmed).mockImplementationOnce(() => oldRead);
    remote.questApi.claim.mockRejectedValueOnce(new ApiError({
      kind: "business", message: "QUEST_PROGRESS_NOT_MET", code: 422,
    }));
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();
    const loaded = store.snapshot;

    const staleRefresh = store.refresh();
    await flush();
    await expect(store.claim(confirmed.quests[0]!)).resolves.toBe(false);
    finishOldRead(confirmed);
    await expect(staleRefresh).resolves.toBe(false);
    expect(store.snapshot).toBe(loaded);
    expect(store.claimErrorQuestCode).toBe(current.questCode);
    expect(store.error).toBe("QUEST_PROGRESS_NOT_MET");
  });

  it("refreshes an already-claimed response without treating it as a new claim", async () => {
    remote.questApi.state.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot("CLAIMED"));
    remote.questApi.claim.mockRejectedValueOnce(new ApiError({
      kind: "business", message: "QUEST_ALREADY_CLAIMED", code: 409,
    }));
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();

    await expect(store.claim(current)).resolves.toBe(false);

    expect(store.claimNotice).toBe("alreadyClaimed");
    expect(store.snapshot?.quests[0]?.status).toBe("CLAIMED");
    expect(peekWeeklyQuestCommandKey("user:a", current.questCode, current.instanceKey)).toBeNull();
    await expect(store.claim(store.snapshot!.quests[0]!)).resolves.toBe(false);
    expect(remote.questApi.claim).toHaveBeenCalledTimes(1);
  });

  it("refreshes a terminal inactive response so a stale claim control closes", async () => {
    const expired = {
      ...snapshot(),
      quests: [{ ...current, status: "EXPIRED" as const, eligible: false }],
    };
    remote.questApi.state.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(expired);
    remote.questApi.claim.mockRejectedValueOnce(new ApiError({
      kind: "business", message: "QUEST_DEFINITION_INACTIVE", code: 409,
    }));
    const store = useWeeklyQuest();
    store.bindAccount("user:a");
    await flush();

    await expect(store.claim(current)).resolves.toBe(false);

    expect(store.claimNotice).toBe("definitionInactive");
    expect(store.snapshot?.quests[0]).toMatchObject({ status: "EXPIRED", eligible: false });
    await expect(store.claim(store.snapshot!.quests[0]!)).resolves.toBe(false);
    expect(remote.questApi.claim).toHaveBeenCalledTimes(1);
  });
});
