<template>
  <view v-if="open" class="cc-layer">
    <view class="cc-mask" @click="emit('close')" />
    <view class="cc-sheet" role="dialog" aria-modal="true" :aria-label="t.countryCodes.title" @click.stop @keydown.esc="emit('close')">
      <view class="cc-grab" />
      <view class="cc-head">
        <text class="cc-head__title">{{ t.countryCodes.title }}</text>
        <view ref="closeRef" class="cc-head__close active:opacity-70" role="button" tabindex="0" :aria-label="t.countryCodes.close" @click="emit('close')" @keydown="onCloseKeydown">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>
      <scroll-view class="cc-list" scroll-y :show-scrollbar="false" role="listbox" :aria-label="t.countryCodes.title">
        <view
          v-for="(item, index) in COUNTRIES"
          :key="item.code"
          ref="rowRefs"
          class="cc-row active:opacity-70"
          :class="{ 'cc-row--selected': item.code === modelValue }"
          role="option"
          tabindex="0"
          :aria-selected="item.code === modelValue"
          @click="select(item.code)"
          @keydown="onRowKeydown($event, item.code, index)"
        >
          <text class="cc-row__name">{{ item.name }}</text>
          <view class="cc-row__end">
            <text class="cc-row__code">{{ item.code }}</text>
            <view class="cc-row__check">
              <svg v-if="item.code === modelValue" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6" /></svg>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useT } from "@/i18n/use-t";

const props = defineProps<{ open: boolean; modelValue: string }>();
const emit = defineEmits<{ (e: "close"): void; (e: "select", code: string): void }>();
const t = useT();
type FocusableRef = { $el?: HTMLElement; focus?: () => void };
const closeRef = ref<FocusableRef | null>(null);
const rowRefs = ref<FocusableRef[]>([]);
let previousFocus: HTMLElement | null = null;

watch(() => props.open, (open) => {
  void nextTick(() => {
    if (open) {
      previousFocus = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      focusElement(closeRef.value);
      return;
    }
    previousFocus?.focus();
    previousFocus = null;
  });
});

function focusElement(target: FocusableRef | null | undefined) {
  const element = target?.$el ?? target;
  element?.focus?.();
}

function onCloseKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    emit("close");
  } else if (e.key === "Tab" && e.shiftKey) {
    e.preventDefault();
    focusElement(rowRefs.value[rowRefs.value.length - 1]);
  }
}

function onRowKeydown(e: KeyboardEvent, code: string, index: number) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    select(code);
  } else if (e.key === "Tab" && !e.shiftKey && index === COUNTRIES.value.length - 1) {
    e.preventDefault();
    focusElement(closeRef.value);
  }
}

const COUNTRIES = computed(() => [
  { code: "+1", name: t.value.countryCodes.usCanada }, { code: "+44", name: t.value.countryCodes.unitedKingdom }, { code: "+49", name: t.value.countryCodes.germany },
  { code: "+33", name: t.value.countryCodes.france }, { code: "+34", name: t.value.countryCodes.spain }, { code: "+84", name: t.value.countryCodes.vietnam }, { code: "+86", name: t.value.countryCodes.china }, { code: "+81", name: t.value.countryCodes.japan },
  { code: "+82", name: t.value.countryCodes.southKorea }, { code: "+55", name: t.value.countryCodes.brazil }, { code: "+62", name: t.value.countryCodes.indonesia },
  { code: "+63", name: t.value.countryCodes.philippines }, { code: "+66", name: t.value.countryCodes.thailand }, { code: "+971", name: t.value.countryCodes.uae }, { code: "+7", name: t.value.countryCodes.russia },
]);

function select(code: string) {
  emit("select", code);
  emit("close");
}
</script>

<style scoped>
.cc-mask { position: fixed; inset: 0; z-index: 9000; background: var(--v5-bg-color-mask); backdrop-filter: blur(3px); }
.cc-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9001; display: flex; flex-direction: column; max-height: min(74vh, 620px); background: var(--v5-surface); border-top: 1px solid var(--v5-border-strong); border-radius: 22px 22px 0 0; padding-bottom: calc(env(safe-area-inset-bottom) + 24px); animation: cc-up 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes cc-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.cc-grab { flex: 0 0 auto; width: 40px; height: 4px; margin: 10px auto 0; border-radius: 9999px; background: var(--v5-surface-3); }
.cc-head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 8px 16px 6px 20px; }
.cc-head__title { font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink); }
.cc-head__close { width: 44px; height: 44px; border-radius: 9999px; background: var(--v5-surface-2); display: flex; align-items: center; justify-content: center; }
.cc-list { flex: 1; min-height: 0; max-height: calc(min(74vh, 620px) - 68px); padding: 0 16px 12px; box-sizing: border-box; scrollbar-width: none; }
.cc-list::-webkit-scrollbar { display: none; width: 0; height: 0; }
.cc-row { min-height: 56px; padding: 0 14px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; }
.cc-row + .cc-row { border-top: 1px solid var(--v5-border); }
.cc-row--selected { background: color-mix(in srgb, var(--v5-brand) 10%, transparent); }
.cc-row--selected + .cc-row { border-top-color: transparent; }
.cc-row__name { font-size: 15px; font-weight: 500; color: var(--v5-ink-2); }
.cc-row__end { display: flex; align-items: center; gap: 10px; }
.cc-row__code { min-width: 42px; text-align: right; font-family: var(--font-v5); font-variant-numeric: tabular-nums; font-size: 13px; color: var(--v5-ink-3); }
.cc-row__check { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
</style>
