import { describe, expect, it } from "vitest";

import {
  remoteClaimableForSurface,
  remoteVoucherPopupPolicy,
  type RemoteVoucherAuthority,
} from "./voucher-home-authority";

function voucher(overrides: Partial<RemoteVoucherAuthority> = {}): RemoteVoucherAuthority {
  return {
    id: "H7-HOME-50",
    claimable: true,
    audienceEligible: true,
    claimSurfaces: ["home"],
    popupEnabled: true,
    popupCadence: {
      enabled: true,
      delayMs: 2400,
      cooldownHours: 36,
      maxPerSession: 2,
      nextEligibleAt: 0,
      popupEligible: true,
    },
    ...overrides,
  };
}

describe("server-authoritative home voucher availability", () => {
  it.each(["home", "store", "me", "earn"] as const)("accepts unrestricted offers on %s without relaxing eligibility or explicit scopes", surface => {
    const unrestricted = voucher({ claimSurfaces: [] });
    expect(remoteClaimableForSurface([unrestricted], surface)).toEqual([unrestricted]);
    expect(remoteClaimableForSurface([voucher({ claimSurfaces: [], claimable: false })], surface)).toEqual([]);
    expect(remoteClaimableForSurface([voucher({ claimSurfaces: [], audienceEligible: false })], surface)).toEqual([]);
    expect(remoteClaimableForSurface([voucher({ claimSurfaces: ["home"] })], surface)).toHaveLength(surface === "home" ? 1 : 0);
    expect(remoteVoucherPopupPolicy([unrestricted], surface)?.voucherId).toBe(unrestricted.id);
  });
  it("never advertises a voucher that the Java response marked unclaimable", () => {
    expect(remoteClaimableForSurface([voucher({ claimable: false })], "home")).toEqual([]);
    expect(remoteClaimableForSurface([voucher({ audienceEligible: false })], "home")).toEqual([]);
  });

  it("uses the H7 cadence returned for the actual claimable home voucher", () => {
    expect(remoteVoucherPopupPolicy([voucher()], "home")).toEqual({
      voucherId: "H7-HOME-50",
      delayMs: 2400,
      cooldownHours: 36,
      maxPerSession: 2,
      nextEligibleAt: 0,
    });
  });

  it("preserves the server next-eligible instant instead of dropping a cooled-down voucher", () => {
    const nextEligibleAt = Date.now() + 60_000;
    expect(remoteVoucherPopupPolicy([voucher({
      popupCadence: {
        enabled: true,
        delayMs: 2400,
        cooldownHours: 36,
        maxPerSession: 2,
        nextEligibleAt,
        popupEligible: false,
      },
    })], "home")).toEqual(expect.objectContaining({ nextEligibleAt }));
  });
});
