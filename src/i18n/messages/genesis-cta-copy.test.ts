import { describe, expect, it } from "vitest";
import { zh } from "./zh";

describe("Genesis primary-sale CTA copy", () => {
  it("uses the same immediate-subscription wording as the 5174 reference", () => {
    expect(zh.genesis.ctaReserve).toBe("立即认购");
  });
});
