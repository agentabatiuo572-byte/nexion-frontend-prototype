import { describe, expect, it, vi } from "vitest";
import { createQuestApi } from "./quest-api";

const quest = {
  questCode: "setup_profile",
  name: "Set up profile",
  layer: "DAY_ONE",
  rewardNex: 80,
  status: "CLAIMABLE",
  category: "identity",
  actionRoute: "/pages/me/profile",
  instanceKey: "DAY_ONE:20260901T000000",
  eligibleFrom: "2026-09-01T00:00:00+08:00",
  eligibleUntil: "2026-09-04T00:00:00+08:00",
  eligible: true,
};

describe("quest API authority", () => {
  it("keeps Share weekly promo available without exposing legacy daily USD", async () => {
    const promo = {
      bannerCode: "HOME_WEEKLY_UPSELL", baseReward: 800, multiplier: 1.5,
      countdownDays: 4, countdownHours: 12, targetDevice: "opaque-share-sku",
      productType: "SHARE", targetDaily: null, status: "active",
    };
    const response = {
      quests: [quest], dayOneRewardNex: 500, promoBanner: promo,
      questBonusMultiplier: 1, rhythmMonth: 1, serverCanonical: true,
      sourceEnvironment: "PRODUCTION", runId: "", source: "nx_mission + nx_user_mission",
    };
    await expect(createQuestApi({ request: async () => response } as never, "prod").state())
      .resolves.toMatchObject({ promoBanner: { targetDaily: null, baseReward: 800 } });

    const legacyResponse = { ...response, promoBanner: { ...promo, productType: undefined, targetDevice: "Cloud Share", targetDaily: 0.19 } };
    await expect(createQuestApi({ request: async () => legacyResponse } as never, "prod").state())
      .resolves.toMatchObject({ promoBanner: { targetDaily: null } });

    for (const targetDevice of ["云共享", "雲共享"]) {
      const localizedLegacy = { ...legacyResponse, promoBanner: { ...legacyResponse.promoBanner, targetDevice } };
      await expect(createQuestApi({ request: async () => localizedLegacy } as never, "prod").state())
        .resolves.toMatchObject({ promoBanner: { targetDaily: null } });
    }

    const deviceResponse = { ...response, promoBanner: { ...promo, productType: "DEVICE", targetDevice: "StellarBox Pro", targetDaily: 1.5 } };
    await expect(createQuestApi({ request: async () => deviceResponse } as never, "prod").state())
      .resolves.toMatchObject({ promoBanner: { targetDaily: 1.5 } });

    const namedDevice = { ...response, promoBanner: { ...promo, productType: "DEVICE", targetDevice: "Cloud Share research device", targetDaily: 1.5 } };
    await expect(createQuestApi({ request: async () => namedDevice } as never, "prod").state())
      .resolves.toMatchObject({ promoBanner: { targetDaily: 1.5 } });
  });

  it("keeps a complete Day-One snapshot's required member count with the immutable row projection", async () => {
    const request = vi.fn().mockResolvedValue({
      quests: [quest], dayOneRewardNex: 500, dayOneRequiredTaskCount: 1, dayOneSnapshotStatus: "SNAPSHOT",
      promoBanner: {}, questBonusMultiplier: 1, rhythmMonth: 1, serverCanonical: true,
      sourceEnvironment: "PRODUCTION", runId: "", source: "nx_mission + nx_user_mission",
    });
    await expect(createQuestApi({ request } as never, "prod").state()).resolves.toMatchObject({
      dayOneRequiredTaskCount: 1,
      dayOneSnapshotStatus: "SNAPSHOT",
    });
  });

  it("keeps a 1001-member frozen snapshot when every immutable row belongs to its one instance", async () => {
    const instanceKey = "DAY_ONE:20260909T000000";
    const immutableRows = Array.from({ length: 1001 }, (_, index) => ({
      ...quest,
      questCode: `frozen-${index}`,
      instanceKey,
      status: "COMPLETED",
    }));
    const response = {
      quests: immutableRows,
      dayOneRewardNex: 500,
      dayOneRequiredTaskCount: immutableRows.length,
      dayOneSnapshotStatus: "SNAPSHOT",
      promoBanner: {}, questBonusMultiplier: 1, rhythmMonth: 1, serverCanonical: true,
      sourceEnvironment: "PRODUCTION", runId: "", source: "nx_mission + nx_user_mission",
    };

    await expect(createQuestApi({ request: async () => response } as never, "prod").state())
      .resolves.toMatchObject({
        dayOneRequiredTaskCount: 1001,
        dayOneSnapshotStatus: "SNAPSHOT",
        quests: expect.arrayContaining([expect.objectContaining({ instanceKey })]),
      });
  });

  it("fails closed for an unsafe frozen member count even when JavaScript can represent it as an integer", async () => {
    const response = {
      quests: [quest],
      dayOneRewardNex: 500,
      dayOneRequiredTaskCount: Number.MAX_SAFE_INTEGER + 1,
      dayOneSnapshotStatus: "SNAPSHOT",
      promoBanner: {}, questBonusMultiplier: 1, rhythmMonth: 1, serverCanonical: true,
      sourceEnvironment: "PRODUCTION", runId: "", source: "nx_mission + nx_user_mission",
    };
    await expect(createQuestApi({ request: async () => response } as never, "prod").state())
      .resolves.toMatchObject({
        dayOneRequiredTaskCount: null,
        dayOneSnapshotStatus: "LEGACY_UNVERIFIED",
      });
  });

  it("consumes the backend snapshot-only response without inventing weekly rows or re-pricing its frozen reward", async () => {
    const response = {
      quests: [{
        questCode: "FROZEN_DAY_ONE", name: "Original name", layer: "DAY_ONE", rewardNex: 0,
        status: "PENDING", category: "explore", actionRoute: "/pages/store/store",
        instanceKey: "DAY_ONE:SNAPSHOT1",
        eligibleFrom: "2026-09-09T10:30:15+08:00", eligibleUntil: "2026-09-12T10:30:15+08:00",
        eligible: true,
      }],
      dayOneRewardNex: 1000,
      dayOneRequiredTaskCount: 1,
      dayOneSnapshotStatus: "SNAPSHOT",
      promoBanner: {},
      questBonusMultiplier: 2,
      rhythmMonth: 2,
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      source: "nx_mission + nx_user_mission + nx_growth_day_one_instance + nx_growth_day_one_instance_item + day_one_snapshot_only",
    };

    await expect(createQuestApi({ request: async () => response } as never, "prod").state())
      .resolves.toEqual(expect.objectContaining({
        quests: [expect.objectContaining({ questCode: "FROZEN_DAY_ONE", layer: "DAY_ONE" })],
        dayOneRewardNex: 1000,
        dayOneRequiredTaskCount: 1,
        dayOneSnapshotStatus: "SNAPSHOT",
        questBonusMultiplier: 2,
        rhythmMonth: 2,
        source: "nx_mission + nx_user_mission + nx_growth_day_one_instance + nx_growth_day_one_instance_item + day_one_snapshot_only",
      }));
  });

  it("accepts a frozen Day-One reward above the former aggregate transport cap", async () => {
    const response = {
      quests: [quest],
      dayOneRewardNex: 25_001 * 4,
      dayOneRequiredTaskCount: 1,
      dayOneSnapshotStatus: "SNAPSHOT",
      promoBanner: {},
      questBonusMultiplier: 4,
      rhythmMonth: 2,
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      source: "nx_mission + nx_user_mission + nx_growth_day_one_instance",
    };

    await expect(createQuestApi({ request: async () => response } as never, "prod").state())
      .resolves.toMatchObject({ dayOneRewardNex: 100_004 });
  });

  it.each([
    [-1, "negative"],
    [Number.NaN, "NaN"],
    [Number.POSITIVE_INFINITY, "Infinity"],
  ])("rejects a %s aggregate Day-One reward", async (dayOneRewardNex, _reason) => {
    const response = {
      quests: [quest],
      dayOneRewardNex,
      dayOneRequiredTaskCount: 1,
      dayOneSnapshotStatus: "SNAPSHOT",
      promoBanner: {},
      questBonusMultiplier: 1,
      rhythmMonth: 1,
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      source: "nx_mission + nx_user_mission + nx_growth_day_one_instance",
    };

    await expect(createQuestApi({ request: async () => response } as never, "prod").state())
      .rejects.toMatchObject({ message: "QUEST_RESPONSE_INVALID" });
  });

  it.each([
    [{ quests: [], dayOneRewardNex: 0, dayOneRequiredTaskCount: 0, dayOneSnapshotStatus: "EMPTY" }, "EMPTY"],
    [{ quests: [{ ...quest, status: "EXPIRED", eligible: false }], dayOneRewardNex: 0,
      dayOneRequiredTaskCount: null, dayOneSnapshotStatus: "LEGACY_UNVERIFIED" }, "LEGACY_UNVERIFIED"],
  ])("rejects a %s state response without H1 fields instead of supplying a fictional default", async (partial, _status) => {
    const response = {
      ...partial,
      promoBanner: {},
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      source: "nx_mission + nx_user_mission + nx_growth_day_one_instance",
    };
    await expect(createQuestApi({ request: async () => response } as never, "prod").state())
      .rejects.toMatchObject({ message: "QUEST_RESPONSE_INVALID" });
  });

  it("preserves weekly and legacy Day-One history while treating missing snapshot metadata as unverified", async () => {
    const request = vi.fn().mockResolvedValue({
      quests: [
        { ...quest, status: "EXPIRED", eligible: false },
        { ...quest, questCode: "weekly-1", layer: "WEEKLY_T1", instanceKey: "WEEK:2026-W36" },
      ],
      dayOneRewardNex: 0, promoBanner: {}, questBonusMultiplier: 1, rhythmMonth: 1,
      serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", source: "nx_mission + nx_user_mission",
    });
    await expect(createQuestApi({ request } as never, "prod").state()).resolves.toMatchObject({
      dayOneRequiredTaskCount: null,
      dayOneSnapshotStatus: "LEGACY_UNVERIFIED",
      quests: [{ layer: "DAY_ONE" }, { layer: "WEEKLY_T1" }],
    });
  });

  it.each([
    [{ dayOneRequiredTaskCount: 1 }, "incomplete metadata"],
    [{ dayOneSnapshotStatus: "SNAPSHOT", dayOneRequiredTaskCount: 0 }, "zero snapshot member count"],
    [{ dayOneSnapshotStatus: "EMPTY", dayOneRequiredTaskCount: 1 }, "nonzero empty count"],
    [{ dayOneSnapshotStatus: "LEGACY_UNVERIFIED", dayOneRequiredTaskCount: 6 }, "legacy count"],
  ])("keeps other task history while failing closed for invalid Day-One metadata: %s", async (override, _reason) => {
    const payload = {
      quests: [quest], dayOneRewardNex: 500, promoBanner: {}, questBonusMultiplier: 1, rhythmMonth: 1,
      serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", source: "nx_mission + nx_user_mission", ...override,
    };
    await expect(createQuestApi({ request: async () => payload } as never, "prod").state())
      .resolves.toMatchObject({
        dayOneRequiredTaskCount: null,
        dayOneSnapshotStatus: "LEGACY_UNVERIFIED",
        quests: [{ questCode: quest.questCode }],
      });
  });

  it("accepts the production mission projection only in remote mode", async () => {
    const request = vi.fn().mockResolvedValue({
      quests: [quest],
      dayOneRewardNex: 500,
      promoBanner: {},
      questBonusMultiplier: 1,
      rhythmMonth: 1,
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      source: "nx_mission + nx_user_mission",
    });
    const api = createQuestApi({ request } as never, "prod");

    await expect(api.state()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
  });

  it("accepts the same backend-canonical quest projection in development", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        quests: [quest],
        dayOneRewardNex: 500,
        promoBanner: {},
        questBonusMultiplier: 1,
        rhythmMonth: 1,
        serverCanonical: true,
        sourceEnvironment: "PRODUCTION",
        runId: "",
        source: "nx_mission + nx_user_mission",
      })
      .mockResolvedValueOnce({
        questId: "setup_profile",
        rewardNex: 80,
        status: "CLAIMED",
        instanceKey: quest.instanceKey,
        serverCanonical: true,
        sourceEnvironment: "PRODUCTION",
        runId: "",
      });
    const api = createQuestApi({ request } as never, "dev");

    await expect(api.state()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
    await expect(api.claim("setup_profile", "quest-claim-20260816", quest.instanceKey)).resolves.toMatchObject({
      sourceEnvironment: "PRODUCTION",
      runId: "",
    });
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({
      method: "POST",
      body: { instanceKey: quest.instanceKey },
    }));
  });

  it("rejects sandbox payloads in both development and production", async () => {
    const sandbox = {
      quests: [quest], dayOneRewardNex: 500, promoBanner: {}, questBonusMultiplier: 1, rhythmMonth: 0,
      serverCanonical: true, sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260816", source: "mock",
    };
    await expect(createQuestApi({ request: async () => sandbox } as never, "prod").state())
      .rejects.toMatchObject({ message: "QUEST_RESPONSE_INVALID" });
    await expect(createQuestApi({ request: async () => sandbox } as never, "dev").state())
      .rejects.toMatchObject({ message: "QUEST_RESPONSE_INVALID" });
  });

  it.each([
    [{ category: undefined }, "missing category"],
    [{ category: "unknown" }, "unknown category"],
    [{ actionRoute: undefined }, "missing route"],
    [{ actionRoute: "https://example.com/phish" }, "external route"],
    [{ instanceKey: "WEEK:2026-W36" }, "wrong instance kind"],
    [{ eligibleUntil: "2026-08-31T23:59:59+08:00" }, "reversed eligibility window"],
    [{ eligible: false, status: "PENDING" }, "ineligible pending state"],
  ])("rejects a quest with %s", async (override, _reason) => {
    const payload = {
      quests: [{ ...quest, ...override }],
      dayOneRewardNex: 500,
      promoBanner: {},
      questBonusMultiplier: 1,
      rhythmMonth: 1,
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      source: "nx_mission + nx_user_mission",
    };
    await expect(createQuestApi({ request: async () => payload } as never, "prod").state())
      .rejects.toMatchObject({ message: "QUEST_RESPONSE_INVALID" });
  });

  it("accepts an expired Day-One instance as a visible but ineligible row", async () => {
    const payload = {
      quests: [{ ...quest, status: "EXPIRED", eligible: false }],
      dayOneRewardNex: 0,
      promoBanner: {},
      questBonusMultiplier: 1,
      rhythmMonth: 1,
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      source: "nx_mission + nx_user_mission",
    };
    await expect(createQuestApi({ request: async () => payload } as never, "prod").state())
      .resolves.toMatchObject({ quests: [{ status: "EXPIRED", eligible: false }] });
  });

  it("accepts a disabled weekly instance as visible read-only history", async () => {
    const payload = {
      quests: [{
        ...quest,
        questCode: "weekly_device_activation_legacy",
        layer: "WEEKLY_T1",
        status: "EXPIRED",
        instanceKey: "WEEK:2026-W35",
        eligibleFrom: "2026-08-24T00:00:00+08:00",
        eligibleUntil: "2026-08-31T00:00:00+08:00",
        eligible: false,
      }],
      dayOneRewardNex: 0,
      promoBanner: {},
      questBonusMultiplier: 1,
      rhythmMonth: 1,
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
      source: "nx_mission + nx_user_mission",
    };

    await expect(createQuestApi({ request: async () => payload } as never, "prod").state())
      .resolves.toMatchObject({ quests: [{ status: "EXPIRED", eligible: false }] });
  });
});
