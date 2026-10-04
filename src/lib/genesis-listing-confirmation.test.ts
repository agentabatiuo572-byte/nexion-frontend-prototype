import { describe, expect, it } from "vitest";
import { canExecuteGenesisListingConfirmation } from "./genesis-listing-confirmation";

describe("Genesis listing confirmation fence", () => {
  const listConfirmation = {
    mounted: true,
    accountScopeCurrent: true,
    frozenTokenId: "holding-a",
    currentTokenId: "holding-a",
    frozenListing: null,
    currentListing: null,
  };

  it("does not issue a new listing command after an account change, unmount, or prop replacement", () => {
    expect(canExecuteGenesisListingConfirmation(listConfirmation)).toBe(true);
    expect(canExecuteGenesisListingConfirmation({ ...listConfirmation, accountScopeCurrent: false })).toBe(false);
    expect(canExecuteGenesisListingConfirmation({ ...listConfirmation, mounted: false })).toBe(false);
    expect(canExecuteGenesisListingConfirmation({ ...listConfirmation, currentTokenId: "holding-b" })).toBe(false);
  });

  it("only cancels the exact listing the user confirmed", () => {
    const frozenListing = { askPriceUSDT: 10.5, listedAt: 1_700_000_000_000 };
    const request = { ...listConfirmation, frozenListing, currentListing: { ...frozenListing } };

    expect(canExecuteGenesisListingConfirmation(request)).toBe(true);
    expect(canExecuteGenesisListingConfirmation({ ...request, currentListing: { ...frozenListing, askPriceUSDT: 11 } })).toBe(false);
    expect(canExecuteGenesisListingConfirmation({ ...request, currentListing: null })).toBe(false);
  });
});
