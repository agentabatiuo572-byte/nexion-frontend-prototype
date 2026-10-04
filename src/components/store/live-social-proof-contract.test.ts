import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./live-social-proof.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./live-social-proof.vue"] ?? "") as string;

describe("LiveSocialProof server scope", () => {
  it("fences remote responses to account and the current commerce run", () => {
    expect(source).toContain("captureRuntimeRevision");
    expect(source).toContain("isCurrentRuntimeRevision(runScope)");
    expect(source).toContain("remoteMounted && generation === remoteRequest");
    expect(source).toContain("expectedAccount === String(app.accountKey)");
    expect(source).toContain("productCatalogState.status");
  });

  it("renders an unavailable state instead of falling back to local facts", () => {
    expect(source).toContain("remoteUnavailable");
    expect(source).toContain("w.unavailableLabel");
    expect(source).toContain("clearRemoteProof(true)");
  });
});
