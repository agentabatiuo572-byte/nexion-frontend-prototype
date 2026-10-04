import { reactive } from "vue";
import type { WalletBillsSnapshot } from "@/api/wallet-bills-api";
import type { Bill } from "./bills";

export type LedgerLoadStatus = "idle" | "loading" | "ready" | "error";
export interface WalletLedgerPager {
  rows: Bill[];
  status: LedgerLoadStatus;
  error: string;
  loadingMore: boolean;
  hasMore: boolean;
  total: number;
  refresh(options?: { force?: boolean }): Promise<void>;
  loadMore(): Promise<void>;
  reset(): void;
}

/** Only explicit refresh/loadMore calls fetch. No effect watches hasMore to drain the ledger. */
export function createWalletLedgerPager(
  fetch: (page: number, cursor: string) => Promise<WalletBillsSnapshot>,
  map: (row: WalletBillsSnapshot["bills"][number]) => Bill,
): WalletLedgerPager {
  let generation = 0;
  let nextCursor: string | null = null;
  let nextPage = 1;
  let firstFlight: Promise<void> | null = null;
  let moreFlight: Promise<void> | null = null;
  let seenCursors = new Set<string>(["start"]);
  const state: WalletLedgerPager = reactive({ rows: [] as Bill[], status: "idle" as LedgerLoadStatus, error: "",
    loadingMore: false, hasMore: false, total: 0, refresh, loadMore, reset });

  function reset() {
    generation++;
    firstFlight = moreFlight = null;
    nextCursor = null; nextPage = 1;
    seenCursors = new Set(["start"]);
    Object.assign(state, { rows: [], status: "idle", error: "", loadingMore: false, hasMore: false, total: 0 });
  }

  function accept(snapshot: WalletBillsSnapshot, cursor: string, append: boolean) {
    // A broken/non-advancing cursor must not create a request loop or pretend history is complete.
    if ((snapshot.nextPage !== null && !snapshot.nextCursor)
        || (snapshot.nextCursor !== null && (snapshot.nextCursor === cursor || seenCursors.has(snapshot.nextCursor)))) {
      throw new Error("WALLET_BILLS_CURSOR_INVALID");
    }
    const rows = append ? [...state.rows] : [];
    const ids = new Set(rows.map(row => row.id));
    for (const item of snapshot.bills) if (!ids.has(item.id)) { rows.push(map(item)); ids.add(item.id); }
    state.rows = rows;
    state.total = snapshot.total;
    nextCursor = snapshot.nextCursor;
    if (nextCursor !== null) seenCursors.add(nextCursor);
    nextPage = snapshot.nextPage ?? snapshot.page + 1;
    state.hasMore = nextCursor !== null;
    state.status = "ready";
  }

  function refresh(options: { force?: boolean } = {}): Promise<void> {
    if (firstFlight && !options.force) return firstFlight;
    const expected = ++generation;
    seenCursors = new Set(["start"]);
    moreFlight = null; state.loadingMore = false;
    state.status = "loading"; state.error = "";
    const request = fetch(1, "start").then(snapshot => {
      if (expected !== generation) throw new Error("WALLET_BILLS_REQUEST_SUPERSEDED");
      accept(snapshot, "start", false);
    }).catch(cause => {
      if (expected === generation) { state.status = "error"; state.error = cause instanceof Error ? cause.message : "WALLET_BILLS_REFRESH_FAILED"; }
      throw cause;
    }).finally(() => { if (expected === generation) firstFlight = null; });
    firstFlight = request;
    return request;
  }

  function loadMore(): Promise<void> {
    if (firstFlight) return firstFlight;
    if (moreFlight) return moreFlight;
    if (!nextCursor || !state.hasMore || state.status !== "ready") return Promise.resolve();
    const expected = generation;
    const cursor = nextCursor;
    state.loadingMore = true; state.error = "";
    const request = fetch(nextPage, cursor).then(snapshot => {
      if (expected !== generation) throw new Error("WALLET_BILLS_REQUEST_SUPERSEDED");
      accept(snapshot, cursor, true);
    }).catch(cause => {
      if (expected === generation) state.error = cause instanceof Error ? cause.message : "WALLET_BILLS_LOAD_MORE_FAILED";
      throw cause;
    }).finally(() => { if (expected === generation) { state.loadingMore = false; moreFlight = null; } });
    moreFlight = request;
    return request;
  }
  return state;
}
