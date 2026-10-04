import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  clear: vi.fn(),
  replace: vi.fn(),
  advanceRuntimeRevision: vi.fn(),
}));

vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  productCatalogApi: { catalog: mocks.catalog },
}));
vi.mock("@/api/order-api", () => ({ advanceRuntimeRevision: mocks.advanceRuntimeRevision }));
vi.mock("@/mock/products", () => ({
  clearProductCatalog: mocks.clear,
  replaceProductCatalog: mocks.replace,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("product catalog refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("keeps only a presentation snapshot during refresh/error, accepts real deletions, and clears on rebind", async () => {
    const snapshot = { products: [{ id: "confirmed", name: "UVELBox S1" }], source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "one" };
    mocks.catalog.mockResolvedValueOnce(snapshot);
    const catalog = await import("./product-catalog");
    expect(catalog.productCatalogPresentation.value).toBeNull();
    await catalog.refreshProductCatalog(true);
    const confirmed = catalog.productCatalogPresentation.value;
    const pending = deferred<any>();
    mocks.catalog.mockReturnValueOnce(pending.promise);
    const refresh = catalog.refreshProductCatalog(true);
    expect(catalog.productCatalogState.status).toBe("loading");
    expect(catalog.productCatalogPresentation.value).toBe(confirmed);
    pending.resolve({ ...snapshot, revision: "two" });
    await refresh;
    mocks.catalog.mockRejectedValueOnce(new Error("offline"));
    await catalog.refreshProductCatalog(true);
    expect(catalog.productCatalogState.status).toBe("error");
    expect(catalog.productCatalogState.serverCanonical).toBe(false);
    expect(mocks.clear).toHaveBeenCalled();
    expect(catalog.productCatalogPresentation.value?.products).toEqual(snapshot.products);
    mocks.catalog.mockResolvedValueOnce({ ...snapshot, products: [], revision: "deleted" });
    await catalog.refreshProductCatalog(true);
    expect(catalog.productCatalogPresentation.value?.products).toEqual([]);
    catalog.prepareProductCatalog();
    expect(catalog.productCatalogPresentation.value).toBeNull();
  });

  it("presents a retired server product name under the current brand without changing its SKU", async () => {
    const legacyName = "Nexi" + "onBox Pro v2";
    const snapshot = { products: [{ id: "stellarbox-pro-v2", name: legacyName }], source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "brand" };
    mocks.catalog.mockResolvedValueOnce(snapshot);
    const catalog = await import("./product-catalog");

    await catalog.refreshProductCatalog(true);

    expect(catalog.productCatalogPresentation.value?.products[0]).toMatchObject({
      id: "stellarbox-pro-v2", name: "UVELBox Pro v2",
    });
    expect(mocks.replace).toHaveBeenCalledWith(snapshot.products);
    expect(snapshot.products[0].name).toBe(legacyName);
  });

  it("lets a forced refresh supersede an older request and ignores its late response", async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    mocks.catalog.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const catalog = await import("./product-catalog");

    const firstRequest = catalog.refreshProductCatalog(true);
    const secondRequest = catalog.refreshProductCatalog(true);

    expect(secondRequest).not.toBe(firstRequest);
    expect(mocks.catalog).toHaveBeenCalledTimes(2);

    second.resolve({ products: [{ id: "new", name: "New" }], source: "new", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "new" });
    await secondRequest;
    first.resolve({ products: [{ id: "old", name: "Old" }], source: "old", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "old" });
    await firstRequest;

    expect(catalog.productCatalogState.revision).toBe("new");
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("clears a same-account rebind and accepts only the replacement catalog", async () => {
    const beforeRebind = deferred<any>();
    const afterRebind = deferred<any>();
    mocks.catalog.mockReturnValueOnce(beforeRebind.promise).mockReturnValueOnce(afterRebind.promise);
    const catalog = await import("./product-catalog");

    const oldRequest = catalog.refreshProductCatalog(true);
    catalog.prepareProductCatalog();
    expect(catalog.productCatalogState.status).toBe("loading");
    const currentRequest = catalog.refreshProductCatalog(true);

    beforeRebind.resolve({ products: [{ id: "old", name: "Old" }], source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "old" });
    await oldRequest;
    expect(mocks.replace).not.toHaveBeenCalled();

    afterRebind.resolve({ products: [{ id: "current", name: "Current" }], source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "current" });
    await currentRequest;
    expect(catalog.productCatalogState.status).toBe("ready");
    expect(catalog.productCatalogState.revision).toBe("current");
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
});
