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
  it("retains the claim's canonical split even when current policy differs", () => {
    expect(parseTrialAuthorityState({ ...base, offsetUsdt: "5", remainderUsdt: "5", priceUsdt: "649" }))
      .toMatchObject({ shadowUSD: 10, offsetUSD: 5, remainderUSD: 5, priceUSD: 649 });
  });
  it.each([{ offsetUsdt: -1, remainderUsdt: 0, priceUsdt: 649 }, { offsetUsdt: 5 },
    { offsetUsdt: 5, remainderUsdt: "invalid", priceUsdt: 649 }])("rejects an incomplete or invalid canonical split", amounts => {
    expect(() => parseTrialAuthorityState({ ...base, ...amounts })).toThrow("TRIAL_RESPONSE_INVALID");
  });
  it("reads whether a redeemed trial's purchase was refunded, and only when the server says so", () => {
    expect(parseTrialAuthorityState({ ...base, conversionOrderNo: "TRC-1", conversionRefunded: true, conversionRewardsReversed: true }))
      .toMatchObject({ conversion: { orderNo: "TRC-1", refunded: true, rewardsReversed: true } });
    expect(parseTrialAuthorityState({ ...base, conversionOrderNo: null, conversionRefunded: false }))
      .toMatchObject({ conversion: { orderNo: null, refunded: false, rewardsReversed: false } });
    expect(parseTrialAuthorityState(base)).not.toHaveProperty("conversion");
  });
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
  const earlyQuote = {
    settlementPolicy: "FULL_TERM_ON_CONVERSION", quoteVersion: "FULL_TERM_ON_CONVERSION:0123456789abcdef",
    earlyPurchase: true, priceUsdt: 1299, accruedUsdt: "19.26", accruedNex: "5", settledUsdt: "115.56",
    rewardNex: "30", earlyRewardUsdt: "96.3", earlyRewardNex: "25", offsetUsdt: "50", remainderUsdt: "65.56",
    promoDiscountUsdt: "0", earlyDiscountConfiguredUsdt: "10", earlyDiscountUsdt: "10", discountUsdt: "60",
    amountUsdt: "1239", earlyEndsAtEpochMs: 1_725_100_000_000,
  };
  it("parses the server early-conversion quote without deriving any amount", () => {
    expect(parseTrialAuthorityState({ ...base, state: "ACTIVE", eligibilityReason: "in-progress", quote: earlyQuote }).quote)
      .toEqual({
        settlementPolicy: "FULL_TERM_ON_CONVERSION", quoteVersion: "FULL_TERM_ON_CONVERSION:0123456789abcdef",
        earlyPurchase: true, priceUSD: 1299, accruedUSD: 19.26, accruedNEX: 5, settledUSD: 115.56, rewardNEX: 30,
        earlyRewardUSD: 96.3, earlyRewardNEX: 25, offsetUSD: 50, remainderUSD: 65.56, promoDiscountUSD: 0,
        earlyDiscountConfiguredUSD: 10, earlyDiscountUSD: 10, amountUSD: 1239, earlyEndsAt: 1_725_100_000_000,
      });
    expect(parseTrialAuthorityState(base).quote).toBeUndefined();
  });
  it.each([
    { settlementPolicy: "UNKNOWN" },
    { earlyPurchase: false },
    { earlyEndsAtEpochMs: null },
    { amountUsdt: "-1" },
    { quoteVersion: "" },
  ])("rejects an inconsistent early quote instead of showing partial benefits", patch => {
    expect(() => parseTrialAuthorityState({ ...base, quote: { ...earlyQuote, ...patch } })).toThrow("TRIAL_RESPONSE_INVALID");
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
    await api.convert("stellarbox-s1", 1264.555, null, "convert-key");
    expect(requests[0]?.body).toEqual({ productNo: "stellarbox-s1", expectedAmountUsdt: 1264.555 });
  });
  it("reads what an early conversion settled and rejects a partial settlement", () => {
    const settled = { settlementPolicy: "FULL_TERM_ON_CONVERSION", earlyPurchase: true, remainderUsdt: "65.56",
      rewardNex: "30", earlyRewardUsdt: "96.3", earlyRewardNex: "25", earlyDiscountUsdt: "10" };
    expect(parseTrialConvertReceipt({ ...canonicalReceipt, ...settled }).settlement).toEqual({
      settlementPolicy: "FULL_TERM_ON_CONVERSION", earlyPurchase: true, remainderUSD: 65.56, rewardNEX: 30,
      earlyRewardUSD: 96.3, earlyRewardNEX: 25, earlyDiscountUSD: 10,
    });
    expect(parseTrialConvertReceipt(canonicalReceipt).settlement).toBeUndefined();
    expect(() => parseTrialConvertReceipt({ ...canonicalReceipt, ...settled, rewardNex: undefined }))
      .toThrow("TRIAL_RESPONSE_INVALID");
  });
});
