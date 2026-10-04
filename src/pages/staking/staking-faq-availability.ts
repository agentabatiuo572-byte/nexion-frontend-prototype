export function stakingFaqAnswerKey(stakingAvailable: boolean | null, exchangeAvailable: boolean | null) {
  if (stakingAvailable === false) return exchangeAvailable === false ? "faqA2BothPaused" : "faqA2StakingPaused";
  if (stakingAvailable === true && exchangeAvailable === false) return "faqA2ExchangePaused";
  if (stakingAvailable === true && exchangeAvailable === true) return "faqA2";
  return "faqA2Unknown";
}
