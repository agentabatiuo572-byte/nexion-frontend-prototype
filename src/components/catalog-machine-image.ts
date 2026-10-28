import { effectScope, onScopeDispose, ref, shallowRef, watch, type EffectScope } from 'vue';
import { useProductImage } from '@/composables/use-product-image';
import { productImageCacheKey } from '@/lib/product-image-cache';
import type { PublicPromotion } from '@/api/promotion-contracts';

export function promotionMachineSlots(activity: PublicPromotion) {
  const rule = activity.rewardRules[0];
  if (!rule) return [];
  const reward = rule.buyerReward;
  return [
    { role: 'purchase' as const, sku: rule.productNo },
    ...(reward?.type === 'DEVICE' ? [{ role: 'gift' as const, sku: reward.giftProductNo }] : []),
  ];
}

type Source = { identity: string; url?: string | null };
type Frame = { key: string; src: string; load: () => void; error: () => void };

/** Only the signed, immutable catalog endpoint can renew a URL for the same asset. */
export function catalogMachineImageIdentity(url?: string | null): string {
  if (!url) return '';
  const immutable = productImageCacheKey(url);
  if (!immutable) return url;
  const params = new URL(url).searchParams;
  let count = 0;
  params.forEach(() => { count++; });
  return count === 2 && params.getAll('signature').length === 1 && params.getAll('expires').length === 1
    ? immutable : url;
}

/** Each identity owns its native cache resolver and decoded-image events. */
export function useCatalogMachineImage(source: () => Source) {
  const frame = shallowRef<Frame | null>(null), ready = ref(false);
  let requestScope: EffectScope | undefined, generation = 0, alive = true, activeIdentity = '';
  const key = () => JSON.stringify([source().identity, catalogMachineImageIdentity(source().url)]);
  watch(() => JSON.stringify([source().identity, source().url || '']), () => {
    const identity = key();
    // A decoded immutable object needs no new native node when only its signature renews.
    if (identity === activeIdentity && ready.value && frame.value) return;
    activeIdentity = identity;
    const token = ++generation;
    requestScope?.stop();
    frame.value = null;
    ready.value = false;
    const url = source().url;
    if (!url) return;
    requestScope = effectScope();
    requestScope.run(() => {
      const image = useProductImage(() => url, () => source().url || undefined);
      let attempt = 0;
      watch(image.imageSrc, path => {
        const attemptToken = ++attempt;
        frame.value = null;
        ready.value = false;
        if (!path) return;
        let failed = false;
        const current = () => alive && token === generation && identity === activeIdentity && attemptToken === attempt;
        frame.value = {
          key: JSON.stringify([identity, token, attemptToken]), src: path,
          load() { if (current() && !failed) ready.value = true; },
          error() {
            if (!current() || failed) return;
            failed = true;
            ready.value = false;
            image.imageError();
          },
        };
      }, { immediate: true, flush: 'sync' });
    });
  }, { immediate: true, flush: 'sync' });
  onScopeDispose(() => { alive = false; generation++; requestScope?.stop(); });
  return { frame, ready };
}
