<!--
  Language picker (ported from Nexion-prototype/app/(main)/me/language/page.tsx).
  Shows every shipped interface language in one list; active row shows a brand
  check badge. Tapping a row switches the app locale live.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" :title="t.language.pageTitle" />

      <text class="block mx-4" :style="introStyle">{{ t.language.intro }}</text>

      <view class="mx-4">
        <!-- 语言是互斥单选(选一个,其余取消)。原先 role="button" + aria-pressed 被浏览器
             当 toggle button,读屏按复选框朗读,用户以为能同时选多个(zentao #94)。
             改 radiogroup/radio + aria-checked + roving tabindex + 上下方向键。 -->
        <view :style="groupStyle" role="radiogroup" :aria-label="t.language.pageTitle">
          <view
            v-for="(l, i) in LOCALES"
            :key="l.code"
            :class="['flex items-center active:opacity-80', `nx-language-row-${l.code}`]"
            :style="rowStyle(i !== 0, l.code === code)"
            role="radio"
            :tabindex="l.code === code ? 0 : -1"
            :aria-checked="l.code === code ? 'true' : 'false'"
            @click="pick(l.code)"
            @keydown.enter.prevent="pick(l.code)"
            @keydown.space.prevent="pick(l.code)"
            @keydown.up.prevent="moveLocale(i, -1)"
            @keydown.down.prevent="moveLocale(i, 1)"
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

        <text class="block text-center" :style="footStyle">{{ fmt(t.language.countLine, { n: localeCount }) }}</text>
        <view v-if="profileLocaleSyncState === 'syncing'" class="text-center" :style="syncNoteStyle">
          <text>{{ t.language.preferenceSyncing }}</text>
        </view>
        <view v-else-if="profileLocaleSyncState === 'failed'" class="text-center active:opacity-70" :style="syncNoteStyle" role="button" tabindex="0" @click="retryCurrentProfileLocale" @keydown.enter.prevent="retryCurrentProfileLocale" @keydown.space.prevent="retryCurrentProfileLocale">
          <text>{{ t.language.preferenceSyncFailed }} · {{ t.language.preferenceSyncRetry }}</text>
        </view>

        <view class="flex items-center justify-center active:opacity-70 transition-opacity" :style="backLinkStyle" role="button" tabindex="0" @click="goAccount" @keydown.enter.prevent="goAccount" @keydown.space.prevent="goAccount">
          <text>{{ t.language.backToAccount }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, nextTick, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useLocaleStore } from "@/store/locale";
import { LOCALES, type LocaleCode } from "@/i18n";
import { profileLocaleSyncState, retryCurrentProfileLocale } from "@/lib/locale-profile-sync-runtime";

const t = useT();
const locale = useLocaleStore();
const code = computed(() => locale.code);
const localeCount = LOCALES.length;

function pick(next: LocaleCode) {
  locale.setLocale(next);
}
/** 单选组的上下方向键:移一格并选上,焦点跟到新选中项(zentao #94,与 earn.vue moveRange 同形)。 */
function moveLocale(index: number, delta: number): void {
  const next = LOCALES[(index + delta + LOCALES.length) % LOCALES.length];
  if (!next) return;
  locale.setLocale(next.code);
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('.nx-language-row-' + next.code)?.focus();
  });
}
function goAccount() {
  navTo("/pages/me/me");
}

// Intro caption — header already provides the 24px breathing (no top margin).
const introStyle: CSSProperties = {
  marginBottom: "14px",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.6,
};
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
const syncNoteStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-warning)", marginTop: "8px", minHeight: "32px", display: "grid", placeItems: "center" };
const backLinkStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-brand)",
  minHeight: "44px",
};
</script>
