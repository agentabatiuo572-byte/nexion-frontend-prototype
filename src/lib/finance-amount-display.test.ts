import { describe, expect, it } from "vitest";
import { formatFinanceAmount } from "./finance-amount-display";
import { formatAmount } from "./amount-display";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";

describe("finance display, independent of command precision", () => {
  it.each([
    [52800.64, "52,800.64"], [0, "0.00"], ["999.995", "1,000.00"],
    ["-1234567.005", "-1,234,567.01"], ["9007199254740993.125", "9,007,199,254,740,993.13"],
    ["1e6", "1,000,000.00"], [null, "-"], [undefined, "-"], [NaN, "-"], [Infinity, "-"], ["", "-"],
  ] as const)("groups %s as %s", (value, expected) => expect(formatFinanceAmount(value)).toBe(expected));

  it.each([
    [2500000, "2,500,000"], [0, "0"], ["999.4999", "999"], ["999.5", "1,000"],
    ["-1234.5", "-1,235"], ["-0.1", "0"], ["2.5e6", "2,500,000"],
    ["9007199254740993", "9,007,199,254,740,993"], [null, "-"], ["bad", "-"],
  ] as const)("shows VND %s without decimal or double rounding", (value, expected) => {
    expect(formatFinanceAmount(value, "VND")).toBe(expected);
  });

  it("does not change legacy formatting or the supplied amount", () => {
    const amount = "52800.643217";
    expect(formatFinanceAmount(amount)).toBe("52,800.64");
    expect(amount).toBe("52800.643217");
    expect(formatAmount(amount)).toBe("52800.64");
  });

  it.each([en, zh, vi])("does not promise free deposits in the rate explanation", messages => {
    expect(messages.fx.sheetBody2).not.toMatch(/zero fees|0\s*手续费|0\s*phí/i);
    expect(messages.fx.sheetBody2).toMatch(/fees|手续费|phí/);
  });
});
