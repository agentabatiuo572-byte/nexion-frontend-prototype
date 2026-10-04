import { describe, expect, it, vi } from "vitest";
import { formatBankDateTime } from "./bank-date";

describe("bank business time on native Android", () => {
  it("keeps the server instant in Vietnam time when native Intl ignores the requested locale and zone", () => {
    const spy = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(() => "Wed Sep 16 2026 19:52:40 GMT+0900 (JST)");
    try {
      expect(formatBankDateTime("2026-09-16T10:52:40Z")).toBe("2026-09-16 17:52:40 UTC+7");
      expect(formatBankDateTime("2026-09-17T00:52:40+08:00")).toBe("2026-09-16 23:52:40 UTC+7");
      expect(formatBankDateTime("2026-09-17 00:52:40")).toBe("2026-09-16 23:52:40 UTC+7");
      expect(formatBankDateTime("invalid")).toBe("—");
    } finally {
      spy.mockRestore();
    }
  });
});
