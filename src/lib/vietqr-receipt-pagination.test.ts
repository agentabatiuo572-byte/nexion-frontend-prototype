import { describe, expect, it } from "vitest";
import {
  beginVietQrReceiptPageRead,
  createVietQrReceiptPageState,
  failVietQrReceiptPageRead,
  invalidateVietQrReceiptPageReads,
  succeedVietQrReceiptPageRead,
} from "./vietqr-receipt-pagination";

type Receipt = { receiptNo: string };

describe("VietQR receipt pagination", () => {
  it("keeps the loaded receipt list and cursor when a later page fails", () => {
    const state = createVietQrReceiptPageState<Receipt>([{ receiptNo: "R-1" }], 50);
    const request = beginVietQrReceiptPageRead(state, "more");

    expect(request).not.toBeNull();
    if (!request) return;
    failVietQrReceiptPageRead(state, request, new Error("network down"));

    expect(state.items).toEqual([{ receiptNo: "R-1" }]);
    expect(state.nextOffset).toBe(50);
    expect(state.initial).toEqual({ status: "ready", error: "" });
    expect(state.more).toEqual({ status: "error", error: "network down" });
  });

  it("keeps initial and pagination failures separate", () => {
    const state = createVietQrReceiptPageState<Receipt>([], 0);
    const request = beginVietQrReceiptPageRead(state, "initial");

    expect(request).not.toBeNull();
    if (!request) return;
    failVietQrReceiptPageRead(state, request, new Error("initial unavailable"));

    expect(state.initial).toEqual({ status: "error", error: "initial unavailable" });
    expect(state.more).toEqual({ status: "idle", error: "" });
  });

  it("allows only one active more request and retries with the unchanged cursor", () => {
    const state = createVietQrReceiptPageState<Receipt>([{ receiptNo: "R-1" }], 50);
    const first = beginVietQrReceiptPageRead(state, "more");

    expect(beginVietQrReceiptPageRead(state, "more")).toBeNull();
    expect(first).not.toBeNull();
    if (!first) return;
    failVietQrReceiptPageRead(state, first, new Error("temporary failure"));
    const retry = beginVietQrReceiptPageRead(state, "more");

    expect(retry).toMatchObject({ kind: "more", offset: 50 });
  });

  it("serializes initial and more reads so either return order cannot overwrite the cursor", () => {
    const firstPageState = createVietQrReceiptPageState<Receipt>([{ receiptNo: "R-1" }], 50);
    const initial = beginVietQrReceiptPageRead(firstPageState, "initial");

    expect(beginVietQrReceiptPageRead(firstPageState, "more")).toBeNull();
    expect(initial).not.toBeNull();
    if (!initial) return;
    succeedVietQrReceiptPageRead(firstPageState, initial, [{ receiptNo: "R-1" }, { receiptNo: "R-2" }], 100);
    expect(firstPageState.nextOffset).toBe(100);

    const morePageState = createVietQrReceiptPageState<Receipt>([{ receiptNo: "R-1" }], 50);
    const more = beginVietQrReceiptPageRead(morePageState, "more");

    expect(beginVietQrReceiptPageRead(morePageState, "initial")).toBeNull();
    expect(more).not.toBeNull();
    if (!more) return;
    succeedVietQrReceiptPageRead(morePageState, more, [{ receiptNo: "R-2" }], 100);
    expect(morePageState).toMatchObject({
      items: [{ receiptNo: "R-1" }, { receiptNo: "R-2" }],
      nextOffset: 100,
    });
  });

  it("discards responses and errors from a hidden or replaced receipt view", () => {
    const state = createVietQrReceiptPageState<Receipt>([{ receiptNo: "R-1" }], 50);
    const request = beginVietQrReceiptPageRead(state, "more");

    expect(request).not.toBeNull();
    if (!request) return;
    invalidateVietQrReceiptPageReads(state);
    succeedVietQrReceiptPageRead(state, request, [{ receiptNo: "STALE" }], null);
    failVietQrReceiptPageRead(state, request, new Error("stale failure"));

    expect(state.items).toEqual([{ receiptNo: "R-1" }]);
    expect(state.nextOffset).toBe(50);
    expect(state.more).toEqual({ status: "idle", error: "" });
  });
});
