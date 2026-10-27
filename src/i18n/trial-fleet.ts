import { computed } from "vue";
import { useLocaleStore } from "@/store/locale";

export const trialFleetCopy = {
  zh: {
    imageBadge: "试用", statusUnknown: "状态未知",
    longRemaining: '{days}天 {hours}小时',
    grace: "试用已停止，抵扣仍可用", remaining: "剩余时间", creditRemaining: "抵扣剩余",
    availableCredit: "当前可抵扣", estimate: "预计试用抵扣", details: "试用详情", buyEarly: "提前购买", buy: "使用抵扣购机",
    unknown: "试用状态暂不可用", loading: "正在更新试用状态", retry: "重试", creditNote: "抵扣仅用于购机，不能直接提现。",
    slotsUnknown: "设备容量暂不可用，请刷新后重试", slotsChecking: "正在确认设备容量，请稍候", cancelBusy: "正在取消试用", cancel: "取消试用",
  },
  en: {
    imageBadge: "Trial", statusUnknown: "Status unknown",
    longRemaining: '{days}d {hours}h',
    grace: "Trial stopped · credit available", remaining: "Remaining", creditRemaining: "Credit expires in",
    availableCredit: "Available credit", estimate: "Estimated trial credit", details: "Trial details", buyEarly: "Buy early", buy: "Buy with credit",
    unknown: "Trial status unavailable", loading: "Updating trial status", retry: "Retry", creditNote: "Credit applies to a device purchase and cannot be withdrawn directly.",
    slotsUnknown: "Device capacity is unavailable. Refresh and try again.", slotsChecking: "Checking device capacity. Please wait.", cancelBusy: "Cancelling trial", cancel: "Cancel trial",
  },
  vi: {
    imageBadge: "Dùng thử", statusUnknown: "Chưa xác định",
    longRemaining: '{days} ngày {hours} giờ',
    grace: "Đã dừng dùng thử · còn khoản khấu trừ", remaining: "Còn lại", creditRemaining: "Khấu trừ còn",
    availableCredit: "Khoản khấu trừ khả dụng", estimate: "Khoản khấu trừ dự kiến", details: "Chi tiết dùng thử", buyEarly: "Mua sớm", buy: "Mua bằng khoản khấu trừ",
    unknown: "Chưa tải được trạng thái dùng thử", loading: "Đang cập nhật lượt dùng thử", retry: "Thử lại", creditNote: "Khoản khấu trừ chỉ dùng để mua thiết bị, không thể rút trực tiếp.",
    slotsUnknown: "Chưa tải được sức chứa thiết bị. Vui lòng tải lại và thử lại.", slotsChecking: "Đang kiểm tra sức chứa thiết bị. Vui lòng đợi.", cancelBusy: "Đang hủy dùng thử", cancel: "Hủy dùng thử",
  },
};

export function useTrialFleetCopy() {
  const locale = useLocaleStore();
  return computed(() => trialFleetCopy[locale.code === "zh" || locale.code === "vi" ? locale.code : "en"]);
}
