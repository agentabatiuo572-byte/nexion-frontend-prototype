import { describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ remoteApiEnabled: true }));
vi.mock("@/api/runtime", () => runtime);
const { advisorChatRoute } = await import("./advisor-chat-route");

function store(advisorId: number | null) {
  return {
    advisor: advisorId === null ? null : { currentAdvisorId: advisorId },
    humanThreads: [{ id: "OLD-1", ownerAgentId: "3" }, { id: "CUR 7", ownerAgentId: "7" }],
    refresh: vi.fn(async () => {}), refreshAdvisor: vi.fn(async () => {}),
  } as unknown as Parameters<typeof advisorChatRoute>[0];
}

describe("advisor chat route", () => {
  it("continues the current advisor's thread after refreshing the inbox", async () => {
    const convStore = store(7);
    await expect(advisorChatRoute(convStore)).resolves.toBe("/pages/support/chat?cid=CUR%207");
    expect(convStore.refresh).toHaveBeenCalledOnce();
    expect(convStore.refreshAdvisor).toHaveBeenCalledOnce();
  });

  it("opens a new advisor conversation without a current advisor thread", async () => {
    for (const advisorId of [9, null]) {
      await expect(advisorChatRoute(store(advisorId))).resolves.toBe("/pages/support/chat?start=advisor");
    }
  });

  it("does not read the server in the local prototype", async () => {
    runtime.remoteApiEnabled = false;
    const convStore = store(7);
    await expect(advisorChatRoute(convStore)).resolves.toBe("/pages/support/chat?cid=CUR%207");
    expect(convStore.refresh).not.toHaveBeenCalled();
    runtime.remoteApiEnabled = true;
  });
});
