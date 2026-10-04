import { expect, test } from "vitest";
import { createPaymentApi } from "./payment-api";

test.each(["manual", "hosted"])("preserves %s mode without deriving capacity knowledge from it", async (paymentMode) => {
  const api = createPaymentApi({ request: async () => ({
    serverCanonical: true, source: "nx_vietqr_config", sourceEnvironment: "PRODUCTION", runId: "",
    vietQr: { enabled: true, paymentMode, dailyCapacityKnown: false,
      minDepositUsdt: 10, maxDepositUsdt: 5000, todayRemainingDepositUsdt: 0,
      todayRemainingVnd: 0, toleranceVnd: 1000, graceMinutes: 10, version: 4, feeVnd: 0, feeUsdt: 0 },
  }) } as never, "dev");
  await expect(api.config()).resolves.toMatchObject({
    vietQr: { enabled: true, paymentMode, dailyCapacityKnown: false, maxDepositUsdt: 5000 },
  });
});

test.each([false, true, undefined])("preserves explicit capacity knowledge independently of payment mode: %s", async (known) => {
  const api = createPaymentApi({ request: async () => ({
    serverCanonical: true, source: "nx_vietqr_config", sourceEnvironment: "PRODUCTION", runId: "",
    vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
      todayRemainingDepositUsdt: 0, todayRemainingVnd: 0, toleranceVnd: 1000,
      graceMinutes: 10, version: 4, feeVnd: 0, feeUsdt: 0,
      ...(known === undefined ? {} : { dailyCapacityKnown: known }) },
  }) } as never, "dev");
  await expect(api.config()).resolves.toMatchObject({ vietQr: { dailyCapacityKnown: known ?? true } });
});

test.each([null, "false", 0])("rejects a malformed capacity knowledge flag: %s", async (known) => {
  const api = createPaymentApi({ request: async () => ({
    serverCanonical: true, source: "nx_vietqr_config", sourceEnvironment: "PRODUCTION", runId: "",
    vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
      todayRemainingDepositUsdt: 0, todayRemainingVnd: 0, toleranceVnd: 1000,
      graceMinutes: 10, version: 4, feeVnd: 0, feeUsdt: 0, dailyCapacityKnown: known },
  }) } as never, "dev");
  await expect(api.config()).rejects.toMatchObject({ kind: "protocol", message: "PAYMENT_CONFIG_RESPONSE_INVALID" });
});

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

test("accepts production payment config and quote on the development rail", async () => {
  const production = {
    serverCanonical: true,
    source: "nx_vietqr_config",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
      todayRemainingDepositUsdt: 2578.62, todayRemainingVnd: 68050000, toleranceVnd: 1000,
      graceMinutes: 10, version: 4, feeVnd: 0, feeUsdt: 0 },
  };
  const quote = {
    serverCanonical: true,
    source: "nx_finance_fx_quote_config",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    baseRateVndPerUsdt: 26000, buySpreadPct: 1.5, quoteRateVndPerUsdt: 26390,
    lockWindowMinutes: 30, version: 7, asOf: "2026-08-15T00:00:00Z",
  };
  const api = createPaymentApi({ request: async (request: { path: string }) =>
    request.path.includes("fx-quote") ? quote : production } as never, "dev");

  await expect(api.config()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
  await expect(api.fxQuote()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
});

test("accepts an HDPay hosted payment page on the canonical bank intent", async () => {
  const { memoCode: _memoCode, bankAccount: _bankAccount, ...hostedIntent } = intent;
  const api = createPaymentApi({ request: async () => ({
    ...hostedIntent,
    paymentMode: "hosted",
    paymentUrl: "https://api.hdpayadmin.com/placeAnOrder?orderId=1826145351742570496",
    providerStatus: "created",
  }) } as never);

  const result = await api.getVietQrIntent("VQR-12345678");
  expect(result).toMatchObject({
    paymentMode: "hosted",
    paymentUrl: "https://api.hdpayadmin.com/placeAnOrder?orderId=1826145351742570496",
    providerStatus: "created",
  });
  expect(result).not.toHaveProperty("memoCode");
  expect(result).not.toHaveProperty("bankAccount");
});

test("fails closed when a hosted payment URL is not HTTPS", async () => {
  const { memoCode: _memoCode, bankAccount: _bankAccount, ...hostedIntent } = intent;
  const api = createPaymentApi({ request: async () => ({
    ...hostedIntent,
    paymentMode: "hosted",
    paymentUrl: "http://api.hdpayadmin.com/placeAnOrder?orderId=1",
    providerStatus: "created",
  }) } as never);

  await expect(api.getVietQrIntent("VQR-12345678")).rejects.toMatchObject({
    kind: "protocol",
    message: "VIETQR_INTENT_RESPONSE_INVALID",
  });
});

test("fails closed when a hosted payment URL uses an untrusted HTTPS host", async () => {
  const { memoCode: _memoCode, bankAccount: _bankAccount, ...hostedIntent } = intent;
  const api = createPaymentApi({ request: async () => ({
    ...hostedIntent,
    paymentMode: "hosted",
    paymentUrl: "https://api.hdpayadmin.com.evil.example/placeAnOrder?orderId=1",
    providerStatus: "created",
  }) } as never);

  await expect(api.getVietQrIntent("VQR-12345678")).rejects.toMatchObject({
    kind: "protocol",
    message: "VIETQR_INTENT_RESPONSE_INVALID",
  });
});

test("accepts a closed pending hosted state only when it has no payment URL", async () => {
  const { memoCode: _memoCode, bankAccount: _bankAccount, ...hostedIntent } = intent;
  const api = createPaymentApi({ request: async () => ({
    ...hostedIntent,
    paymentMode: "hosted",
    providerStatus: "submit_unknown",
  }) } as never);

  await expect(api.getVietQrIntent("VQR-12345678")).resolves.toMatchObject({
    paymentMode: "hosted",
    providerStatus: "submit_unknown",
  });
});

test("accepts a terminal hosted order only after its payment URL is withheld", async () => {
  const { memoCode: _memoCode, bankAccount: _bankAccount, ...hostedIntent } = intent;
  const api = createPaymentApi({ request: async () => ({
    ...hostedIntent,
    status: "expired",
    paymentMode: "hosted",
    providerStatus: "created",
  }) } as never);

  await expect(api.getVietQrIntent("VQR-12345678")).resolves.toMatchObject({
    status: "expired",
    paymentMode: "hosted",
    providerStatus: "created",
  });
});

test("fails closed if a hosted response leaks compatibility bank instructions", async () => {
  const api = createPaymentApi({ request: async () => ({
    ...intent,
    paymentMode: "hosted",
    paymentUrl: "https://api.hdpayadmin.com/placeAnOrder?orderId=1",
    providerStatus: "created",
  }) } as never);

  await expect(api.getVietQrIntent("VQR-12345678")).rejects.toMatchObject({
    kind: "protocol",
    message: "VIETQR_INTENT_RESPONSE_INVALID",
  });
});

test("accepts an operational VietQR rail whose daily capacity is below the minimum", async () => {
  const response = {
    serverCanonical: true,
    source: "nx_vietqr_config",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
      todayRemainingDepositUsdt: 0.62, todayRemainingVnd: 16580, toleranceVnd: 1000,
      graceMinutes: 10, version: 4, feeVnd: 0, feeUsdt: 0 },
  };
  const api = createPaymentApi({ request: async () => response } as never, "dev");

  await expect(api.config()).resolves.toMatchObject({
    vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
      todayRemainingDepositUsdt: 0.62, todayRemainingVnd: 16580 },
  });
});

test("fails closed when the server omits today's remaining VietQR capacity", async () => {
  const response = {
    serverCanonical: true,
    source: "nx_vietqr_config",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000, toleranceVnd: 1000,
      graceMinutes: 10, version: 4, feeVnd: 0, feeUsdt: 0 },
  };
  const api = createPaymentApi({ request: async () => response } as never, "dev");

  await expect(api.config()).rejects.toMatchObject({
    kind: "protocol",
    message: "PAYMENT_CONFIG_RESPONSE_INVALID",
  });
});
