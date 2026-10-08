import type { PublicPromotion, PublicRewardSpec, RewardDisclosure } from '@/api/promotion-contracts';

export type EntryItem = { productNo: string; quantity: number };
export type EntrySelectionDraft = { items: EntryItem[]; entryItems?: EntryItem[] };
const capabilities = new Set(['PROMOTION_QUOTE_V1', 'ORDER_ITEM_QUANTITIES_V1', 'PROMOTION_REWARDS_V1']);

/** A display gate only. Checkout always obtains a fresh, authoritative quote. */
export function canPreviewPromotion(activity: PublicPromotion | null): boolean {
  return !!activity && activity.state === 'ACTIVE'
    && activity.minimumClientCapabilities.every(capability => capabilities.has(capability))
    && ['SIGN_IN_REQUIRED', 'ESTIMATE_ELIGIBLE'].includes(activity.eligibility);
}

export function productRewardSpecs(activity: PublicPromotion | null, productNo?: string): PublicRewardSpec[] {
  return (activity?.rewardRules ?? []).filter(rule => !productNo || rule.productNo === productNo)
    .flatMap(rule => rule.inviterReward ? [rule.buyerReward, rule.inviterReward] : [rule.buyerReward]);
}

export function promotionDisclosures(activity: PublicPromotion | null, productNo?: string): RewardDisclosure[] {
  return productRewardSpecs(activity, productNo).map(reward => reward.disclosure);
}

export function validEntryItems(items: EntryItem[], minimum = 1): boolean {
  return items.length >= minimum && items.length <= 8
    && new Set(items.map(item => item.productNo)).size === items.length
    && items.every(item => !!item.productNo && Number.isSafeInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 100)
    && items.reduce((total, item) => total + item.quantity, 0) <= 100;
}

export function promotionStoreHref(activityId?: string): string {
  return '/pages/store/store' + (activityId ? '?activityId=' + encodeURIComponent(activityId) : '?scope=all');
}

export function promotionDetailHref(productNo: string, activityId?: string): string {
  return '/pages/store/detail?id=' + encodeURIComponent(productNo)
    + (activityId ? '&activityId=' + encodeURIComponent(activityId) : '');
}

export function promotionCheckoutHref(items: EntryItem[], activityId?: string): string {
  if (!validEntryItems(items)) throw new Error('Invalid purchase selection');
  return '/pages/store/checkout?items=' + encodeURIComponent(JSON.stringify(items))
    + (activityId ? '&activityId=' + encodeURIComponent(activityId) : '');
}

export function promotionBundleHref(activityId?: string, items?: EntryItem[]): string {
  const query: string[] = [];
  if (activityId) query.push('activityId=' + encodeURIComponent(activityId));
  if (items?.length && validEntryItems(items)) query.push('items=' + encodeURIComponent(JSON.stringify(items)));
  return '/pages/store/bundle' + (query.length ? '?' + query.join('&') : '');
}

export function parseEntryItems(raw: string | null | undefined): EntryItem[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    const items = value.map(item => ({ productNo: item?.productNo, quantity: item?.quantity }));
    return validEntryItems(items) ? items : null;
  } catch { return null; }
}

/** Reopening the same entry resumes edits; a different explicit selection starts a new draft. */
export function restoreEntrySelection(initial: EntryItem[], saved: EntrySelectionDraft | null): EntryItem[] {
  const storedItems = Array.isArray(saved?.items) && saved?.items.length === 0 ? [] : parseEntryItems(JSON.stringify(saved?.items));
  const sameEntry = !initial.length || JSON.stringify(saved?.entryItems) === JSON.stringify(initial);
  const source = storedItems && sameEntry ? storedItems : initial;
  return source.map(item => ({ ...item }));
}

/** Invalidates hidden/account-old responses without relying on cancellation support. */
export function createPromotionReadFence() {
  let generation = 0;
  return { next: () => ++generation, current: (ticket: number) => ticket === generation, invalidate: () => { generation++; } };
}

/** Quote lifetime uses the server's duration and elapsed time, never the local date. */
export function isEntryQuoteFresh(expiresAt:string,serverTime:string,elapsedMs:number):boolean {
  const lifetime=Date.parse(expiresAt)-Date.parse(serverTime);
  return Number.isFinite(lifetime)&&lifetime>0&&elapsedMs>=0&&elapsedMs<lifetime;
}
