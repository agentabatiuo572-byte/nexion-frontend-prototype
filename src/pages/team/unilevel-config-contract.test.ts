import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./unilevel.vue", { query: "?raw", import: "default", eager: true })["./unilevel.vue"] ?? "") as string;

describe("unilevel canonical commission consumer contract", () => {
  it("uses the commission store config in server-backed and local prototype display/calculation paths", () => {
    expect(source).toContain("commission.config");
    expect(source).toContain("commission.configStatus");
    expect(source).toContain("commission.unilevelRate");
    expect(source).not.toContain("UNILEVEL_USDT");
  });

  it("does not render remote content while commission config is loading or failed", () => {
    expect(source).toContain("commission.configStatus === 'ready'");
    expect(source).toContain('commission.configStatus === "error"');
    expect(source).toContain('commission.configStatus !== "ready"');
  });

  it("reloads the page-local projection after a runtime revision invalidates it", () => {
    expect(source).toContain("subscribeRuntimeRevision");
    expect(source).toContain("const unsubscribeRuntimeRevision");
    expect(source).toMatch(/subscribeRuntimeRevision\(\(\) => \{\s*retryRemote\(\);/);
    expect(source).toContain("commission.ensureCanonicalConfig(), network.ensureCanonicalNetwork(), loadRemote()");
    expect(source).toContain("if (!current()) return;");
    expect(source).not.toContain('remoteState.value = "error"; } return;');
  });

  it("keeps canonical F2 policy visible without exposing provenance internals or inventing earnings", () => {
    expect(source).not.toContain("F2 canonical rules · server source");
    expect(source).not.toContain("commission.config.sourceEnvironment");
    expect(source).not.toContain("commission.config.runId");
    expect(source).toContain("remoteState === 'ready'");
    expect(source).toContain('v-else-if="!remoteApiEnabled"');
    expect(source).toContain("canonicalPolicyText");
    expect(source).not.toContain("t.unilevel.serverRewardHold");
    expect(source).toContain("t.network.projectionErrorDesc");
  });

  it("shows every server-paused settlement layer and explains that accrual is suspended", () => {
    expect(source).toContain("commission.config?.unilevelPaused");
    expect(source).toContain("pausedLayersText");
    expect(source).toContain("t.unilevel.pausedLayersTitle");
    expect(source).toContain(["t.value.unilevel.", "pausedLayersDesc"].join(""));
    expect(source).toContain('join(", ")');
    expect(source).not.toContain('join("\u3001")');
  });
});
