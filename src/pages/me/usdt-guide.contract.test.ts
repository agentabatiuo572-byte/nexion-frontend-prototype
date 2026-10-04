// @ts-expect-error Vitest executes this page-copy contract in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./usdt-guide.vue", import.meta.url), "utf8");
const zh = readFileSync(new URL("../../i18n/messages/zh.ts", import.meta.url), "utf8");
const en = readFileSync(new URL("../../i18n/messages/en.ts", import.meta.url), "utf8");
const vi = readFileSync(new URL("../../i18n/messages/vi.ts", import.meta.url), "utf8");

function guideCopy(messages: string): string {
  const start = messages.indexOf("  usdtGuide:");
  const end = messages.indexOf("\n  //", start);
  return messages.slice(start, end < 0 ? undefined : end);
}

describe("USDT guide accuracy", () => {
  it("always sends the explicit return-to-top-up CTA to top-up", () => {
    expect(page).toContain('navReplace("/pages/me/wallet-topup")');
    expect(page).not.toContain('navBack("/pages/me/wallet-topup")');
  });

  it.each([zh, en, vi])("does not make a fixed network, timing, or recovery promise", (messages) => {
    const guide = guideCopy(messages);
    expect(guide).toContain("usdtGuide:");
    expect(guide).toMatch(/(?:top-up|充值|trang nạp)/i);
    expect(guide).toMatch(/(?:available|可用|hiện có)/i);
    expect(guide).toMatch(/(?:provider|服务商|nhà cung cấp)/i);
    expect(guide).toMatch(/(?:fee|费用|phí)/i);
    expect(guide).not.toMatch(/(?:TRC20.{0,30}(?:lowest|最低|thấp nhất)|(?:only minutes|只需几分钟|chỉ mất vài phút)|(?:cannot be recovered|无法找回|không thể khôi phục))/i);
  });
});
