export interface ExchangeQuote {
  grossUsdt: number;
  feeUsdt: number;
  netUsdt: number;
  toAmount: number;
}

// Mirrors AppExchangeService: money HALF_UP at scale 6, fee percentage
// division at scale 12, then NEX proceeds DOWN at scale 6.
function decimal(value: number): [bigint, bigint] {
  const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const scale = fraction.length - Number(exponent);
  const digits = BigInt(whole + fraction);
  return scale >= 0 ? [digits, 10n ** BigInt(scale)] : [digits * 10n ** BigInt(-scale), 1n];
}
function halfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}
export function exchangeQuote(
  direction: "usdt2nex" | "nex2usdt", amount: number, price: number,
  feePct: number, feeMinUsdt: number,
): ExchangeQuote | null {
  if (![amount, price, feePct, feeMinUsdt].every(Number.isFinite)
    || amount <= 0 || price <= 0 || feePct < 0 || feeMinUsdt < 0) return null;
  const scale = 1_000_000n;
  const [a, ad] = decimal(amount);
  const [p, pd] = decimal(price);
  const [f, fd] = decimal(feePct);
  const [m, md] = decimal(feeMinUsdt);
  const gross = direction === "usdt2nex" ? halfUp(a * scale, ad) : halfUp(a * p * scale, ad * pd);
  const percentageFee = halfUp(halfUp(gross * f * scale, fd * 100n), scale);
  const minimumFee = halfUp(m * scale, md);
  const fee = f === 0n ? 0n : percentageFee > minimumFee ? percentageFee : minimumFee;
  const net = gross - fee;
  if (net <= 0n) return null;
  const proceeds = direction === "usdt2nex" ? net * pd / p : net;
  const values = [gross, fee, net, proceeds].map((value) => Number(value) / Number(scale));
  if (!values.every(Number.isFinite) || values[3] <= 0) return null;
  return { grossUsdt: values[0], feeUsdt: values[1], netUsdt: values[2], toAmount: values[3] };
}
