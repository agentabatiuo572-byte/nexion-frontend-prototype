import { describe, expect, it } from "vitest";
import { resolveWalletBillMemo } from "./wallet-bill-display";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";

describe("resolveWalletBillMemo", () => {
  const memo = { trialCharge: "购买", other: "其他账本流水" };

  it("uses the controlled presentation code instead of a stored ledger remark", () => {
    expect(resolveWalletBillMemo({ memo: "H2 internal conversion settlement", memoKey: "trialCharge" }, memo)).toBe("购买");
  });

  it("uses the honest generic copy when no recognized presentation is available", () => {
    expect(resolveWalletBillMemo({ memo: "D5 internal note" }, memo)).toBe("其他账本流水");
  });

  it.each(["constructor", "toString", "__proto__"])("rejects inherited translation key %s", (memoKey) => {
    expect(resolveWalletBillMemo({ memo: "private ledger note", memoKey }, memo)).toBe("其他账本流水");
  });

  it.each([["en", en], ["vi", vi], ["zh", zh]] as const)("ships specific wallet descriptions in %s", (_, messages) => {
    const codes = ["computeTaskReward", "dailyCheckIn", "trialCharge", "trialBonus", "questReward", "purchaseReward",
      "withdrawPrincipal", "withdrawNetworkFee", "withdrawPenaltyFee", "withdrawFeeOffset", "withdrawPayoutRefund",
      "withdrawPayoutNexRefund", "withdrawRefund", "withdrawFeeOffsetRefund"];
    const published = messages.bills.memo;
    for (const memoKey of codes) {
      const description = resolveWalletBillMemo({ memo: "private ledger note", memoKey }, published);
      expect(description).toBeTypeOf("string");
      expect(description.trim()).not.toBe("");
      expect(description).not.toBe(published.other);
    }
  });
});
