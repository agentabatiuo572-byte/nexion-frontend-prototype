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
    label: "暂时不用？可以先质押",
    basis: "按输入的 {amount} USDT 查看各期限的预计奖励。",
    term: "{days} 天 · 参考年奖励率 {rate}%",
    estimate: "预计奖励 {amount} USDT",
    assumptions: "按当前参考奖励率估算，以实际到账为准。",
    lockup: "质押期间资金锁定，提前解锁可能产生扣费，具体以质押页为准。",
    rules: "查看质押说明",
  },
  en: {
    label: "Not using it yet? Consider staking",
    basis: "Estimated rewards by term for the {amount} USDT you entered.",
    term: "{days} days · Est. annual reward rate {rate}%",
    estimate: "Est. reward {amount} USDT",
    assumptions: "Estimated at the current reference rate. Actual rewards may differ.",
    lockup: "Staked funds are locked for the term. Unlocking early may incur a charge. See the staking page for details.",
    rules: "View staking details",
  },
  vi: {
    label: "Chưa cần dùng? Bạn có thể staking",
    basis: "Phần thưởng dự kiến theo từng kỳ hạn cho {amount} USDT bạn đã nhập.",
    term: "{days} ngày · Tỷ lệ thưởng năm tham khảo {rate}%",
    estimate: "Thưởng dự kiến {amount} USDT",
    assumptions: "Ước tính theo tỷ lệ tham khảo hiện tại. Phần thưởng thực tế có thể khác.",
    lockup: "Tiền staking được khóa trong suốt kỳ hạn. Mở khóa sớm có thể phát sinh khoản khấu trừ. Xem chi tiết tại trang staking.",
    rules: "Xem chi tiết staking",
  },
};
