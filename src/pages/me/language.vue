<!--
  Language picker (ported from Nexion-prototype/app/(main)/me/language/page.tsx).
  Groups locales by priority; active row shows a brand check badge. Tapping a row
  switches the app locale live. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" :title="t.language.pageTitle" />

      <text class="block mx-4" :style="introStyle">{{ t.language.intro }}</text>

      <view class="mx-4">
        <view style="display: flex; flex-direction: column; gap: 20px">
          <template v-for="p in priorities" :key="p">
            <view v-if="grouped[p].length > 0">
              <view class="flex items-center justify-between" :style="sectionHeadStyle">
                <text :style="sectionLabelStyle">{{ priorityLabels[p] }}</text>
                <text :style="priorityTagStyle">P{{ p }}</text>
              </view>
              <view :style="groupStyle">
                <view
                  v-for="(l, i) in grouped[p]"
                  :key="l.code"
                  :class="['flex items-center active:opacity-80', `nx-language-row-${l.code}`]"
                  :style="rowStyle(i !== 0, l.code === code)"
                  @click="pick(l.code)"
                >
                  <text :style="flagStyle">{{ l.flag }}</text>
                  <view class="min-w-0" style="flex: 1">
                    <view class="flex items-center" style="gap: 8px">
                      <text class="truncate" :style="nameStyle(l.code === code)">{{ l.nativeName }}</text>
                      <text class="shrink-0" :style="codeStyle">{{ l.code }}</text>
                      <text v-if="l.isRTL" class="shrink-0" :style="rtlBadgeStyle">RTL</text>
                    </view>
                    <text class="block truncate" :style="subStyle">{{ l.englishName }} · {{ l.region }}</text>
                  </view>
                  <view v-if="l.code === code" class="grid place-items-center shrink-0" :style="checkBadgeStyle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </view>
                </view>
              </view>
            </view>
          </template>
        </view>

        <text class="block text-center" :style="footStyle">{{ fmt(t.language.countLine, { n: localeCount }) }} · {{ t.language.autoDetect }}</text>

        <view class="flex items-center justify-center active:opacity-70 transition-opacity" :style="backLinkStyle" @click="goAccount">
          <text>{{ t.language.backToAccount }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useLocaleStore } from "@/store/locale";
import { LOCALES, PRIORITY_LABELS, localesByPriority, type LocaleCode } from "@/i18n";

const t = useT();
const locale = useLocaleStore();
const code = computed(() => locale.code);
const grouped = localesByPriority();
const priorities = [0, 1, 2, 3] as const;
const priorityLabels = PRIORITY_LABELS;
const localeCount = LOCALES.length;

function pick(next: LocaleCode) {
  locale.setLocale(next);
}
function goAccount() {
  uni.navigateTo({ url: "/pages/me/me", fail: () => {} });
}

// Intro caption — header already provides the 24px breathing (no top margin).
const introStyle: CSSProperties = {
  marginBottom: "14px",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.6,
};
// Section label (de-card spec): 15/600/ink tier heading + mono P-tag on the floor.
const sectionHeadStyle: CSSProperties = { padding: "0 2px 10px" };
const sectionLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
};
const priorityTagStyle: CSSProperties = { fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", color: "var(--v5-ink-4)" };
// Transparent hairline group — border-top opens the group, rows carry dividers
// (first row = no top border); the active row keeps its brand selection tint.
const groupStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
function rowStyle(divider: boolean, active: boolean): CSSProperties {
  return {
    gap: "12px",
    padding: "12px 0",
    borderTop: divider ? "1px solid var(--v5-border)" : "none",
    background: active ? "color-mix(in srgb, var(--v5-brand) 6%, transparent)" : "transparent",
  };
}
const flagStyle: CSSProperties = { fontSize: "20px", lineHeight: 1 };
function nameStyle(active: boolean): CSSProperties {
  return {
    fontSize: "13px",
    color: active ? "var(--v5-ink)" : "color-mix(in srgb, var(--v5-ink) 90%, transparent)",
    fontWeight: active ? 600 : 400,
  };
}
const codeStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)" };
const rtlBadgeStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-warning)",
  background: "color-mix(in srgb, var(--v5-warning) 10%, transparent)",
  borderRadius: "4px",
  padding: "1px 6px",
};
const subStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
const checkBadgeStyle: CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
};
const footStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)", marginTop: "20px" };
const backLinkStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-brand)",
  minHeight: "44px",
};
</script>
