<template>
  <view v-if="q" class="team-rule-faq">
    <view class="team-rule-faq__toggle" role="button" tabindex="0" :aria-expanded="expanded" :aria-controls="bodyId" @click="toggle" @keydown.enter.prevent="toggle" @keydown.space.prevent="toggle">
      <text class="team-rule-faq__q">{{ q }}</text>
      <svg class="team-rule-chevron" :class="{ 'is-open': expanded }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </view>
    <view v-if="expanded" :id="bodyId" class="team-rule-faq__a"><text>{{ a }}</text></view>
  </view>
  <view v-else-if="n !== undefined || item" class="team-rule-item">
    <text v-if="n !== undefined" class="team-rule-item__n" aria-hidden="true">{{ n }}</text>
    <view class="team-rule-item__copy">
      <view v-if="title || label || $slots.tag" class="team-rule-item__head"><text v-if="title || label" class="team-rule-item__title">{{ title || label }}</text><slot name="tag" /></view>
      <text v-if="body" class="team-rule-item__body" :class="{ 'team-rule-item__body--text': !(title || label) }">{{ body }}</text>
      <slot />
    </view>
  </view>
  <view v-else-if="tone" class="team-rule-note">
    <text v-if="title || label" class="team-rule-note__title">{{ title || label }}</text>
    <text v-if="body" class="team-rule-note__body">{{ body }}</text>
    <slot />
  </view>
  <view v-else-if="fold" class="team-rule-fold">
    <view class="team-rule-fold__toggle" role="button" tabindex="0" :aria-expanded="expanded" :aria-controls="bodyId" @click="toggle" @keydown.enter.prevent="toggle" @keydown.space.prevent="toggle">
      <text class="team-rule-fold__title">{{ title || label }}</text>
      <svg class="team-rule-chevron" :class="{ 'is-open': expanded }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </view>
    <view v-if="expanded" :id="bodyId" class="team-rule-fold__body"><slot /></view>
  </view>
  <view v-else :id="anchor ? `team-rule-${anchor}` : undefined" class="team-rule-section">
    <view v-if="title || label || lead" class="team-rule-section__heading">
      <text v-if="title || label" class="team-rule-section__title" role="heading" aria-level="2">{{ title || label }}</text>
      <text v-if="lead" class="team-rule-section__lead">{{ lead }}</text>
    </view>
    <view class="team-rule-section__card" :class="{ 'team-rule-section__card--list': list }">
      <text v-if="body" class="team-rule-section__copy">{{ body }}</text>
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from 'vue';
// One component, five roles (design system 04.7): q = FAQ row, n / item = numbered or plain item,
// tone = note, fold = collapsed full text, otherwise a section heading with its content card.
const props = withDefaults(defineProps<{
  title?: string; label?: string; body?: string; lead?: string; q?: string; a?: string; n?: number;
  tone?: string; item?: boolean; fold?: boolean; list?: boolean; anchor?: string; initialOpen?: boolean;
}>(), { initialOpen: false });
const open = ref(props.initialOpen);
const expanded = computed(() => open.value);
const bodyId = `team-rule-body-${getCurrentInstance()!.uid}`;
function toggle() { open.value = !open.value; }
</script>

<style src="./team-rule-type.css"></style>
<style scoped>
.team-rule-section { min-width: 0; margin: var(--ui-space-section-gap) 16px 0; scroll-margin-top: 72px; color: var(--v5-ink); }
.team-rule-section__heading { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; padding: 0 4px; }
.team-rule-section__title { color: var(--v5-ink); font: var(--ui-type-section-weight) var(--ui-type-section)/var(--ui-type-section-lh) var(--font-v5); letter-spacing: -.01em; text-wrap: balance; overflow-wrap: anywhere; }
.team-rule-section__title:lang(zh) { letter-spacing: 0; }
.team-rule-section__lead { color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); text-wrap: pretty; overflow-wrap: anywhere; }
.team-rule-section__card { padding: 16px; border-radius: var(--ui-radius-surface); background: var(--v5-surface); color: var(--v5-ink-2); font: var(--ui-type-guide-body-weight) var(--ui-type-guide-body)/var(--ui-type-guide-body-lh) var(--font-v5); white-space: pre-line; text-wrap: pretty; overflow-wrap: anywhere; }
/* flow-root keeps a closing note's margin inside the card instead of collapsing through it. */
.team-rule-section__card--list { padding: 0 16px; display: flow-root; }
.team-rule-section__card--list > .team-rule-note { margin-top: 0; }
.team-rule-section__card--list > .team-rule-note:last-child { margin-bottom: 16px; }
.team-rule-section__copy { display: block; }

.team-rule-item { display: flex; gap: 12px; padding: 16px 0; }
.team-rule-item + .team-rule-item { border-top: 1px solid var(--v5-border); }
.team-rule-item__n { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 999px; background: var(--v5-brand-soft); color: var(--v5-brand); font: 500 var(--ui-type-description)/1 var(--font-v5); }
.team-rule-item__copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.team-rule-item__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.team-rule-item__title { min-width: 0; color: var(--v5-ink); font: var(--ui-type-subheading-weight) var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5); overflow-wrap: anywhere; }
.team-rule-item__body { color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); white-space: pre-line; overflow-wrap: anywhere; }
.team-rule-item__body--text { color: var(--v5-ink-2); font: var(--ui-type-guide-body-weight) var(--ui-type-guide-body)/var(--ui-type-guide-body-lh) var(--font-v5); }

.team-rule-note { margin-top: 12px; padding: 12px 16px; border-radius: 12px; background: var(--v5-surface-2); }
.team-rule-note__title { display: block; color: var(--v5-ink); font: var(--ui-type-subheading-weight) var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5); overflow-wrap: anywhere; }
.team-rule-note__body { display: block; margin-top: 4px; color: var(--v5-ink-2); font: var(--ui-type-guide-body-weight) var(--ui-type-guide-body)/var(--ui-type-guide-body-lh) var(--font-v5); white-space: pre-line; overflow-wrap: anywhere; }

/* Inset line, not a border, so every row stays exactly 52px. */
.team-rule-faq + .team-rule-faq { box-shadow: inset 0 1px var(--v5-border); }
.team-rule-faq__toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; padding: 14px 0; box-sizing: border-box; cursor: pointer; }
.team-rule-faq__q { min-width: 0; color: var(--v5-ink); font: var(--ui-type-subheading-weight) var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5); overflow-wrap: anywhere; }
.team-rule-faq__a { padding: 0 28px 16px 0; color: var(--v5-ink-2); font: var(--ui-type-guide-body-weight) var(--ui-type-guide-body)/var(--ui-type-guide-body-lh) var(--font-v5); white-space: pre-line; overflow-wrap: anywhere; }

.team-rule-fold { margin: var(--ui-space-section-gap) 16px 0; border-radius: var(--ui-radius-surface); background: var(--v5-surface); }
.team-rule-fold__toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; padding: 0 16px; box-sizing: border-box; cursor: pointer; }
.team-rule-fold__title { min-width: 0; color: var(--v5-ink); font: 400 var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5); overflow-wrap: anywhere; }
.team-rule-fold__body { padding: 4px 16px 16px; border-top: 1px solid var(--v5-border); }

.team-rule-chevron { flex: none; color: var(--v5-ink-4); transition: transform 160ms ease-out; }
.team-rule-chevron.is-open { transform: rotate(180deg); color: var(--v5-brand); }
.team-rule-faq__toggle:focus-visible, .team-rule-fold__toggle:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) { .team-rule-chevron { transition: none; } }
</style>
