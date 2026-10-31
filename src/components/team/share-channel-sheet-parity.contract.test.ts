// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./share-channel-sheet.vue", import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("team share sheet configuration and reward boundaries", () => {
  it("reads optional channels from server configuration", () => {
    expect(source).toContain("const channels = computed<ShareChannelDef[]>(() => visibleChannels())");
    expect(source).not.toContain("FALLBACK_TEXT");
  });

  it("keeps the server reward amount while localizing the explanatory copy", () => {
    // The server amount is retained as a confirmed presentation snapshot before it is shown.
    expect(source).toContain("amount: rewards.snapshot.inviterRewardNex");
    expect(source).toContain("`${formatAmount(nex)} UVT`");
    expect(source).toContain("copy.value.qualifiedFriendReward");
    expect(source).not.toContain("Server-set reward:");
    expect(source).not.toContain("Server invitation reward unavailable");
    expect(source).toMatch(/\.ss-reward__t \{[^}]*overflow-wrap:anywhere/);
  });
});
