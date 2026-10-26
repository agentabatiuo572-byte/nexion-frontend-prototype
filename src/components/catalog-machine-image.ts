import { effectScope, onScopeDispose, ref, shallowRef, watch, type EffectScope } from 'vue';
import { useProductImage } from '@/composables/use-product-image';
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

/** Each identity owns its native cache resolver and decoded-image events. */
export function useCatalogMachineImage(source: () => Source) {
  const frame = shallowRef<Frame | null>(null), ready = ref(false);
  let requestScope: EffectScope | undefined, generation = 0, alive = true;
  const key = () => JSON.stringify([source().identity, source().url || '']);
  watch(key, identity => {
    const token = ++generation;
    requestScope?.stop();
    frame.value = null;
    ready.value = false;
    const url = source().url;
    if (!url) return;
    requestScope = effectScope();
    requestScope.run(() => {
      const image = useProductImage(() => url);
      let attempt = 0;
      watch(image.imageSrc, path => {
        const attemptToken = ++attempt;
        frame.value = null;
        ready.value = false;
        if (!path) return;
        let failed = false;
        const current = () => alive && token === generation && identity === key() && attemptToken === attempt;
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
