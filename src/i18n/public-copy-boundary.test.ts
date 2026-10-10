import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { zh } from "./messages/zh";
import { vi } from "./messages/vi";
// @ts-expect-error This Node-only gate helper is shared with the production artifact check.
import { INTERNAL_COPY_PATTERNS } from "../../scripts/lib/public-copy-patterns.mjs";

function entries(value: object, prefix = ""): Array<[string, string]> {
  return Object.entries(value).flatMap(([key, item]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return typeof item === "string" ? [[name, item] as [string, string]] : item && typeof item === "object" ? entries(item, name) : [];
  });
}

describe("public copy implementation boundary", () => {
  it.each(Object.entries({ zh, en, vi }))("uses a dash in %s compact missing-value slots", (_locale, dictionary) => {
    expect([dictionary.exchange.remoteNotProvided, dictionary.store.shareAnnualUnavailable,
      dictionary.proof.valueUnavailable, dictionary.leaderboard.pool.resetsUnavailable,
      dictionary.notifs.unreadUnavailable]).toEqual(["-", "-", "-", "-", "-"]);
    expect(dictionary.home.quickFactsFailed).not.toBe("-");
    expect(dictionary.earn.hashCapabilityUnknown).not.toBe("-");
    expect(dictionary.team.settlementUnavailable).not.toBe("-");
  });
  it.each(Object.entries({ zh, en, vi }))("does not invent causes or funds outcomes in %s notices", (_locale, dictionary) => {
    expect(dictionary.wallet.withdrawRouteReviewBody).not.toMatch(/关联.*(?:账号|账户)|shared.*(?:account|address)|linked.*account|liên kết.*tài khoản/i);
    const uncertain = [dictionary.topupChrome.depositOpFailedNote, dictionary.walletV3.submitReasonServiceUnavailable, dictionary.walletV3.withdrawOutcomeUnknownBody,
      dictionary.walletV3.withdrawResendDeclinedBody, dictionary.exchange.outcomeUnknownBody,
      dictionary.repurchase.recoveryHint].join("\n");
    expect(uncertain).not.toMatch(/未扣款|余额未变|资金未受影响|余额不受影响|已退款|funds (?:are |remain )?untouched|no funds were deducted|balance (?:is |remains )?(?:unchanged|unaffected)|tiền (?:của bạn )?không bị ảnh hưởng|số dư không bị ảnh hưởng|chưa trừ tiền|đã hoàn tiền/i);
  });
  it.each(Object.entries({ zh, en, vi }))("omits conversational filler from %s notices", (_locale, dictionary) => {
    const filler = /照常提交就行|这笔我们会|钱一分没动|先别另开一笔|这笔提现还没确认结果|这笔没锁上|刷新一下通常就好|go ahead and submit as usual|Support can sort this out with you|bạn cứ gửi như bình thường|tiền không hề bị trừ/i;
    expect(entries(dictionary).filter(([, text]) => filler.test(text))).toEqual([]);
  });
  it.each(Object.entries({ zh, en, vi }))("keeps internal narration out of %s", (_locale, dictionary) => {
    const copy = entries(dictionary);
    expect(copy.length).toBeGreaterThan(5000);
    const hits = copy.filter(([, text]) => INTERNAL_COPY_PATTERNS.some((pattern: RegExp) => pattern.test(text)));
    expect(hits).toEqual([]);
  });
  it("detects the reported source footnote and its translations", () => {
    for (const text of ["来源：服务端设备在线状态与已完成提现汇总", "Server-verified aggregate", "Tổng hợp từ máy chủ", "发送手机任务心跳", "send its task heartbeat", "gửi nhịp tim tác vụ", "不会把读取失败当成空会话", "attempt can be replayed safely", "không hiển thị bản lưu cũ"]) {
      expect(INTERNAL_COPY_PATTERNS.some((pattern: RegExp) => pattern.test(text))).toBe(true);
    }
  });
  it("allows actual fees, risk, restrictions and public developer documentation", () => {
    for (const text of ["手续费 {fee} USDT；预计到账 {net} USDT", "提前赎回会损失累计利息", "交易不可撤销，请核对网络和地址", "网络异常，结果尚未确认，请先刷新查看", "API requests require an access token", "Fees and exchange rates may change"]) {
      expect(INTERNAL_COPY_PATTERNS.some((pattern: RegExp) => pattern.test(text))).toBe(false);
    }
  });
});
