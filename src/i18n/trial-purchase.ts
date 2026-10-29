import { computed } from 'vue';
import { useLocaleStore } from '@/store/locale';

/** FEAT-TRIAL05 purchase screens: trial detail, checkout confirmation, purchase result and refunded trial. */
export const trialPurchaseCopy = {
  zh: {
    earlyTitle: '现在购买：完整试用权益照拿，再减 {discount} USDT',
    accruedTitle: '现在购买：按已累计试用收益结算',
    graceTitle: '购买后试用权益照常到账',
    earlyDeadline: '立减截止 {time}（试用期结束）',
    payGroup: '购机应付', unitPrice: '单价', amountDue: '应付', creditGroup: '购后到账',
    creditNoteFull: '按完整 {days} 天试用权益结算，未累计的部分购机后一次到账',
    creditNoteAccrued: '按当前已累计的试用收益结算，购买后试用结束',
    earlyEnded: '试用期内购买的 {discount} USDT 立减已结束。',
    buyCta: '立即购买 · 应付 {amount} USDT', rulesEntry: '查看抵扣与退款规则',
    heroRemaining: '剩余 {time}', heroTermUntil: '试用期至 {time}', heroKeptUntil: '保留至 {time}',
    refundedTitle: '本次购买已退款', refundedBody: '实付金额已退回钱包，试用随订单结束。',
    refundedRewards: '购机时发放的试用奖励已随退款收回', shopCta: '去商城看看', refundOrderCta: '查看退款订单',
    confirmTitle: '确认购买 {device}', confirmPay: '从钱包支付 {amount} USDT', confirmCredit: '购后到账 {rewards}',
    confirmRun: '支付成功后设备立即开始运行，试用随之结束。',
    refundClause: '试用购机退款时，购机时发放的试用奖励随退款收回。',
    resultTitle: '购买成功', resultRunning: '{device} 已在 {dc} 开始运行', resultRunningNoDc: '{device} 已开始运行',
    resultCredited: '试用奖励已到账', resultUsdt: 'USDT 余额', resultUvt: 'UVT 余额',
    resultPaid: '实付', resultSaved: '共节省', resultDevices: '查看我的设备', resultOrder: '查看订单',
    orderPaid: '实付', orderTrialReward: '试用奖励到账', orderRewardsReversed: '试用奖励已随退款收回',
  },
  en: {
    earlyTitle: 'Buy now: keep your full trial benefits and get {discount} USDT off',
    accruedTitle: 'Buy now: settled on the trial earnings accrued so far',
    graceTitle: 'Your trial benefits are still credited when you buy',
    earlyDeadline: 'Discount ends {time} (end of trial)',
    payGroup: 'Amount due', unitPrice: 'Price', amountDue: 'Due', creditGroup: 'Credited after purchase',
    creditNoteFull: 'Settled on the full {days}-day trial; the part not yet accrued arrives in one go after purchase',
    creditNoteAccrued: 'Settled on the trial earnings accrued so far; the trial ends when you buy',
    earlyEnded: 'The {discount} USDT discount for buying during the trial has ended.',
    buyCta: 'Buy now · {amount} USDT due', rulesEntry: 'Credit and refund rules',
    heroRemaining: '{time} left', heroTermUntil: 'Trial until {time}', heroKeptUntil: 'Kept until {time}',
    refundedTitle: 'This purchase was refunded', refundedBody: 'The amount paid is back in your wallet, and the trial has ended with the order.',
    refundedRewards: 'Trial rewards paid at purchase were taken back with the refund', shopCta: 'Browse the store', refundOrderCta: 'View refunded order',
    confirmTitle: 'Buy {device}?', confirmPay: 'Pay {amount} USDT from your wallet', confirmCredit: 'Credited after purchase: {rewards}',
    confirmRun: 'Your device starts running as soon as payment succeeds, and the trial ends.',
    refundClause: 'If a trial purchase is refunded, trial rewards paid at purchase are taken back with the refund.',
    resultTitle: 'Purchase complete', resultRunning: '{device} is now running in {dc}', resultRunningNoDc: '{device} is now running',
    resultCredited: 'Trial rewards credited', resultUsdt: 'USDT balance', resultUvt: 'UVT balance',
    resultPaid: 'Paid', resultSaved: 'You saved', resultDevices: 'View my devices', resultOrder: 'View order',
    orderPaid: 'Paid', orderTrialReward: 'Trial rewards credited', orderRewardsReversed: 'Trial rewards were taken back with the refund',
  },
  vi: {
    earlyTitle: 'Mua ngay: giữ trọn quyền lợi dùng thử và giảm thêm {discount} USDT',
    accruedTitle: 'Mua ngay: khấu trừ theo thu nhập dùng thử đã tích lũy',
    graceTitle: 'Mua máy vẫn nhận đủ quyền lợi dùng thử',
    earlyDeadline: 'Giảm giá đến {time} (hết thời gian dùng thử)',
    payGroup: 'Số tiền phải trả', unitPrice: 'Đơn giá', amountDue: 'Phải trả', creditGroup: 'Nhận sau khi mua',
    creditNoteFull: 'Quyết toán theo đủ {days} ngày dùng thử; phần chưa tích lũy được cộng một lần sau khi mua',
    creditNoteAccrued: 'Quyết toán theo thu nhập dùng thử đã tích lũy; dùng thử kết thúc khi mua',
    earlyEnded: 'Ưu đãi giảm {discount} USDT khi mua trong thời gian dùng thử đã kết thúc.',
    buyCta: 'Mua ngay · phải trả {amount} USDT', rulesEntry: 'Quy tắc khấu trừ và hoàn tiền',
    heroRemaining: 'Còn {time}', heroTermUntil: 'Dùng thử đến {time}', heroKeptUntil: 'Giữ đến {time}',
    refundedTitle: 'Đơn mua này đã được hoàn tiền', refundedBody: 'Số tiền đã trả đã về ví, dùng thử kết thúc cùng đơn hàng.',
    refundedRewards: 'Thưởng dùng thử trả lúc mua đã được thu hồi cùng khoản hoàn', shopCta: 'Xem cửa hàng', refundOrderCta: 'Xem đơn đã hoàn',
    confirmTitle: 'Mua {device}?', confirmPay: 'Thanh toán {amount} USDT từ ví', confirmCredit: 'Nhận sau khi mua: {rewards}',
    confirmRun: 'Thiết bị chạy ngay khi thanh toán thành công, dùng thử kết thúc.',
    refundClause: 'Khi hoàn tiền đơn mua từ dùng thử, thưởng dùng thử trả lúc mua sẽ được thu hồi cùng khoản hoàn.',
    resultTitle: 'Mua thành công', resultRunning: '{device} đã chạy tại {dc}', resultRunningNoDc: '{device} đã bắt đầu chạy',
    resultCredited: 'Đã nhận thưởng dùng thử', resultUsdt: 'Số dư USDT', resultUvt: 'Số dư UVT',
    resultPaid: 'Đã trả', resultSaved: 'Tiết kiệm', resultDevices: 'Xem thiết bị', resultOrder: 'Xem đơn hàng',
    orderPaid: 'Đã trả', orderTrialReward: 'Thưởng dùng thử đã nhận', orderRewardsReversed: 'Thưởng dùng thử đã được thu hồi cùng khoản hoàn',
  },
};

export function useTrialPurchaseCopy() {
  const locale = useLocaleStore();
  return computed(() => trialPurchaseCopy[locale.code === 'zh' || locale.code === 'vi' ? locale.code : 'en']);
}
