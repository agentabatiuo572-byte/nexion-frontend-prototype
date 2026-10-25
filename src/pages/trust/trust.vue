<template>
  <AppChassis active="me">
    <CardStagger style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" pill />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <view class="trust-intro" :style="heroStyle">
          <view class="flex items-center" style="gap: 10px">
            <view class="grid place-items-center" :style="heroIconStyle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
            </view>
            <view class="min-w-0" style="flex: 1">
              <text class="block" :style="heroLabelStyle">{{ resources.about }}</text>
              <text class="block" :style="heroHeadlineStyle">{{ narrativeHero || resources.headline }}</text>
              <text class="block" :style="heroBodyStyle">{{ narrativeSubhero || resources.subtitle }}</text>
            </view>
          </view>
        </view>

        <SectionHeader :label="resources.resources" />
        <view class="trust-surface" :style="listCardStyle">
          <view v-for="(resource, index) in resources.items" :key="resource.href" role="link" tabindex="0"
            class="active:opacity-75" :style="listRowStyle(index === resources.items.length - 1)"
            @click="openHref(resource.href)" @keydown.enter.prevent="openHref(resource.href)">
            <view style="flex: 1; min-width: 0">
              <text class="block" :style="titleStyle">{{ resource.title }}</text>
              <text class="block" :style="bodyStyle">{{ resource.body }}</text>
            </view>
            <text :style="linkStyle" aria-hidden="true">›</text>
          </view>
        </view>

        <view class="trust-surface" v-if="loading" :style="stateCardStyle"><text :style="bodyStyle">{{ tr.loadingDisclosure }}</text></view>
        <view class="trust-surface" v-else-if="hasError" :style="stateCardStyle">
          <text :style="bodyStyle">{{ remoteApiEnabled ? tr.errorUnavailable : tr.errorOffline }}</text>
          <text v-if="remoteApiEnabled" class="block active:opacity-70" role="button" tabindex="0" :style="retryStyle" @click="loadTrustSections">{{ t.ui.retry }}</text>
        </view>

        <template v-else>
          <template v-if="financialSection && financialMetrics.length">
            <SectionHeader :label="resources.data" />
            <view class="trust-surface grid grid-cols-2" :style="gridCardStyle">
              <view v-for="metric in financialMetrics" :key="metric.key" :style="metricStyle">
                <text class="block" :style="labelStyle">{{ metric.label }}</text>
                <view class="flex items-baseline" style="gap: 6px; margin-top: 4px">
                  <text :style="metricValueStyle">{{ metric.value }}</text>
                  <text v-if="metric.delta" :style="deltaStyle">{{ metric.delta }}</text>
                </view>
              </view>
            </view>
          </template>

          <template v-if="auditSection && verifiedAuditRows.length">
            <SectionHeader :label="resources.documents" />
            <view class="trust-surface" :style="listCardStyle">
              <view v-for="(row, index) in verifiedAuditRows" :key="row.Primary" class="active:opacity-75" :style="listRowStyle(index === verifiedAuditRows.length - 1)"
                role="link" :tabindex="safeHref(row.Url) ? 0 : -1" :aria-disabled="safeHref(row.Url) ? 'false' : 'true'"
                @click="openHref(row.Url)" @keydown.enter.prevent="openHref(row.Url)">
                <view class="min-w-0" style="flex: 1">
                  <text class="block" :style="titleStyle">{{ row.Primary }}</text>
                  <text v-if="row.Secondary" class="block" :style="bodyStyle">{{ row.Secondary }}</text>
                  <text v-if="!safeHref(row.Url)" class="block" :style="bodyStyle">{{ tr.linkUnavailable }}</text>
                </view>
                <text v-if="safeHref(row.Url)" :style="linkStyle">↗</text>
              </view>
            </view>
          </template>

          <template v-if="leadershipSection && verifiedLeadershipRows.length">
            <SectionHeader :label="sectionLabel(sectionKey.leadership)" :suffix="leadershipSection.version" />
            <view class="trust-surface" :style="listCardStyle">
              <view v-for="(row, index) in verifiedLeadershipRows" :key="row.Name" :style="listRowStyle(index === verifiedLeadershipRows.length - 1)" @click="openHref(row.Url)">
                <view class="grid place-items-center" :style="avatarStyle"><text :style="avatarTextStyle">{{ initials(row.Name) }}</text></view>
                <view class="min-w-0" style="flex: 1">
                  <text class="block" :style="titleStyle">{{ row.Name }}</text>
                  <text class="block" :style="roleStyle">{{ row.Role }}</text>
                  <text v-if="row.Previous" class="block" :style="bodyStyle">{{ row.Previous }}</text>
                </view>
              </view>
            </view>
          </template>

        </template>
      </view>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { computed, onUnmounted, type CSSProperties } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import CardStagger from "@/components/card-stagger.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import SectionHeader from "@/components/trust/trust-section-header.vue";
import { trustResources } from "./trust-resources";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { useConfig } from "@/store/config";
import { toast } from "@/store/ui";
import { navTo } from "@/lib/route";
import { remoteApiEnabled } from "@/api/runtime";
import type { PublishedTrustSection, TrustLocale } from "@/api/trust-section-api";
import { localizedTrustFieldValue, trustNumberedRows } from "@/lib/trust-fields";
import { recordPublishedTrustViews, usePublishedTrust } from "@/composables/use-published-trust";
import { subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const cfg = useConfig();
const tr = computed(() => t.value.trust);
const locale = useLocaleStore();
const language = computed<TrustLocale>(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code as TrustLocale : "en");
const resources = computed(() => trustResources(language.value));
const { sections, status, refresh } = usePublishedTrust();
const loading = computed(() => remoteApiEnabled && (status.value === "idle" || status.value === "loading"));
const hasError = computed(() => !remoteApiEnabled || status.value === "error");

function section(key: PublishedTrustSection["sectionKey"]) {
  return sections.value.find((item) => item.sectionKey === key);
}
function sectionLabel(key: PublishedTrustSection["sectionKey"]): string {
  const labels = {
    financials: tr.value.qtrLabel,
    leadership: tr.value.leadershipLabel,
    nexNarrative: tr.value.nexAnchorLabel,
    complianceBadges: tr.value.complianceLabel,
    auditsReserves: tr.value.auditsLabel,
    listings: tr.value.listingsLabel,
  };
  return labels[key];
}
const sectionKey = {
  financials: "financials", leadership: "leadership", nexNarrative: "nexNarrative",
  complianceBadges: "complianceBadges", auditsReserves: "auditsReserves", listings: "listings",
} as const satisfies Record<PublishedTrustSection["sectionKey"], PublishedTrustSection["sectionKey"]>;
const financialSection = computed(() => section(sectionKey.financials));
const leadershipSection = computed(() => section(sectionKey.leadership));
const narrativeSection = computed(() => section(sectionKey.nexNarrative));
const auditSection = computed(() => section(sectionKey.auditsReserves));

const narrativeHero = computed(() => localizedTrustFieldValue(narrativeSection.value?.fields ?? [], "hero", language.value) ?? "");
const narrativeSubhero = computed(() => localizedTrustFieldValue(narrativeSection.value?.fields ?? [], "subhero", language.value) ?? "");
const verified = computed(() => cfg.syncFailed ? null : cfg.config.verifiedStats);
const financialMetrics = computed(() => {
  const v = verified.value;
  if (!v) return [];
  return [
    { key: "activeAccountsValue", label: tr.value.activeAccounts, value: v.activeAccounts.value.toLocaleString("en-US"), delta: null },
    { key: "devicesOnlineValue", label: tr.value.activeNodes, value: v.onlineDevices.value.toLocaleString("en-US"), delta: null },
    { key: "payoutsProcessedValue", label: tr.value.completedPayouts, value: formatAmount(v.completedPayoutUsdt.value), delta: null },
  ];
});
const auditRows = computed(() => trustNumberedRows(auditSection.value?.fields ?? [], "document", ["Primary", "Secondary", "Url"] as const, language.value));
const verifiedAuditRows = computed(() => auditRows.value.filter((row) => safeHref(row.Url)));
const leadershipRows = computed(() => trustNumberedRows(leadershipSection.value?.fields ?? [], "leader", ["Name", "Role", "Previous", "Url"] as const, language.value));
const verifiedLeadershipRows = computed(() => leadershipRows.value.filter((row) => safeHref(row.Url)));

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
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
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

const heroStyle: CSSProperties = { padding: "8px 2px 20px" };
const heroIconStyle: CSSProperties = { width: "40px", height: "40px", flexShrink: 0, borderRadius: "12px", background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)" };
const heroLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-brand-2)" };
const heroHeadlineStyle: CSSProperties = { marginTop: "3px", fontSize: "26px", fontWeight: 600, lineHeight: 1.25, color: "var(--v5-ink)" };
const heroBodyStyle: CSSProperties = { marginTop: "10px", fontSize: "14px", lineHeight: 1.6, color: "var(--v5-ink-3)" };
const stateCardStyle: CSSProperties = { padding: "16px", borderRadius: "22px", background: "var(--v5-surface)" };
const gridCardStyle: CSSProperties = { borderRadius: "22px", overflow: "hidden", background: "var(--v5-surface)" };
const metricStyle: CSSProperties = { padding: "14px", borderRight: "1px solid var(--v5-border)", borderBottom: "1px solid var(--v5-border)" };
const labelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const metricValueStyle: CSSProperties = { fontSize: "20px", fontWeight: 600, color: "var(--v5-ink)" };
const deltaStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-success)" };
const listCardStyle: CSSProperties = { borderRadius: "22px", overflow: "hidden", background: "var(--v5-surface)" };
function listRowStyle(last: boolean): CSSProperties { return { display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderBottom: last ? "none" : "1px solid var(--v5-border)" }; }
const titleStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)" };
const bodyStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", lineHeight: 1.5, color: "var(--v5-ink-3)" };
const roleStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-brand)" };
const linkStyle: CSSProperties = { fontSize: "15px", color: "var(--v5-brand)" };
const avatarStyle: CSSProperties = { width: "38px", height: "38px", borderRadius: "999px", background: "var(--v5-brand-soft)" };
const avatarTextStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-brand)" };
const retryStyle: CSSProperties = { minHeight: "44px", display: "flex", alignItems: "center", marginTop: "12px", fontSize: "13px", fontWeight: 600, color: "var(--v5-brand)" };


</script>
