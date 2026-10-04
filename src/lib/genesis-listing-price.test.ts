import { describe, expect, it } from "vitest";

import { parseGenesisListingPrice } from "./genesis-listing-price";

describe("Genesis listing-price input", () => {
  it("preserves a server-supported six-decimal amount", () => {
    expect(parseGenesisListingPrice("10.123456")).toBe(10.123456);
  });

  it.each(["10.1234567", "1,000.50", "12abc34", ".5", "0", "100000000.000001", "1e3"])(
    "rejects malformed, zero, or out-of-range listing input %s without coercion",
    (raw) => {
      expect(parseGenesisListingPrice(raw)).toBeNull();
    },
  );
});
