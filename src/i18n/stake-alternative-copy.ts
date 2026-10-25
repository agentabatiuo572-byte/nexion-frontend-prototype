interface StakeAlternativeCopy {
  label: string;
  basis: string;
  term: string;
  estimate: string;
  assumptions: string;
  lockup: string;
  rules: string;
}

export const stakeAlternativeCopy: Record<"zh" | "en" | "vi", StakeAlternativeCopy> = {
  zh: {
    label: "了解质押（可选）",
    basis: "以当前输入的 {amount} USDT 为本金，查看各期限的预估收益。",
    term: "{days} 天 · 年化收益率 {rate}%",
    estimate: "预估收益 {amount} USDT",
    assumptions: "估算按本金 × 当前年化收益率 × 天数 ÷ 365 计算，假设利率不变、不复投，未扣除费用或罚金；不代表保证收益。",
    lockup: "质押有锁定期限，提前赎回可能扣除罚金。实际收益、资格与赎回规则以质押页为准。",
    rules: "查看质押规则",
  },
  en: {
    label: "Explore staking (optional)",
    basis: "Estimated rewards by term, using the entered {amount} USDT as principal.",
    term: "{days} days · Annualized rate {rate}%",
    estimate: "Estimated reward {amount} USDT",
    assumptions: "Estimate = principal × current annualized rate × days ÷ 365. It assumes an unchanged rate and no reinvestment, before fees or penalties. Returns are not guaranteed.",
    lockup: "Staking has a lockup period. Early redemption may incur a penalty. See the staking page for actual rewards, eligibility and redemption rules.",
    rules: "View staking rules",
  },
  vi: {
    label: "Tìm hiểu staking (tùy chọn)",
    basis: "Lợi nhuận ước tính theo kỳ hạn, với số vốn đã nhập là {amount} USDT.",
    term: "{days} ngày · Lãi suất năm {rate}%",
    estimate: "Lợi nhuận ước tính {amount} USDT",
    assumptions: "Ước tính = vốn gốc × lãi suất năm hiện tại × số ngày ÷ 365, giả định lãi suất không đổi, không tái đầu tư và chưa trừ phí hoặc tiền phạt. Lợi nhuận không được đảm bảo.",
    lockup: "Staking có thời hạn khóa. Rút trước hạn có thể bị phạt. Xem trang staking để biết lợi nhuận thực tế, điều kiện và quy tắc rút vốn.",
    rules: "Xem quy tắc staking",
  },
};
