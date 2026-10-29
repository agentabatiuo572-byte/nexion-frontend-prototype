import { computed } from "vue";
import { useLocaleStore } from "@/store/locale";

// Kept local to staking so concurrent dictionary changes remain independent.
const copy = {
  en: {
    days: (n: number) => `${n} days`,
    loading: "Loading…",
    unavailable: "Staking info could not load. Please try again later.",
    stale: "Refresh failed. Showing the last data; refresh before making changes.",
    retry: "Retry", empty: "No stakes yet", emptyDetail: "Choose a plan above to start staking.",
    rateNotice: "Rates for new plans may change. Existing stakes keep their recorded rate.",
    rules: {
      r3Label: "Rates for new plans may change",
      r3Body: "New stakes use the plan available at the time. Existing stakes keep the rate, term and early unlock charge they started with.",
      s3Step3Title: "Claim at maturity", faqQ3: "What if I do not claim at maturity?",
    },
  },
  zh: {
    days: (n: number) => `${n} 天`,
    loading: "正在加载…",
    unavailable: "质押信息加载失败，请稍后重试。",
    stale: "刷新失败，以下是上次的数据，操作前请先刷新。",
    retry: "重试", empty: "还没有质押", emptyDetail: "选择上方方案开始质押。",
    rateNotice: "新方案的奖励率可能调整，已开始的质押按原奖励率计算。",
    rules: {
      r3Label: "新方案奖励率可能调整",
      r3Body: "新质押按当时的方案计算；已开始的质押按开始时的奖励率、期限和扣费比例计算。",
      s3Step3Title: "到期领取", faqQ3: "到期没领取会怎样？",
    },
  },
  vi: {
    days: (n: number) => `${n} ngày`,
    loading: "Đang tải…",
    unavailable: "Không tải được thông tin staking. Vui lòng thử lại sau.",
    stale: "Làm mới thất bại. Đang hiển thị dữ liệu lần trước; vui lòng làm mới trước khi thao tác.",
    retry: "Thử lại", empty: "Chưa có khoản staking nào", emptyDetail: "Chọn một gói ở trên để bắt đầu staking.",
    rateNotice: "Tỷ lệ thưởng của gói mới có thể thay đổi. Các khoản đang staking giữ nguyên tỷ lệ đã ghi nhận.",
    rules: {
      r3Label: "Tỷ lệ thưởng của gói mới có thể thay đổi",
      r3Body: "Khoản staking mới áp dụng gói tại thời điểm tham gia. Các khoản đang staking giữ nguyên tỷ lệ thưởng, kỳ hạn và phí mở khóa sớm như lúc bắt đầu.",
      s3Step3Title: "Nhận khi đáo hạn", faqQ3: "Nếu chưa nhận khi đáo hạn thì sao?",
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
