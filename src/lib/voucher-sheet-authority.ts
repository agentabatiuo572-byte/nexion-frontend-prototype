import type { VoucherDef, VoucherSurface } from "@/mock/vouchers";

/** Keep the visible claim list on the exact page surface that opened the sheet. */
export function visibleVoucherCatalog<T extends VoucherDef>(
  catalog: T[],
  claimable: VoucherDef[],
  claimedUnused: VoucherDef[],
  surface: VoucherSurface,
): T[] {
  const showable = new Set<string>([
    ...claimable.map((voucher) => voucher.id),
    ...claimedUnused.map((voucher) => voucher.id),
  ]);
  return catalog.filter((voucher) => showable.has(voucher.id) && voucher.claimSurfaces.includes(surface));
}
