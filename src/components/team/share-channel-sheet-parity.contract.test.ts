// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./share-channel-sheet.vue", import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("team share sheet 5174 parity", () => {
  it("renders only server-configured share channels", () => {
    expect(source).toContain("const channels = computed<ShareChannelDef[]>(() => visibleChannels())");
    expect(source).not.toContain("FALLBACK_TEXT");
  });

  it("keeps the server reward amount while localizing the explanatory copy", () => {
    expect(source).toContain("t.value.team.serverRewardPerSettlement");
    expect(source).not.toContain("Server-set reward:");
    expect(source).not.toContain("Server invitation reward unavailable");
    expect(source).toMatch(/\.ss-reward \{[^}]*min-height: 65px/);
  });
});
