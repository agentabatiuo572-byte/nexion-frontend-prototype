import { computed } from 'vue';
import { useLocaleStore } from '@/store/locale';

export const trialLifecycleCopy = {
  zh: {
    cardActiveTitle: '试用中', cardGraceTitle: '可抵扣',
    cardCapacityFull: '队列已满，先腾出1位', cardManage: '管理',
    activeTitle: '免费试用中', graceTitle: '试用已到期 · 仍可抵扣', endedTitle: '试用已结束', convertedTitle: '已购入设备',
    remainingLabel: '剩余时间', creditUntilLabel: '抵扣剩余时间', creditLabel: '本次购机可抵',
    viewTrial: '查看试用', viewDevices: '查看设备', buyEarly: '提前购机', buyDevice: '选购设备',
    endedBody: '本次试用已结束，可选购设备继续使用。', convertedBody: '前往设备页查看运行状态。',
    durationDays: '{days} 天免费试用', activateTitle: '确认并开启试用', activating: '正在激活…', activateCta: '免费激活，开始试用',
    activationSuccessTitle: '试用已激活', activationSuccessBody: '试用已开始计时，可在设备页查看进度。',
    longRemaining: '{days}天 {hours}小时', voucherUnavailable: '代金券不可与试用购机优惠同时使用。',
    estimateLabel: '预计获取收益', estimateNote: '按每日 ${rate} × {days} 天估算，最高 ${cap}。',
    productLabel: '试用设备', durationLabel: '试用时长', noPayment: '无需支付',
    accruedLabel: '已累计试用收益', availableOffsetLabel: '当前可抵购机款', estimateTotalLabel: '试用期预计抵扣',
    earlyPurchaseNote: '现在即可购买；仅按当前已累计抵扣结算，购买后试用结束。',
    postPurchaseRemainder: '超出抵扣上限的部分按规则在购机后入账。', capacityFull: '算力队列已满，请先在设备管理中腾出一个位置。', manageDevices: '管理设备', earlyDiscountLabel: '提前购买立减',
    afterPurchaseLabel: '购后到账',
    rulesEarly: '试用期内购买：完整试用权益照拿，再减 {discount} USDT；试用到期后购买不享此立减。',
    rulesRefund: '确认退款时，实付金额全额退回，购机时发放的试用奖励随退款收回。',
    retry: '重试', unavailable: '暂时无法读取，请重试。', loading: '正在读取试用…', close: '关闭',
  },
  en: {
    cardActiveTitle: 'Trial', cardGraceTitle: 'Credit',
    cardCapacityFull: 'Queue full. Free up 1 slot.', cardManage: 'Manage',
    activeTitle: 'Free trial active', graceTitle: 'Trial expired · Credit available', endedTitle: 'Trial ended', convertedTitle: 'Device purchased',
    remainingLabel: 'Time remaining', creditUntilLabel: 'Time to use credit', creditLabel: 'Toward device purchase',
    viewTrial: 'View trial', viewDevices: 'View devices', buyEarly: 'Buy early', buyDevice: 'Shop devices',
    endedBody: 'This trial has ended. Choose a device to continue.', convertedBody: 'View your device and its current status.',
    durationDays: '{days}-day free trial', activateTitle: 'Confirm your free trial', activating: 'Activating…', activateCta: 'Activate free and start trial',
    activationSuccessTitle: 'Your trial is active', activationSuccessBody: 'Your trial timer has started. View its progress with your devices.',
    longRemaining: '{days}d {hours}h', voucherUnavailable: 'Vouchers cannot be combined with this trial purchase offer.',
    estimateLabel: 'Estimated earnings', estimateNote: 'Estimated at ${rate}/day × {days} days, capped at ${cap}.',
    productLabel: 'Trial device', durationLabel: 'Trial duration', noPayment: 'No payment needed',
    accruedLabel: 'Trial earnings accrued', availableOffsetLabel: 'Available toward device purchase', estimateTotalLabel: 'Estimated trial credit',
    earlyPurchaseNote: 'You can buy now. Only credit already accrued applies, and your trial ends when you purchase.',
    postPurchaseRemainder: 'Amounts above the credit cap are credited after purchase according to the rules.', capacityFull: 'Your compute queue is full. Free up a position in device management first.', manageDevices: 'Manage devices', earlyDiscountLabel: 'Early purchase discount',
    afterPurchaseLabel: 'Credited after purchase',
    rulesEarly: "Buy during the trial to keep your full trial benefits and get {discount} USDT off. Buying after the trial ends doesn't include this discount.",
    rulesRefund: 'If the order is refunded, the full amount paid is returned and trial rewards paid at purchase are taken back.',
    retry: 'Retry', unavailable: 'Unable to load your trial. Please retry.', loading: 'Loading your trial…', close: 'Close',
  },
  vi: {
    cardActiveTitle: 'Dùng thử', cardGraceTitle: 'Khấu trừ',
    cardCapacityFull: 'Hết chỗ. Giải phóng 1 vị trí.', cardManage: 'Quản lý',
    activeTitle: 'Đang dùng thử miễn phí', graceTitle: 'Đã hết dùng thử · Còn khấu trừ', endedTitle: 'Đã kết thúc dùng thử', convertedTitle: 'Đã mua thiết bị',
    remainingLabel: 'Thời gian còn lại', creditUntilLabel: 'Thời hạn dùng khấu trừ', creditLabel: 'Khấu trừ khi mua máy',
    viewTrial: 'Xem dùng thử', viewDevices: 'Xem thiết bị', buyEarly: 'Mua máy sớm', buyDevice: 'Chọn mua thiết bị',
    endedBody: 'Lượt dùng thử đã kết thúc. Chọn mua thiết bị để tiếp tục.', convertedBody: 'Xem thiết bị và trạng thái hiện tại.',
    durationDays: 'Dùng thử miễn phí {days} ngày', activateTitle: 'Xác nhận lượt dùng thử', activating: 'Đang kích hoạt…', activateCta: 'Kích hoạt miễn phí, bắt đầu dùng thử',
    activationSuccessTitle: 'Đã kích hoạt dùng thử', activationSuccessBody: 'Thời gian dùng thử đã bắt đầu. Xem tiến trình tại trang thiết bị.',
    longRemaining: '{days} ngày {hours} giờ', voucherUnavailable: 'Không thể dùng phiếu giảm giá cùng ưu đãi mua máy dùng thử.',
    estimateLabel: 'Thu nhập dự kiến', estimateNote: 'Ước tính ${rate}/ngày × {days} ngày, tối đa ${cap}.',
    productLabel: 'Thiết bị dùng thử', durationLabel: 'Thời hạn dùng thử', noPayment: 'Không cần thanh toán',
    accruedLabel: 'Thu nhập dùng thử đã tích lũy', availableOffsetLabel: 'Khấu trừ hiện có khi mua máy', estimateTotalLabel: 'Khấu trừ dùng thử ước tính',
    earlyPurchaseNote: 'Bạn có thể mua ngay. Chỉ khấu trừ đã tích lũy được áp dụng và lượt dùng thử kết thúc khi mua.',
    postPurchaseRemainder: 'Phần vượt mức khấu trừ được ghi vào số dư sau khi mua theo quy định.', capacityFull: 'Hàng đợi tính toán đã đầy. Hãy giải phóng một vị trí trong quản lý thiết bị trước.', manageDevices: 'Quản lý thiết bị', earlyDiscountLabel: 'Giảm giá mua sớm',
    afterPurchaseLabel: 'Nhận sau khi mua',
    rulesEarly: 'Mua trong thời gian dùng thử: giữ trọn quyền lợi và giảm thêm {discount} USDT; mua sau khi hết hạn không được giảm.',
    rulesRefund: 'Khi đơn hàng được hoàn tiền, toàn bộ số tiền đã trả được hoàn lại và thưởng dùng thử trả lúc mua sẽ được thu hồi.',
    retry: 'Thử lại', unavailable: 'Chưa thể tải lượt dùng thử. Vui lòng thử lại.', loading: 'Đang tải lượt dùng thử…', close: 'Đóng',
  },
};

export function useTrialLifecycleCopy() {
  const locale = useLocaleStore();
  return computed(() => trialLifecycleCopy[locale.code === 'zh' || locale.code === 'vi' ? locale.code : 'en']);
}

/** Compact display only; lifecycle transitions remain server-owned. */
export function formatTrialRemaining(ms: number, longPattern = trialLifecycleCopy.en.longRemaining): string {
  if (ms > 86_400_000) return longPattern.replace('{days}', String(Math.floor(ms / 86_400_000)))
    .replace('{hours}', String(Math.floor(ms / 3_600_000) % 24));
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}
