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
 * 本身低于最低额，保留用户输入并给出差额，避免自动制造一个必然失败的表单。
 */
export function resolveWithdrawalUseMax(maxWithdrawable: number, minimum: number): WithdrawalUseMaxDecision {
  const max = Number.isFinite(maxWithdrawable) ? Math.max(0, maxWithdrawable) : 0;
  const min = Number.isFinite(minimum) ? Math.max(0, minimum) : 0;
  if (max + 0.000001 < min) {
    return { amount: null, reason: "below-minimum", shortfall: Math.max(0, min - max) };
  }
  return { amount: max.toFixed(2), reason: null, shortfall: 0 };
}
