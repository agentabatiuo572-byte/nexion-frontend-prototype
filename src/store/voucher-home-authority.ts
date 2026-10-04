import type { VoucherSurface } from "@/mock/vouchers";

export interface RemoteVoucherAuthority {
  id: string;
  claimable: boolean;
  audienceEligible: boolean;
  claimSurfaces: VoucherSurface[];
  popupEnabled: boolean;
  popupCadence: {
    enabled: boolean;
    delayMs: number;
    cooldownHours: number;
    maxPerSession: number;
    nextEligibleAt: number;
    popupEligible: boolean;
  };
}

export interface VoucherPopupPolicy {
  voucherId: string;
  delayMs: number;
  cooldownHours: number;
  maxPerSession: number;
  nextEligibleAt: number;
}

/** Java owns cohort, quota, validity and prior-claim decisions in remote mode. */
export function remoteClaimable<T extends RemoteVoucherAuthority>(vouchers: T[]): T[] {
  return vouchers.filter((voucher) => voucher.claimable && voucher.audienceEligible);
}

export function remoteClaimableForSurface<T extends RemoteVoucherAuthority>(
  vouchers: T[],
  surface: VoucherSurface,
): T[] {
  return remoteClaimable(vouchers).filter((voucher) => voucher.claimSurfaces.includes(surface));
}

/** Select the exact H7 cadence attached to a server-approved Home voucher. */
export function remoteVoucherPopupPolicy<T extends RemoteVoucherAuthority>(
  vouchers: T[],
  surface: VoucherSurface = "home",
): VoucherPopupPolicy | null {
  const voucher = remoteClaimableForSurface(vouchers, surface).find((candidate) =>
    candidate.popupEnabled
      && candidate.popupCadence.enabled
      && (candidate.popupCadence.popupEligible || candidate.popupCadence.nextEligibleAt > 0));
  if (!voucher) return null;
  return {
    voucherId: voucher.id,
    delayMs: voucher.popupCadence.delayMs,
    cooldownHours: voucher.popupCadence.cooldownHours,
    maxPerSession: voucher.popupCadence.maxPerSession,
    nextEligibleAt: voucher.popupCadence.nextEligibleAt,
  };
}
