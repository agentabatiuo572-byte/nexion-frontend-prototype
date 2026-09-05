import { reactive } from "vue";
import { productCatalogApi, remoteApiEnabled } from "@/api/runtime";
import { setCurrentCommerceSandboxRun } from "@/api/order-api";
import { clearProductCatalog, replaceProductCatalog } from "@/mock/products";

// "mock" 变体已删:它曾是 mock 模式的初值,而全仓消费方只认 "ready" —— 留着这个变体
// 等于给「下次有人再把 mock 设成它」留了门。删掉后 tsc 会证明没有第二处在用。
export type ProductCatalogStatus = "loading" | "ready" | "error";

export const productCatalogState = reactive<{
  status: ProductCatalogStatus;
  error: string;
  source: string;
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
  revision: null,
});

let refreshInFlight: Promise<boolean> | null = null;
let catalogEpoch = 0;

export function prepareProductCatalog(): void {
  if (!remoteApiEnabled) return;
  // Catalog snapshots and Sandbox run ids are account-scoped. Bump the epoch
  // before clearing so a response started by the previous account can never
  // repopulate this account's store. Detach the old promise as well so the new
  // account can immediately start its own request.
  catalogEpoch += 1;
  refreshInFlight = null;
  clearProductCatalog();
  productCatalogState.status = "loading";
  productCatalogState.error = "";
  productCatalogState.source = "";
  productCatalogState.revision = null;
  setCurrentCommerceSandboxRun(null);
}

export function refreshProductCatalog(force = false): Promise<boolean> {
  if (!remoteApiEnabled) return Promise.resolve(true);
  if (!force && productCatalogState.status === "ready") return Promise.resolve(true);
  if (refreshInFlight) return refreshInFlight;

  productCatalogState.status = "loading";
  productCatalogState.error = "";
  const requestEpoch = catalogEpoch;
  const request = productCatalogApi.catalog()
    .then((snapshot) => {
      if (requestEpoch !== catalogEpoch) return false;
      replaceProductCatalog(snapshot.products);
      productCatalogState.status = "ready";
      productCatalogState.source = snapshot.source;
      productCatalogState.revision = snapshot.revision;
      setCurrentCommerceSandboxRun(snapshot.sourceEnvironment === "SANDBOX" ? snapshot.runId ?? null : null);
      return true;
    })
    .catch((error: unknown) => {
      if (requestEpoch !== catalogEpoch) return false;
      clearProductCatalog();
      productCatalogState.status = "error";
      productCatalogState.error = error instanceof Error ? error.message : "PRODUCT_CATALOG_UNAVAILABLE";
      productCatalogState.source = "";
      productCatalogState.revision = null;
      setCurrentCommerceSandboxRun(null);
      return false;
    })
    .finally(() => {
      if (refreshInFlight === request) refreshInFlight = null;
    });
  refreshInFlight = request;
  return request;
}
