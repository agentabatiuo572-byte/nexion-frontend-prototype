import { formatAmount } from "./amount-display";

/** Presentation only. Never use grouped values for inputs, requests or arithmetic. */
export function formatFinanceAmount(value: number | string | null | undefined, currency: "USDT" | "VND" = "USDT"): string {
  if (currency !== "VND") return group(formatAmount(value));
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
  const rounded = BigInt(whole) + (tail[0] >= "5" ? BigInt(1) : BigInt(0));
  return group((sign === "-" && rounded > BigInt(0) ? "-" : "") + rounded.toString());
}

function group(fixed: string): string {
  const [whole, fraction] = fixed.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction === undefined ? "" : `.${fraction}`);
}
