import source from "../../scripts/lib/harness-stubs.mjs?raw";
import emptyProbeSource from "../../scripts/empty-state-probe.mjs?raw";
import { describe, expect, it } from "vitest";
import { createGenesisApi } from "../api/genesis-api";

describe("publication harness regression", () => {
  it("empty-state fixtures satisfy real Genesis account and public history readers", async () => {
    const start = emptyProbeSource.indexOf("function formalEmptyResponse(url) {");
    const end = emptyProbeSource.indexOf("\n// 接了 EmptyState", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const responseFor = new Function(`${emptyProbeSource.slice(start, end)}; return formalEmptyResponse;`)();
    const api = createGenesisApi({ request: async ({ path }: { path: string }) => responseFor(new URL(path, "http://fixture.invalid")) } as never);
    await expect(api.account()).resolves.toMatchObject({ holdings: [], orders: [], emissions: [], ordersNextCursor: null, emissionsNextCursor: null });
    await expect(api.state()).resolves.toMatchObject({ listings: [], transactions: [], transactionsNextCursor: null });
  });
  it("both shared Vue stubs expose shallowReactive and preserve object identity", async () => {
    const stubs = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    for (const name of ["VUE_STUB_PLAIN", "VUE_STUB_NXREF"]) {
      const vue = await import(`data:text/javascript,${encodeURIComponent(stubs[name])}`);
      expect(typeof vue.shallowReactive).toBe("function");
      const state = { items: [], busy: false };
      expect(vue.shallowReactive(state)).toBe(state);
    }
  });
});
