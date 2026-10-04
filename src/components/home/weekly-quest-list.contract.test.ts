import { describe, expect, it } from "vitest";
import source from "./weekly-quest-list.vue?raw";

describe("weekly Tier-2 list presentation", () => {
  it("refreshes the canonical quest projection after a real page return without duplicating the initial load", () => {
    expect(source).toContain("createPageVisibilityRefresh");
    expect(source).toContain("bindPageVisibilityRefresh");
    expect(source).toContain("onShow");
    expect(source).toContain("onHide");
  });

  it("keeps the canonical task name when completed and separates completion from claiming", () => {
    expect(source).toMatch(/v-else-if="isCompleted\(q\)"[\s\S]*titleOf\(q\)[\s\S]*w\.rewardReady[\s\S]*claimTextFor\(q\)/);
  });

  it("labels claimed rows and counts completion rather than only claimed rewards", () => {
    expect(source).toContain("t.questClaim.alreadyClaimed");
    expect(source).toContain("fmt(t.value.quest.progress");
    expect(source).toMatch(/\["COMPLETED", "CLAIMABLE", "CLAIMED"\]\.includes\(q\.status\)/);
  });
});