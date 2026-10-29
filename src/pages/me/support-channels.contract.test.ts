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

  it("opens the advisor chat directly: the current advisor's thread, else a new one", async () => {
    const script = source.match(/const openingChat = ref\(false\);[\s\S]*?\nfunction onChannel\(c: Channel\) \{[\s\S]*?\n\}/)![0];
    const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const mount = (advisorId: number | null, remote = true) => {
      const convStore = {
        advisor: advisorId === null ? null : { currentAdvisorId: advisorId },
        humanThreads: [{ id: "OLD-1", ownerAgentId: "3" }, { id: "CUR-7", ownerAgentId: "7" }],
        refresh: vi.fn(async () => {}), refreshAdvisor: vi.fn(async () => {}),
      };
      const navTo = vi.fn();
      const ref = <T>(value: T) => ({ value });
      const onChannel = new Function("ref", "convStore", "remoteApiEnabled", "navTo", "openExternalSupportChannel", "toast",
        code + ";return onChannel;")(ref, convStore, remote, navTo, vi.fn(), { info: vi.fn() });
      return { onChannel, convStore, navTo };
    };
    const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

    const ongoing = mount(7);
    ongoing.onChannel({ id: "lc" }); ongoing.onChannel({ id: "lc" }); await flush();
    expect(ongoing.convStore.refresh).toHaveBeenCalledOnce();
    expect(ongoing.convStore.refreshAdvisor).toHaveBeenCalledOnce();
    expect(ongoing.navTo.mock.calls).toEqual([["/pages/support/chat?cid=CUR-7"]]);

    for (const advisorId of [9, null]) {
      const fresh = mount(advisorId); fresh.onChannel({ id: "lc" }); await flush();
      expect(fresh.navTo.mock.calls).toEqual([["/pages/support/chat?start=advisor"]]);
    }

    const local = mount(7, false); local.onChannel({ id: "lc" }); await flush();
    expect(local.convStore.refresh).not.toHaveBeenCalled();
    expect(local.navTo.mock.calls).toEqual([["/pages/support/chat?cid=CUR-7"]]);
  });

  it("keeps external launch behavior confined to the explicit mock-only branch", () => {
    expect(source).toContain("openExternalSupportChannel(c.externalId)");
    expect(source).toContain('@keydown.space.prevent="onChannel(c)"');
  });
});
