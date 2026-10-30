import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { zh } from "./messages/zh";
import { vi } from "./messages/vi";

describe("support copy preserves recovery and history without implementation explanations", () => {
  for (const [name, locale] of Object.entries({ en, zh, vi })) {
    it(`${name}: current support consumption has no server or defensive implementation copy`, () => {
      for (const copy of [locale.conversations.loadErrorDesc, locale.conversations.historyTruncated]) {
        expect(copy).not.toMatch(/服务器|服务端|后端|不会把读取失败|server|empty inbox is assumed|máy chủ|Lỗi tải không được xem/i);
      }
      for (const copy of [locale.conversations.historyTruncated]) {
        expect(copy).toContain("100");
        expect(copy).toMatch(/更早|早期|Earlier|cũ hơn/);
        expect(copy).toMatch(/保留|available|retained|lưu/);
      }
      expect(locale.conversations.loadErrorDesc).toMatch(/重试|try again|thử lại/);
    });
  }
});
