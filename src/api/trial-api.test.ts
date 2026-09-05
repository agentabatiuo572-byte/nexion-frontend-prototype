import { describe, expect, it } from "vitest";
import { createTrialApi, parseTrialAuthorityState, parseTrialConvertReceipt } from "./trial-api";
import { setCurrentCommerceSandboxRun } from "./order-api";

const base = {
  authoritative: true,
  state: "REDEEMED",
  canStart: false,
  eligibilityReason: "converted",
  serverNowEpochMs: 1_725_000_000_000,
  version: 1,
  claimNo: "TRIAL-SBX-CLAIM",
  claimedAtEpochMs: 1_724_000_000_000,
  expiresAtEpochMs: 1_724_259_200_000,
  finishedAtEpochMs: 1_724_100_000_000,
  shadowUsdt: 10,
  shadowNex: 20,
  source: "nx_trial_claim_sandbox",
  paymentRail: "NEXION_USDT_WALLET",
  config: {
    trialDays: "3", graceDays: "7", discountRate: "0.15", discountCapUSD: "20",
    trialOffsetCapUSD: "50", trialProductId: "stellarbox-s1", trialPriceUSD: "1299",
    shadowDailyUSD: "38.52", shadowDailyNEX: "65", phaseOpen: true,
    autoPushEnabled: true, autoPushDelayMs: "1500", autoPushCooldownHours: "24",
    autoPushMaxPerSession: "1",
  },
};

describe("trial conversion contract", () => {
  it("accepts the paid, run-scoped sandbox receipt", () => {
    setCurrentCommerceSandboxRun("sandbox-run-1");
    const parsed = parseTrialAuthorityState(base);
    expect(parsed.source).toBe("nx_trial_claim_sandbox");
    expect(parsed.status).toBe("converted");
    const receipt = parseTrialConvertReceipt({
      orderNo: "TRC-SBX-ABC123",
      paymentNo: "PAY-SBX-ABC123",
      productNo: "stellarbox-s1",
      amountUsdt: 1289,
      discountUsdt: 10,
      paymentStatus: "PAID",
      orderStatus: "PAID",
      source: "mock",
      sourceEnvironment: "SANDBOX",
      runId: "sandbox-run-1",
    });
    expect(receipt.paymentNo).toBe("PAY-SBX-ABC123");
    setCurrentCommerceSandboxRun(null);
  });

  it("rejects a sandbox receipt that is not paid by mock", () => {
    setCurrentCommerceSandboxRun("sandbox-run-1");
    expect(() => parseTrialConvertReceipt({
      orderNo: "TRC-SBX-ABC123", productNo: "stellarbox-s1", amountUsdt: 1, discountUsdt: 0,
      paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT", source: "provider",
      sourceEnvironment: "SANDBOX", runId: "sandbox-run-1", paymentNo: "PAY-SBX-ABC123",
    })).toThrow();
    setCurrentCommerceSandboxRun(null);
  });

  it("rejects a paid sandbox receipt from another run", () => {
    setCurrentCommerceSandboxRun("sandbox-run-2");
    expect(() => parseTrialConvertReceipt({
      orderNo: "TRC-SBX-ABC123", paymentNo: "PAY-SBX-ABC123", productNo: "stellarbox-s1",
      amountUsdt: 1289, discountUsdt: 10, paymentStatus: "PAID", orderStatus: "PAID",
      source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-1",
    })).toThrow();
    setCurrentCommerceSandboxRun(null);
  });

  it("sends the client amount as a separate conversion contract field", async () => {
    setCurrentCommerceSandboxRun("sandbox-run-1");
    const requests: Array<{ body?: unknown }> = [];
    const client = {
      request: async (request: { body?: unknown }) => {
        requests.push(request);
        return {
          orderNo: "TRC-SBX-ABC123", paymentNo: "PAY-SBX-ABC123", productNo: "stellarbox-s1",
          amountUsdt: 1264.555, discountUsdt: 34.445, paymentStatus: "PAID", orderStatus: "PAID",
          source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-1",
        };
      },
    } as never;
    const api = createTrialApi(client);
    await api.convert("stellarbox-s1", 1264.555, "convert-key");
    expect(requests[0]?.body).toEqual({ productNo: "stellarbox-s1", expectedAmountUsdt: 1264.555 });
    setCurrentCommerceSandboxRun(null);
  });
});
