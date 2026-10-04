import { describe, expect, it } from "vitest";
import { isAnnualizedQuotaPerk } from "./quota-perk";

describe("quota fallback perks", () => {
  it("hides unsupported annualized claims but preserves other percentages", () => {
    for (const perk of ["约 396% 年化", "~365% annualized", "ROI 365%", "~365%/năm"])
      expect(isAnnualizedQuotaPerk(perk), perk).toBe(true);
    for (const perk of ["GPU 利用率 90%", "10% discount", "80 NEX/day"])
      expect(isAnnualizedQuotaPerk(perk), perk).toBe(false);
  });
});
