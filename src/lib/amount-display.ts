/** Display only: keep API, ledger and command amounts at their original precision. */
export function formatGroupedAmount(value: number | string | null | undefined): string {
  const fixed = formatAmount(value), [whole, fraction] = fixed.split('.');
  return fraction === undefined ? fixed : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction;
}
export function formatAmount(value: number | string | null | undefined, precision: 2 | 6 = 2): string {
  if (typeof value === "number" && !Number.isFinite(value)) return "-";
  const match = String(value ?? "").trim().match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return "-";
  const [, sign, integer, fraction = "", exponent = "0"] = match;
  const shift = Number(exponent);
  if (shift < -324 || shift > 308) return "-";
  const digits = integer + fraction;
  const point = integer.length + shift;
  const whole = point > 0 ? digits.slice(0, point).padEnd(point, "0") : "0";
  const tail = (point < 0 ? "0".repeat(-point) : "") + digits.slice(Math.max(point, 0));
  const units = BigInt(whole + tail.slice(0, precision).padEnd(precision, "0")) + (tail[precision] >= "5" ? BigInt(1) : BigInt(0));
  const fixed = units.toString().padStart(precision + 1, "0");
  const decimals = fixed.slice(-precision).replace(/(\d{2}\d*?)0+$/, "$1");
  return (sign === "-" && /[1-9]/.test(digits) ? "-" : "") + fixed.slice(0, -precision) + "." + decimals;
}
