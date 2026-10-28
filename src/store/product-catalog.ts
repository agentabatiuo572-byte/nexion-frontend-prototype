import { runPassiveTabRead, invalidatePassiveTabRead, invalidateBeforePassiveTabRead, rememberPassiveTabRead } from "@/lib/passive-tab-read";
import { reactive, shallowRef, shallowReadonly, watch } from "vue";
import type { ProductCatalogSnapshot } from "@/api/product-catalog-api";
import { productCatalogApi, remoteApiEnabled, apiRuntimeConfig } from "@/api/runtime";
import { advanceRuntimeRevision, captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";
import { clearProductCatalog, replaceProductCatalog } from "@/mock/products";
import { ApiError } from "@/api/errors";

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

let retryAt = 0;
let publishedCatalogSignature: string | null = null;
// Display only. Purchase authority remains productCatalogState + a fresh
// eligibility response; a failed read still clears the compatibility catalog.
const presentation = shallowRef<ProductCatalogSnapshot | null>(null);
export const productCatalogPresentation = shallowReadonly(presentation);

/** Read context only; never purchase, quote, stock or eligibility authority. */
export interface ProductCatalogDisplayProof {
  readonly sourceEnvironment: "PRODUCTION";
  readonly runId: "";
  readonly revision: string | null;
  readonly bindingEpoch: number;
  readonly runtimeEpoch: number;
}
const displayProof = shallowRef<ProductCatalogDisplayProof | null>(null);
export const productCatalogDisplayProof = shallowReadonly(displayProof);
let publishing: RuntimeRevisionScope | null = null;

export function isProductCatalogDisplayCurrent(scope = captureRuntimeRevision()): boolean {
  const proof = displayProof.value;
  return isCurrentRuntimeRevision(scope) && proof !== null && proof.bindingEpoch === catalogBindingEpoch
    && proof.runtimeEpoch === scope.epoch;
}
let catalogBindingEpoch = 0;
subscribeRuntimeRevision((scope: RuntimeRevisionScope) => {
  // Object identity identifies our actual notification, never an expected epoch.
  if (publishing === scope && isCurrentRuntimeRevision(scope)) return;
  invalidatePassiveTabRead("product-catalog");
  publishedCatalogSignature = null;
  displayProof.value = null;

  productCatalogState.serverCanonical = false;
  productCatalogState.status = "loading";
  clearProductCatalog();
});
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl], () => {
  prepareProductCatalog();
}, { flush: "sync" });

function publishCatalogRuntime(): boolean {
  let published: RuntimeRevisionScope | null = null;
  try {
    advanceRuntimeRevision(null, scope => {
      publishing = published = scope;
      if (displayProof.value) displayProof.value = { ...displayProof.value, runtimeEpoch: scope.epoch };
    });
    return published !== null && isCurrentRuntimeRevision(published);
  } finally { publishing = null; }
}
function transientCatalogRead(error: unknown): boolean {
  return error instanceof ApiError && error.status !== 401 && error.status !== 403
    && error.code !== 401 && error.code !== 403
    && (error.kind === "network" || (error.kind === "http"
      && (error.status === 429 || (error.status !== undefined && error.status >= 500 && error.status <= 599))));
}


export function prepareProductCatalog(): void {
  if (!remoteApiEnabled) return;
  // Catalog snapshots and Sandbox run ids are account-scoped. Bump the epoch
  // before clearing so a response started by the previous account can never
  // repopulate this account's store. Detach the old promise as well so the new
  // account can immediately start its own request.
  catalogEpoch += 1;
  publishedCatalogSignature = null;

  retryAt = 0;
  refreshInFlight = null;
  presentation.value = null;
  displayProof.value = null;
  catalogBindingEpoch += 1;
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

/** Ordinary tab visits share a current read and reuse a recent confirmed read. */
export function revalidateProductCatalog(): Promise<boolean> {
  if (Date.now() < retryAt) return Promise.resolve(false);
  if (!remoteApiEnabled) return Promise.resolve(true);
  return runPassiveTabRead("product-catalog", () => refreshInFlight ?? refreshProductCatalog(true), [catalogBindingEpoch]);
}

export function refreshProductCatalog(force = false): Promise<boolean> {
  if (force) invalidateBeforePassiveTabRead("product-catalog");
  if (!remoteApiEnabled) return Promise.resolve(true);
  // A fresh read is unavailable until the server's retry deadline, even for commands.
  if (Date.now() < retryAt) return Promise.resolve(false);
  if (!force && productCatalogState.status === "ready") return Promise.resolve(true);

  // A visible-page refresh is a newer observation, not merely another caller
  // waiting for an older request. Advance the epoch so its late success/failure
  // cannot overwrite the newer catalog snapshot.
  if (force) {
    catalogEpoch += 1;
    refreshInFlight = null;
  }
  if (refreshInFlight) return refreshInFlight;

  const requestEpoch = catalogEpoch;
  const requestRuntime = captureRuntimeRevision();
  const requestBinding = catalogBindingEpoch;
  const current = () => requestEpoch === catalogEpoch && requestBinding === catalogBindingEpoch && isCurrentRuntimeRevision(requestRuntime);
  productCatalogState.status = "loading";
  if (!current()) return Promise.resolve(false);
  productCatalogState.error = "";
  if (!current()) return Promise.resolve(false);
  const request = productCatalogApi.catalog()
    .then((snapshot) => {
      if (!current()) return false;
      replaceProductCatalog(snapshot.products);
      if (!current()) return false;
      presentation.value = {
        ...snapshot,
        products: snapshot.products,
      };
      if (!current()) return false;
      displayProof.value = snapshot.serverCanonical === true && snapshot.sourceEnvironment === "PRODUCTION" && snapshot.runId === ""
        ? { sourceEnvironment: "PRODUCTION", runId: "", revision: snapshot.revision, bindingEpoch: requestBinding, runtimeEpoch: requestRuntime.epoch }
        : null;
      if (!current()) return false;
      productCatalogState.source = snapshot.source;
      if (!current()) return false;
      productCatalogState.sourceEnvironment = snapshot.sourceEnvironment;
      if (!current()) return false;
      productCatalogState.runId = snapshot.runId;
      if (!current()) return false;
      productCatalogState.serverCanonical = snapshot.serverCanonical;
      if (!current()) return false;
      productCatalogState.revision = snapshot.revision;
      if (!current()) return false;
      productCatalogState.status = "ready";
      if (!current()) return false;

      retryAt = 0;
      const signature = JSON.stringify(snapshot);
      // An identical directory read is an observation, not a business revision.
      const published = signature === publishedCatalogSignature || publishCatalogRuntime();
      if (published) publishedCatalogSignature = signature;
      return published && requestEpoch === catalogEpoch && requestBinding === catalogBindingEpoch;
    })
    .catch((error: unknown) => {
      if (!current()) return false;
      if (transientCatalogRead(error) && error instanceof ApiError && error.kind === "http" && error.status === 429) retryAt = Date.now() + (error.retryAfterMs ?? 30_000);
      if (!transientCatalogRead(error)) displayProof.value = null;
      if (!current()) return false;
      if (error instanceof ApiError && (error.kind === "auth" || error.status === 401 || error.status === 403 || error.code === 401 || error.code === 403)) presentation.value = null;
      if (!current()) return false;
      clearProductCatalog();
      if (!current()) return false;
      productCatalogState.status = "error";
      if (!current()) return false;
      productCatalogState.error = error instanceof Error ? error.message : "PRODUCT_CATALOG_UNAVAILABLE";
      if (!current()) return false;
      productCatalogState.source = "";
      if (!current()) return false;
      productCatalogState.sourceEnvironment = "";
      if (!current()) return false;
      productCatalogState.runId = "";
      if (!current()) return false;
      productCatalogState.serverCanonical = false;
      if (!current()) return false;
      productCatalogState.revision = null;
      if (!current()) return false;
      publishedCatalogSignature = null;
      publishCatalogRuntime();
      return false;
    })
    .finally(() => {
      if (refreshInFlight === request) refreshInFlight = null;
    });
  rememberPassiveTabRead("product-catalog", request, [requestBinding]);
  refreshInFlight = request;
  return request;
}
