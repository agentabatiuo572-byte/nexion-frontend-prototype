<template>
  <AppChassis active="me">
    <CardStagger class="doc-root" style="padding-bottom: 24px">
      <SubPageHeader back="/pages/trust/trust" plain solid />

      <view class="px-4 doc-page">
        <text v-if="!document && status !== 'error'" class="doc-state" role="status" aria-live="polite">{{ copy.documentsLoading }}</text>
        <view v-else-if="!document" class="nx-inline-recovery" role="alert">
          <text class="nx-inline-recovery__copy">{{ copy.documentsError }}</text>
          <view class="doc-link" role="button" tabindex="0" @click="refresh"><text>{{ t.ui.retry }}</text></view>
        </view>
        <template v-else>
          <view class="doc-head">
            <text class="block doc-head__title">{{ title }}</text>
            <text class="block doc-head__issuer">{{ issuer }}</text>
            <view v-if="reference" class="doc-head__reference">
              <text class="doc-head__reference-label">{{ reference.label }}</text>
              <text class="doc-head__reference-value">{{ reference.value }}</text>
            </view>
            <text class="block doc-head__meta">{{ meta }}</text>
          </view>

          <text class="block doc-hint">{{ copy.docZoomHint }}</text>
          <view class="doc-pages">
            <view v-for="(url, index) in document.pageUrls" :key="url" class="doc-sheet" role="button" tabindex="0"
              :aria-label="fmt(copy.docPageAlt, { title, n: index + 1 })" @click="zoom(index)">
              <image class="doc-sheet__image" :src="url" mode="widthFix" lazy-load />
              <text class="block doc-sheet__label">{{ fmt(copy.docPage, { n: index + 1, total: document.pageCount }) }}</text>
            </view>
          </view>

          <view class="doc-actions">
            <view v-if="verify" class="doc-link" role="link" tabindex="0" @click="openUrl(verify.url)">
              <text>{{ verify.label }}</text>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
            </view>
            <view v-if="document.fileUrl" class="doc-download" role="button" tabindex="0" @click="openUrl(document.fileUrl)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12"/><path d="m6 10 6 6 6-6"/><path d="M4 20h16"/></svg>
              <text>{{ copy.docDownload }}</text>
            </view>
          </view>
        </template>
      </view>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import CardStagger from "@/components/card-stagger.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { trustCenterCopy } from "@/i18n/trust-center";
import { useLocaleStore } from "@/store/locale";
import { toast } from "@/store/ui";
import { openExternalUrl } from "@/lib/open-external";
import { useTrustDocuments } from "@/composables/use-trust-documents";
import type { TrustDocumentSlot } from "@/api/trust-document-api";

const t = useT();
const locale = useLocaleStore();
const copy = computed(() => trustCenterCopy(locale.code));
const { documents, status, refresh } = useTrustDocuments();
const slot = ref<TrustDocumentSlot>("whitepaper");
const document = computed(() => documents.value?.documents[slot.value] ?? null);
const title = computed(() => copy.value.docTitles[slot.value]);
const issuer = computed(() => ({
  whitepaper: documents.value?.profile.legalName ?? "",
  incorporation: copy.value.incorporationIssuer,
  msb: copy.value.msbIssuer,
  ein: copy.value.einIssuer,
})[slot.value]);
const reference = computed(() => {
  const value = document.value?.referenceNo;
  if (!value) return null;
  const label = { whitepaper: "", incorporation: copy.value.dosIdLabel, msb: copy.value.msbNumberLabel, ein: copy.value.einLabel }[slot.value];
  return { label, value };
});
const verify = computed(() => {
  const url = document.value?.verifyUrl;
  if (!url) return null;
  const label = { whitepaper: "", incorporation: copy.value.incorporationVerify, msb: copy.value.msbVerify, ein: copy.value.einVerify }[slot.value];
  return { url, label };
});
const meta = computed(() => {
  const value = document.value;
  if (!value) return "";
  const size = value.sizeBytes >= 1024 * 1024 ? `${(value.sizeBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value.sizeBytes / 1024))} KB`;
  return ["PDF", value.version, value.language, fmt(copy.value.docPages, { n: value.pageCount }), size].filter(Boolean).join(" · ");
});

function zoom(index: number) {
  const value = document.value;
  if (value) uni.previewImage({ urls: value.pageUrls, current: value.pageUrls[index] });
}

function openUrl(url: string) {
  if (!openExternalUrl(url)) toast.error(t.value.trust.openFailed);
}

onLoad((options) => {
  const requested = String(options?.slot ?? "");
  if (requested === "whitepaper" || requested === "incorporation" || requested === "msb" || requested === "ein") slot.value = requested;
});
onShow(() => { void refresh(); });
</script>

<style scoped>
.doc-page { display: flex; flex-direction: column; gap: var(--v5-space-4); }
.doc-state { font: 400 13px/18px var(--font-v5); color: var(--v5-ink-3); }
.doc-head { display: flex; flex-direction: column; gap: var(--v5-space-1); padding: var(--v5-space-5); border-radius: var(--v5-radius-xl); background: var(--v5-surface); }
.doc-head__title { font: 700 20px/28px var(--font-v5); color: var(--v5-ink); }
.doc-head__issuer { font: 400 13px/18px var(--font-v5); color: var(--v5-ink-3); }
.doc-head__reference { display: flex; justify-content: space-between; gap: var(--v5-space-3); margin-top: var(--v5-space-3); padding: var(--v5-space-3); border-radius: var(--v5-radius-s); background: var(--v5-surface-2); font: 400 13px/18px var(--font-v5); }
.doc-head__reference-label { color: var(--v5-ink-3); }
.doc-head__reference-value { font-weight: 600; color: var(--v5-ink); font-variant-numeric: tabular-nums; }
.doc-head__meta { margin-top: var(--v5-space-2); font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); font-variant-numeric: tabular-nums; }
.doc-hint { text-align: center; font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); }
.doc-pages { display: flex; flex-direction: column; gap: var(--v5-space-4); }
.doc-sheet { display: flex; flex-direction: column; gap: var(--v5-space-2); cursor: zoom-in; }
.doc-sheet__image { display: block; width: 100%; border-radius: var(--v5-radius-s); background: var(--v5-surface); box-shadow: var(--v5-glass-shadow); }
.doc-sheet__label { text-align: center; font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); font-variant-numeric: tabular-nums; }
.doc-sheet:focus-visible, .doc-link:focus-visible, .doc-download:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.doc-actions { display: flex; flex-direction: column; align-items: stretch; gap: var(--v5-space-2); }
.doc-link { display: inline-flex; align-items: center; justify-content: center; gap: var(--v5-space-1); min-height: 44px; font: 600 13px/18px var(--font-v5); color: var(--v5-brand); cursor: pointer; }
.doc-download { display: flex; align-items: center; justify-content: center; gap: var(--v5-space-2); min-height: 48px; border-radius: var(--v5-radius-full); background: var(--v5-brand); color: var(--v5-on-brand); font: 600 15px/20px var(--font-v5); cursor: pointer; }
.doc-download:active, .doc-sheet:active { opacity: .85; }
/* Same header title size as the trust centre design. */
.doc-root :deep(.spv-title) { font-size: 15px; line-height: 20px; }
</style>
