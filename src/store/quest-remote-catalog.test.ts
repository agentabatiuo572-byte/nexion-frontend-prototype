import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, claim } = vi.hoisted(() => ({ state: vi.fn(), claim: vi.fn() }));

vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  questApi: { state, claim },
}));

import { useQuest } from "./quest";
import { useLocaleStore } from "./locale";
import { ApiError } from "@/api/errors";

describe("PC-managed H3 quest catalogue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    state.mockReset();
    claim.mockReset();
  });

  it("keeps the canonical quest rows so the home card can render PC task names and rewards", async () => {
    state.mockResolvedValue({
      quests: [
        { questCode: "H3_FIRST_ORDER_STARTED", name: "Start your first order", layer: "DAY_ONE", rewardNex: 50, status: "PENDING" },
        { questCode: "H3_REFERRAL_SETTLED", name: "Complete a qualified referral", layer: "DAY_ONE", rewardNex: 200, status: "PENDING" },
        { questCode: "H3_DEVICE_ACTIVATED", name: "Activate a device", layer: "WEEKLY_T1", rewardNex: 100, status: "PENDING" },
      ],
    });
    const quest = useQuest();

    await expect(quest.refreshRemote()).resolves.toBe(true);

    expect(quest.remoteQuests).toHaveLength(3);
    expect(quest.remoteQuests.filter((row) => row.layer === "DAY_ONE"))
      .toMatchObject([
        { questCode: "H3_FIRST_ORDER_STARTED", rewardNex: 50 },
        { questCode: "H3_REFERRAL_SETTLED", rewardNex: 200 },
      ]);
  });

  it("refreshes the visible home task catalogue after an explicit locale change", async () => {
    state.mockResolvedValueOnce({
      quests: [{ questCode: "H3_FIRST_ORDER_STARTED", name: "Start your first order", layer: "DAY_ONE", rewardNex: 50, status: "PENDING" }],
    }).mockResolvedValueOnce({
      quests: [{ questCode: "H3_FIRST_ORDER_STARTED", name: "Start first order", layer: "DAY_ONE", rewardNex: 50, status: "PENDING" }],
    });
    const locale = useLocaleStore();
    locale.applyServerLocale("en");
    const quest = useQuest();
    await quest.refreshRemote();
    expect(state).toHaveBeenLastCalledWith("en");

    locale.setLocale("zh");

    await vi.waitFor(() => expect(quest.remoteQuests[0]?.name).toBe("Start first order"));
    expect(state).toHaveBeenLastCalledWith("zh");
  });

  it("keeps the last confirmed catalogue visible while a background refresh is pending", async () => {
    state.mockResolvedValueOnce({
      quests: [
        { questCode: "H3_FIRST_ORDER_STARTED", name: "Start your first order", layer: "DAY_ONE", rewardNex: 50, status: "PENDING" },
        { questCode: "H3_REFERRAL_SETTLED", name: "Complete a qualified referral", layer: "DAY_ONE", rewardNex: 200, status: "CLAIMED" },
      ],
    });
    const quest = useQuest();
    await quest.refreshRemote();

    let resolveRefresh!: (value: { quests: Array<Record<string, unknown>> }) => void;
    state.mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    const refreshing = quest.refreshRemote();

    expect(quest.remoteStatus).toBe("ready");
    expect(quest.remoteQuests).toHaveLength(2);
    expect(quest.isComplete("H3_REFERRAL_SETTLED")).toBe(true);

    resolveRefresh({
      quests: [
        { questCode: "H3_FIRST_ORDER_STARTED", name: "Start your first order", layer: "DAY_ONE", rewardNex: 50, status: "CLAIMED" },
      ],
    });
    await expect(refreshing).resolves.toBe(true);
    expect(quest.remoteQuests).toHaveLength(1);
    expect(quest.isComplete("H3_FIRST_ORDER_STARTED")).toBe(true);
  });

  it("keeps the task count when switching to a large module triggers markComplete refresh", async () => {
    state.mockResolvedValueOnce({
      quests: [
        { questCode: "H3_FIRST_ORDER_STARTED", name: "Start your first order", layer: "DAY_ONE", rewardNex: 50, status: "PENDING" },
        { questCode: "H3_REFERRAL_SETTLED", name: "Complete a qualified referral", layer: "DAY_ONE", rewardNex: 200, status: "PENDING" },
      ],
    });
    const quest = useQuest();
    await quest.refreshRemote();

    let resolveModuleRefresh!: (value: { quests: Array<Record<string, unknown>> }) => void;
    state.mockImplementationOnce(() => new Promise((resolve) => { resolveModuleRefresh = resolve; }));
    quest.markComplete("visit_store");

    expect(state).toHaveBeenCalledTimes(2);
    expect(quest.remoteStatus).toBe("ready");
    expect(quest.remoteQuests.filter((row) => row.layer === "DAY_ONE")).toHaveLength(2);

    resolveModuleRefresh({ quests: [] });
    await vi.waitFor(() => expect(quest.remoteQuests).toHaveLength(0));
  });

  it("keeps the last confirmed catalogue when a background refresh fails", async () => {
    state.mockResolvedValueOnce({
      quests: [
        { questCode: "H3_FIRST_ORDER_STARTED", name: "Start your first order", layer: "DAY_ONE", rewardNex: 50, status: "PENDING" },
        { questCode: "H3_REFERRAL_SETTLED", name: "Complete a qualified referral", layer: "DAY_ONE", rewardNex: 200, status: "PENDING" },
      ],
    });
    const quest = useQuest();
    await quest.refreshRemote();
    state.mockRejectedValueOnce(new Error("temporary network failure"));

    await expect(quest.refreshRemote()).resolves.toBe(false);

    expect(quest.remoteStatus).toBe("ready");
    expect(quest.remoteQuests).toHaveLength(2);
    expect(quest.rewardFor("H3_REFERRAL_SETTLED")).toBe(200);
  });

  it("commits a refreshed catalogue atomically when the server payload is malformed", async () => {
    state.mockResolvedValueOnce({
      quests: [
        { questCode: "H3_FIRST_ORDER_STARTED", name: "Start your first order", layer: "DAY_ONE", rewardNex: 50, status: "PENDING" },
        { questCode: "H3_REFERRAL_SETTLED", name: "Complete a qualified referral", layer: "DAY_ONE", rewardNex: 200, status: "PENDING" },
      ],
    });
    const quest = useQuest();
    await quest.refreshRemote();
    state.mockResolvedValueOnce({ quests: null });

    await expect(quest.refreshRemote()).resolves.toBe(false);

    expect(quest.remoteStatus).toBe("ready");
    expect(quest.remoteQuests).toHaveLength(2);
    expect(quest.rewardFor("H3_FIRST_ORDER_STARTED")).toBe(50);
  });

  it("does not erase a confirmed catalogue when a route-triggered claim fails", async () => {
    state.mockResolvedValueOnce({
      quests: [
        { questCode: "H3_FIRST_ORDER_STARTED", name: "Start your first order", layer: "DAY_ONE", rewardNex: 50, status: "PENDING" },
        { questCode: "H3_REFERRAL_SETTLED", name: "Complete a qualified referral", layer: "DAY_ONE", rewardNex: 200, status: "PENDING" },
      ],
    });
    const quest = useQuest();
    await quest.refreshRemote();
    claim.mockRejectedValueOnce(new Error("not claimable from route visit"));

    await expect(quest.claimRemote("visit_store")).resolves.toBe(false);

    expect(quest.remoteStatus).toBe("ready");
    expect(quest.remoteQuests).toHaveLength(2);
  });

  it("scopes a claim idempotency key and readback to the current mission instance", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-03T12:00:00+08:00"));
    const current = {
      questCode: "visit_store",
      name: "Visit store",
      layer: "WEEKLY_T1",
      rewardNex: 50,
      status: "CLAIMABLE",
      category: "explore",
      actionRoute: "/pages/store/store",
      instanceKey: "WEEK:2026-W36",
      eligibleFrom: "2026-08-31T00:00:00+08:00",
      eligibleUntil: "2026-09-07T00:00:00+08:00",
      eligible: true,
    };
    state.mockResolvedValueOnce({ quests: [current] }).mockResolvedValueOnce({
      quests: [{ ...current, status: "CLAIMED" }],
    });
    claim.mockResolvedValueOnce({
      questId: current.questCode,
      status: "CLAIMED",
      rewardNex: current.rewardNex,
      instanceKey: current.instanceKey,
    });
    const quest = useQuest();
    await quest.refreshRemote();

    await expect(quest.claimRemote(current.questCode)).resolves.toBe(true);

    expect(claim).toHaveBeenCalledWith(
      current.questCode,
      `h3-quest-claim:${current.questCode}:${current.instanceKey}`,
      current.instanceKey,
    );
    expect(quest.remoteQuests[0]).toMatchObject({ status: "CLAIMED", instanceKey: current.instanceKey });
  });

  it("still discards the previous account catalogue when the account binding changes", async () => {
    state.mockResolvedValueOnce({
      quests: [
        { questCode: "H3_REFERRAL_SETTLED", name: "Complete a qualified referral", layer: "DAY_ONE", rewardNex: 200, status: "CLAIMED" },
      ],
    });
    const quest = useQuest();
    await quest.refreshRemote();

    let resolveNewAccount!: (value: { quests: Array<Record<string, unknown>> }) => void;
    state.mockImplementationOnce(() => new Promise((resolve) => { resolveNewAccount = resolve; }));
    quest.bindAccount("second-account");

    expect(quest.remoteStatus).toBe("loading");
    expect(quest.remoteQuests).toHaveLength(0);
    expect(quest.isComplete("H3_REFERRAL_SETTLED")).toBe(false);

    resolveNewAccount({ quests: [] });
    await vi.waitFor(() => expect(quest.remoteStatus).toBe("ready"));
    expect(quest.remoteQuests).toHaveLength(0);
  });

  it("refreshes a terminal already-claimed response instead of reporting a new reward", async () => {
    const current = {
      questCode: "H3_FIRST_ORDER_STARTED", name: "Start your first order", layer: "DAY_ONE",
      rewardNex: 50, status: "CLAIMABLE", category: "explore", actionRoute: "/pages/store/store",
      instanceKey: "DAY_ONE:2026-09-07", eligibleFrom: "2026-09-07T00:00:00+08:00",
      eligibleUntil: "2099-09-07T00:00:00+08:00", eligible: true,
    };
    state.mockResolvedValueOnce({ quests: [current] }).mockResolvedValueOnce({
      quests: [{ ...current, status: "CLAIMED" }],
    });
    claim.mockRejectedValueOnce(new ApiError({
      kind: "business", message: "QUEST_ALREADY_CLAIMED", code: 409,
    }));
    const quest = useQuest();
    await quest.refreshRemote();

    await expect(quest.claimRemote(current.questCode)).resolves.toBe(false);

    expect(quest.claimNotice).toBe("alreadyClaimed");
    expect(quest.remoteQuests[0]).toMatchObject({ status: "CLAIMED" });
    await expect(quest.claimRemote(current.questCode)).resolves.toBe(false);
    expect(claim).toHaveBeenCalledTimes(1);
  });
});
