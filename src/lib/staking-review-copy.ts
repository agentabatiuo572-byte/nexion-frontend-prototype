import { computed } from "vue";
import { useLocaleStore } from "@/store/locale";

// Kept local to staking so concurrent dictionary changes remain independent.
const copy = {
  en: {
    days: (n: number) => `${n} days`,
    loading: "Loading staking data…",
    unavailable: "Staking data is unavailable. Assets and positions cannot be confirmed.",
    stale: "Refresh failed. Showing the last successful snapshot; refresh before making changes.",
    retry: "Retry", empty: "No staking positions", emptyDetail: "Your latest position list is empty.",
    rateNotice: "Rates for new plans may change. Each opened position keeps its recorded rate and term.",
    rules: {
      r3Label: "Rates for new plans may change",
      r3Body: "New positions use the plan available when opened. Existing positions keep their recorded rate and term; later plan changes do not change that rate.",
      s3Step3Title: "Claim at maturity", faqQ3: "What if I do not claim at maturity?",
    },
  },
  zh: {
    days: (n: number) => `${n} 天`,
    loading: "正在读取质押数据…",
    unavailable: "质押数据读取失败，暂无法确认资产与持仓。",
    stale: "刷新失败，以下保留上次成功读取的数据；操作前请重试更新。",
    retry: "重试", empty: "暂无质押持仓", emptyDetail: "本次读取的持仓列表为空。",
    rateNotice: "新方案利率可能调整；已开立持仓按该笔记录的锁定利率和期限计息。",
    rules: {
      r3Label: "新方案利率可能调整",
      r3Body: "新开仓以当时可用方案为准。已开立持仓按该笔记录的锁定利率和期限计息，后续方案调整不改变该笔利率。",
      s3Step3Title: "到期申请领取", faqQ3: "到期未领取会怎样？",
    },
  },
  vi: {
    days: (n: number) => `${n} ngày`,
    loading: "Đang tải dữ liệu staking…",
    unavailable: "Không thể tải dữ liệu staking. Chưa thể xác nhận tài sản và vị thế.",
    stale: "Làm mới thất bại. Đang hiển thị dữ liệu đã tải trước đó; hãy thử lại trước khi giao dịch.",
    retry: "Thử lại", empty: "Chưa có vị thế staking", emptyDetail: "Danh sách vị thế vừa tải đang trống.",
    rateNotice: "Lãi suất gói mới có thể thay đổi. Vị thế đã mở giữ nguyên lãi suất và kỳ hạn đã ghi nhận.",
    rules: {
      r3Label: "Lãi suất gói mới có thể thay đổi",
      r3Body: "Vị thế mới áp dụng gói khả dụng khi mở. Vị thế hiện có giữ nguyên lãi suất và kỳ hạn đã ghi nhận, không bị thay đổi theo gói mới.",
      s3Step3Title: "Yêu cầu nhận khi đáo hạn", faqQ3: "Nếu chưa nhận khi đáo hạn thì sao?",
    },
  },
};

export function stakingReviewCopy(locale: string) {
  return copy[locale === "zh" || locale === "vi" ? locale : "en"];
}

export function useStakingReviewCopy() {
  const locale = useLocaleStore();
  return computed(() => stakingReviewCopy(locale.code));
}
