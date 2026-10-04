import { describe, expect, it } from "vitest";
import { proofPosterText } from "./proof-poster-values";

describe("proof poster values", () => {
  it("renders unavailable metrics as a human placeholder instead of null", () => {
    expect(proofPosterText(null)).toBe("—");
    expect(proofPosterText(undefined)).toBe("—");
  });

  it("keeps present numeric and text values intact", () => {
    expect(proofPosterText(0)).toBe("0");
    expect(proofPosterText(12)).toBe("12");
    expect(proofPosterText("NEX-001")).toBe("NEX-001");
  });
});
