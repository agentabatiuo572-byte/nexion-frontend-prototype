import { describe, expect, it } from "vitest";
import { genesisHoldingId, displayGenesisHoldingId } from "./genesis-holding-id";

describe("Genesis canonical holding identity", () => {
  it("shortens display only, without inventing an identifier prefix", () => {
    expect(displayGenesisHoldingId(123)).toBe("123");
    expect(displayGenesisHoldingId("G4P-E1308DD15B9E42D9B93E8032568D16FD")).toBe("G4P-E130…8D16FD");
  });
  it("keeps formerly colliding UUID holdings distinct and unchanged", () => {
    const first = "G4P-E1308DD15B9E42D9B93E8032568D16FD";
    const second = "G4P-76B06745BE0B4F8FABEE584CD652BFA5";
    expect(genesisHoldingId(first)).toBe(first);
    expect(genesisHoldingId(second)).toBe(second);
    expect(new Set([genesisHoldingId(first), genesisHoldingId(second)]).size).toBe(2);
  });
  it("rejects missing or malformed identities instead of inventing a target", () => {
    for (const value of ["", " ", "../other", "x".repeat(129)]) {
      expect(() => genesisHoldingId(value)).toThrow();
    }
  });
});
