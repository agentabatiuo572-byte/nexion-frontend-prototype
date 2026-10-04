import { reactive, shallowRef, shallowReadonly } from "vue";
import type { ProductCatalogSnapshot } from "@/api/product-catalog-api";
import { productCatalogApi, remoteApiEnabled } from "@/api/runtime";
import { advanceRuntimeRevision } from "@/api/order-api";
import { clearProductCatalog, replaceProductCatalog } from "@/mock/products";
import { nexGridBrandText } from "@/lib/brand-copy";

// "mock" 变体已删:它曾是 mock 模式的初值,而全仓消费方只认 "ready" —— 留着这个变体
// 等于给「下次有人再把 mock 设成它」留了门。删掉后 tsc 会证明没有第二处在用。
export type ProductCatalogStatus = "loading" | "ready" | "error";

export const productCatalogState = reactive<{
  status: ProductCatalogStatus;
  error: string;
  source: string;
  sourceEnvironment: "PRODUCTION" | "";
  runId: "";
  serverCanonical: boolean;
  revision: string | null;
}>({
  // 🔴🔴 mock 模式下必须直接是 "ready",不能是一个只有这里用的 "mock" 状态值 ——
  //   全仓**每一个**消费方判的都是 `status === "ready"`(store.vue 的 catalogHasProducts /
  //   unlockedProducts、tradein-sheets 的守卫),而 refreshProductCatalog() 在
  //   !remoteApiEnabled 时直接 resolve、根本不改 status。于是 mock 下 status 永远停在
  //   "mock",商城主列表**永久不渲染**,页面钉死在「暂无可购设备」——
  //   而 CLAUDE.md 明写 verify 的合法靶必须是 mock 模式,等于原型里商城是空的。
  //   与创世那五处死代码同族:迁服务端权威时,mock 分支的取值没被下游认。
  //   mock 期的目录就是本地 PRODUCTS 常量,它本来就是 ready 的;来源仍由 source 标注。
  status: remoteApiEnabled ? "loading" : "ready",
  error: "",
  source: remoteApiEnabled ? "" : "mock/products",
  sourceEnvironment: "",
  runId: "",
  serverCanonical: false,
  revision: null,
});

let refreshInFlight: Promise<boolean> | null = null;
let catalogEpoch = 0;
// Display only. Purchase authority remains productCatalogState + a fresh
// eligibility response; a failed read still clears the compatibility catalog.
const presentation = shallowRef<ProductCatalogSnapshot | null>(null);
export const productCatalogPresentation = shallowReadonly(presentation);

export function prepareProductCatalog(): void {
  if (!remoteApiEnabled) return;
  // Catalog snapshots and Sandbox run ids are account-scoped. Bump the epoch
  // before clearing so a response started by the previous account can never
  // repopulate this account's store. Detach the old promise as well so the new
  // account can immediately start its own request.
  catalogEpoch += 1;
  refreshInFlight = null;
  presentation.value = null;
  clearProductCatalog();
  productCatalogState.status = "loading";
  productCatalogState.error = "";
  productCatalogState.source = "";
  productCatalogState.sourceEnvironment = "";
  productCatalogState.runId = "";
  productCatalogState.serverCanonical = false;
  productCatalogState.revision = null;
  advanceRuntimeRevision(null);
}

export function refreshProductCatalog(force = false): Promise<boolean> {
  if (!remoteApiEnabled) return Promise.resolve(true);
  if (!force && productCatalogState.status === "ready") return Promise.resolve(true);

  // A visible-page refresh is a newer observation, not merely another caller
  // waiting for an older request. Advance the epoch so its late success/failure
  // cannot overwrite the newer catalog snapshot.
  if (force) {
    catalogEpoch += 1;
    refreshInFlight = null;
  }
  if (refreshInFlight) return refreshInFlight;

  productCatalogState.status = "loading";
  productCatalogState.error = "";
  const requestEpoch = catalogEpoch;
  const request = productCatalogApi.catalog()
    .then((snapshot) => {
      if (requestEpoch !== catalogEpoch) return false;
      replaceProductCatalog(snapshot.products);
      presentation.value = {
        ...snapshot,
        products: snapshot.products.map((product) => ({ ...product, name: nexGridBrandText(product.name) })),
      };
      productCatalogState.status = "ready";
      productCatalogState.source = snapshot.source;
      productCatalogState.sourceEnvironment = snapshot.sourceEnvironment;
      productCatalogState.runId = snapshot.runId;
      productCatalogState.serverCanonical = snapshot.serverCanonical;
      productCatalogState.revision = snapshot.revision;
      advanceRuntimeRevision(null);
      return true;
    })
    .catch((error: unknown) => {
      if (requestEpoch !== catalogEpoch) return false;
      clearProductCatalog();
      productCatalogState.status = "error";
      productCatalogState.error = error instanceof Error ? error.message : "PRODUCT_CATALOG_UNAVAILABLE";
      productCatalogState.source = "";
      productCatalogState.sourceEnvironment = "";
      productCatalogState.runId = "";
      productCatalogState.serverCanonical = false;
      productCatalogState.revision = null;
      advanceRuntimeRevision(null);
      return false;
    })
    .finally(() => {
      if (refreshInFlight === request) refreshInFlight = null;
    });
  refreshInFlight = request;
  return request;
}
