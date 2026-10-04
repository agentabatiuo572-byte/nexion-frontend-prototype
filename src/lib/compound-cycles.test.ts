import { describe, expect, it } from "vitest";

import { compoundDurationDays, reinvestmentCount } from "./compound-cycles";

describe("reinvestmentCount", () => {
  it("does not count the initial term as a re-investment", () => {
    expect(reinvestmentCount(2)).toBe(1);
  });

  it("keeps a one-term calculation at zero re-investments", () => {
    expect(reinvestmentCount(1)).toBe(0);
  });

  it("labels the actual covered duration instead of a fixed calendar year", () => {
    expect(compoundDurationDays(30)).toBe(360);
    expect(compoundDurationDays(90)).toBe(360);
    expect(compoundDurationDays(180)).toBe(360);
    expect(compoundDurationDays(365)).toBe(365);
  });
});
