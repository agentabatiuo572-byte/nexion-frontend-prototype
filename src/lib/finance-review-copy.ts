import { computed } from "vue";
import { useLocaleStore } from "@/store/locale";

const copy = {
  zh: {
    bankFooter: "请使用本人账户；有提现处理中时不可更换。未保存内容离页即清除。",
    bankRules: "绑定及换卡规则",
    addressLoading: "正在读取地址与保护期…",
    addressUnavailable: "地址信息暂不可用，当前地址及保护期尚无法确认。请重试。",
    retry: "重试",
  },
  en: {
    bankFooter: "Use your own account. Changes are blocked during a withdrawal. Unsaved details are cleared when you leave.",
    bankRules: "Linking and account change rules",
    addressLoading: "Loading address and protection period…",
    addressUnavailable: "Address details are unavailable. The current address and protection period cannot be confirmed. Please retry.",
    retry: "Retry",
  },
  vi: {
    bankFooter: "Dùng tài khoản của chính bạn. Không thể đổi khi đang xử lý lệnh rút. Nội dung chưa lưu sẽ bị xóa khi rời trang.",
    bankRules: "Quy tắc liên kết và đổi tài khoản",
    addressLoading: "Đang tải địa chỉ và thời gian bảo vệ…",
    addressUnavailable: "Chưa thể tải thông tin địa chỉ. Không thể xác nhận địa chỉ hiện tại và thời gian bảo vệ. Vui lòng thử lại.",
    retry: "Thử lại",
  },
};
export function financeReviewCopy(locale: string) { return copy[locale === "zh" || locale === "vi" ? locale : "en"]; }
export function useFinanceReviewCopy() {
  const locale = useLocaleStore();
  return computed(() => financeReviewCopy(locale.code));
}
