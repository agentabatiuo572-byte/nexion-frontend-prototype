import { describe, expect, it } from "vitest";
import {
  presentGenesisFloorDelta,
  presentGenesisFloorPrice,
  presentGenesisMarketplaceActivityDescription,
  presentGenesisRoyalty,
} from "./genesis-marketplace-presentation";

describe("Genesis marketplace presentation", () => {
  it("keeps an unavailable floor delta neutral instead of inventing an up trend", () => {
    expect(presentGenesisFloorDelta(null)).toEqual({ state: "unavailable", value: "—" });
  });

  it.each([
    [8.25, "up", "+8.25%"],
    [-8.25, "down", "-8.25%"],
    [0, "flat", "0%"],
  ] as const)("presents a %s floor delta as %s", (delta, state, value) => {
    expect(presentGenesisFloorDelta(delta)).toEqual({ state, value });
  });

  it("formats only a known server royalty, preserving a real zero rate", () => {
    expect(presentGenesisRoyalty(2.5)).toBe("2.5%");
    expect(presentGenesisRoyalty(0)).toBe("0%");
    expect(presentGenesisRoyalty(null)).toBeNull();
    expect(presentGenesisRoyalty(-1)).toBeNull();
  });

  it("presents a known floor as full money and an unknown floor without a currency suffix", () => {
    expect(presentGenesisFloorPrice(13_400.5)).toBe("$13,400.50");
    expect(presentGenesisFloorPrice(null)).toBe("—");
  });

  it("turns public transaction kinds and quantities into localized activity text", () => {
    const labels = { primary: "Primary purchase", secondary: "Secondary sale" };

    expect(presentGenesisMarketplaceActivityDescription("PRIMARY", "1 node", "tx-primary", labels))
      .toBe("Primary purchase · 1 node · tx-primary");
    expect(presentGenesisMarketplaceActivityDescription("SECONDARY", "2 nodes", "tx-secondary", labels))
      .toBe("Secondary sale · 2 nodes · tx-secondary");
  });
});
