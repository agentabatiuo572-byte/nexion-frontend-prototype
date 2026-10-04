import { describe, expect, it } from "vitest";
import { createTrialApi, parseTrialAuthorityState, parseTrialConvertReceipt } from "./trial-api";

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
  source: "nx_trial_claim + nx_user_wallet",
  serverCanonical: true,
  sourceEnvironment: "PRODUCTION",
  runId: "",
  provenance: {
    serverCanonical: true,
    source: "nx_trial_claim + nx_user_wallet",
    sourceEnvironment: "PRODUCTION",
    runId: "",
  },
  paymentRail: "NEXION_USDT_WALLET",
  config: {
    trialDays: "3", graceDays: "7", discountRate: "0.15", discountCapUSD: "20",
    trialOffsetCapUSD: "50", trialProductId: "stellarbox-s1", trialProductName: "NexGridBox S1", trialPriceUSD: "1299",
    shadowDailyUSD: "38.52", shadowDailyNEX: "65", phaseOpen: true,
    autoPushEnabled: true, autoPushDelayMs: "1500", autoPushCooldownHours: "24",
    autoPushMaxPerSession: "1", seatsLeftToday: "47",
  },
};

describe("trial conversion contract", () => {
  it("retains the extended purchase deadline without resuming production", () => {
    const extendedEndsAt = 1_726_000_000_000;
    const parsed = parseTrialAuthorityState({ ...base, state: "EXTENDED", eligibilityReason: "in-progress",
      graceEndsAt: null, extendedEndsAtEpochMs: extendedEndsAt });
    expect(parsed.status).toBe("grace");
    expect(parsed.extendedEndsAt).toBe(extendedEndsAt);
    expect(parsed.shadowUSD).toBe(base.shadowUsdt);
  });
  it("rejects extended authority without a real deadline", () => {
    expect(() => parseTrialAuthorityState({ ...base, state: "EXTENDED", eligibilityReason: "in-progress" }))
      .toThrow("TRIAL_RESPONSE_INVALID");
  });
  const canonicalReceipt = {
    orderNo: "TRC-ABC123",
    productNo: "stellarbox-s1",
    amountUsdt: 1289,
    discountUsdt: 10,
    paymentStatus: "PENDING",
    orderStatus: "PENDING_PAYMENT",
    source: "nx_trial_claim + nx_order + nx_order_item",
    serverCanonical: true,
    sourceEnvironment: "PRODUCTION",
    runId: "",
    provenance: {
      serverCanonical: true,
      source: "nx_trial_claim + nx_order + nx_order_item",
      sourceEnvironment: "PRODUCTION",
      runId: "",
    },
  } as const;

  it("accepts canonical production trial state and conversion receipt", () => {
    const parsed = parseTrialAuthorityState(base);
    expect(parsed.source).toBe("nx_trial_claim + nx_user_wallet");
    expect(parsed.sourceEnvironment).toBe("PRODUCTION");
    expect(parsed.status).toBe("converted");
    const receipt = parseTrialConvertReceipt(canonicalReceipt);
    expect(receipt.orderNo).toBe("TRC-ABC123");
    expect(receipt.provenance.sourceEnvironment).toBe("PRODUCTION");
  });

  it("rejects sandbox-shaped or incomplete trial state provenance", () => {
    expect(() => parseTrialAuthorityState({
      ...base,
      source: "nx_trial_claim_sandbox",
      sourceEnvironment: "SANDBOX",
      runId: "sandbox-run-1",
      provenance: {
        serverCanonical: true,
        source: "nx_trial_claim_sandbox",
        sourceEnvironment: "SANDBOX",
        runId: "sandbox-run-1",
      },
    })).toThrow("TRIAL_RESPONSE_INVALID");
    expect(() => parseTrialAuthorityState({ ...base, provenance: undefined })).toThrow("TRIAL_RESPONSE_INVALID");
  });

  it("rejects sandbox-shaped or incomplete conversion provenance", () => {
    expect(() => parseTrialConvertReceipt({
      orderNo: "TRC-SBX-ABC123", productNo: "stellarbox-s1", amountUsdt: 1, discountUsdt: 0,
      paymentStatus: "PAID", orderStatus: "PAID", source: "mock",
      sourceEnvironment: "SANDBOX", runId: "sandbox-run-1", paymentNo: "PAY-SBX-ABC123",
    })).toThrow();
    expect(() => parseTrialConvertReceipt({ ...canonicalReceipt, provenance: undefined })).toThrow();
    expect(() => parseTrialConvertReceipt({ ...canonicalReceipt, serverCanonical: false })).toThrow();
  });

  it("sends the client amount as a separate conversion contract field", async () => {
    const requests: Array<{ body?: unknown }> = [];
    const client = {
      request: async (request: { body?: unknown }) => {
        requests.push(request);
        return {
          ...canonicalReceipt,
          amountUsdt: 1264.555,
          discountUsdt: 34.445,
        };
      },
    } as never;
    const api = createTrialApi(client);
    await api.convert("stellarbox-s1", 1264.555, "convert-key");
    expect(requests[0]?.body).toEqual({ productNo: "stellarbox-s1", expectedAmountUsdt: 1264.555 });
  });
});
