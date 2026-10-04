// @ts-expect-error Vitest executes this content contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type LocaleContract = {
  file: string;
  expected: string[];
  faqExpected: string;
  prohibited: string[];
};

const contracts: readonly LocaleContract[] = [
  {
    file: "../../i18n/messages/zh.ts",
    expected: [
      "NEX 的发放和释放以适用的任务、活动、Genesis 等已发布规则及实际入账记录为准。",
      "当前兑换页报价与可用状态为准，报价可能变化。",
    ],
    faqExpected: "需要先在兑换页面将 NEX 换成 USDT，再按可用渠道提现。每日兑换上限可能适用。",
    prohibited: ["没有固定释放节奏", "中等(真实需求驱动)", "价格结构上长期偏向上涨"],
  },
  {
    file: "../../i18n/messages/en.ts",
    expected: [
      "NEX issuance and release follow the applicable published rules for tasks, activities, Genesis, and actual ledger records.",
      "Use the current exchange quote and availability shown on the exchange page; quotes can change.",
    ],
    faqExpected: "First exchange NEX for USDT on the exchange page, then withdraw USDT through an available channel. Daily exchange caps may apply.",
    prohibited: ["no fixed supply schedule", "Moderate (real demand-driven)", "structurally biased upward over time"],
  },
  {
    file: "../../i18n/messages/vi.ts",
    expected: [
      "Việc phát hành và mở khóa NEX tuân theo các quy tắc đã công bố áp dụng cho nhiệm vụ, hoạt động, Genesis và bản ghi sổ cái thực tế.",
      "Hãy dùng báo giá và trạng thái khả dụng hiện có trên trang Quy đổi; báo giá có thể thay đổi.",
    ],
    faqExpected: "Trước hết, hãy đổi NEX sang USDT trên trang Quy đổi, sau đó rút USDT qua kênh hiện có. Hạn mức quy đổi hằng ngày có thể áp dụng.",
    prohibited: ["không có lịch phát hành cố định", "Vừa phải (do nhu cầu thật dẫn dắt)", "có xu hướng nghiêng lên theo thời gian"],
  },
];

describe("NEX static narrative contract", () => {
  it("uses published rules and actual records for issuance in every supported locale", () => {
    for (const contract of contracts) {
      const source = readFileSync(new URL(contract.file, import.meta.url), "utf8");
      expect(source).toContain(contract.expected[0]);
    }
  });

  it("uses the current exchange quote without a demand or appreciation promise", () => {
    for (const contract of contracts) {
      const source = readFileSync(new URL(contract.file, import.meta.url), "utf8");
      expect(source).toContain(contract.expected[1]);
      for (const prohibited of contract.prohibited) expect(source).not.toContain(prohibited);
    }
  });

  it("describes the exchange-before-withdrawal flow without exposing an internal route", () => {
    for (const contract of contracts) {
      const source = readFileSync(new URL(contract.file, import.meta.url), "utf8");
      const nexNarrative = source.match(/nexHowItWorks: \{([\s\S]*?)\r?\n  \},\r?\n\r?\n  monthlyChallenge:/)?.[1] ?? "";
      expect(nexNarrative).toContain(contract.faqExpected);
      expect(nexNarrative).not.toContain("/me/wallet/exchange");
    }
  });
});
