<template>
  <view v-if="open" class="cc-layer">
    <view class="cc-mask" @click="emit('close')" />
    <view class="nx-glass-sheet cc-sheet" role="dialog" aria-modal="true" :aria-label="t.countryCodes.title" @click.stop @keydown.esc="emit('close')">
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
          class="cc-row"
          :class="{ 'cc-row--selected': item.code === modelValue, 'cc-row--disabled': !item.selectable }"
          role="option"
          :tabindex="item.selectable ? 0 : -1"
          :aria-selected="item.code === modelValue"
          :aria-disabled="!item.selectable"
          @click="select(item)"
          @keydown="onRowKeydown($event, item, index)"
        >
          <view class="cc-row__identity">
            <text class="cc-row__iso">{{ item.iso }}</text>
            <text class="cc-row__name">{{ item.name }}</text>
          </view>
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
import { PHONE_COUNTRIES, type PhoneCountryProfile } from "@/auth/phone-number";

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
    focusElement(rowRefs.value[lastSelectableIndex.value]);
  }
}

function onRowKeydown(e: KeyboardEvent, item: CountryRow, index: number) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    select(item);
  } else if (e.key === "Tab" && !e.shiftKey && index === lastSelectableIndex.value) {
    e.preventDefault();
    focusElement(closeRef.value);
  }
}

function countryName(iso: PhoneCountryProfile["iso"]): string {
  switch (iso) {
    case "VN": return t.value.countryCodes.vietnam;
    case "US": return t.value.countryCodes.usCanada;
    case "GB": return t.value.countryCodes.unitedKingdom;
    case "DE": return t.value.countryCodes.germany;
    case "FR": return t.value.countryCodes.france;
    case "ES": return t.value.countryCodes.spain;
    case "CN": return t.value.countryCodes.china;
    case "JP": return t.value.countryCodes.japan;
    case "KR": return t.value.countryCodes.southKorea;
    case "BR": return t.value.countryCodes.brazil;
    case "ID": return t.value.countryCodes.indonesia;
    case "PH": return t.value.countryCodes.philippines;
    case "TH": return t.value.countryCodes.thailand;
    case "AE": return t.value.countryCodes.uae;
    case "RU": return t.value.countryCodes.russia;
    case "SA": return t.value.countryCodes.saudiArabia;
  }
}

type CountryRow = { iso: PhoneCountryProfile["iso"]; code: string; name: string; selectable: boolean };

const COUNTRIES = computed<CountryRow[]>(() => PHONE_COUNTRIES.map((item) => ({
  iso: item.iso,
  code: item.dialCode,
  name: countryName(item.iso),
  selectable: item.selectable,
})));
const lastSelectableIndex = computed(() => COUNTRIES.value.reduce(
  (last, item, index) => item.selectable ? index : last,
  -1,
));

function select(item: CountryRow) {
  if (!item.selectable) return;
  emit("select", item.code);
  emit("close");
}


</script>

<style scoped>
.cc-mask { position: fixed; inset: 0; z-index: 9000; background: var(--v5-bg-color-mask); backdrop-filter: blur(3px); }
.cc-sheet { border-radius: var(--nx-glass-radius) var(--nx-glass-radius) 0 0; box-shadow: var(--nx-glass-edge); position: fixed; left: 0; right: 0; bottom: 0; z-index: 9001; display: flex; flex-direction: column; max-height: min(74vh, 620px); background: var(--nx-glass-fill); border: none;  padding-bottom: calc(env(safe-area-inset-bottom) + 24px); animation: cc-up 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes cc-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.cc-grab { flex: 0 0 auto; width: 40px; height: 4px; margin: 10px auto 0; border-radius: 9999px; background: var(--v5-surface-3); }
.cc-head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 8px 16px 6px 20px; }
.cc-head__title { font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink); }
.cc-head__close { width: 44px; height: 44px; border-radius: 9999px; background: var(--v5-surface-2); display: flex; align-items: center; justify-content: center; }
.cc-list { flex: 1; min-height: 0; max-height: calc(min(74vh, 620px) - 68px); padding: 0 16px 12px; box-sizing: border-box; scrollbar-width: none; }
.cc-list::-webkit-scrollbar { display: none; width: 0; height: 0; }
.cc-row { min-height: 56px; padding: 0 14px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; }
.cc-row:not(.cc-row--disabled):active { opacity: 0.7; }
.cc-row + .cc-row { border-top: 1px solid var(--v5-border); }
.cc-row--selected { background: color-mix(in srgb, var(--v5-brand) 10%, transparent); }
.cc-row--selected + .cc-row { border-top-color: transparent; }
.cc-row--disabled { cursor: not-allowed; opacity: 0.38; }
.cc-row__identity { min-width: 0; display: flex; align-items: center; gap: 10px; }
.cc-row__iso { flex: 0 0 30px; height: 24px; border-radius: 7px; background: var(--v5-surface-2); display: inline-flex; align-items: center; justify-content: center; font-family: var(--font-v5); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: var(--v5-ink-3); }
.cc-row__name { font-size: 15px; font-weight: 500; color: var(--v5-ink-2); }
.cc-row__end { display: flex; align-items: center; gap: 10px; }
.cc-row__code { min-width: 42px; text-align: right; font-family: var(--font-v5); font-variant-numeric: tabular-nums; font-size: 13px; color: var(--v5-ink-3); }
.cc-row__check { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
</style>
