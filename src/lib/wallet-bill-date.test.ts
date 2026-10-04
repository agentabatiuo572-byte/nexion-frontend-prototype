import { describe, expect, it, vi } from "vitest";
import { walletBillMonthKey, walletBillMonthLabel, walletBillTimeLabel } from "./wallet-bill-date";

describe("wallet bill dates", () => {
  it("groups by local calendar month and labels dates in the selected language without Intl", () => {
    const first = new Date(2026, 8, 1, 9, 5).getTime();
    const later = new Date(2026, 8, 26, 2, 59).getTime();
    const nextMonth = new Date(2026, 9, 1, 0, 1).getTime();
    const dateSpy = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(() => { throw new Error("unavailable"); });
    const timeSpy = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(() => { throw new Error("unavailable"); });
    try {
      expect(walletBillMonthKey(first)).toBe(walletBillMonthKey(later));
      expect(walletBillMonthKey(later)).not.toBe(walletBillMonthKey(nextMonth));
      expect(walletBillMonthLabel(later, "vi-VN")).toBe("tháng 9 năm 2026");
      expect(walletBillMonthLabel(later, "en-US")).toBe("September 2026");
      expect(walletBillMonthLabel(later, "zh-CN")).toBe("2026/09");
      expect(walletBillTimeLabel(later, "vi-VN")).toBe("26 thg 9, 02:59");
      expect(walletBillTimeLabel(later, "en-US")).toBe("Sep 26, 02:59");
      expect(walletBillTimeLabel(later, "zh-CN")).toBe("09/26 02:59");
    } finally {
      dateSpy.mockRestore();
      timeSpy.mockRestore();
    }
  });
});
