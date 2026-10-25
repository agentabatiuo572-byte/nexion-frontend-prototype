export type UsdDisplayContext = "overview" | "detail";

export interface UsdOverviewParts {
  prefix: string;
  integer: string;
  fraction: string;
}

/** For amount heroes with separate prefix / integer / decimal typography. */
export function formatUsdOverviewParts(value: number | string | null | undefined): UsdOverviewParts | null {
  const display = formatUsd(value);
  if (display === "-") return null;
  const currency = display.indexOf("$");
  const [integer, fraction] = display.slice(currency + 1).split(".");
  return { prefix: display.slice(0, currency + 1), integer, fraction };
}

/** Display only. Never feed this result back into API commands or ledger amounts. */
export function formatUsd(
  value: number | string | null | undefined,
  context: UsdDisplayContext = "overview",
  showPlus = false,
): string {
  if (typeof value === "number" && !Number.isFinite(value)) return "-";
  const match = String(value ?? "").trim().match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return "-";
  const [, sign, integer, fraction = "", exponent = "0"] = match;
  const shift = Number(exponent);
  if (shift < -324 || shift > 308) return "-";

  // Decimal strings retain precision, including amounts beyond Number.MAX_SAFE_INTEGER.
  const digits = integer + fraction;
  const point = integer.length + shift;
  const whole = point > 0 ? digits.slice(0, point).padEnd(point, "0") : "0";
  const tail = (point < 0 ? "0".repeat(-point) : "") + digits.slice(Math.max(point, 0));
  const places = context === "detail" ? 4 : 2;
  const nonzero = /[1-9]/.test(digits);
  const prefix = nonzero ? (sign === "-" ? "−" : showPlus ? "+" : "") : "";
  if (nonzero && !/[1-9]/.test(whole + tail.slice(0, places))) {
    return `${prefix}<$${context === "detail" ? "0.0001" : "0.01"}`;
  }

  const scaled = BigInt(whole + tail.slice(0, places).padEnd(places, "0"))
    + (tail[places] >= "5" ? BigInt(1) : BigInt(0));
  const fixed = scaled.toString().padStart(places + 1, "0");
  const grouped = fixed.slice(0, -places).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = fixed.slice(-places).replace(/0+$/, "").padEnd(2, "0");
  return `${prefix}$${grouped}.${decimals}`;
}
