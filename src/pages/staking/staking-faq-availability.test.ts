import { describe, expect, it } from "vitest";
import { stakingFaqAnswerKey } from "./staking-faq-availability";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";

describe("staking FAQ availability", () => {
  it.each([
    [null, null, "faqA2Unknown"],
    [true, null, "faqA2Unknown"],
    [false, null, "faqA2StakingPaused"],
    [false, false, "faqA2BothPaused"],
    [false, true, "faqA2StakingPaused"],
    [true, false, "faqA2ExchangePaused"],
    [true, true, "faqA2"],
  ] as const)("maps staking=%s exchange=%s to %s", (staking, exchange, key) => {
    expect(stakingFaqAnswerKey(staking, exchange)).toBe(key);
  });

  it.each([en, vi, zh])("keeps historical positions readable in every paused answer", (messages) => {
    const copy = messages.stakingHowItWorks;
    for (const key of ["faqA2BothPaused", "faqA2StakingPaused", "faqA2ExchangePaused"] as const) {
      expect(copy[key]).toMatch(/position|持仓|vị thế/i);
    }
  });
});
