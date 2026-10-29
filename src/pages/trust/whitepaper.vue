<template>
  <AppChassis active="me">
    <CardStagger class="wp-root" style="padding-bottom: 24px">
      <SubPageHeader back="/pages/trust/trust" plain solid />

      <view class="px-4 wp-page">
        <view class="wp-cover">
          <view class="wp-cover__top">
            <text class="wp-cover__eyebrow">UVEL WHITEPAPER</text>
            <text v-if="whitepaper?.version" class="wp-cover__version">{{ whitepaper.version }}</text>
          </view>
          <view>
            <text class="block wp-cover__headline">{{ copy.wpHeadline }}</text>
            <text class="block wp-cover__tagline">{{ copy.wpTagline }}</text>
          </view>
          <view v-if="whitepaper" class="wp-cover__facts">
            <view v-for="fact in facts" :key="fact.label" class="wp-cover__fact">
              <text class="block wp-cover__fact-label">{{ fact.label }}</text>
              <text class="block wp-cover__fact-value">{{ fact.value }}</text>
            </view>
          </view>
          <text v-if="!whitepaper && status !== 'error'" class="wp-cover__state" role="status" aria-live="polite">{{ copy.wpLoading }}</text>
          <view v-else-if="!whitepaper" class="wp-cover__state" role="alert">
            <text class="block">{{ copy.wpError }}</text>
            <view class="wp-cover__cta wp-cover__cta--small" role="button" tabindex="0" @click="refresh"><text>{{ t.ui.retry }}</text></view>
          </view>
          <view v-else class="wp-cover__cta" role="button" tabindex="0" @click="read">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            <text>{{ copy.readWhitepaper }}</text>
          </view>
        </view>

        <view class="wp-block">
          <text class="wp-block__title">{{ copy.wpTopicsTitle }}</text>
          <view class="wp-topics">
            <view v-for="(topic, index) in copy.wpTopics" :key="topic[0]" class="wp-topic">
              <text class="wp-topic__index">{{ index + 1 }}</text>
              <view class="min-w-0" style="flex: 1">
                <text class="block wp-topic__title">{{ topic[0] }}</text>
                <text class="block wp-topic__body">{{ topic[1] }}</text>
              </view>
            </view>
          </view>
        </view>

        <view v-if="profile" class="wp-publisher">
          <view class="wp-publisher__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/></svg>
          </view>
          <view class="min-w-0" style="flex: 1">
            <text class="block wp-topic__title">{{ fmt(copy.wpPublisher, { name: profile.legalName }) }}</text>
            <text class="block wp-topic__body">{{ fmt(copy.wpPublisherMeta, { id: profile.nyDosId }) }}</text>
          </view>
          <view class="wp-publisher__link" role="link" tabindex="0" @click="navBack('/pages/trust/trust')">
            <text>{{ copy.wpViewRegistrations }}</text>
          </view>
        </view>

        <text class="block wp-footnote">{{ copy.wpFootnote }}</text>
      </view>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import CardStagger from "@/components/card-stagger.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { trustCenterCopy } from "@/i18n/trust-center";
import { useLocaleStore } from "@/store/locale";
import { navBack, navTo } from "@/lib/route";
import { useTrustDocuments } from "@/composables/use-trust-documents";

const t = useT();
const locale = useLocaleStore();
const copy = computed(() => trustCenterCopy(locale.code));
const { documents, status, refresh } = useTrustDocuments();
const whitepaper = computed(() => documents.value?.documents.whitepaper ?? null);
const profile = computed(() => documents.value?.profile ?? null);
const facts = computed(() => {
  const value = whitepaper.value;
  if (!value) return [];
  const size = value.sizeBytes >= 1024 * 1024 ? `${(value.sizeBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value.sizeBytes / 1024))} KB`;
  return [
    { label: copy.value.wpLanguage, value: value.language ?? "—" },
    { label: copy.value.wpSize, value: size },
    { label: copy.value.wpFormat, value: "PDF" },
  ];
});

function read() {
  navTo("/pages/trust/document?slot=whitepaper");
}

onShow(() => { void refresh(); });
</script>

<style scoped>
.wp-page { display: flex; flex-direction: column; gap: var(--v5-space-6); }
.wp-cover { display: flex; flex-direction: column; gap: var(--v5-space-5); padding: var(--v5-space-6) var(--v5-space-5); border-radius: var(--v5-radius-2xl); background: var(--v5-brand); color: var(--v5-on-brand); }
.wp-cover__top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--v5-space-3); }
.wp-cover__eyebrow { font: 600 12px/16px var(--font-v5); letter-spacing: .6px; opacity: .9; }
.wp-cover__version { display: inline-flex; align-items: center; min-height: 24px; padding: 0 10px; border-radius: var(--v5-radius-full); background: color-mix(in srgb, var(--v5-on-brand) 18%, transparent); font: 600 12px/16px var(--font-v5); font-variant-numeric: tabular-nums; }
.wp-cover__headline { font: 700 26px/34px var(--font-v5); }
.wp-cover__tagline { margin-top: var(--v5-space-2); font: 400 15px/22px var(--font-v5); opacity: .92; }
.wp-cover__facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--v5-space-2); }
.wp-cover__fact { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wp-cover__fact-label { font: 400 12px/16px var(--font-v5); opacity: .8; }
.wp-cover__fact-value { font: 600 15px/20px var(--font-v5); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.wp-cover__state { display: flex; flex-direction: column; align-items: flex-start; gap: var(--v5-space-3); font: 400 13px/18px var(--font-v5); }
/* On the brand cover the action inverts: on-brand fill with brand text keeps contrast in both themes. */
.wp-cover__cta { display: flex; align-items: center; justify-content: center; gap: var(--v5-space-2); min-height: 48px; padding: 0 var(--v5-space-5); border-radius: var(--v5-radius-full); background: var(--v5-on-brand); color: var(--v5-brand); font: 700 15px/20px var(--font-v5); cursor: pointer; }
.wp-cover__cta--small { min-height: 44px; font-size: 13px; }
.wp-cover__cta:active { opacity: .85; }
.wp-cover__cta:focus-visible { outline: 2px solid var(--v5-on-brand); outline-offset: 2px; }
.wp-block { display: flex; flex-direction: column; gap: var(--v5-space-3); }
.wp-block__title { font: 700 15px/20px var(--font-v5); color: var(--v5-ink); }
.wp-topics { padding: var(--v5-space-1) var(--v5-space-4); border-radius: var(--v5-radius-l); background: var(--v5-surface); }
.wp-topic { display: flex; gap: var(--v5-space-3); padding: 14px 0; }
.wp-topic + .wp-topic { border-top: 1px solid var(--v5-border); }
.wp-topic__index { width: 28px; height: 28px; flex-shrink: 0; display: grid; place-items: center; border-radius: var(--v5-radius-full); background: var(--v5-brand-soft); color: var(--v5-brand-deep); font: 700 13px/18px var(--font-v5); font-variant-numeric: tabular-nums; }
.wp-topic__title { font: 600 15px/20px var(--font-v5); color: var(--v5-ink); }
.wp-topic__body { margin-top: 2px; font: 400 13px/18px var(--font-v5); color: var(--v5-ink-3); }
.wp-publisher { display: flex; align-items: center; gap: var(--v5-space-3); padding: var(--v5-space-4); border-radius: var(--v5-radius-l); background: var(--v5-surface); }
.wp-publisher__icon { width: 40px; height: 40px; flex-shrink: 0; display: grid; place-items: center; border-radius: var(--v5-radius-s); background: var(--v5-brand-soft); color: var(--v5-brand); }
.wp-publisher__link { display: inline-flex; align-items: center; min-height: 44px; font: 600 13px/18px var(--font-v5); color: var(--v5-brand); cursor: pointer; }
.wp-publisher__link:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.wp-footnote { text-align: center; font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); }
/* The design sets the header title at 15px on this page. */
.wp-root :deep(.spv-title) { font-size: 15px; line-height: 20px; }
</style>
