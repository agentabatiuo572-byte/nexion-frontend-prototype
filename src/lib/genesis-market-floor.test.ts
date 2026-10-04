import { describe, expect, it } from "vitest";
import { genesisMarketFloor } from "./genesis-market-floor";

describe("Genesis market floor", () => {
  it("never substitutes the mock G4 seed for an unavailable remote floor", () => {
    expect(genesisMarketFloor(true, null, 13_400)).toBeNull();
  });

  it("uses the canonical remote floor when available", () => {
    expect(genesisMarketFloor(true, 12_500, 13_400)).toBe(12_500);
  });

  it("retains the configured fallback only in mock mode", () => {
    expect(genesisMarketFloor(false, null, 13_400)).toBe(13_400);
  });
});
