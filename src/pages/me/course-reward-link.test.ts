import { describe, expect, it, vi } from "vitest";
import { takeNavigationQuery } from "@/lib/route";
import { courseRewardId, rewardsListCategory } from "./course-reward-link";

describe("course reward detail link", () => {
  it("opens only a projected course reward source", () => {
    expect(courseRewardId({ memoKey: "learningReward", ref: "account-security@v1" })).toBe("account-security");
    expect(courseRewardId({ memoKey: "bonus", ref: "account-security@v1" })).toBeNull();
    expect(courseRewardId({ memoKey: "learningReward", ref: "LEARN:7:account-security:v1" })).toBeNull();
    expect(courseRewardId({ memoKey: "learningReward", ref: "bad/id@v1" })).toBeNull();
    expect(courseRewardId({ memoKey: "learningReward" })).toBeNull();
  });
});

describe("NEX reward list return", () => {
  it("recovers its category from an H5 cold-return hash and keeps normal App options", () => {
    vi.stubGlobal("window", { location: { hash: "#/pages/me/rewards-list?cat=nex" } });
    try {
      expect(rewardsListCategory(undefined, takeNavigationQuery("/pages/me/rewards-list"))).toBe("nex");
      expect(rewardsListCategory({ cat: "nex" }, "")).toBe("nex");
      expect(rewardsListCategory({ cat: "" }, "?cat=nex")).toBe("nex");
      expect(rewardsListCategory(undefined, "?cat=unknown")).toBe("voucher");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
