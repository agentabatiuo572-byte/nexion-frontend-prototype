import type { Messages } from "@/i18n/messages/en";
import type { WithdrawalTerminalReason } from "@/store/types";

// 风控 reason code → 用户话术,单源码表(SPEC-7 K3/K4 基础码 + PAY04 换绑扩展码)。
// 三处渲染源共用:wallet-withdraw 预览横幅 / wallet-withdraw-tracking 存单快照 /
// wallet 审核中弹层 —— 各自散抄 dict 时,新增码只补一处会被 `.filter(Boolean)`
// 静默吞行(tester 2026-07-24 在 tracking 页抓获),故收口成一个函数。
export function riskReasonLines(t: Messages, codes: readonly string[] | undefined): string[] {
  const dict: Record<string, string> = {
    ...(t.wallet.riskReasons as Record<string, string>),
    "new-address-large-amount": t.addrRebind.reasonNewAddressAge,
    "rebind-freeze": t.addrRebind.submitFrozenReason,
  };
  const lines = (codes ?? []).map((code) => dict[code]).filter((line): line is string => Boolean(line));
  // 2026-08-15 焦虑文案收敛:多个侦测码共用同一句「行为异常」话术 —— 必须去重,
  // 否则横幅 join(" · ") 会拼出「行为异常 · 行为异常」。
  return [...new Set(lines)];
}

/**
 * 提现终态原因 code → 用户话术(服务端 GET /api/withdrawals/:id 的 terminalReason)。
 *
 * 🔴 返回 `null` 而不是空串:调用方据此回落到通用失败文案。上面两个函数用
 * `.filter(Boolean)` 丢行是因为它们是**多行列表**,少一行不改变语义;终态原因只有一行,
 * 悄悄丢掉 = 失败单又变回「只说失败、不说为什么」,正是本包要消灭的那个状态。
 */
export function terminalReasonLine(t: Messages, code: WithdrawalTerminalReason | undefined): string | null {
  if (!code) return null;
  // `?? {}`:整块被删时(三语同时删,tsc 因类型由 en.ts 派生而不报错)对 undefined
  // 取下标会抛 TypeError 把追踪页整页算崩 —— 缺文案不该升级成白屏(同 waivedGateLines)。
  const dict = (t.wallet.withdrawTerminalReasons ?? {}) as Record<string, string>;
  return dict[code] ?? dict.other ?? null;
}

// 免审闸 code → 用户话术。与上面同一套路(散抄 dict 会被 filter 静默吞行),
// 故并列收口在这里:decideWithdrawalRoute 新增一道可免的闸时,只有这一处要补。
export function waivedGateLines(t: Messages, codes: readonly string[] | undefined): string[] {
  // `?? {}`:整块 waivedGates 被删时(三语同时删,tsc 因类型由 en.ts 派生而不报错)
  // 这里会对 undefined 取下标直接抛 TypeError,把整个提现页的横幅计算炸掉。
  // 缺文案最多是少显示一行,不该升级成白屏。
  const dict = (t.wallet.waivedGates ?? {}) as Record<string, string>;
  return (codes ?? []).map((code) => dict[code]).filter((line): line is string => Boolean(line));
}
