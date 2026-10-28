<template>
  <view class="team-rule-section" :class="{ 'team-rule-section--chapter': !!$slots.default, 'team-rule-section--note': !!tone, 'team-rule-section--open': expanded }">
    <view v-if="collapsible" class="team-rule-section__toggle" role="button" tabindex="0" :aria-expanded="expanded" :aria-controls="bodyId" @click="toggle" @keydown.enter.prevent="toggle" @keydown.space.prevent="toggle">
      <text class="team-rule-section__title">{{ q || title || label }}</text>
      <svg class="team-rule-section__chevron" :class="{ 'is-open': expanded }" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </view>
    <view v-else-if="title || label" class="team-rule-section__heading">
      <text v-if="n !== undefined" class="team-rule-section__step">{{ n }}</text>
      <text class="team-rule-section__title">{{ title || label }}</text>
    </view>
    <view v-if="!collapsible || expanded" :id="bodyId" class="team-rule-section__body">
      <text v-if="a || body" class="team-rule-section__copy">{{ a || body }}</text>
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, useSlots } from 'vue';
const props = withDefaults(defineProps<{
  title?: string; label?: string; body?: string; q?: string; a?: string; n?: number;
  accent?: string; tone?: string; initialOpen?: boolean; open?: boolean;
}>(), { initialOpen: false, open: undefined });
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const slots = useSlots();
const localOpen = ref(props.initialOpen);
const expanded = computed(() => props.open ?? localOpen.value);
const collapsible = computed(() => !!props.q || !!slots.default);
const bodyId = `team-rule-body-${getCurrentInstance()!.uid}`;
function toggle() {
  localOpen.value = !expanded.value;
  emit('update:open', localOpen.value);
}
</script>

<style src="./team-rule-type.css"></style>
<style scoped>
.team-rule-section { min-width: 0; padding: 12px 0; color: var(--v5-ink); }
.team-rule-section--chapter { margin: 0 16px; padding: 0; border-bottom: 1px solid var(--v5-border); }
.team-rule-section__toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 12px 0; box-sizing: border-box; cursor: pointer; }
.team-rule-section__toggle:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; border-radius: 4px; }
.team-rule-section__title { min-width: 0; color: var(--v5-ink); font-size: var(--team-guide-heading); line-height: var(--team-guide-heading-lh); font-weight: 600; text-wrap: balance; overflow-wrap: anywhere; }
.team-rule-section__heading { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
.team-rule-section__step { flex-shrink: 0; color: var(--v5-brand); font-variant-numeric: tabular-nums; }
.team-rule-section__chevron { flex: 0 0 18px; color: var(--v5-ink-3); transition: transform 160ms ease-out; }
.team-rule-section__chevron.is-open { transform: rotate(180deg); color: var(--v5-brand); }
.team-rule-section__body { padding-bottom: 16px; color: var(--v5-ink-2); font-size: var(--team-guide-body); line-height: var(--team-guide-body-lh); white-space: pre-line; text-wrap: pretty; overflow-wrap: anywhere; }
.team-rule-section__copy { display: block; }
.team-rule-section--note { padding: 16px; margin-top: 16px; background: var(--v5-surface); border-radius: 12px; }
.team-rule-section--chapter .team-rule-section--chapter { margin-inline: 0; }
@media (prefers-reduced-motion: reduce) { .team-rule-section__chevron { transition: none; } }
</style>
