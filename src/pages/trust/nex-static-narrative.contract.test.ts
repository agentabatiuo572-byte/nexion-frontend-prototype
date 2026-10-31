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
      "你可以通过以下方式获得 UVT：",
      "在兑换页按当前报价兑换，每日有兑换额度。",
    ],
    faqExpected: "需要先在兑换页面将 UVT 换成 USDT，再按可用渠道提现。每日兑换上限可能适用。",
    prohibited: ["没有固定释放节奏", "中等(真实需求驱动)", "价格结构上长期偏向上涨"],
  },
  {
    file: "../../i18n/messages/en.ts",
    expected: [
      "You can earn UVT in these ways:",
      "Exchange at the current quote on the exchange page. A daily limit applies.",
    ],
    faqExpected: "First exchange UVT for USDT on the exchange page, then withdraw USDT through an available channel. Daily exchange caps may apply.",
    prohibited: ["no fixed supply schedule", "Moderate (real demand-driven)", "structurally biased upward over time"],
  },
  {
    file: "../../i18n/messages/vi.ts",
    expected: [
      "Bạn có thể nhận UVT theo các cách sau:",
      "Quy đổi theo báo giá hiện tại trên trang quy đổi. Có hạn mức mỗi ngày.",
    ],
    faqExpected: "Trước hết, hãy đổi UVT sang USDT trên trang Quy đổi, sau đó rút USDT qua kênh hiện có. Hạn mức quy đổi hằng ngày có thể áp dụng.",
    prohibited: ["không có lịch phát hành cố định", "Vừa phải (do nhu cầu thật dẫn dắt)", "có xu hướng nghiêng lên theo thời gian"],
  },
];

describe("NEX static narrative contract", () => {
  // Copy audit 2026-10-29 (9dd4d088): issuance is a plain list of earning sources, no schedule or promise.
  it("introduces UVT through its earning sources in every supported locale", () => {
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
      const nexNarrative = source.match(/nexHowItWorks: \{([\s\S]*?)\r?\n  \},\r?\n\r?\n  [A-Za-z]+:/)?.[1] ?? "";
      expect(nexNarrative).toContain(contract.faqExpected);
      expect(nexNarrative).not.toContain("/me/wallet/exchange");
    }
  });
});
