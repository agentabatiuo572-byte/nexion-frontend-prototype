// Dimensions follow the official 2026-10-21 kit: 712×246 lockup, 490×361 symbol.
export type BrandVariant = "lockup" | "mark";
const RATIO: Record<BrandVariant, number> = { lockup: 712 / 246, mark: 490 / 361 };
const MIN_WIDTH: Record<BrandVariant, number> = { lockup: 144, mark: 24 };

export function brandLockupBox(height: number, variant: BrandVariant): { width: number; height: number } {
  const ratio = RATIO[variant];
  const safeHeight = Math.max(height, MIN_WIDTH[variant] / ratio);
  return { width: Math.round(safeHeight * ratio), height: Math.round(safeHeight) };
}
