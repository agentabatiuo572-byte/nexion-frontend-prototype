const MICRO_SCALE = 6;
const MICRO_FACTOR = 1_000_000n;
const MAX_SAFE_MICROS = BigInt(Number.MAX_SAFE_INTEGER);

type Decimal = { coefficient: bigint; scale: number };
export interface BundleQuoteAmount {
  subtotalUsdt: number;
  discountUsdt: number;
  amountUsdt: number;
}

function power10(exponent: number): bigint | null {
  if (!Number.isSafeInteger(exponent) || exponent < 0 || exponent > 24) return null;
  return 10n ** BigInt(exponent);
}

function decimal(value: number): Decimal | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const matched = value.toString().toLowerCase().match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
  if (!matched) return null;
  const fraction = matched[2] ?? "";
  const exponent = matched[3] ? Number(matched[3]) : 0;
  if (!Number.isSafeInteger(exponent)) return null;
  let scale = fraction.length - exponent;
  let coefficient = BigInt(`${matched[1]}${fraction}`);
  if (scale < 0) {
    const factor = power10(-scale);
    if (factor === null) return null;
    coefficient *= factor;
    scale = 0;
  }
  return { coefficient, scale };
}

function roundHalfUp(value: Decimal, targetScale: number): bigint | null {
  if (value.scale <= targetScale) {
    const factor = power10(targetScale - value.scale);
    return factor === null ? null : value.coefficient * factor;
  }
  const divisor = power10(value.scale - targetScale);
  if (divisor === null) return null;
  const quotient = value.coefficient / divisor;
  return (value.coefficient % divisor) * 2n >= divisor ? quotient + 1n : quotient;
}

function toAmount(microUsdt: bigint): number | null {
  if (microUsdt < 0n || microUsdt > MAX_SAFE_MICROS) return null;
  return Number(microUsdt) / Number(MICRO_FACTOR);
}

/** Mirrors AppBundleOrderService: each price is canonicalized to micro-USDT,
 * then the discount is HALF_UP to micro-USDT before the final subtraction. */
export function quoteBundleAmountUsdt(prices: readonly number[], discountRate: number): BundleQuoteAmount | null {
  const rate = decimal(discountRate);
  if (rate === null || rate.coefficient < 0n || discountRate > 0.5) return null;
  let subtotal = 0n;
  for (const price of prices) {
    const parsed = decimal(price);
    if (parsed === null || parsed.coefficient <= 0n) return null;
    const micros = roundHalfUp(parsed, MICRO_SCALE);
    if (micros === null) return null;
    subtotal += micros;
  }
  const divisor = power10(rate.scale);
  if (divisor === null) return null;
  const discountNumerator = subtotal * rate.coefficient;
  const discount = (discountNumerator % divisor) * 2n >= divisor
    ? (discountNumerator / divisor) + 1n
    : discountNumerator / divisor;
  const amount = subtotal - discount;
  const subtotalUsdt = toAmount(subtotal);
  const discountUsdt = toAmount(discount);
  const amountUsdt = toAmount(amount);
  return subtotalUsdt === null || discountUsdt === null || amountUsdt === null
    ? null
    : { subtotalUsdt, discountUsdt, amountUsdt };
}
