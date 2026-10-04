import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";
import { localizedIdleClose } from "./support-idle-message";

const closeNotice = "会话已因用户闲置 5 分钟自动结束,可重新发起会话。";

describe("server idle notice display", () => {
  it("renders the same stored close message in the active language", () => {
    expect(localizedIdleClose(closeNotice, vi.conversations)).toContain("5 phút");
    expect(localizedIdleClose(closeNotice, en.conversations)).toContain("5 minutes");
    expect(localizedIdleClose(closeNotice, zh.conversations)).toContain("5 分钟");
  });

  it("rejects unrelated and partial user text", () => {
    expect(localizedIdleClose("请帮我检查订单", vi.conversations)).toBeNull();
    expect(localizedIdleClose("会话已因用户闲置 5 分钟自动结束", vi.conversations)).toBeNull();
  });
});
