import { describe, expect, it } from "vitest";
import { genesisSupplyDisplay } from "./genesis-supply-display";

describe("Genesis supply display", () => {
  it("keeps an unknown remote supply out of numeric output and progress widths", () => {
    expect(genesisSupplyDisplay(0, 0, false)).toEqual({
      known: false,
      summary: "",
      progressWidth: "0%",
    });
  });

  it("preserves a real empty supply as a known zero", () => {
    expect(genesisSupplyDisplay(0, 0, true)).toEqual({
      known: true,
      summary: "0 / 0",
      progressWidth: "0%",
    });
  });

  it("renders server supply safely", () => {
    expect(genesisSupplyDisplay(1, 1000, true)).toEqual({
      known: true,
      summary: "1 / 1,000",
      progressWidth: "0.1%",
    });
  });
});
