import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import type { ApiClient } from "./api-client";
import { createBundleOrderApi, matchesBundleQuote, normalizeBundleExpectedAmountUsdt } from "./bundle-order-api";
import { ApiError, asApiError, isAmbiguousOutcome } from "./errors";
import { advanceRuntimeRevision } from "./order-api";
import bundleSource from "../pages/store/bundle.vue?raw";
import { en } from "../i18n/messages/en";

const onCheckoutCompiled = ts.transpileModule(
  bundleSource.slice(bundleSource.indexOf("async function onCheckout()"), bundleSource.indexOf("// ───── style objects ─────"))
    + "\nreturn onCheckout;",
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function onCheckoutHarness(receipt: { productNos: string[]; amountUsdt: number }) {
  const created = {
    orderNo: "BND-1", orderType: "BUNDLE", itemCount: 2, productNos: receipt.productNos,
    subtotalUsdt: 300, discountRate: 0.05, discountUsdt: 15, amountUsdt: receipt.amountUsdt,
    paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT", idSource: "server", policyVersion: 3,
  } as const;
  const deps = {
    products: { value: [{ id: "sku-a" }, { id: "sku-b" }] }, submitting: { value: false }, walletRefreshing: { value: false },
    remoteApiEnabled: true, captureAccountScope: () => ({}), isCurrentAccountScope: () => true,
    orders: { currentAccountKey: () => "account-a", refreshRemote: vi.fn().mockResolvedValue(undefined),
      orders: [{ id: "BND-1", status: "activated" }] },
    app: { captureRemoteAccountRequest: () => ({}), user: { usdtBalance: 300 }, adoptCommerceWallet: vi.fn(), refreshRemoteFleet: vi.fn() },
    total: { value: 285 }, normalizeBundleExpectedAmountUsdt, toast: { warn: vi.fn(), success: vi.fn(), error: vi.fn() },
    t: { value: en }, bundleDiscountApi: { current: vi.fn().mockResolvedValue({ policyVersion: 3 }) },
    policy: { value: { policyVersion: 3 } }, policyStatus: { value: "ready" },
    purchaseEligibilityStore: {
      ensure: vi.fn().mockResolvedValue(true),
      state: vi.fn(() => ({ status: "ready" })),
    },
    acquireBundleCommand: vi.fn(() => ({ key: "bundle-key", expectedAmountUsdt: 285, productNos: ["sku-a", "sku-b"] })),
    offerBundleWalletTopup: vi.fn(), bundleOrderApi: { create: vi.fn().mockResolvedValue(created) }, matchesBundleQuote,
    ApiError, orderApi: { pay: vi.fn().mockResolvedValue({ orderNo: "BND-1", paymentMethod: "OTHER" }) },
    retireBundleKey: vi.fn(), cart: { clear: vi.fn() }, fmt: (message: string) => message, navTo: vi.fn(),
    asApiError, isAmbiguousOutcome, BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED: "BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED",
    refreshBundlePolicy: vi.fn(), refreshProductCatalog: vi.fn(),
  };
  const onCheckout = new Function(...Object.keys(deps), onCheckoutCompiled)(...Object.values(deps)) as () => Promise<void>;
  return { ...deps, onCheckout };
}

describe("bundle order API", () => {
  afterEach(() => advanceRuntimeRevision(null));

  it("accepts a dynamically configured server discount", async () => {
    const request = vi.fn().mockResolvedValue({
      orderNo: "BND-DYNAMIC", orderType: "BUNDLE", itemCount: 2,
      productNos: ["a", "b"], subtotalUsdt: 300, discountRate: 0.07,
      discountUsdt: 21, amountUsdt: 279, paymentStatus: "PENDING",
      orderStatus: "PENDING_PAYMENT", idSource: "server", policyVersion: 7,
    });
    await expect(createBundleOrderApi({ request } as unknown as ApiClient)
      .create(["a", "b"], 7, 279, "idem-dynamic"))
      .resolves.toMatchObject({ discountRate: 0.07, discountUsdt: 21, amountUsdt: 279 });
  });

  it("creates one server-priced bundle", async () => {
    const request = vi.fn().mockResolvedValue({
      orderNo: "BND-1", orderType: "BUNDLE", itemCount: 2,
      productNos: ["stellarbox-s1", "stellarbox-pro"], subtotalUsdt: 300,
      discountRate: 0.05, discountUsdt: 15, amountUsdt: 285,
      paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT", idSource: "server", policyVersion: 3,
    });
    const api = createBundleOrderApi({ request } as unknown as ApiClient);
    await expect(api.create(["stellarbox-s1", "stellarbox-pro"], 3, 285, "bundle-key"))
      .resolves.toMatchObject({ orderNo: "BND-1", amountUsdt: 285 });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: "/api/orders/bundle", idempotencyKey: "bundle-key",
      body: { productNos: ["stellarbox-s1", "stellarbox-pro"], policyVersion: 3, expectedAmountUsdt: 285 },
    }));
  });

  it("rejects client-like or inconsistent totals", async () => {
    const request = vi.fn().mockResolvedValue({
      orderNo: "BND-1", orderType: "BUNDLE", itemCount: 2,
      productNos: ["a", "b"], subtotalUsdt: 300, discountRate: 0.05,
      discountUsdt: 15, amountUsdt: 300, paymentStatus: "PENDING",
      orderStatus: "PENDING_PAYMENT", idSource: "client", policyVersion: 3,
    });
    await expect(createBundleOrderApi({ request } as unknown as ApiClient)
      .create(["a", "b"], 3, 285, "bundle-key")).rejects.toMatchObject({ message: "BUNDLE_ORDER_RESPONSE_INVALID" });
  });

  it("rejects retired sandbox receipts even when their run matches", async () => {
    advanceRuntimeRevision("sandbox-run-20260815");
    const request = vi.fn().mockResolvedValue({
      orderNo: "BND-SBX-1", orderType: "BUNDLE", itemCount: 2,
      productNos: ["stellarbox-s1", "stellarbox-pro"], subtotalUsdt: 300,
      discountRate: 0.05, discountUsdt: 15, amountUsdt: 285,
      paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT", idSource: "sandbox-server",
      source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260815",
    });
    await expect(createBundleOrderApi({ request } as unknown as ApiClient)
      .create(["stellarbox-s1", "stellarbox-pro"], 3, 285, "sandbox-key"))
      .rejects.toMatchObject({ kind: "protocol", message: "BUNDLE_ORDER_RESPONSE_INVALID" });
    advanceRuntimeRevision(null);
  });

  it("rejects a sandbox receipt from another run", async () => {
    advanceRuntimeRevision("sandbox-run-current");
    const request = vi.fn().mockResolvedValue({
      orderNo: "BND-SBX-2", orderType: "BUNDLE", itemCount: 2,
      productNos: ["a", "b"], subtotalUsdt: 300, discountRate: 0.05,
      discountUsdt: 15, amountUsdt: 285, paymentStatus: "PENDING",
      orderStatus: "PENDING_PAYMENT", idSource: "sandbox-server", source: "mock",
      sourceEnvironment: "SANDBOX", runId: "sandbox-run-other",
    });
    await expect(createBundleOrderApi({ request } as unknown as ApiClient)
      .create(["a", "b"], 3, 285, "sandbox-key"))
      .rejects.toMatchObject({ message: "BUNDLE_ORDER_RESPONSE_INVALID" });
    advanceRuntimeRevision(null);
  });

  it("accepts a two-decimal quote whose binary representation has a fractional tail", async () => {
    const request = vi.fn().mockResolvedValue({
      orderNo: "BND-DECIMAL", orderType: "BUNDLE", itemCount: 2,
      productNos: ["a", "b"], subtotalUsdt: 2.12, discountRate: 0.05,
      discountUsdt: 0.106, amountUsdt: 2.014, paymentStatus: "PENDING",
      orderStatus: "PENDING_PAYMENT", idSource: "server", policyVersion: 3,
    });
    await expect(createBundleOrderApi({ request } as unknown as ApiClient)
      .create(["a", "b"], 3, 2.01, "decimal-key")).resolves.toMatchObject({ orderNo: "BND-DECIMAL" });
    expect(normalizeBundleExpectedAmountUsdt(2.01)).toBe(2.01);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ expectedAmountUsdt: 2.01 }),
    }));
  });

  it("keeps a six-decimal bundle total visible in the CTA instead of rounding it to cents", () => {
    expect(bundleSource).toContain("maximumFractionDigits: 6");
    expect(bundleSource).toContain("command.expectedAmountUsdt, command.key");
  });

  it("settles a remote bundle only through the NexGrid wallet", () => {
    expect(bundleSource).toContain("orderApi.pay(");
    expect(bundleSource).toContain("ORDER_WALLET_INSUFFICIENT");
    expect(bundleSource).toContain("/pages/me/wallet-topup");
    expect(bundleSource).not.toContain("createPaymentSession");
    expect(bundleSource).not.toContain("openHostedPaymentPage");
  });

  it("retires the purchase intent after a confirmed debit and treats order refresh as read-only recovery", () => {
    const confirmed = bundleSource.indexOf("paymentConfirmed = true");
    const retire = bundleSource.indexOf("retireBundleKey(list, accountKey, command.key)", confirmed);
    const clear = bundleSource.indexOf("cart.clear()", confirmed);
    const readback = bundleSource.indexOf("await orders.refreshRemote()", confirmed);
    expect(confirmed).toBeGreaterThan(-1);
    expect(retire).toBeGreaterThan(confirmed);
    expect(clear).toBeGreaterThan(retire);
    expect(readback).toBeGreaterThan(clear);
    expect(bundleSource).toContain("walletPaymentConfirmedRefreshPending");
  });

  it("rechecks the account after policy refresh before creating a bundle", () => {
    const policyRead = bundleSource.indexOf("const latestPolicy = await bundleDiscountApi.current()");
    const create = bundleSource.indexOf("const created = await bundleOrderApi.create(");
    const fence = bundleSource.indexOf("if (!scopeIsCurrent())", policyRead);
    expect(policyRead).toBeGreaterThan(-1);
    expect(fence).toBeGreaterThan(policyRead);
    expect(fence).toBeLessThan(create);
  });

  it("refuses an ineligible SKU before creating a remote bundle order", async () => {
    const h = onCheckoutHarness({ productNos: ["sku-a", "sku-b"], amountUsdt: 285 });
    h.purchaseEligibilityStore.ensure.mockImplementation(async (id: string) => id !== "sku-b");
    await h.onCheckout();
    expect(h.purchaseEligibilityStore.ensure).toHaveBeenCalledWith("sku-a", true);
    expect(h.purchaseEligibilityStore.ensure).toHaveBeenCalledWith("sku-b", true);
    expect(h.bundleOrderApi.create).not.toHaveBeenCalled();
    expect(h.orderApi.pay).not.toHaveBeenCalled();
  });

  it("rejects a server receipt whose product set or amount differs from the confirmed quote", () => {
    const changed = {
      orderNo: "BND-CHANGED", orderType: "BUNDLE" as const, itemCount: 2,
      productNos: ["a", "replacement"], subtotalUsdt: 300, discountRate: 0.05,
      discountUsdt: 15, amountUsdt: 285, paymentStatus: "PENDING" as const,
      orderStatus: "PENDING_PAYMENT" as const, idSource: "server" as const, policyVersion: 3,
    };
    expect(matchesBundleQuote(changed, ["a", "b"], 285)).toBe(false);
    expect(matchesBundleQuote({ ...changed, productNos: ["a", "b"] }, ["a", "b"], 284.99)).toBe(false);
  });

  it("replays a frozen SKU order for an unknown bundle result", () => {
    expect(bundleSource).toContain("command.productNos, latestPolicy.policyVersion");
    expect(bundleSource).toContain("matchesBundleQuote(created, command.productNos");
    expect(bundleSource).toContain("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  });

  it("keeps legacy commands out of create and payment, with an order recovery exit", () => {
    const legacyGuard = bundleSource.indexOf("BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED");
    const create = bundleSource.indexOf("const created = await bundleOrderApi.create(");
    expect(legacyGuard).toBeGreaterThan(-1);
    expect(legacyGuard).toBeLessThan(create);
    expect(bundleSource).toContain("navTo(\"/pages/store/orders\")");
    expect(bundleSource).toContain("BUNDLE_QUOTE_RECEIPT_MISMATCH");
    expect(bundleSource).toContain("createdOrderNo");
  });

  it("guards the confirmed quote before any bundle wallet payment", () => {
    const created = bundleSource.indexOf("const created = await bundleOrderApi.create(");
    const quoteGuard = bundleSource.indexOf("BUNDLE_QUOTE_RECEIPT_MISMATCH", created);
    const pay = bundleSource.indexOf("orderApi.pay(", created);
    expect(quoteGuard).toBeGreaterThan(created);
    expect(pay).toBeGreaterThan(quoteGuard);
    expect(bundleSource).toContain("command.expectedAmountUsdt, command.key");
  });

  it.each([
    { name: "accepts the backend's canonical SKU order", receipt: { productNos: ["sku-b", "sku-a"], amountUsdt: 285 }, pays: true },
    { name: "rejects a substituted SKU", receipt: { productNos: ["sku-a", "replacement"], amountUsdt: 285 }, pays: false },
    { name: "rejects an altered exact amount", receipt: { productNos: ["sku-a", "sku-b"], amountUsdt: 284.99 }, pays: false },
  ])("executes the real bundle submit handler and $name before payment", async ({ receipt, pays }) => {
    const h = onCheckoutHarness(receipt);
    await h.onCheckout();
    expect(h.bundleOrderApi.create).toHaveBeenCalledWith(["sku-a", "sku-b"], 3, 285, "bundle-key");
    if (pays) {
      expect(h.orderApi.pay).toHaveBeenCalledWith("BND-1", "wallet-pay:BND-1");
    } else {
      expect(h.orderApi.pay).not.toHaveBeenCalled();
      expect(h.navTo).toHaveBeenCalledWith("/pages/store/order-detail?id=BND-1");
    }
  });

  it("executes recovery-only legacy and unknown-result exits without creating a payment", async () => {
    const legacy = onCheckoutHarness({ productNos: ["sku-a", "sku-b"], amountUsdt: 285 });
    legacy.acquireBundleCommand.mockImplementation(() => {
      throw new Error("BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED");
    });
    await legacy.onCheckout();
    expect(legacy.bundleOrderApi.create).not.toHaveBeenCalled();
    expect(legacy.orderApi.pay).not.toHaveBeenCalled();
    expect(legacy.navTo).toHaveBeenCalledWith("/pages/store/orders");

    const unknown = onCheckoutHarness({ productNos: ["sku-a", "sku-b"], amountUsdt: 285 });
    unknown.bundleOrderApi.create.mockRejectedValue(new ApiError({ kind: "business", message: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" }));
    await unknown.onCheckout();
    expect(unknown.orderApi.pay).not.toHaveBeenCalled();
    expect(unknown.retireBundleKey).not.toHaveBeenCalled();
    expect(unknown.navTo).toHaveBeenCalledWith("/pages/store/orders");
  });
});
