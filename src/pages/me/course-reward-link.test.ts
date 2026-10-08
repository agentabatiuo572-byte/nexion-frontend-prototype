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

describe("reward list categories", () => {
  it.each(["voucher", "usdt", "nex", "promotion"] as const)("keeps %s on App options and H5 cold return", category => {
    expect(rewardsListCategory({ cat: category }, "")).toBe(category);
    expect(rewardsListCategory(undefined, `?cat=${category}`)).toBe(category);
    expect(rewardsListCategory({ cat: "" }, `?cat=${category}`)).toBe(category);
  });

  it("prefers a valid explicit category and defaults invalid input to vouchers", () => {
    expect(rewardsListCategory({ cat: "promotion" }, "?cat=nex")).toBe("promotion");
    expect(rewardsListCategory({ cat: "voucher" }, "?cat=promotion")).toBe("voucher");
    expect(rewardsListCategory({ cat: "unknown" }, "?cat=promotion")).toBe("promotion");
    expect(rewardsListCategory({ cat: "unknown" }, "?cat=unknown")).toBe("voucher");
  });
});
