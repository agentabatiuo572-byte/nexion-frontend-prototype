import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { promotionApi, remoteApiEnabled, sessionVault } from '@/api/runtime';
import type { PublicPromotion } from '@/api/promotion-contracts';
import { useApp } from '@/store/app';
import { useLocaleStore } from '@/store/locale';
import { canPreviewPromotion, createPromotionReadFence, isPromotionActive } from '@/lib/promotion-entry';

/** Shared by the existing catalog/detail/bundle surfaces; no qualification calculation. */
export function usePromotionContext(activityId: Ref<string>) {
  const app = useApp();
  const locale = useLocaleStore();
  const activity = ref<PublicPromotion | null>(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const fence = createPromotionReadFence();
  let visible = true;
  async function refresh() {
    const ticket = fence.next();
    const id = activityId.value;
    activity.value = null;
    if (!visible || !id) { status.value = 'idle'; return; }
    status.value = 'loading';
    if (!remoteApiEnabled) { status.value = 'error'; return; }
    const identity = `${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`;
    try {
      const result = await promotionApi.get(id, !!sessionVault.read());
      if (!visible || !fence.current(ticket) || id !== activityId.value || identity !== `${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`) return;
      activity.value = isPromotionActive(result) ? result : null;
      status.value = 'ready';
    } catch {
      if (visible && fence.current(ticket) && identity === `${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`) { activity.value = null; status.value = 'error'; }
    }
  }
  watch(activityId, () => { activity.value = null; void refresh(); });
  watch([() => app.accountKey, () => app.accountBindingEpoch, () => locale.code], () => {
    fence.invalidate(); activity.value = null; status.value = 'idle';
    if (visible) void refresh();
  });
  onMounted(() => { void refresh(); });
  onShow(() => { visible = true; void refresh(); });
  onHide(() => { visible = false; fence.invalidate(); activity.value = null; status.value = 'idle'; });
  onBeforeUnmount(() => { visible = false; fence.invalidate(); activity.value = null; });
  const available = computed(() => status.value === 'ready' && canPreviewPromotion(activity.value));
  return { activity, status, available, refresh };
}
