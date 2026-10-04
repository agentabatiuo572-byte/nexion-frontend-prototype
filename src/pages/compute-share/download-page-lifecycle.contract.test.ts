import { describe, expect, it } from "vitest";

const pages = import.meta.glob("./download.vue", { eager: true, query: "?raw", import: "default" });
const source = (pages["./download.vue"] ?? "") as string;

describe("compute-share download page cold-gate wiring", () => {
  it("renders pending and retryable failure states before the enabled surface", () => {
    expect(source).toContain("gatePhase === 'pending'");
    expect(source).toContain('data-proof="compute-share-config-pending"');
    expect(source).toContain('aria-busy="true"');
    expect(source).toContain("gatePhase === 'failed'");
    expect(source).toContain('data-proof="compute-share-config-failed"');
    expect(source).toContain('@keydown.enter.prevent="retryConfigGate"');
    expect(source).toContain('@keydown.space.prevent="retryConfigGate"');
  });

  it("uses the shared flight gate and clears the scoped connecting lock before a later resume", () => {
    expect(source).toContain("settle: () => cfg.ensureLoaded()");
    expect(source).toContain("void downloadGate.mount()");
    expect(source).toContain("downloadGate.unmount()");
    expect(source).toContain("watch(() => [cfg.configStatus, enabled.value] as const");
    const suspend = source.slice(source.indexOf("function suspendRemoteWork"), source.indexOf("function closeDisabled"));
    expect(suspend).toContain("lifecycleGeneration += 1");
    expect(suspend).toContain("connecting.value = false");
    expect(suspend).toContain("clearPolling()");
  });
});
