import { expect, test } from "vitest";
import { createPaymentApi } from "./payment-api";

const intent = {
  intentNo: "VQR-12345678",
  usdtAmount: 25,
  fxRate: 26390,
  vndAmount: 659750,
  memoCode: "NX-12345678",
  bankAccount: { accountName: "NEX", accountNumber: "123456789", bankName: "BANK" },
  status: "awaiting_payment",
  expiresAt: "2026-08-15T00:30:00Z",
  creditedUsdt: 0,
  feeVnd: 0,
  feeUsdt: 0,
  version: 0,
};

test("requires server fee fields on VietQR intent responses", async () => {
  const api = createPaymentApi({ request: async () => intent } as never);
  await expect(api.getVietQrIntent("VQR-12345678")).resolves.toMatchObject({ feeVnd: 0, feeUsdt: 0 });
});

test("fails closed when the server omits an intent fee", async () => {
  const { feeVnd: _feeVnd, ...withoutFee } = intent;
  const api = createPaymentApi({ request: async () => withoutFee } as never);
  await expect(api.getVietQrIntent("VQR-12345678")).rejects.toMatchObject({
    kind: "protocol",
    message: "VIETQR_INTENT_RESPONSE_INVALID",
  });
});

test("lists user-scoped VietQR receipts with an opaque offset cursor", async () => {
  const requests: unknown[] = [];
  const api = createPaymentApi({
    request: async (request: unknown) => {
      requests.push(request);
      return {
        items: [{
          receiptNo: "VQR-REC-123",
          intentNo: "VQR-12345678",
          viewType: "MATCHED",
          status: "COMPLETED",
          payableVnd: 659750,
          receivedVnd: 659750,
          lockedFxRate: 26390,
          creditedUsdt: 25,
          expiresAt: "2026-08-15T00:30:00Z",
          receivedAt: "2026-08-15T00:10:00Z",
          createdAt: "2026-08-15T00:00:00Z",
        }],
        nextOffset: null,
      };
    },
  } as never);

  await expect(api.listVietQrReceipts(20, 40)).resolves.toMatchObject({
    items: [{ receiptNo: "VQR-REC-123", intentNo: "VQR-12345678" }],
    nextOffset: null,
  });
  expect(requests[0]).toEqual({
    method: "GET",
    path: "/api/app/deposits/vietqr/receipts?limit=20&offset=40",
  });
});
