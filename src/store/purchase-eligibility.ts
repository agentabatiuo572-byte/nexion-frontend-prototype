import { computed, reactive, watch, type Ref } from "vue";
import { purchaseEligibilityApi, remoteApiEnabled } from "@/api/runtime";
import type { PurchaseEligibilitySnapshot } from "@/api/purchase-eligibility-api";
import { remoteAccountScope, type RemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";

export type PurchaseEligibilityStatus = "idle" | "loading" | "ready" | "error";

export interface PurchaseEligibilityState {
  status: PurchaseEligibilityStatus;
  eligible: boolean;
  snapshot: PurchaseEligibilitySnapshot | null;
  error: string;
}

interface PurchaseEligibilityApi {
  get(productNo: string): Promise<PurchaseEligibilitySnapshot>;
}

function normalizeProductNo(productNo: string): string {
  return productNo.trim();
}

function keyFor(accountKey: string, productNo: string): string {
  return `${accountKey}\u0000${productNo}`;
}

/**
 * Account-scoped remote eligibility cache. The cache is deliberately small and
 * in-memory: the server decision is refreshed by each account-bound UI surface,
 * while the request map prevents four product cards plus detail from issuing
 * the same request at once.
 */
export function createPurchaseEligibilityStore(
  api: PurchaseEligibilityApi,
  scope: RemoteAccountEpoch,
) {
  const entries = reactive(new Map<string, PurchaseEligibilityState>());
  const inFlight = new Map<string, Promise<boolean>>();

  function state(productNo: string): PurchaseEligibilityState {
    const normalized = normalizeProductNo(productNo);
    const key = keyFor(scope.accountKey(), normalized);
    let entry = entries.get(key);
    if (!entry) {
      entry = reactive({
        status: "idle",
        eligible: false,
        snapshot: null,
        error: "",
      }) as PurchaseEligibilityState;
      entries.set(key, entry);
    }
    return entry;
  }

  function ensure(productNo: string, force = false): Promise<boolean> {
    const normalized = normalizeProductNo(productNo);
    if (!normalized) return Promise.resolve(false);

    const requestScope: RemoteAccountRequest = scope.snapshot();
    const key = keyFor(requestScope.accountKey, normalized);
    const entry = state(normalized);
    if (!force && entry.status === "ready") return Promise.resolve(entry.eligible);
    const existing = inFlight.get(key);
    if (!force && existing) return existing;

    entry.status = "loading";
    entry.eligible = false;
    entry.snapshot = null;
    entry.error = "";
    const request = api.get(normalized)
      .then((snapshot) => {
        if (!scope.isCurrent(requestScope)) return false;
        entry.status = "ready";
        entry.snapshot = snapshot;
        entry.eligible = snapshot.eligible;
        entry.error = "";
        return snapshot.eligible;
      })
      .catch((error: unknown) => {
        if (!scope.isCurrent(requestScope)) return false;
        entry.status = "error";
        entry.eligible = false;
        entry.snapshot = null;
        entry.error = error instanceof Error ? error.message : "PURCHASE_ELIGIBILITY_UNAVAILABLE";
        return false;
      })
      .finally(() => {
        if (inFlight.get(key) === request) inFlight.delete(key);
      });
    inFlight.set(key, request);
    return request;
  }

  function clear(): void {
    entries.clear();
    inFlight.clear();
  }

  return { state, ensure, clear };
}

export const purchaseEligibilityStore = createPurchaseEligibilityStore(
  purchaseEligibilityApi,
  remoteAccountScope,
);

/**
 * UI adapter used by cards and detail. In mock mode it stays idle and never
 * triggers a request; callers continue to use their local demo gate there.
 */
export function useRemotePurchaseEligibility(
  productNo: Ref<string> | (() => string),
) {
  const product = computed(() => typeof productNo === "function" ? productNo() : productNo.value);
  const eligibility = computed(() => purchaseEligibilityStore.state(product.value));

  // `watch` is intentionally kept out of the store so a shared cache does not
  // acquire component lifecycle ownership. Vue's computed Map dependency also
  // makes account rebind/clear immediately visible to mounted pages.
  watch(product, (value) => {
    if (remoteApiEnabled && value) void purchaseEligibilityStore.ensure(value);
  }, { immediate: true });

  function retry(): Promise<boolean> {
    return purchaseEligibilityStore.ensure(product.value, true);
  }

  return { eligibility, retry };
}
