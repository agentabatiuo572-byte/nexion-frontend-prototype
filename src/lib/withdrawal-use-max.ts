export interface WithdrawalUseMaxDecision {
  amount: string | null;
  reason: "below-minimum" | null;
  shortfall: number;
}

export function computeWithdrawalMaximum(base: number, ratio: number): number {
  const safeBase = Number.isFinite(base) ? Math.max(0, base) : 0;
  const safeRatio = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return safeBase * safeRatio;
}

export function formatWithdrawalRatioPercent(ratio: number): string {
  const safeRatio = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return (safeRatio * 100).toFixed(2).replace(/\.?0+$/, "");
}

/**
 * “全部提现”只能填入一笔服务端规则允许提交的金额。若权威可提上限
 * 向下取分后低于最低额，保留用户输入并给出差额，避免制造必然失败的表单。
 */
export function resolveWithdrawalUseMax(maxWithdrawable: number, minimum: number): WithdrawalUseMaxDecision {
  const max = Number.isFinite(maxWithdrawable) ? Math.max(0, maxWithdrawable) : 0;
  const min = Number.isFinite(minimum) ? Math.max(0, minimum) : 0;
  // Decimal integer division avoids rounding above the cap or losing a valid cent to binary drift.
  const [mantissa, exponent = "0"] = String(max).split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = BigInt(whole + fraction);
  const shift = 2 + Number(exponent) - fraction.length;
  const cents = shift >= 0 ? digits * 10n ** BigInt(shift) : digits / 10n ** BigInt(-shift);
  const amount = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
  if (Number(amount) < min) {
    return { amount: null, reason: "below-minimum", shortfall: min - Number(amount) };
  }
  return { amount, reason: null, shortfall: 0 };
}
