import { expect, test } from "vitest";
import { createPaymentMethodApi } from "./payment-method-api";

const card = {
  tokenId: "12", version: 3, brand: "visa", last4: "4242", holder: "ALEX NEX",
  expiry: "12/30",
  status: "BOUND", isDefault: true, boundAt: "2026-08-15T00:00:00Z",
  source: "mock", sandbox: true, providerCanonical: false,
};

test("reads the server CAS version and routes card commands to real endpoints", async () => {
  const requests: any[] = [];
  const api = createPaymentMethodApi({ request: async (request: any) => {
    requests.push(request);
    if (request.method === "GET") return { serverCanonical: true, cards: [card] };
    return { serverCanonical: true, receipt: request.path.endsWith("/default") ? "CARD_DEFAULT_SET" : "CARD_UNBOUND", card };
  }} as never);
  await expect(api.list()).resolves.toEqual([card]);
  await api.setDefault({ tokenId: "12", expectedVersion: 3, idempotencyKey: "k-default" });
  await api.unbind({ tokenId: "12", expectedVersion: 3, idempotencyKey: "k-unbind" });
  expect(requests.map((item) => item.path)).toEqual([
    "/api/payment-methods",
    "/api/payment-methods/12/default",
    "/api/payment-methods/12/unbind",
  ]);
  expect(requests[1].body).toEqual({ expectedVersion: 3 });
  expect(requests[2].body).toEqual({ expectedVersion: 3 });
});

test("rejects a payment method response without an optimistic-concurrency version", async () => {
  const { version: _version, ...withoutVersion } = card;
  const api = createPaymentMethodApi({ request: async () => ({ serverCanonical: true, cards: [withoutVersion] }) } as never);
  await expect(api.list()).rejects.toMatchObject({ kind: "protocol", message: "PAYMENT_METHOD_RESPONSE_INVALID" });
});

test("binds and reads back the PSP-returned expiry without exposing PAN or CVV", async () => {
  const requests: any[] = [];
  const api = createPaymentMethodApi({ request: async (request: any) => {
    requests.push(request);
    return {
      serverCanonical: true, receipt: "CARD_BOUND", source: "mock", sandbox: true,
      providerCanonical: false, card,
    };
  }} as never);

  await expect(api.bind({
    providerToken: "tok_0123456789abcdef01234567", source: "mock", brand: "visa",
    last4: "4242", expiry: "12/30", holder: "ALEX NEX", makeDefault: true,
    idempotencyKey: "bind-expiry",
  })).resolves.toMatchObject({ expiry: "12/30" });
  expect(requests[0].body).toEqual({
    providerToken: "tok_0123456789abcdef01234567", source: "mock", brand: "visa",
    last4: "4242", expiry: "12/30", holder: "ALEX NEX", makeDefault: true,
  });
  expect(requests[0].body).not.toHaveProperty("pan");
  expect(requests[0].body).not.toHaveProperty("cvv");
});
