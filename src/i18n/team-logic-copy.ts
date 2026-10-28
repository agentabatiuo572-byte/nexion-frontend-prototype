/** Copy for the bounded TI-F04/05/06/09/10 fixes. */
const COPY = {
  zh: {
    discardDraft: '放弃草稿', unknownConditions: '{n} 项条件待确认', unknownProgress: '当前进度待确认',
    posterYieldCap: '今日收益', eventAt: '发生时间', settledAt: '结算时间', expectedUnlockAt: '预计可用时间', dateUnavailable: '未提供',
  },
  en: {
    discardDraft: 'Discard draft', unknownConditions: '{n} requirements awaiting confirmation', unknownProgress: 'Current progress awaiting confirmation',
    posterYieldCap: "TODAY'S EARNINGS", eventAt: 'Occurred at', settledAt: 'Settled at', expectedUnlockAt: 'Expected availability', dateUnavailable: 'Not provided',
  },
  vi: {
    discardDraft: 'Bỏ bản nháp', unknownConditions: '{n} điều kiện chờ xác nhận', unknownProgress: 'Tiến độ hiện tại chờ xác nhận',
    posterYieldCap: 'THU NHẬP HÔM NAY', eventAt: 'Thời gian phát sinh', settledAt: 'Thời gian quyết toán', expectedUnlockAt: 'Dự kiến khả dụng', dateUnavailable: 'Chưa cung cấp',
  },
};
export function teamLogicCopy(locale: string) {
  return COPY[locale.split('-')[0] as keyof typeof COPY] ?? COPY.en;
}
