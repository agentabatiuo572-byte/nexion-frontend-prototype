/** Copy for the bounded TI-F04/05/06/09/10 fixes. */
const COPY = {
  zh: {
    discardDraft: '放弃草稿', legacySelf: '旧规则 · 自购金额', legacyTeam: '旧规则 · 团队购买金额',
    legacyNeedSelf: '旧规则 · 自购金额还差 {amount}', legacyNeedTeam: '旧规则 · 团队购买金额还差 {amount}',
    pointsUnavailable: '算力点条件未提供', unknownConditions: '{n} 项条件待确认', unknownProgress: '当前进度待确认',
    posterYieldCap: '今日收益', eventAt: '发生时间', settledAt: '结算时间', expectedUnlockAt: '预计可用时间', dateUnavailable: '未提供',
  },
  en: {
    discardDraft: 'Discard draft', legacySelf: 'Legacy rule · Own purchase amount', legacyTeam: 'Legacy rule · Team purchase amount',
    legacyNeedSelf: 'Legacy rule · {amount} more in own purchases', legacyNeedTeam: 'Legacy rule · {amount} more in team purchases',
    pointsUnavailable: 'Compute point requirements not provided', unknownConditions: '{n} requirements awaiting confirmation', unknownProgress: 'Current progress awaiting confirmation',
    posterYieldCap: "TODAY'S EARNINGS", eventAt: 'Occurred at', settledAt: 'Settled at', expectedUnlockAt: 'Expected availability', dateUnavailable: 'Not provided',
  },
  vi: {
    discardDraft: 'Bỏ bản nháp', legacySelf: 'Quy tắc cũ · Số tiền tự mua', legacyTeam: 'Quy tắc cũ · Số tiền mua của đội',
    legacyNeedSelf: 'Quy tắc cũ · Còn thiếu {amount} tự mua', legacyNeedTeam: 'Quy tắc cũ · Đội còn thiếu {amount} tiền mua',
    pointsUnavailable: 'Chưa có điều kiện điểm tính toán', unknownConditions: '{n} điều kiện chờ xác nhận', unknownProgress: 'Tiến độ hiện tại chờ xác nhận',
    posterYieldCap: 'THU NHẬP HÔM NAY', eventAt: 'Thời gian phát sinh', settledAt: 'Thời gian quyết toán', expectedUnlockAt: 'Dự kiến khả dụng', dateUnavailable: 'Chưa cung cấp',
  },
};
export function teamLogicCopy(locale: string) {
  return COPY[locale.split('-')[0] as keyof typeof COPY] ?? COPY.en;
}
