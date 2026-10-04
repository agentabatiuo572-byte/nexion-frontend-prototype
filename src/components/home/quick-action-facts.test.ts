import { describe, expect, it } from "vitest";
import type { CanonicalQuest } from "@/api/quest-api";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { quickMissionFact, quickNumericFact } from "./quick-action-facts";

describe("home quick action server facts", () => {
  it.each(["idle", "loading"])("does not expose bootstrap or stale numbers during %s", state => {
    expect(quickNumericFact(true, state, 0)).toEqual({ state: "loading" });
    expect(quickNumericFact(true, state, 99)).toEqual({ state: "loading" });
  });
  it.each(["error", "unavailable"])("does not call failed reads zero during %s", state => {
    expect(quickNumericFact(true, state, 0)).toEqual({ state: "error" });
  });
  it("preserves confirmed zero and the explicit local preview mode", () => {
    expect(quickNumericFact(true, "ready", 0)).toEqual({ state: "ready", value: 0 });
    expect(quickNumericFact(false, "loading", 3)).toEqual({ state: "ready", value: 3 });
  });
  it("labels the current server task total without calling completed or closed tasks active", () => {
    const now = Date.parse("2026-09-09T00:00:00Z");
    const row = { eligible: true, status: "PENDING", eligibleFrom: "2026-09-08", eligibleUntil: "2026-09-11" } as CanonicalQuest;
    const rows = [row, { ...row, status: "COMPLETED" as const }, { ...row, status: "CLAIMABLE" as const },
      { ...row, status: "CLAIMED" as const, eligible: false },
      { ...row, status: "EXPIRED" as const, eligible: false }, { ...row, eligibleFrom: "2026-09-10" }];
    const fact = quickMissionFact(true, "ready", rows, now);
    expect(fact).toEqual({ state: "ready", value: 4 });
    if (fact.state === "ready") {
      expect(fmt(zh.home.quickMissionsCount, { n: fact.value })).toBe("共 4 项任务");
      expect(fmt(en.home.quickMissionsCount, { n: fact.value })).toBe("4 tasks total");
      expect(fmt(vi.home.quickMissionsCount, { n: fact.value })).toBe("Tổng 4 nhiệm vụ");
    }
    expect(quickMissionFact(true, "loading", rows, now)).toEqual({ state: "loading" });
    expect(quickMissionFact(true, "error", [], now)).toEqual({ state: "error" });
    expect(quickMissionFact(true, "ready", [], now)).toEqual({ state: "ready", value: 0 });
  });
});
