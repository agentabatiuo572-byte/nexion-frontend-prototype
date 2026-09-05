<template>
  <AppChassis active="me">
    <CardStagger style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <view :style="heroStyle">
          <view class="flex items-center" style="gap: 10px">
            <view class="grid place-items-center" :style="heroIconStyle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
            </view>
            <view class="min-w-0" style="flex: 1">
              <text class="block" :style="heroLabelStyle">{{ sectionLabel("nexNarrative") }}</text>
              <text class="block" :style="heroHeadlineStyle">{{ narrativeHero || "—" }}</text>
              <text v-if="narrativeSubhero" class="block" :style="heroBodyStyle">{{ narrativeSubhero }}</text>
            </view>
          </view>
          <view class="grid grid-cols-2 text-center" :style="heroStatsStyle">
            <Stat :label="tr.tvlOnChain" :value="trustSnapshotLabel" tint="var(--v5-brand)" />
            <Stat :label="tr.activeNodes" :value="activeDevicesText" />
          </view>
        </view>

        <view v-if="loading" :style="stateCardStyle"><text :style="bodyStyle">{{ tr.loadingDisclosure }}</text></view>
        <view v-else-if="hasError" :style="stateCardStyle">
          <text :style="bodyStyle">{{ remoteApiEnabled ? tr.errorUnavailable : tr.errorOffline }}</text>
          <text v-if="remoteApiEnabled" class="block active:opacity-70" :style="retryStyle" @click="loadTrustSections">{{ t.ui.retry }}</text>
        </view>

        <template v-else>
          <template v-if="financialSection && financialMetrics.length">
            <SectionHeader :label="sectionLabel('financials')" :suffix="financialSection.version" />
            <view class="grid grid-cols-2" :style="gridCardStyle">
              <view v-for="metric in financialMetrics" :key="metric.key" :style="metricStyle">
                <text class="block" :style="labelStyle">{{ metric.label }}</text>
                <view class="flex items-baseline" style="gap: 6px; margin-top: 4px">
                  <text :style="metricValueStyle">{{ metric.value }}</text>
                  <text v-if="metric.delta" :style="deltaStyle">{{ metric.delta }}</text>
                </view>
              </view>
              <text v-if="financialFootnote" class="block" :style="footnoteStyle">{{ financialFootnote }}</text>
            </view>
          </template>

          <template v-if="complianceSection && complianceRows.length">
            <SectionHeader :label="sectionLabel('complianceBadges')" :suffix="complianceSection.version" />
            <view class="grid grid-cols-2" style="gap: 8px">
              <view v-for="row in complianceRows" :key="row.Label" :style="tileStyle">
                <text class="block" :style="titleStyle">{{ row.Label }}</text>
                <text class="block" :style="bodyStyle">{{ row.Body }}</text>
              </view>
            </view>
          </template>

          <template v-if="auditSection && auditRows.length">
            <SectionHeader :label="sectionLabel('auditsReserves')" :suffix="auditSection.version" />
            <view :style="listCardStyle">
              <view v-for="(row, index) in auditRows" :key="row.Primary" class="active:opacity-75" :style="listRowStyle(index === auditRows.length - 1)" @click="openHref(row.Url)">
                <view class="min-w-0" style="flex: 1">
                  <text class="block" :style="titleStyle">{{ row.Primary }}</text>
                  <text v-if="row.Secondary" class="block" :style="bodyStyle">{{ row.Secondary }}</text>
                </view>
                <text v-if="row.Url" :style="linkStyle">↗</text>
              </view>
            </view>
          </template>

          <template v-if="leadershipSection && leadershipRows.length">
            <SectionHeader :label="sectionLabel('leadership')" :suffix="leadershipSection.version" />
            <view :style="listCardStyle">
              <view v-for="(row, index) in leadershipRows" :key="row.Name" :style="listRowStyle(index === leadershipRows.length - 1)" @click="openHref(row.Url)">
                <view class="grid place-items-center" :style="avatarStyle"><text :style="avatarTextStyle">{{ initials(row.Name) }}</text></view>
                <view class="min-w-0" style="flex: 1">
                  <text class="block" :style="titleStyle">{{ row.Name }}</text>
                  <text class="block" :style="roleStyle">{{ row.Role }}</text>
                  <text v-if="row.Previous" class="block" :style="bodyStyle">{{ row.Previous }}</text>
                </view>
              </view>
            </view>
          </template>

          <template v-if="listingsSection && listingRows.length">
            <SectionHeader :label="sectionLabel('listings')" :suffix="listingsSection.version" />
            <view :style="listCardStyle">
              <view v-for="(row, index) in listingRows" :key="row.Exchange" class="flex items-center justify-between active:opacity-75" :style="listRowStyle(index === listingRows.length - 1)" @click="openHref(row.Url)">
                <text :style="titleStyle">{{ row.Exchange }}</text>
                <text :style="stateStyle">{{ row.State }}</text>
              </view>
            </view>
          </template>
        </template>
      </view>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import CardStagger from "@/components/card-stagger.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import SectionHeader from "@/components/trust/trust-section-header.vue";
import Stat from "@/components/trust/trust-stat.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { toast } from "@/store/ui";
import { navTo } from "@/lib/route";
import { remoteApiEnabled } from "@/api/runtime";
import type { PublishedTrustSection, TrustLocale } from "@/api/trust-section-api";
import { localizedTrustFieldValue, trustFieldValue, trustNumberedRows } from "@/lib/trust-fields";
import { recordPublishedTrustViews, usePublishedTrust } from "@/composables/use-published-trust";

const t = useT();
const tr = computed(() => t.value.trust);
const locale = useLocaleStore();
const language = computed<TrustLocale>(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code as TrustLocale : "en");
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
const financialSection = computed(() => section("financials"));
const leadershipSection = computed(() => section("leadership"));
const narrativeSection = computed(() => section("nexNarrative"));
const complianceSection = computed(() => section("complianceBadges"));
const auditSection = computed(() => section("auditsReserves"));
const listingsSection = computed(() => section("listings"));

const narrativeHero = computed(() => localizedTrustFieldValue(narrativeSection.value?.fields ?? [], "hero", language.value) ?? "");
const narrativeSubhero = computed(() => localizedTrustFieldValue(narrativeSection.value?.fields ?? [], "subhero", language.value) ?? "");
const trustSnapshotLabel = computed(() => trustFieldValue(financialSection.value?.fields ?? [], "tvlOnChain") ?? "—");
const activeDevicesText = computed(() => trustFieldValue(financialSection.value?.fields ?? [], "devicesOnlineValue") ?? "—");
const financialFootnote = computed(() => localizedTrustFieldValue(financialSection.value?.fields ?? [], "footnote", language.value));
const financialMetrics = computed(() => {
  const fields = financialSection.value?.fields ?? [];
  return ["tvlOnChain", "mrrValue", "activeAccountsValue", "devicesOnlineValue", "payoutsProcessedValue"].flatMap((key) => {
    const field = fields.find((item) => item.key === key);
    if (!field?.value.trim()) return [];
    const label = key === "tvlOnChain" ? tr.value.tvlOnChain : key === "devicesOnlineValue" ? tr.value.activeNodes : field.label;
    return [{ key, label, value: field.value, delta: key.endsWith("Value") ? trustFieldValue(fields, key.replace(/Value$/, "Delta")) : null }];
  });
});
const complianceRows = computed(() => trustNumberedRows(complianceSection.value?.fields ?? [], "badge", ["Label", "Body"] as const, language.value));
const auditRows = computed(() => trustNumberedRows(auditSection.value?.fields ?? [], "document", ["Primary", "Secondary", "Url"] as const, language.value));
const leadershipRows = computed(() => trustNumberedRows(leadershipSection.value?.fields ?? [], "leader", ["Name", "Role", "Previous", "Url"] as const, language.value));
const listingRows = computed(() => trustNumberedRows(listingsSection.value?.fields ?? [], "listing", ["Exchange", "State", "Url"] as const, language.value));

async function loadTrustSections() {
  if (!remoteApiEnabled) return;
  if (await refresh(true)) recordPublishedTrustViews(sections.value.map((item) => item.sectionKey), language.value);
}

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
  if (!href) return;
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

onShow(() => { void loadTrustSections(); });

const heroStyle: CSSProperties = { borderRadius: "16px", padding: "16px", background: "radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, var(--v5-brand-2) 18%, transparent) 0%, transparent 65%), var(--v5-surface)" };
const heroIconStyle: CSSProperties = { width: "40px", height: "40px", borderRadius: "12px", background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)" };
const heroLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-brand-2)" };
const heroHeadlineStyle: CSSProperties = { marginTop: "3px", fontSize: "20px", fontWeight: 600, lineHeight: 1.3, color: "var(--v5-ink)" };
const heroBodyStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", lineHeight: 1.5, color: "var(--v5-ink-3)" };
const heroStatsStyle: CSSProperties = { marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--v5-border)", gap: "8px" };
const stateCardStyle: CSSProperties = { padding: "16px", borderRadius: "16px", background: "var(--v5-surface)" };
const gridCardStyle: CSSProperties = { borderRadius: "16px", overflow: "hidden", background: "var(--v5-surface)" };
const metricStyle: CSSProperties = { padding: "14px", borderRight: "1px solid var(--v5-border)", borderBottom: "1px solid var(--v5-border)" };
const labelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const metricValueStyle: CSSProperties = { fontSize: "18px", fontWeight: 600, color: "var(--v5-ink)" };
const deltaStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-success)" };
const footnoteStyle: CSSProperties = { gridColumn: "1 / -1", padding: "10px 14px", fontSize: "12px", lineHeight: 1.5, color: "var(--v5-ink-4)" };
const tileStyle: CSSProperties = { padding: "12px", borderRadius: "12px", background: "var(--v5-surface)" };
const listCardStyle: CSSProperties = { borderRadius: "16px", overflow: "hidden", background: "var(--v5-surface)" };
function listRowStyle(last: boolean): CSSProperties { return { display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderBottom: last ? "none" : "1px solid var(--v5-border)" }; }
const titleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const bodyStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", lineHeight: 1.5, color: "var(--v5-ink-3)" };
const roleStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-brand)" };
const linkStyle: CSSProperties = { fontSize: "16px", color: "var(--v5-brand)" };
const avatarStyle: CSSProperties = { width: "38px", height: "38px", borderRadius: "999px", background: "var(--v5-brand-soft)" };
const avatarTextStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-brand)" };
const stateStyle: CSSProperties = { padding: "3px 8px", borderRadius: "999px", fontSize: "12px", color: "var(--v5-success)", background: "var(--v5-success-soft)" };
const retryStyle: CSSProperties = { marginTop: "12px", fontSize: "13px", fontWeight: 600, color: "var(--v5-brand)" };
</script>
