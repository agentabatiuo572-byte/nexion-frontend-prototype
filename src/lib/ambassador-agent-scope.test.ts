import { describe, expect, it } from "vitest";
import { isCurrentAmbassadorAgentFence, type AmbassadorAgentFence } from "@/lib/ambassador-agent-scope";

const agentSource = (import.meta.glob("../pages/team/agent.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["../pages/team/agent.vue"] ?? "") as string;

const request: AmbassadorAgentFence = { accountKey: "account-a", generation: 11 };

function current(overrides: Partial<AmbassadorAgentFence> = {}) {
  return { mounted: true, ...request, ...overrides };
}

describe("ambassador agent request fence", () => {
  it.each([
    ["same account", current(), true],
    ["account key changed", current({ accountKey: "account-b" }), false],
    ["request generation changed", current({ generation: 12 }), false],
    ["page unloaded", { ...current(), mounted: false }, false],
  ])("accepts only the current mounted account scope: %s", (_label, state, expected) => {
    expect(isCurrentAmbassadorAgentFence(request, state)).toBe(expected);
  });

  it("fences policy, latest, submit and readback on lifecycle teardown", () => {
    expect(agentSource).toContain("captureAgentRequest");
    expect(agentSource).toContain("onUnload(() => {");
    expect(agentSource).toContain("agentMounted = false");
    expect(agentSource).toMatch(/const value = await ambassadorApplicationApi\.latest\(\);[\s\S]*requestIsCurrent\(requestScope\)/);
    expect(agentSource).toMatch(/const result = await ambassadorApplicationApi\.submit\(input, key\);[\s\S]*requestIsCurrent\(requestScope\)/);
    // Readback only updates the display; it no longer falsely identifies a
    // matching historical application as this command's successful receipt.
    expect(agentSource).toMatch(/await refreshLatest\(requestScope\);[\s\S]*requestIsCurrent\(requestScope\)/);
    expect(agentSource).not.toContain("matches(input, authoritative)");
    expect(agentSource).toMatch(/finally \{[\s\S]*if \(requestIsCurrent\(requestScope\)\) submitting\.value = false;/);
  });
});
