import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = (import.meta.glob("./support.vue", {
  query: "?raw", import: "default", eager: true,
})["./support.vue"] ?? "") as string;

describe("support channel actions", () => {
  it("does not expose hard-coded external support channels in the remote product", () => {
    expect(source).toContain('externalId: "telegram"');
    expect(source).toContain('externalId: "discord"');
    expect(source).toContain('externalId: "email"');
    expect(source).toContain("return remoteApiEnabled ? internalChannels.value : [...internalChannels.value, ...externalChannels.value];");
    expect(source).not.toContain("messageCenter");
    expect(source).not.toContain('href: "/pages/support/messages"');
    expect(source).not.toContain("support-tickets");
  });

  it("opens the advisor chat directly through the shared route, once per tap", async () => {
    const script = source.match(/const openingChat = ref\(false\);[\s\S]*?\nfunction onChannel\(c: Channel\) \{[\s\S]*?\n\}/)![0];
    const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const ref = <T>(value: T) => ({ value });
    const convStore = {}, navTo = vi.fn();
    const advisorChatRoute = vi.fn(async () => "/pages/support/chat?cid=CUR-7");
    const onChannel = new Function("ref", "convStore", "advisorChatRoute", "navTo", "openExternalSupportChannel", "toast",
      code + ";return onChannel;")(ref, convStore, advisorChatRoute, navTo, vi.fn(), { info: vi.fn() });

    onChannel({ id: "lc" }); onChannel({ id: "lc" });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(advisorChatRoute).toHaveBeenCalledExactlyOnceWith(convStore);
    expect(navTo.mock.calls).toEqual([["/pages/support/chat?cid=CUR-7"]]);
  });

  it("keeps external launch behavior confined to the explicit mock-only branch", () => {
    expect(source).toContain("openExternalSupportChannel(c.externalId)");
    expect(source).toContain('@keydown.space.prevent="onChannel(c)"');
  });
});
