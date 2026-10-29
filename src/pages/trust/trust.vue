<template>
  <AppChassis active="me">
    <CardStagger class="trust-root" style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" plain solid />

      <view class="px-4 trust-page">
        <view class="trust-hero" :style="heroStyle">
          <view class="trust-hero__identity">
            <view class="trust-hero__mark" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
            </view>
            <view class="min-w-0">
              <text class="block trust-eyebrow">{{ center.operator }}</text>
              <text class="block trust-hero__name">{{ profile ? profile.legalName : resources.about }}</text>
            </view>
          </view>
          <view>
            <text class="block trust-hero__headline">{{ center.headline }}</text>
            <text class="block trust-hero__body">{{ center.subtitle }}</text>
          </view>
          <view v-if="profile" class="trust-chips">
            <view v-for="chip in center.chips" :key="chip" class="trust-chip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
              <text>{{ chip }}</text>
            </view>
          </view>
          <view v-if="profile" class="trust-facts">
            <view v-for="fact in profileFacts" :key="fact.label" class="trust-fact">
              <text class="block trust-fact__label">{{ fact.label }}</text>
              <text class="block trust-fact__value" :class="{ 'trust-fact__value--small': fact.small }">{{ fact.value }}</text>
            </view>
          </view>
        </view>

        <view class="trust-block">
          <view class="trust-block__head">
            <text class="trust-block__title">{{ center.credentialsTitle }}</text>
            <text class="trust-block__hint">{{ center.credentialsHint }}</text>
          </view>
          <text v-if="!documents && documentsStatus !== 'error'" class="trust-state" role="status" aria-live="polite">{{ center.documentsLoading }}</text>
          <view v-else-if="!documents" class="nx-inline-recovery" role="alert">
            <text class="nx-inline-recovery__copy">{{ center.documentsError }}</text>
            <NxButton class="nx-inline-recovery__action" variant="text" size="small" :label="t.ui.retry" @click="refreshDocuments" />
          </view>
          <template v-else>
          <view v-for="card in credentialCards" :key="card.slot" class="trust-credential">
            <view class="trust-credential__head">
              <view class="trust-credential__icon" :class="`trust-credential__icon--${card.slot}`" aria-hidden="true">
                <svg v-if="card.slot === 'incorporation'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/></svg>
                <svg v-else-if="card.slot === 'msb'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
                <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>
              </view>
              <view class="min-w-0" style="flex: 1">
                <text class="block trust-credential__title">{{ card.title }}</text>
                <text class="block trust-credential__issuer">{{ card.issuer }}</text>
              </view>
            </view>
            <text v-if="card.note" class="block trust-credential__note">{{ card.note }}</text>
            <view class="trust-credential__facts">
              <view v-for="fact in card.facts" :key="fact.label" class="trust-credential__fact">
                <text class="trust-credential__fact-label">{{ fact.label }}</text>
                <text class="trust-credential__fact-value">{{ fact.value }}</text>
              </view>
            </view>
            <view class="trust-credential__actions">
              <view v-if="card.verifyUrl" class="trust-link" role="link" tabindex="0" @click="openHref(card.verifyUrl)">
                <text>{{ card.verifyLabel }}</text>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
              </view>
              <view v-else />
              <view class="trust-view" role="button" tabindex="0" @click="navTo(`/pages/trust/document?slot=${card.slot}`)"><text>{{ card.viewLabel }}</text></view>
            </view>
          </view>
          </template>
        </view>

        <view v-if="whitepaper" class="trust-whitepaper" role="link" tabindex="0" @click="navTo('/pages/trust/whitepaper')">
          <view class="trust-whitepaper__top">
            <text class="trust-whitepaper__eyebrow">WHITEPAPER{{ whitepaper.version ? ` · ${whitepaper.version}` : "" }}</text>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>
          </view>
          <view class="trust-whitepaper__copy">
            <text class="block trust-whitepaper__title">{{ center.whitepaperTitle }}</text>
            <text class="block trust-whitepaper__body">{{ center.whitepaperBody }}</text>
          </view>
          <view class="trust-whitepaper__bottom">
            <text class="trust-whitepaper__meta">{{ whitepaperMeta }}</text>
            <text class="trust-whitepaper__cta">{{ center.readWhitepaper }}</text>
          </view>
        </view>

        <view v-if="financialMetrics.length" class="trust-block">
          <view class="trust-block__head">
            <text class="trust-block__title">{{ center.dataTitle }}</text>
            <text class="trust-block__hint">{{ center.dataHint }}</text>
          </view>
          <view class="trust-summary">
            <view v-for="metric in financialMetrics" :key="metric.key" class="trust-summary__cell">
              <text class="trust-summary__value" :class="metricSize(metric.value)">{{ metric.value }}</text>
              <text class="trust-summary__label">{{ metric.label }}</text>
            </view>
          </view>
        </view>

        <view v-if="verifiedLeadershipRows.length" class="trust-block">
          <view class="trust-block__head"><text class="trust-block__title">{{ center.teamTitle }}</text></view>
          <view class="trust-surface">
            <view v-for="row in verifiedLeadershipRows" :key="row.Name" class="trust-person" role="link" tabindex="0" @click="openHref(row.Url)">
              <view class="trust-person__avatar"><text>{{ initials(row.Name) }}</text></view>
              <view class="min-w-0" style="flex: 1">
                <text class="block trust-row__title">{{ row.Name }}</text>
                <text class="block trust-row__body">{{ row.Role }}</text>
                <text v-if="row.Previous" class="block trust-row__body">{{ row.Previous }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="trust-block">
          <view class="trust-block__head"><text class="trust-block__title">{{ center.servicesTitle }}</text></view>
          <view class="trust-categories trust-surface">
            <view v-for="item in categories" :key="item.key" class="trust-category">
              <view class="trust-category-toggle" role="button" tabindex="0" :aria-expanded="openCategory === item.key" @click="openCategory = openCategory === item.key ? '' : item.key" @keydown.enter.prevent="openCategory = openCategory === item.key ? '' : item.key" @keydown.space.prevent="openCategory = openCategory === item.key ? '' : item.key">
                <view class="min-w-0" style="flex: 1">
                  <text class="block trust-row__title">{{ item.title }}</text>
                  <text class="block trust-row__body">{{ center.serviceSubtitles[item.key] }}</text>
                </view>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="trust-row__chevron" :class="{ 'trust-row__chevron--open': openCategory === item.key }"><path d="m9 18 6-6-6-6"/></svg>
              </view>
              <view v-if="openCategory === item.key" class="trust-category-body">
                <text v-if="loading" role="status" aria-live="polite">{{ auditCopy.loading }}</text>
                <view v-else-if="hasError" class="nx-inline-recovery" role="alert"><text class="nx-inline-recovery__copy">{{ auditCopy.error }}</text><NxButton class="nx-inline-recovery__action" variant="text" size="small" :label="t.ui.retry" @click="loadTrustSections" /></view>
                <template v-else-if="item.key === 'audit'">
                  <view v-for="row in verifiedAuditRows" :key="row.Primary" class="trust-document" role="link" :tabindex="safeHref(row.Url) ? 0 : -1" :aria-disabled="!safeHref(row.Url)" @click="safeHref(row.Url) && openHref(row.Url)" @keydown.enter.prevent="safeHref(row.Url) && openHref(row.Url)">
                    <text class="block trust-material-title">{{ row.Primary }}</text>
                    <text v-if="row.Secondary" class="block">{{ row.Secondary }}</text>
                    <text v-if="row.Type || row.Date || row.Size" class="block">{{ [row.Type, row.Date, row.Size].filter(Boolean).join(' · ') }}</text>
                    <text v-if="!safeHref(row.Url)" class="block">{{ tr.linkUnavailable }}</text>
                  </view>
                </template>
                <template v-else-if="item.material.content || item.material.rows.length">
                  <text v-if="item.material.content" class="block trust-material-copy">{{ item.material.content }}</text>
                  <view v-for="(row, index) in item.material.rows" :key="index" class="trust-material"
                    :class="{ 'trust-material--link': row.href }" :role="row.href ? 'link' : undefined" :tabindex="row.href ? 0 : -1"
                    @click="row.href && openHref(row.href)" @keydown.enter.prevent="row.href && openHref(row.href)">
                    <text class="block trust-material-title">{{ row.title || resources.viewDocument }}</text>
                    <text v-if="row.body" class="block trust-material-copy">{{ row.body }}</text>
                    <text v-if="row.metadata" class="block">{{ row.metadata }}</text>
                  </view>
                </template>
                <text v-else>{{ resources.pending }}</text>
                <NxButton v-if="item.key === 'warranty'" variant="text" :label="auditCopy.afterSales" @click="navTo('/pages/me/notifications?section=service')" />
                <NxButton v-if="item.key === 'security'" variant="text" :label="auditCopy.securitySettings" @click="openHref('/pages/me/security')" />
              </view>
            </view>
          </view>
        </view>

        <view class="trust-block">
          <view class="trust-block__head"><text class="trust-block__title">{{ resources.resources }}</text></view>
          <view class="trust-surface">
            <view v-for="resource in resources.items" :key="resource.href" class="trust-row" role="link" tabindex="0" @click="openHref(resource.href)" @keydown.enter.prevent="openHref(resource.href)">
              <view class="min-w-0" style="flex: 1">
                <text class="block trust-row__title">{{ resource.title }}</text>
                <text class="block trust-row__body">{{ resource.body }}</text>
              </view>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="trust-row__chevron"><path d="m9 18 6-6-6-6"/></svg>
            </view>
          </view>
        </view>

        <view class="trust-contact">
          <view class="min-w-0" style="flex: 1">
            <text class="block trust-row__title">{{ center.contactTitle }}</text>
            <text class="block trust-row__body">{{ center.contactBody }}</text>
          </view>
          <view class="trust-contact__cta" role="button" tabindex="0" @click="navTo('/pages/me/support')"><text>{{ center.contactCta }}</text></view>
        </view>

        <!-- Refresh feedback follows the retained content: its insertion/removal
             must not move the reader's anchor while a hidden page returns. -->
        <view v-if="refreshError" class="trust-refresh-status" :class="{ 'nx-inline-recovery': refreshError }" role="status" aria-live="polite">
          <text class="nx-inline-recovery__copy">{{ continuity.trustRefreshFailed }}</text>
          <NxButton v-if="refreshError" class="nx-inline-recovery__action" variant="text" :label="t.ui.retry" @click="loadTrustSections" />
        </view>

        <text class="block trust-footnote">{{ center.footnote }}</text>
      </view>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { continuityCopy } from "@/i18n/continuity-fixes";
import { trustCenterCopy } from "@/i18n/trust-center";
import { formatGroupedAmount } from "@/lib/amount-display";
import { computed, ref, onUnmounted, type CSSProperties } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import CardStagger from "@/components/card-stagger.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import NxButton from '@/components/ui/nx-button.vue';
import { trustResources } from "./trust-resources";
import { trustCategoryMaterial } from "./trust-category-material";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { useConfig } from "@/store/config";
import { toast } from "@/store/ui";
import { navTo } from "@/lib/route";
import { remoteApiEnabled } from "@/api/runtime";
import type { PublishedTrustSection, TrustLocale } from "@/api/trust-section-api";
import { trustNumberedRows } from "@/lib/trust-fields";
import { recordPublishedTrustViews, usePublishedTrust } from "@/composables/use-published-trust";
import { useTrustDocuments } from "@/composables/use-trust-documents";
import { subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const openCategory = ref('');
const cfg = useConfig();
const tr = computed(() => t.value.trust);
const locale = useLocaleStore();
const language = computed<TrustLocale>(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code as TrustLocale : "en");
const auditCopy = computed(() => networkReauditCopy(language.value));
const resources = computed(() => trustResources(language.value));
const continuity = computed(() => continuityCopy(language.value));
const center = computed(() => trustCenterCopy(language.value));
const { sections, status, refreshError, refresh } = usePublishedTrust();
const { documents, status: documentsStatus, refresh: refreshDocuments } = useTrustDocuments();
const loading = computed(() => remoteApiEnabled && !sections.value.length && (status.value === "idle" || status.value === "loading"));
const hasError = computed(() => !remoteApiEnabled || (!sections.value.length && status.value === "error"));

function section(key: PublishedTrustSection["sectionKey"]) {
  return sections.value.find((item) => item.sectionKey === key);
}
const leadershipSection = computed(() => section("leadership"));
const auditSection = computed(() => section("auditsReserves"));

const verified = computed(() => cfg.syncFailed ? null : cfg.config.verifiedStats);
const financialMetrics = computed(() => {
  const v = verified.value;
  if (!v) return [];
  return [
    { key: "activeAccountsValue", label: tr.value.activeAccounts, value: v.activeAccounts.value.toLocaleString("en-US") },
    { key: "devicesOnlineValue", label: tr.value.activeNodes, value: v.onlineDevices.value.toLocaleString("en-US") },
    { key: "payoutsProcessedValue", label: tr.value.completedPayouts, value: formatGroupedAmount(v.completedPayoutUsdt.value) },
  ];
});
// Figures stay exact (no K/M); a long one steps down from the design's 18px to fit a third-width cell.
function metricSize(value: string): string {
  return value.length <= 8 ? "" : value.length <= 10 ? "trust-summary__value--long" : "trust-summary__value--longer";
}
const auditRows = computed(() => trustNumberedRows(auditSection.value?.fields ?? [], "document", ["Primary", "Secondary", "Url", "Type", "Date", "Size"] as const, language.value));
const verifiedAuditRows = computed(() => auditRows.value.filter((row) => row.Primary));
const leadershipRows = computed(() => trustNumberedRows(leadershipSection.value?.fields ?? [], "leader", ["Name", "Role", "Previous", "Url"] as const, language.value));
const verifiedLeadershipRows = computed(() => leadershipRows.value.filter((row) => safeHref(row.Url)));
// Audits only appear once an audit document is published; the other commitments always link onwards.
const categories = computed(() => resources.value.categories
  .filter(item => item.key !== "audit" || verifiedAuditRows.value.length > 0)
  .map(item => ({ ...item, material: trustCategoryMaterial(sections.value, item.key, language.value, safeHref) })));

const profile = computed(() => documents.value?.profile ?? null);
const profileFacts = computed(() => {
  const value = profile.value;
  if (!value) return [];
  return [
    { label: center.value.factJurisdiction, value: value.jurisdiction === "New York, USA" ? center.value.newYork : value.jurisdiction, small: false },
    { label: center.value.factDosId, value: value.nyDosId, small: false },
    { label: center.value.factCapital, value: `US$${value.authorizedCapitalUsd.toLocaleString("en-US")}`, small: false },
    { label: center.value.factAddress, value: value.registeredAddress, small: true },
  ];
});
const credentialCards = computed(() => {
  const value = documents.value;
  if (!value) return [];
  const copy = center.value;
  const { incorporation, msb, ein } = value.documents;
  return [
    { slot: incorporation.slot, title: copy.incorporationTitle, issuer: copy.incorporationIssuer, note: "",
      facts: [{ label: copy.dosIdLabel, value: incorporation.referenceNo ?? value.profile.nyDosId }, { label: copy.filingNumberLabel, value: value.profile.nyFilingNumber }],
      verifyUrl: incorporation.verifyUrl, verifyLabel: copy.incorporationVerify, viewLabel: copy.incorporationView },
    { slot: msb.slot, title: copy.msbTitle, issuer: copy.msbIssuer, note: copy.msbNote,
      facts: msb.referenceNo ? [{ label: copy.msbNumberLabel, value: msb.referenceNo }] : [],
      verifyUrl: msb.verifyUrl, verifyLabel: copy.msbVerify, viewLabel: copy.msbView },
    { slot: ein.slot, title: copy.einTitle, issuer: copy.einIssuer, note: "",
      facts: ein.referenceNo ? [{ label: copy.einLabel, value: ein.referenceNo }] : [],
      verifyUrl: ein.verifyUrl, verifyLabel: copy.einVerify, viewLabel: copy.einView },
  ];
});
const whitepaper = computed(() => documents.value?.documents.whitepaper ?? null);
const whitepaperMeta = computed(() => {
  const value = whitepaper.value;
  if (!value) return "";
  const size = value.sizeBytes >= 1024 * 1024 ? `${(value.sizeBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value.sizeBytes / 1024))} KB`;
  return ["PDF", value.language, size].filter(Boolean).join(" · ");
});

// Company documents are public and independent of the published sections' view counting.
onShow(() => { void refreshDocuments(); });

let trustPageVisible = false;
let trustVisibleEpoch = 0;
let trustReadRequest = 0;

function invalidateTrustPageRead(): void {
  trustVisibleEpoch += 1;
}

async function loadTrustSections(): Promise<boolean> {
  if (!remoteApiEnabled || !trustPageVisible) return false;
  const visibleEpoch = trustVisibleEpoch;
  const request = ++trustReadRequest;
  const loaded = await refresh(true);
  // The shared Trust reader drops stale runtime generations. The local page
  // fence additionally prevents a hidden/stale visible cycle from counting a
  // late response as a real page view, and records a coalesced read once.
  if (trustPageVisible && visibleEpoch === trustVisibleEpoch && request === trustReadRequest && loaded) {
    recordPublishedTrustViews(sections.value.map((item) => item.sectionKey), language.value);
  }
  return loaded;
}

const unsubscribeTrustRuntime = subscribeRuntimeRevision(() => {
  if (trustPageVisible && remoteApiEnabled) void loadTrustSections();
});

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0]?.[0] ?? "");
}

function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (/^\/pages\/[A-Za-z0-9/_-]+$/.test(value)) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch { return null; }
}


function openHref(raw: string) {
  const href = safeHref(raw);
  if (!href) { toast.error(t.value.trust.linkUnavailable); return; }
  if (href.startsWith("/")) { navTo(href); return; }
  let opened = false;
  // #ifdef H5
  opened = !!window.open(href, "_blank");
  // #endif
  // #ifndef H5
  const runtime = (globalThis as { plus?: { runtime?: { openURL: (url: string) => void } } }).plus?.runtime;
  if (runtime) { runtime.openURL(href); opened = true; }
  // #endif
  if (!opened) toast.error(t.value.trust.openFailed);
}

onShow(() => {
  trustPageVisible = true;
  invalidateTrustPageRead();
  void loadTrustSections();
});
onHide(() => {
  trustPageVisible = false;
  invalidateTrustPageRead();
});
onUnmounted(() => {
  trustPageVisible = false;
  invalidateTrustPageRead();
  unsubscribeTrustRuntime();
});

const heroStyle: CSSProperties = { padding: "20px" };
</script>

<style scoped>
.trust-page { display: flex; flex-direction: column; gap: var(--v5-space-6); }
.trust-eyebrow { font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); }
.trust-hero { display: flex; flex-direction: column; gap: var(--v5-space-4); border-radius: var(--v5-radius-xl); background: var(--v5-surface); box-shadow: var(--v5-glass-shadow); }
.trust-hero__identity { display: flex; align-items: center; gap: var(--v5-space-3); }
.trust-hero__mark { width: 48px; height: 48px; flex-shrink: 0; display: grid; place-items: center; border-radius: var(--v5-radius-s); background: var(--v5-brand); color: var(--v5-on-brand); }
.trust-hero__name { font: 700 20px/28px var(--font-v5); letter-spacing: .2px; color: var(--v5-ink); overflow-wrap: anywhere; }
.trust-hero__headline { font: 700 24px/32px var(--font-v5); color: var(--v5-ink); }
.trust-hero__body { margin-top: 6px; font: 400 15px/22px var(--font-v5); color: var(--v5-ink-2); }
.trust-chips { display: flex; flex-wrap: wrap; gap: var(--v5-space-2); }
.trust-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px; border-radius: var(--v5-radius-full); background: var(--v5-brand-soft); color: var(--v5-brand); font: 600 12px/16px var(--font-v5); }
.trust-chip > text { color: var(--v5-brand-deep); }
:global(:root:not([data-theme="light"]) .trust-chip > text) { color: var(--v5-brand); }
.trust-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; overflow: hidden; border-radius: var(--v5-radius-m); background: var(--v5-border); }
.trust-fact { display: flex; flex-direction: column; gap: 2px; padding: var(--v5-space-3); background: var(--v5-surface-2); min-width: 0; }
.trust-fact__label { font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); }
.trust-fact__value { font: 600 15px/20px var(--font-v5); color: var(--v5-ink); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.trust-fact__value--small { font-size: 13px; line-height: 18px; }
.trust-block { display: flex; flex-direction: column; gap: var(--v5-space-3); }
.trust-block__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--v5-space-3); }
.trust-block__title { font: 700 15px/20px var(--font-v5); color: var(--v5-ink); }
.trust-block__hint { font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); text-align: right; }
.trust-state { font: 400 13px/18px var(--font-v5); color: var(--v5-ink-3); }
.trust-credential { display: flex; flex-direction: column; gap: var(--v5-space-3); padding: var(--v5-space-4); border-radius: var(--v5-radius-l); background: var(--v5-surface); box-shadow: var(--v5-glass-shadow); }
.trust-credential__head { display: flex; align-items: flex-start; gap: var(--v5-space-3); }
.trust-credential__icon { width: 40px; height: 40px; flex-shrink: 0; display: grid; place-items: center; border-radius: var(--v5-radius-s); background: var(--v5-brand-soft); color: var(--v5-brand); }
.trust-credential__icon--msb { background: var(--v5-nex-soft); color: var(--v5-nex); }
.trust-credential__icon--ein { background: var(--v5-warning-soft); color: var(--v5-warning-ink); }
.trust-credential__title { font: 600 15px/20px var(--font-v5); color: var(--v5-ink); }
.trust-credential__issuer { margin-top: 2px; font: 400 13px/18px var(--font-v5); color: var(--v5-ink-3); }
.trust-credential__note { font: 400 13px/18px var(--font-v5); color: var(--v5-ink-2); }
.trust-credential__facts { display: flex; flex-direction: column; gap: 6px; padding: var(--v5-space-3); border-radius: var(--v5-radius-s); background: var(--v5-surface-2); }
.trust-credential__fact { display: flex; justify-content: space-between; gap: var(--v5-space-3); font: 400 13px/18px var(--font-v5); }
.trust-credential__fact-label { color: var(--v5-ink-3); }
.trust-credential__fact-value { font-weight: 600; color: var(--v5-ink); font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }
.trust-credential__actions { display: flex; align-items: center; justify-content: space-between; gap: var(--v5-space-3); min-height: 44px; }
.trust-view { position: relative; display: inline-flex; align-items: center; height: 32px; padding: 0 14px; border-radius: var(--v5-radius-full); background: color-mix(in srgb, var(--v5-brand) 14%, transparent); color: var(--v5-brand-deep); font: 600 13px/18px var(--font-v5); cursor: pointer; }
/* The pill stays 32px tall as drawn; the hit area grows to 44px. */
.trust-view::after { content: ""; position: absolute; inset: -6px 0; }
.trust-view:active, .trust-contact__cta:active { opacity: .85; }
.trust-link { display: inline-flex; align-items: center; gap: var(--v5-space-1); min-height: 44px; font: 600 13px/18px var(--font-v5); color: var(--v5-brand); cursor: pointer; }
.trust-link:focus-visible, .trust-view:focus-visible, .trust-contact__cta:focus-visible, .trust-row:focus-visible, .trust-person:focus-visible, .trust-whitepaper:focus-visible, .trust-category-toggle:focus-visible, .trust-document:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.trust-whitepaper { display: flex; flex-direction: column; gap: 14px; padding: var(--v5-space-5); border-radius: var(--v5-radius-xl); background: var(--v5-brand); color: var(--v5-on-brand); cursor: pointer; }
.trust-whitepaper__top { display: flex; align-items: center; justify-content: space-between; }
.trust-whitepaper__eyebrow { font: 600 12px/16px var(--font-v5); letter-spacing: .6px; opacity: .9; }
.trust-whitepaper__copy { display: flex; flex-direction: column; gap: 6px; }
.trust-whitepaper__title { font: 700 20px/28px var(--font-v5); }
.trust-whitepaper__body { font: 400 13px/18px var(--font-v5); opacity: .92; }
.trust-whitepaper__bottom { display: flex; align-items: center; justify-content: space-between; gap: var(--v5-space-3); }
.trust-whitepaper__meta { font: 400 12px/16px var(--font-v5); opacity: .85; font-variant-numeric: tabular-nums; }
.trust-whitepaper__cta { display: inline-flex; align-items: center; min-height: 32px; padding: 0 14px; border-radius: var(--v5-radius-full); background: var(--v5-on-brand); color: var(--v5-brand); font: 700 13px/18px var(--font-v5); }
.trust-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--v5-space-2); }
.trust-summary__cell { display: flex; flex-direction: column; gap: var(--v5-space-1); padding: var(--v5-space-3); border-radius: var(--v5-radius-m); background: var(--v5-surface); min-width: 0; }
.trust-summary__value { display: block; font: 700 18px/24px var(--font-v5); color: var(--v5-ink); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.trust-summary__value--long { font-size: 15px; line-height: 24px; }
.trust-summary__value--longer { font-size: 12px; line-height: 24px; }
.trust-summary__label { display: block; font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); }
.trust-surface { overflow: hidden; border-radius: var(--v5-radius-l); background: var(--v5-surface); }
.trust-row, .trust-person { display: flex; align-items: center; gap: var(--v5-space-3); min-height: 60px; padding: var(--v5-space-3) var(--v5-space-4); cursor: pointer; }
.trust-row { min-height: 84px; box-sizing: border-box; }
/* The design's row pitch is 84px plus its 1px divider. */
.trust-row + .trust-row { min-height: 85px; }
.trust-person { padding-block: 14px; }
.trust-row + .trust-row, .trust-person + .trust-person { border-top: 1px solid var(--v5-border); }
.trust-row__title { font: 600 15px/20px var(--font-v5); color: var(--v5-ink); }
.trust-row__body { margin-top: 2px; font: 400 13px/18px var(--font-v5); color: var(--v5-ink-3); }
.trust-row__chevron { flex-shrink: 0; color: var(--v5-ink-3); transition: transform 160ms ease; }
.trust-row__chevron--open { transform: rotate(90deg); }
.trust-person__avatar { width: 44px; height: 44px; flex-shrink: 0; display: grid; place-items: center; border-radius: var(--v5-radius-full); background: var(--v5-brand-soft); color: var(--v5-brand-deep); font: 700 15px/20px var(--font-v5); }
.trust-category + .trust-category { border-top: 1px solid var(--v5-border); }
.trust-category-toggle { display: flex; align-items: center; justify-content: space-between; gap: var(--v5-space-3); min-height: 60px; padding: var(--v5-space-3) var(--v5-space-4); cursor: pointer; }
.trust-category-body { padding: 0 var(--v5-space-4) var(--v5-space-4); font: 400 13px/1.6 var(--font-v5); color: var(--v5-ink-2); }
.trust-document { padding: var(--v5-space-3) 0; border-bottom: 1px solid var(--v5-border); }
.trust-document:last-child { border-bottom: 0; }
.trust-document[aria-disabled="false"] { cursor: pointer; }
.trust-material { margin-top: var(--v5-space-3); overflow-wrap: anywhere; }
.trust-material-title { color: var(--v5-ink); font-weight: 500; }
.trust-material-copy { white-space: pre-line; overflow-wrap: anywhere; }
.trust-material--link { cursor: pointer; }
.trust-material--link .trust-material-title { color: var(--v5-brand); }
.trust-contact { display: flex; align-items: center; gap: var(--v5-space-3); padding: var(--v5-space-4); border-radius: var(--v5-radius-l); background: var(--v5-surface); }
.trust-contact__cta { flex-shrink: 0; display: inline-flex; align-items: center; height: 44px; padding: 0 18px; border-radius: var(--v5-radius-full); background: var(--v5-brand); color: var(--v5-on-brand); font: 600 15px/20px var(--font-v5); cursor: pointer; }
.trust-refresh-status { font: 400 13px/1.6 var(--font-v5); color: var(--v5-ink-2); overflow-wrap: anywhere; }
.trust-footnote { text-align: center; font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); }
/* The design sets the header title at 15px on this page. */
.trust-root :deep(.spv-title) { font-size: 15px; line-height: 20px; }
/* On the dark theme the design gives every card a 1px rim. */
:global(:root:not([data-theme="light"]) .trust-page :is(.trust-hero, .trust-credential, .trust-summary__cell, .trust-surface, .trust-contact)) { border: 1px solid var(--v5-border); }
</style>
