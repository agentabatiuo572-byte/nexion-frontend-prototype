export type OrderSourceAvailability = "ready" | "partial" | "unavailable";
export type OrderListPresentation = "loading" | "unavailable" | "partial" | "empty" | "list";

export interface OrderListPanels {
  mainPresentation: OrderListPresentation;
  showSourceOutage: boolean;
}

export interface RemoteCommerceRequest {
  accountKey: string;
  epoch: number;
}

export function remoteCommerceRequestCurrent(
  request: RemoteCommerceRequest,
  current: RemoteCommerceRequest,
): boolean {
  return request.accountKey === current.accountKey && request.epoch === current.epoch;
}

export function orderSourceAvailability(sources: { commerce: boolean; genesis: boolean }): OrderSourceAvailability {
  if (sources.commerce && sources.genesis) return "ready";
  if (sources.commerce || sources.genesis) return "partial";
  return "unavailable";
}

export function orderListPresentation(input: {
  loading: boolean;
  availability: OrderSourceAvailability;
  orderCount: number;
}): OrderListPresentation {
  if (input.loading) return "loading";
  if (input.availability === "unavailable") return "unavailable";
  if (input.orderCount > 0) return "list";
  return input.availability === "partial" ? "partial" : "empty";
}

/**
 * A source outage is supplemental state, not the page's sole content state:
 * a successful source can still contribute rows while its peer is retryable.
 */
export function orderListPanels(input: {
  loading: boolean;
  availability: OrderSourceAvailability;
  orderCount: number;
}): OrderListPanels {
  return {
    mainPresentation: orderListPresentation(input),
    showSourceOutage: !input.loading
      && (input.availability === "partial" || input.availability === "unavailable"),
  };
}

/** Retries keep their last per-source verdict visible; only the first read owns the loading panel. */
export function isInitialOrderReadLoading(input: { loading: boolean; hasResolved: boolean }): boolean {
  return input.loading && !input.hasResolved;
}

export type RemoteOrderRefreshResult = {
  availability: OrderSourceAvailability | "stale";
  commerceUnavailable: boolean;
  genesisUnavailable: boolean;
};

export function createRemoteOrdersRefresh(deps: {
  commerce: () => Promise<unknown>;
  genesis: () => Promise<boolean>;
  genesisAccountUnavailable: () => boolean;
  isCurrent: () => boolean;
}): () => Promise<RemoteOrderRefreshResult> {
  return async () => {
    const [commerceResult, genesisResult] = await Promise.allSettled([
      deps.commerce(),
      deps.genesis(),
    ]);
    if (!deps.isCurrent()) {
      return { availability: "stale", commerceUnavailable: false, genesisUnavailable: false };
    }
    const commerceAvailable = commerceResult.status === "fulfilled";
    const genesisAvailable = genesisResult.status === "fulfilled"
      && genesisResult.value
      && !deps.genesisAccountUnavailable();
    return {
      availability: orderSourceAvailability({ commerce: commerceAvailable, genesis: genesisAvailable }),
      commerceUnavailable: !commerceAvailable,
      genesisUnavailable: !genesisAvailable,
    };
  };
}

/** A committed exchange remains successful if its optional wallet read-back is unavailable. */
export function shouldRefreshWalletAfterExchange(status: string): boolean {
  return status === "COMPLETED" || status === "SUCCESS";
}

/**
 * The exchange response is the committed outcome. Wallet projection is a
 * follow-up read, so its failure is intentionally contained and cannot reject
 * or recast the already successful payment state.
 */
export async function refreshWalletAfterCommittedExchange(input: {
  status: string;
  isCurrent: () => boolean;
  refreshWallet: () => Promise<boolean | void>;
}): Promise<"refreshed" | "unavailable" | "stale" | "skipped"> {
  if (!shouldRefreshWalletAfterExchange(input.status)) return "skipped";
  if (!input.isCurrent()) return "stale";
  try {
    const refreshed = await input.refreshWallet();
    // `refreshRemoteFleet` catches transport and supersession failures and
    // reports them as `false`; treating that resolved value as success would
    // let a future caller falsely claim its wallet projection was refreshed.
    if (refreshed === false) return input.isCurrent() ? "unavailable" : "stale";
  } catch {
    return input.isCurrent() ? "unavailable" : "stale";
  }
  return input.isCurrent() ? "refreshed" : "stale";
}
