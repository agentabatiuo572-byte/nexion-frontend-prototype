/** Preserve all supported price decimals while retaining cents for whole amounts. */
export function formatGenesisPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "-";
  return value.toFixed(6).replace(/(\.\d{2}\d*?)0+$/, "$1");
}
