/**
 * Where the home "Compute market / prices" entry lands.
 *
 * 🔴 This must stay the surface that actually renders the compute-workload price
 * board the card previews. `/pages/market/market` is the NEX/USDT token page
 * (title 行情, 24h kline, buy/sell, market cap) — landing a "compute market"
 * entry there shows none of the workload types, models, 1h prices or volumes the
 * card promised. The full board (same `marketBoard.workloads` rows, plus the
 * device-earnings ranking) lives on the Earn tab, which is also where every row
 * inside the card already navigates — so entry and rows agree.
 */
export const COMPUTE_MARKET_ROUTE = "/pages/earn/earn";

type Navigate = (href: string) => Promise<boolean>;
type KeyboardActivation = Pick<KeyboardEvent, "repeat">;

export function createMarketBoardNavigation(navigate: Navigate) {
  let inFlight = false;

  function openMarket(): boolean {
    if (inFlight) return false;
    inFlight = true;
    void Promise.resolve()
      .then(() => navigate(COMPUTE_MARKET_ROUTE))
      .catch(() => false)
      .finally(() => { inFlight = false; });
    return true;
  }

  function openMarketFromKeyboard(event: KeyboardActivation): boolean {
    if (event.repeat) return false;
    return openMarket();
  }

  return {
    openMarket,
    openMarketFromKeyboard,
    isInFlight: () => inFlight,
  };
}
