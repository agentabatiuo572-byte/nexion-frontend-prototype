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
    expect(source).toContain("count: sides.value.left.length");
    expect(source).toContain("count: sides.value.right.length");
    expect(source).not.toContain("remoteApiEnabled ? { left: [] as NetworkMember[], right: [] as NetworkMember[] }");
  });

  it("fails closed while either canonical projection is loading or unavailable", () => {
    expect(source).toContain("commission.binaryStatus !== 'ready' || network.remoteStatus !== 'ready'");
    expect(source).toContain("commission.binaryStatus === 'error' || network.remoteStatus === 'error'");
    expect(source).toContain("commission.binaryStatus === 'ready' && network.remoteStatus === 'ready'");
    expect(source).toContain('@cta="retryCanonicalData"');
  });
});
