import { runPassiveTabRead, invalidateBeforePassiveTabRead } from "@/lib/passive-tab-read";
import { apiRuntimeConfig, promotionApi } from '@/api/runtime';
import { ApiError } from '@/api/errors';
import type { PublicPromotionPage } from '@/api/promotion-contracts';

// One first-page placement, shared by Home and the Store advert. No command uses it.
let current: { key: string; page: PublicPromotionPage | null; at: number; retryAt: number;
  error: unknown; pending: Promise<PublicPromotionPage> | null } | null = null;
export function readHomePromotions(scope: string, authenticated: boolean, force = false): Promise<PublicPromotionPage> {
  if (current?.key === JSON.stringify([apiRuntimeConfig.baseUrl, apiRuntimeConfig.environment, scope, authenticated]) && Date.now() < current.retryAt) return Promise.reject(current.error);
  if (!force) return runPassiveTabRead("home-promotions", () => readHomePromotions(scope, authenticated, true), [scope, authenticated]);
  invalidateBeforePassiveTabRead("home-promotions");
  const key = JSON.stringify([apiRuntimeConfig.baseUrl, apiRuntimeConfig.environment, scope, authenticated]);
  if (current?.key !== key) current = { key, page: null, at: 0, retryAt: 0, error: null, pending: null };
  const state = current;
  if (state.pending) return state.pending;
  if (Date.now() < state.retryAt) return Promise.reject(state.error);
  const request = promotionApi.list({ limit: 20, placement: 'home.purchase-promotion' }, authenticated)
    .then(page => { state.page = page; state.at = Date.now(); state.retryAt = 0; return page; })
    .catch(cause => {
      state.error = cause;
      if (cause instanceof ApiError && cause.status === 429) state.retryAt = Date.now() + (cause.retryAfterMs ?? 30_000);
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) state.page = null;
      throw cause;
    }).finally(() => { if (state.pending === request) state.pending = null; });
  state.pending = request;
  return request;
}
