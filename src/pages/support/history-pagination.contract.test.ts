import { describe, expect, it } from "vitest";
import chatSource from "./chat.vue?raw";
import supportApiSource from "@/api/support-api?raw";

describe("support history pagination", () => {
  it("keeps the visible human window and can request older messages by a server cursor", () => {
    expect(supportApiSource).toContain("beforeMessageId");
    expect(chatSource).toContain("loadEarlierHumanHistory");
    expect(chatSource).toContain("historyNextCursor");
  });
});
