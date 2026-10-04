import { describe, expect, it, vi } from "vitest";
import { createVoucherApi, parseVoucherCadence } from "./voucher-api";

const voucher = {
  voucherId: "V-1", voucherName: "Home voucher", voucherType: "fixed", amountUsd: 50,
  percentValue: 0, minPurchaseUsd: 0, maxDiscountUsd: 50, applicableSkus: "[]",
  audience: "all", claimSurfaces: '["home"]', startAt: 0, endAt: 0, popupEnabled: true,
  popupDelayMs: 300, popupCooldownHours: 1, popupMaxPerSession: 1, popupCadenceEnabled: true,
  popupLastSeenAt: 0, popupSessionCount: 0, nextEligibleAt: 0, stackWithTrial: false, stackWithOthers: false,
  splittable: false, definitionStatus: "active", definitionDeleted: 0,
  grantStatus: "UNCLAIMED", claimable: true, audienceEligible: true, popupEligible: true,
};

const canonicalSnapshot = (overrides: Record<string, unknown> = {}) => ({
  vouchers: [voucher],
  source: "nx_growth_voucher + nx_growth_voucher_grant",
  serverCanonical: true,
  provenance: {
    source: "nx_growth_voucher",
    sourceEnvironment: "PRODUCTION", runId: "",
  },
  ...overrides,
});

describe("voucher popup cadence", () => {
  it("accepts only a server-authoritative cadence with provenance", () => {
    expect(parseVoucherCadence({
      enabled: true, delayMs: 1300, cooldownHours: 24, maxPerSession: 1,
      nextEligibleAt: 0, popupEligible: true,
      source: "nx_growth_voucher", sourceEnvironment: "PRODUCTION", runId: "",
    })).toEqual(expect.objectContaining({ delayMs: 1300, cooldownHours: 24, maxPerSession: 1 }));
  });

  it("fails closed for malformed cadence or a sandbox fence mismatch", () => {
    expect(() => parseVoucherCadence({ enabled: true, delayMs: -1 })).toThrow();
    expect(() => parseVoucherCadence({
      enabled: true, delayMs: 1300, cooldownHours: 24, maxPerSession: 1,
      nextEligibleAt: 0, source: "mock", sourceEnvironment: "SANDBOX", runId: "stale",
    }, { environment: "prod", runId: "" })).toThrow();
  });

  it("uses the Java development profile as authority and accepts its production-shaped snapshot", async () => {
    const request = vi.fn().mockResolvedValue(canonicalSnapshot());

    await expect(createVoucherApi({ request } as never, "dev").state())
      .resolves.toMatchObject({ provenance: { sourceEnvironment: "PRODUCTION", runId: "" } });
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({
      method: "GET",
      path: "/api/vouchers",
    }));
    expect(request.mock.calls[0]?.[0]).not.toHaveProperty("headers");
  });

  it("rejects a sandbox response in the formal development app", async () => {
    const request = vi.fn().mockResolvedValue({
      vouchers: [voucher],
      source: "sandbox",
      serverCanonical: true,
      provenance: { source: "sandbox", sourceEnvironment: "SANDBOX", runId: "run-12345678" },
    });
    await expect(createVoucherApi({ request } as never, "dev").state()).rejects.toThrow();
  });

  it("rejects a voucher snapshot without root canonical provenance", async () => {
    const request = vi.fn().mockResolvedValue({
      vouchers: [voucher], source: "nx_growth_voucher + nx_growth_voucher_grant", serverCanonical: true,
    });
    await expect(createVoucherApi({ request } as never, "dev").state())
      .rejects.toThrow("VOUCHER_PROVENANCE_INVALID");
  });

  it("fails closed when canonical H7 state fields or the root canonical marker are missing", async () => {
    for (const missing of ["grantStatus", "claimable", "audienceEligible", "popupEligible"] as const) {
      const incompleteVoucher = { ...voucher } as Record<string, unknown>;
      delete incompleteVoucher[missing];
      const request = vi.fn().mockResolvedValue(canonicalSnapshot({ vouchers: [incompleteVoucher] }));
      await expect(createVoucherApi({ request } as never, "dev").state()).rejects.toThrow();
    }

    const missingMarker = vi.fn().mockResolvedValue(canonicalSnapshot({ serverCanonical: undefined }));
    await expect(createVoucherApi({ request: missingMarker } as never, "dev").state())
      .rejects.toThrow("VOUCHER_CANONICAL_INVALID");
  });

  it("accepts a canonical claim result and rejects missing command provenance", async () => {
    const canonicalRequest = vi.fn().mockResolvedValue({
      voucherId: "V-1",
      grantId: "G-1",
      status: "AVAILABLE",
      replay: false,
      serverCanonical: true,
      source: "nx_growth_voucher_grant",
      sourceEnvironment: "PRODUCTION",
      runId: "",
    });

    await expect(createVoucherApi({ request: canonicalRequest } as never, "dev")
      .claim("V-1", "home", "idem-voucher-canonical-1"))
      .resolves.toMatchObject({ grantId: "G-1", serverCanonical: true });

    const malformedRequest = vi.fn().mockResolvedValue({
      voucherId: "V-1",
      grantId: "G-1",
      status: "AVAILABLE",
      replay: false,
    });
    await expect(createVoucherApi({ request: malformedRequest } as never, "dev")
      .claim("V-1", "home", "idem-voucher-malformed-1"))
      .rejects.toThrow("VOUCHER_CLAIM_RESPONSE_INVALID");
  });
});
