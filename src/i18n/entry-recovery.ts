import { computed } from "vue";
import { useLocaleStore } from "@/store/locale";

// Copy scoped to the audited entry pages, separate from shared dictionaries.
export const entryRecoveryCopy = {
  zh: {
    referralLoading: "正在加载邀请信息…",
    referralUnavailable: "邀请信息加载失败。可重试或继续创建账号。",
    referralInvalid: "此邀请码暂不可用，你仍可创建账号。",
    txMissingTitle: "缺少交易信息",
    txMissingBody: "未提供交易哈希。请返回账单，选择需要查看的交易记录。",
    txInvalidTitle: "交易信息无效",
    txInvalidBody: "交易哈希格式无效。请返回账单重新打开交易记录。",
    txHashLabel: "交易哈希",
    viewBills: "查看账单",
  },
  en: {
    referralLoading: "Loading invitation details…",
    referralUnavailable: "Invitation details could not be loaded. Retry or continue creating an account.",
    referralInvalid: "This invite code is unavailable. You can still create an account.",
    txMissingTitle: "Missing transaction information",
    txMissingBody: "No transaction hash was provided. Return to Bills and select the transaction you want to view.",
    txInvalidTitle: "Invalid transaction information",
    txInvalidBody: "The transaction hash has an invalid format. Return to Bills and reopen the transaction record.",
    txHashLabel: "Transaction hash",
    viewBills: "View bills",
  },
  vi: {
    referralLoading: "Đang tải thông tin lời mời…",
    referralUnavailable: "Không tải được thông tin lời mời. Hãy thử lại hoặc tiếp tục tạo tài khoản.",
    referralInvalid: "Mã mời này hiện không khả dụng. Bạn vẫn có thể tạo tài khoản.",
    txMissingTitle: "Thiếu thông tin giao dịch",
    txMissingBody: "Chưa có mã băm giao dịch. Hãy quay lại lịch sử và chọn giao dịch cần xem.",
    txInvalidTitle: "Thông tin giao dịch không hợp lệ",
    txInvalidBody: "Mã băm giao dịch không đúng định dạng. Hãy quay lại lịch sử và mở lại giao dịch.",
    txHashLabel: "Mã băm giao dịch",
    viewBills: "Xem lịch sử giao dịch",
  },
};

export function useEntryRecoveryCopy() {
  const locale = useLocaleStore();
  return computed(() => entryRecoveryCopy[locale.code === "zh" || locale.code === "vi" ? locale.code : "en"]);
}
