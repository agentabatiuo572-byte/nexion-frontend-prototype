import { describe, expect, it } from "vitest";
import chatSource from "./chat.vue?raw";
import supportApiSource from "@/api/support-api?raw";
import novaApiSource from "@/api/nova-ai-api?raw";

describe("support history pagination", () => {
  it("keeps the visible human window and can request older messages by a server cursor", () => {
    expect(supportApiSource).toContain("beforeMessageId");
    expect(chatSource).toContain("loadEarlierHumanHistory");
    expect(chatSource).toContain("historyNextCursor");
  });

  it("uses a bounded Nova cursor instead of treating the newest 200 turns as all history", () => {
    expect(novaApiSource).toContain("beforeTurnId");
    expect(novaApiSource).toContain("nextCursor");
    expect(chatSource).toContain("loadEarlierNovaHistory");
  });
});
