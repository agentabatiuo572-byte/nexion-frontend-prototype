export interface GenesisListingSnapshot {
  askPriceUSDT: number;
  listedAt: number;
}

export interface GenesisListingConfirmationFence {
  mounted: boolean;
  accountScopeCurrent: boolean;
  frozenTokenId: string | number;
  currentTokenId: string | number;
  frozenListing: GenesisListingSnapshot | null;
  currentListing: GenesisListingSnapshot | null;
}

/**
 * A confirmation dialog can outlive its component, account binding, or card
 * prop. Only dispatch when the exact account-scoped card state still matches
 * the one that opened the dialog. Token IDs are never treated as global
 * identities; accountScopeCurrent must already prove the original binding.
 */
export function canExecuteGenesisListingConfirmation(fence: GenesisListingConfirmationFence): boolean {
  if (!fence.mounted || !fence.accountScopeCurrent || fence.frozenTokenId !== fence.currentTokenId) return false;
  if (fence.frozenListing === null) return fence.currentListing === null;
  return fence.currentListing !== null
    && fence.currentListing.askPriceUSDT === fence.frozenListing.askPriceUSDT
    && fence.currentListing.listedAt === fence.frozenListing.listedAt;
}
