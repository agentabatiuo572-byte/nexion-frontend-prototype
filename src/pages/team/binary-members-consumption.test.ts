import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./binary.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./binary.vue"] ?? "") as string;

describe("Binary canonical member consumer", () => {
  it("renders the server network members instead of replacing them with empty remote wings", () => {
    expect(source).toContain("const sides = computed(() => network.byBinary())");
    expect(source).toContain("network.refreshCanonicalNetwork()");
    expect(source).toContain("snapshot.value?.trackAMembers ?? 0");
    expect(source).toContain("snapshot.value?.trackBMembers ?? 0");
    expect(source).not.toContain("remoteApiEnabled ? { left: [] as NetworkMember[], right: [] as NetworkMember[] }");
  });

  it("keeps F3 loading and failure independent from member-detail failure", () => {
    expect(source).toContain("binaryPageState");
    expect(source).toContain("pageState.primary === 'error'");
    expect(source).toContain("pageState.primary === 'loading'");
    expect(source).toContain("pageState.memberDetails === 'error'");
    expect(source).not.toContain("commission.binaryStatus === 'ready' && network.remoteStatus === 'ready'");
    expect(source).toContain('@cta="retryCanonicalData"');
    expect(source).toContain("retryNetworkMembers");
  });
});
