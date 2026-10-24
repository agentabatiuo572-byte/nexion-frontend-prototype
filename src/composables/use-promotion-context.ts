import { computed, watch, type Ref } from 'vue';
import { usePromotion } from '@/store/promotion';
export function usePromotionContext(activityId: Ref<string>) {
  const store = usePromotion();
  watch(activityId, () => store.refresh());
  const activity = computed(() => store.activities.find(item => item.activityId === activityId.value) ?? null);
  const status = computed(() => store.error ? 'error' as const : 'ready' as const);
  return { activity, status, available: computed(() => !!activity.value && activity.value.state === 'ACTIVE' && Date.now() < Date.parse(activity.value.endsAt)), refresh: store.refresh };
}
