import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./support.vue", {
  query: "?raw", import: "default", eager: true,
})["./support.vue"] ?? "") as string;

describe("support channel actions", () => {
  it("does not expose hard-coded external support channels in the remote product", () => {
    expect(source).toContain('externalId: "telegram"');
    expect(source).toContain('externalId: "discord"');
    expect(source).toContain('externalId: "email"');
    expect(source).toContain("return remoteApiEnabled ? internalChannels.value : [...internalChannels.value, ...externalChannels.value];");
    expect(source).toContain('messageCenter.show("service")');
    expect(source).not.toContain('href: "/pages/support/messages"');
    expect(source).toContain('href: "/pages/me/support-tickets?mode=create"');
  });

  it("keeps external launch behavior confined to the explicit mock-only branch", () => {
    expect(source).toContain("openExternalSupportChannel(c.externalId)");
    expect(source).toContain('@keydown.space.prevent="onChannel(c)"');
  });
});
