import { describe, expect, it, vi } from "vitest";
import { createPointsApi } from "./points-api";

const sandboxRun = "sandbox-run-20260816";

const state = {
  rewardAsset: "NEX",
  serverDate: "2026-08-16",
  nextResetAtUtc: "2026-08-17T00:00:00Z",
  streak: {
    currentStreak: 1,
    longestStreak: 1,
    streakSavers: 1,
    lastCheckInDate: null,
    checkedInToday: false,
  },
  dailyMilestones: [],
  earningMilestones: [],
  badgeAchievements: [{
    achievementCode: "FIRST_DEVICE",
    name: "First device",
    description: "Activate a device",
    category: "HARDWARE",
    iconKey: "hardware_owner",
    accentColor: "#00C48C",
    rewardPoints: 0,
    status: "UNLOCKED",
    unlockedAt: "2026-08-16T01:00:00Z",
  }],
  powerUps: [],
  rules: [],
  topStreakers: [],
  source: "nx_user_streak + nx_daily_check_in",
  serverCanonical: true,
  sourceEnvironment: "SANDBOX",
  runId: sandboxRun,
};

const production = { ...state, sourceEnvironment: "PRODUCTION", runId: "", source: "nx_user_streak" };

describe("points API provenance", () => {
  it("parses canonical H4 badge achievements from the server projection", async () => {
    await expect(createPointsApi({ request: async () => production } as never, "prod").state())
      .resolves.toMatchObject({ badgeAchievements: [{ achievementCode: "FIRST_DEVICE", status: "UNLOCKED" }] });
  });

  it("accepts the Java canonical production response in development mode", async () => {
    await expect(createPointsApi({ request: async () => production } as never, "dev").state())
      .resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
    await expect(createPointsApi({ request: async () => state } as never, "dev").state())
      .rejects.toMatchObject({ message: "DAILY_RESPONSE_INVALID" });
  });

  it.each(["dev", "prod"] as const)("requires production provenance and an empty run id in %s mode", async (mode) => {
    await expect(createPointsApi({ request: async () => production } as never, mode).state())
      .resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
    await expect(createPointsApi({ request: async () => ({ ...production, runId: "stale-run" }) } as never, mode).state())
      .rejects.toMatchObject({ message: "DAILY_RESPONSE_INVALID" });
    await expect(createPointsApi({ request: async () => state } as never, mode).state())
      .rejects.toMatchObject({ message: "DAILY_RESPONSE_INVALID" });
  });

  it("fails closed for every points mutation when provenance is missing or mismatched", async () => {
    const responses = [
      { checkInDate: "2026-08-16", baseNex: 1, rewardNex: 1, streakBonusNex: 0, multiplier: 1, streakDays: 1 },
      { milestoneId: 1, milestoneDay: 1, rewardType: "NEX", rewardAmount: 1, badgeCode: null, spinTickets: 0 },
      { restoredStreak: 1, streakSavers: 0, effectiveLastCheckInDate: "2026-08-15" },
      { powerUpId: 1, powerUpCode: "nex_boost", badgeCode: null, status: "ACTIVATED" },
    ].map((value) => ({ ...value, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" }));
    const request = vi.fn()
      .mockResolvedValueOnce({ ...responses[0], sourceEnvironment: "SANDBOX", runId: sandboxRun })
      .mockResolvedValueOnce({ ...responses[1], runId: "stale-run" })
      .mockResolvedValueOnce({ ...responses[2], serverCanonical: false })
      .mockResolvedValueOnce({ ...responses[3], sourceEnvironment: "SANDBOX", runId: sandboxRun });
    const api = createPointsApi({ request } as never, "dev");

    await expect(api.checkIn("check-in-key")).rejects.toMatchObject({ message: "DAILY_CHECK_IN_RESPONSE_INVALID" });
    await expect(api.claimMilestone(1, "claim-key")).rejects.toMatchObject({ message: "DAILY_MILESTONE_CLAIM_RESPONSE_INVALID" });
    await expect(api.useSaver("saver-key")).rejects.toMatchObject({ message: "DAILY_STREAK_SAVER_RESPONSE_INVALID" });
    await expect(api.activatePowerUp(1, "power-up-key")).rejects.toMatchObject({ message: "DAILY_POWER_UP_ACTIVATION_RESPONSE_INVALID" });
  });

  it("accepts Java canonical production provenance for every points mutation in development mode", async () => {
    const canonical = { serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" };
    const request = vi.fn()
      .mockResolvedValueOnce({ checkInDate: "2026-08-16", baseNex: 2, rewardNex: 2, streakBonusNex: 0, multiplier: 1, streakDays: 1, ...canonical })
      .mockResolvedValueOnce({ milestoneId: 1, milestoneDay: 3, rewardType: "NEX", rewardAmount: 5, badgeCode: null, spinTickets: 0, ...canonical })
      .mockResolvedValueOnce({ restoredStreak: 1, streakSavers: 0, effectiveLastCheckInDate: "2026-08-15", ...canonical })
      .mockResolvedValueOnce({ powerUpId: 1, powerUpCode: "nex_boost", badgeCode: null, status: "ACTIVATED", ...canonical });
    const api = createPointsApi({ request } as never, "dev");

    await expect(api.checkIn("check-in-key")).resolves.toMatchObject({ rewardNex: 2, sourceEnvironment: "PRODUCTION", runId: "" });
    await expect(api.claimMilestone(1, "claim-key")).resolves.toMatchObject({ milestoneDay: 3, sourceEnvironment: "PRODUCTION", runId: "" });
    await expect(api.useSaver("saver-key")).resolves.toMatchObject({ restoredStreak: 1, sourceEnvironment: "PRODUCTION", runId: "" });
    await expect(api.activatePowerUp(1, "power-up-key")).resolves.toMatchObject({ status: "ACTIVATED", sourceEnvironment: "PRODUCTION", runId: "" });
  });

  it("sends a selected earning milestone in the canonical request body and retains the legacy default call", async () => {
    const canonical = {
      fired: [{ milestoneId: "M-500", thresholdUsd: 500, rewardNex: 50, lifetimeEarningsUsd: 500 }],
      count: 1,
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
    };
    const request = vi.fn().mockResolvedValue(canonical);
    const api = createPointsApi({ request } as never, "prod");

    await expect(api.evaluateEarningMilestones("earning-selected-key", "M-500"))
      .resolves.toMatchObject({ fired: [{ milestoneId: "M-500" }] });
    expect(request).toHaveBeenLastCalledWith({
      method: "POST",
      path: "/api/earnings/milestones/evaluate",
      body: { milestoneId: "M-500" },
      idempotencyKey: "earning-selected-key",
    });

    await expect(api.evaluateEarningMilestones("earning-default-key"))
      .resolves.toMatchObject({ fired: [{ milestoneId: "M-500" }] });
    expect(request).toHaveBeenLastCalledWith({
      method: "POST",
      path: "/api/earnings/milestones/evaluate",
      body: undefined,
      idempotencyKey: "earning-default-key",
    });
  });
});
