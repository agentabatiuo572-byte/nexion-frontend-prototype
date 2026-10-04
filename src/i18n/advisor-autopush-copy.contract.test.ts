import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { zh } from "./messages/zh";
import { vi } from "./messages/vi";

describe("advisor empty-state delivery claims", () => {
  it("does not promise automatic outreach, while keeping manual advisor contact accurate", () => {
    expect(en.conversations.listEmptyAdvisor).not.toContain("will reach out");
    expect(zh.conversations.listEmptyAdvisor).not.toContain("主动联系");
    expect(vi.conversations.listEmptyAdvisor).not.toContain("sẽ chủ động liên hệ");

    expect(en.conversations.listEmptyAdvisor).toContain("send a question");
    expect(en.conversations.listEmptyAdvisor).toContain("not been assigned an advisor");
    expect(zh.conversations.listEmptyAdvisor).toContain("发送咨询");
    expect(zh.conversations.listEmptyAdvisor).toContain("未分配专属顾问也可以发送咨询");
    expect(vi.conversations.listEmptyAdvisor).toContain("gửi câu hỏi");
    expect(vi.conversations.listEmptyAdvisor).toContain("chưa được chỉ định cố vấn");
  });
});
