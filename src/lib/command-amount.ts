const MAX_DECIMAL_PLACES = 6;

/**
 * Command endpoints accept up to six decimal places. Trim excess input rather
 * than rounding it up so a client-side correction cannot increase a requested
 * debit.
 */
export function normalizeCommandAmount(raw: string | number): number {
  const text = String(raw).trim();
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return 0;
  const integer = match[1];
  const fraction = (match[2] ?? "").slice(0, MAX_DECIMAL_PLACES);
  const normalized = fraction ? `${integer}.${fraction}` : integer;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** Formats the exact command value without hiding non-zero supported decimals. */
export function formatCommandAmount(amount: number): string {
  const normalized = normalizeCommandAmount(amount);
  const compact = normalized.toFixed(MAX_DECIMAL_PLACES).replace(/(?:\.0+|(\.\d*?)0+)$/, "$1");
  return compact.includes(".") ? compact : `${compact}.00`;
}
