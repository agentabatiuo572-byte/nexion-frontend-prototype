<!--
  Language picker (ported from Nexion-prototype/app/(main)/me/language/page.tsx).
  Groups locales by priority; active row shows a brand check badge. Tapping a row
  switches the app locale live. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" :title="t.language.pageTitle" />

      <view class="mx-4">
        <view style="display: flex; flex-direction: column; gap: 20px">
              <view :style="groupStyle">
                <view
                  v-for="(l, i) in LOCALES"
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
                    </view>
                    <text class="block truncate" :style="subStyle">{{ l.englishName }} · {{ l.region }}</text>
                  </view>
                  <view v-if="l.code === code" class="grid place-items-center shrink-0" :style="checkBadgeStyle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </view>
                </view>
              </view>
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
import { LOCALES, type LocaleCode } from "@/i18n";

const t = useT();
const locale = useLocaleStore();
const code = computed(() => locale.code);
const localeCount = LOCALES.length;

function pick(next: LocaleCode) {
  locale.setLocale(next);
}
function goAccount() {
  uni.navigateTo({ url: "/pages/me/me", fail: () => {} });
}

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
