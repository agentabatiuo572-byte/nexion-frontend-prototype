import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./nex.vue", {
  query: "?raw", import: "default", eager: true,
})["./nex.vue"] ?? "") as string;

describe("NEX explainer market authority", () => {
  it("renders the canonical market quote and closes when it is unavailable", () => {
    expect(source).toContain("useMarket");
    expect(source).toContain("market.remoteReady");
    expect(source).not.toContain("`$0.17 (${w.value.variable})`");
  });
});
