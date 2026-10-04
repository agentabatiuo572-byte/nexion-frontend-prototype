import type { PlatformConfig } from "@/store/config-types";

export interface VisibleReferralGift {
  usdtAmount: number;
  nexAmount: number;
}

/** Keep every local/demo reward surface fail-closed behind the same H8 gate. */
export function visibleReferralGift(rewards: PlatformConfig["rewards"]): VisibleReferralGift {
  if (!rewards.enabled) return { usdtAmount: 0, nexAmount: 0 };
  return {
    usdtAmount: rewards.welcomeGift.usdtAmount,
    nexAmount: rewards.welcomeGift.nexAmount,
  };
}

/** Never let a configured reward promise bypass the current H8 reward gate. */
export function referralShareText(
  enabled: boolean,
  enabledTemplate: string,
  disabledTemplate: string,
  link: string,
): string {
  const template = enabled ? enabledTemplate : disabledTemplate;
  return template.split("{link}").join(link);
}

/**
 * 注册页副标题该说哪一档 —— 与金额同源,判据是**闸门**,不是金额。
 *
 * 🔴 zentao #227:闸门关闭时 `visibleReferralGift` 会把金额归零,但文案若只按
 *   「金额是否 > 0」分档,就会落进「新人奖励已备好,连接设备即刻到账」那一支 ——
 *   在奖励停用期间照样承诺一份不会到账的奖励。所以:
 *     gated  → 闸门关闭或邀请预览没有可核实金额，不承诺奖励
 *     amount → 闸门开启且邀请预览有金额，可报出金额和结算条件
 */
export type NewcomerSubtitleKind = "gated" | "amount";

export function newcomerSubtitleKind(rewardsEnabled: boolean, usdtAmount: number, nexAmount: number): NewcomerSubtitleKind {
  if (!rewardsEnabled) return "gated";
  return usdtAmount > 0 || nexAmount > 0 ? "amount" : "gated";
}
