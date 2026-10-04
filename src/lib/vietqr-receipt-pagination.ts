export type VietQrReceiptPageLoadStatus = "idle" | "loading" | "ready" | "error";
export type VietQrReceiptPageReadKind = "initial" | "more";

export interface VietQrReceiptPageLoadState {
  status: VietQrReceiptPageLoadStatus;
  error: string;
}

export interface VietQrReceiptPageReadRequest {
  kind: VietQrReceiptPageReadKind;
  offset: number;
  epoch: number;
  requestId: number;
}

export interface VietQrReceiptPageState<T extends { receiptNo: string }> {
  items: T[];
  nextOffset: number | null;
  initial: VietQrReceiptPageLoadState;
  more: VietQrReceiptPageLoadState;
  epoch: number;
  activeInitialRequestId: number | null;
  activeMoreRequestId: number | null;
  nextRequestId: number;
}

export function createVietQrReceiptPageState<T extends { receiptNo: string }>(
  items: readonly T[] = [],
  nextOffset: number | null = null,
): VietQrReceiptPageState<T> {
  return {
    items: [...items],
    nextOffset,
    initial: { status: items.length > 0 ? "ready" : "idle", error: "" },
    more: { status: "idle", error: "" },
    epoch: 0,
    activeInitialRequestId: null,
    activeMoreRequestId: null,
    nextRequestId: 0,
  };
}

export function beginVietQrReceiptPageRead<T extends { receiptNo: string }>(
  state: VietQrReceiptPageState<T>,
  kind: VietQrReceiptPageReadKind,
): VietQrReceiptPageReadRequest | null {
  // Both operations advance the same cursor. Serializing them prevents a
  // late initial refresh from replacing a newer page append (or vice versa).
  if (state.initial.status === "loading" || state.more.status === "loading") return null;
  if (kind === "more") {
    if (state.nextOffset === null) return null;
    state.more = { status: "loading", error: "" };
  } else {
    state.initial = { status: "loading", error: "" };
  }

  const request: VietQrReceiptPageReadRequest = {
    kind,
    offset: kind === "more" ? state.nextOffset as number : 0,
    epoch: state.epoch,
    requestId: ++state.nextRequestId,
  };
  if (kind === "more") state.activeMoreRequestId = request.requestId;
  else state.activeInitialRequestId = request.requestId;
  return request;
}

export function succeedVietQrReceiptPageRead<T extends { receiptNo: string }>(
  state: VietQrReceiptPageState<T>,
  request: VietQrReceiptPageReadRequest,
  items: readonly T[],
  nextOffset: number | null,
): boolean {
  if (!isCurrentVietQrReceiptPageRead(state, request)) return false;
  if (request.kind === "initial") {
    state.items = [...items];
    state.initial = { status: "ready", error: "" };
    state.activeInitialRequestId = null;
  } else {
    state.items = appendByReceiptNo(state.items, items);
    state.more = { status: "ready", error: "" };
    state.activeMoreRequestId = null;
  }
  state.nextOffset = nextOffset;
  return true;
}

export function failVietQrReceiptPageRead<T extends { receiptNo: string }>(
  state: VietQrReceiptPageState<T>,
  request: VietQrReceiptPageReadRequest,
  cause: unknown,
): boolean {
  if (!isCurrentVietQrReceiptPageRead(state, request)) return false;
  const error = cause instanceof Error ? cause.message : "VIETQR_RECEIPT_REFRESH_FAILED";
  if (request.kind === "initial") {
    state.initial = { status: "error", error };
    state.activeInitialRequestId = null;
  } else {
    state.more = { status: "error", error };
    state.activeMoreRequestId = null;
  }
  return true;
}

/** Invalidates a hidden page or a rebinding account before an older response can commit. */
export function invalidateVietQrReceiptPageReads<T extends { receiptNo: string }>(
  state: VietQrReceiptPageState<T>,
): void {
  state.epoch += 1;
  state.activeInitialRequestId = null;
  state.activeMoreRequestId = null;
  if (state.initial.status === "loading") state.initial = { status: "idle", error: "" };
  if (state.more.status === "loading") state.more = { status: "idle", error: "" };
}

function isCurrentVietQrReceiptPageRead<T extends { receiptNo: string }>(
  state: VietQrReceiptPageState<T>,
  request: VietQrReceiptPageReadRequest,
): boolean {
  if (request.epoch !== state.epoch) return false;
  return request.kind === "initial"
    ? state.activeInitialRequestId === request.requestId
    : state.activeMoreRequestId === request.requestId;
}

function appendByReceiptNo<T extends { receiptNo: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const seen = new Set(existing.map((item) => item.receiptNo));
  return [...existing, ...incoming.filter((item) => {
    if (seen.has(item.receiptNo)) return false;
    seen.add(item.receiptNo);
    return true;
  })];
}
