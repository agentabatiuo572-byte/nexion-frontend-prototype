import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { createPublicSponsorPreviewApi, parsePublicSponsorPreview } from "./public-sponsor-preview-api";

const valid = {
  code: "NXAB12CD34EF",
  sourceEnvironment: "PRODUCTION",
  sponsor: { displayName: "A•••", vRank: "V3" },
  gift: { status: "PENDING_REVIEW", usdtAmount: 1.25, nexAmount: 20 },
};

describe("public sponsor preview", () => {
  it("accepts the backend's generic canonical referral format without requiring NX", () => {
    expect(parsePublicSponsorPreview({
      ...valid,
      code: "AB12CD34",
    })).toMatchObject({ code: "AB12CD34" });
  });

  it("accepts only the masked server projection", () => {
    expect(parsePublicSponsorPreview(valid)).toEqual(valid);
  });

  it("rejects raw identity fields or client supplied gift fields", () => {
    expect(() => parsePublicSponsorPreview({
      ...valid,
      sponsor: { ...valid.sponsor, phone: "81987654321" },
    })).toThrowError(new ApiError({ kind: "protocol", message: "REFERRAL_PREVIEW_RESPONSE_INVALID" }));
    expect(() => parsePublicSponsorPreview({
      ...valid,
      sponsor: { ...valid.sponsor, region: "JP" },
    })).toThrowError(new ApiError({ kind: "protocol", message: "REFERRAL_PREVIEW_RESPONSE_INVALID" }));
    expect(() => parsePublicSponsorPreview({
      ...valid,
      gift: { ...valid.gift, usdtAmount: -1 },
    })).toThrow();
  });

  it("uses an unauthenticated encoded GET", async () => {
    const request = vi.fn().mockResolvedValue(valid);
    const api = createPublicSponsorPreviewApi({ request } as never);
    await api.preview("nx-ab12/cd34");
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/public/referrals/nx-ab12%2Fcd34/preview",
      authenticated: false,
    });
  });
});
