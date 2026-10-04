import { describe, expect, it } from "vitest";

const detail = (import.meta.glob("./store/detail.vue", { query: "?raw", import: "default", eager: true })["./store/detail.vue"] ?? "") as string;
const marketplace = (import.meta.glob("./genesis/marketplace.vue", { query: "?raw", import: "default", eager: true })["./genesis/marketplace.vue"] ?? "") as string;

describe("H3 browsing observation page wiring", () => {
  it("observes only a ready, visible canonical product detail through the shared reporter", () => {
    expect(detail).toContain("catalogStatus.value !== \"ready\"");
    expect(detail).toContain("h3ObservationApi.productDetail");
    expect(detail).toContain("authenticatedPageObservationReporter.report");
  });

  it("observes the secondary market only after its canonical remote read resolves", () => {
    expect(marketplace).toContain("await genesis.syncRemote()");
    expect(marketplace).toContain("secondaryMarket()");
    expect(marketplace).toContain("marketplacePageVisible");
  });
});
