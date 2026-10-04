import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./proof.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./proof.vue"] ?? "") as string;

describe("Proof remote snapshot scope", () => {
  it("invalidates and clears the snapshot immediately on account changes", () => {
    expect(source).toMatch(/watch\(\(\) => String\(app\.accountKey\)/);
    expect(source).toMatch(/watch\(\(\) => String\(app\.accountKey\)[\s\S]{0,500}remoteRequest \+= 1;[\s\S]{0,300}remoteSnapshot\.value = null;[\s\S]{0,200}remoteError\.value = false;/);
  });

  it("fences late account/run responses and invalidates the page lifecycle", () => {
    expect(source).toMatch(/captureRuntimeRevision/);
    expect(source).toMatch(/isCurrentRuntimeRevision/);
    expect(source).toMatch(/remoteMounted && request === remoteRequest/);
    expect(source).toMatch(/onUnload\(invalidateRemoteProof\)/);
    expect(source).toMatch(/onUnmounted\(invalidateRemoteProof\)/);
  });
});
