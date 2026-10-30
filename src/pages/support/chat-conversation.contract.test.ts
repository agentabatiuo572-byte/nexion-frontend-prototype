// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./chat.vue", import.meta.url), "utf8");
const threadSource = readFileSync(new URL("../../components/support/conversation-thread.vue", import.meta.url), "utf8");

describe("retired AI chat route", () => {
  it("serves only advisor / support threads and sends any other query back to the message center", () => {
    expect(source).not.toMatch(/nova|isAi|type === "ai"/i);
    expect(source).toMatch(/onLoad\(\(q\) => \{[\s\S]*?q\?\.start === "advisor" \|\| q\?\.start === "support"[\s\S]*?void navReplace\("\/pages\/support\/messages"\);\s*\}\);/);
  });

  it("labels the human typing state with the conversation copy", () => {
    expect(source).toContain(':typing-label="t.conversations.agentTyping"');
    expect(threadSource).toContain("{{ typingLabel }}");
  });
});

describe("human conversation reply-state contract", () => {
  it("retires the composer for every backend-rejected reply state, including transferred", () => {
    expect(source).toContain('const replyAllowedStatuses = new Set(["open", "resolved", "closed"])');
    expect(source).toContain("replyAllowedStatuses.has(conv.value.status)");
    expect(source).toContain("sessionTransferred");
    expect(source).toContain("if (!isReplyAllowed.value)");
  });
});
