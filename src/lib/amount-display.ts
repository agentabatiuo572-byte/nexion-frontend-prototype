/** Display only: keep API, ledger and command amounts at their original precision. */
export function formatAmount(value: number | string | null | undefined): string {
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
  const cents = BigInt(whole + tail.slice(0, 2).padEnd(2, "0")) + (tail[2] >= "5" ? BigInt(1) : BigInt(0));
  const fixed = cents.toString().padStart(3, "0");
  return (sign === "-" && /[1-9]/.test(digits) ? "-" : "") + fixed.slice(0, -2) + "." + fixed.slice(-2);
}
