<!--
  Commissions — ported from Nexion-prototype/app/(main)/team/commissions/page.tsx.
  5+1-kind commission event stream: overview hero (de-carded, floor-sitting) →
  6-kind summary tiles (tap to filter) → filter pills → event list (transparent
  hairline group). Sub-page → <AppChassis active="team"> with
  in-page back row (back → /team). Reuses commission store. mount-effect
  unlockMatured → onMounted. lucide kind icons → inline SVG. <button>→<view @click>.
-->
<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.headerTitles.teamCommissions" :subtitle="t.headerSubtitles.teamCommissions" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <EmptyState
          v-if="remoteApiEnabled && commission.eventsStatus !== 'ready'"
          :kind="commission.eventsStatus === 'error' ? 'recoverable-error' : 'empty-list'"
          :title="commission.eventsStatus === 'error' ? t.network.projectionErrorTitle : t.network.projectionErrorDesc"
          :desc="commission.eventsStatus === 'error' ? t.network.projectionErrorDesc : undefined"
          :cta-label="commission.eventsStatus === 'error' ? t.network.retry : undefined"
          compact
          @cta="commission.refreshCanonicalEvents()"
        />
        <template v-if="!remoteApiEnabled || commission.eventsStatus === 'ready'">
        <!-- overview — de-carded: the two headline numbers sit on the page floor.
             Dual-number hero (Withdrawable/Cooling grid) has no single cap to host
             the rules-intro pill, so the pill rides a tight top-right row hugging
             the grid (owner 2026-07-09: kill the empty gap above the hero). -->
        <view :style="heroWrapStyle">
          <!-- rules-intro pill hugs the top-right; 4px above the grid so no empty gap. -->
          <view class="flex items-center justify-end" style="margin-bottom: 4px">
            <view class="inline-flex items-center shrink-0 active:scale-[0.98]" :style="howItWorksStyle" @click="go('/pages/team/commissions-how')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              <text>{{ t.commissions.howItWorksEntry }}</text>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </view>
          </view>
          <view class="grid grid-cols-2" style="gap: 12px">
            <view>
              <text class="block font-mono-tabular" :style="overviewCapStyle">{{ t.uiChrome.withdrawable }}</text>
              <text class="block tabular-nums" :style="overviewBigStyle('var(--v5-brand)')">${{ commission.unlockedUSDT().toFixed(2) }}</text>
              <text class="block font-mono-tabular" :style="overviewSmallStyle">{{ commission.unlockedNEX().toLocaleString() }} NEX</text>
            </view>
            <view>
              <text class="block font-mono-tabular" :style="overviewCapStyle">{{ t.commissions.cooling }}</text>
              <text class="block tabular-nums" :style="overviewBigStyle('var(--v5-warning)')">${{ commission.coolingUSDT().toFixed(2) }}</text>
              <text class="block font-mono-tabular" :style="overviewSmallStyle">{{ coolingOverviewText }}</text>
            </view>
          </view>
          <view class="grid grid-cols-2" :style="heroFooterStyle">
            <view class="flex items-center justify-between">
              <text :style="{ color: 'var(--v5-ink-3)' }">{{ t.commissions.thisMonth }}</text>
              <text class="font-display tabular-nums" :style="{ fontWeight: 600 }">${{ commission.monthUSDT().toFixed(2) }}</text>
            </view>
            <view class="flex items-center justify-between">
              <text :style="{ color: 'var(--v5-ink-3)' }">{{ t.commissions.lifetime }}</text>
              <text class="font-display tabular-nums" :style="{ fontWeight: 600 }">${{ commission.totalUSDTLifetime().toFixed(2) }}</text>
            </view>
          </view>
        </view>

        <!-- 6-kind summary -->
        <view class="grid grid-cols-3" style="gap: 8px">
          <view
            v-for="k in KIND_ORDER"
            :key="k"
            class="text-left active:scale-[0.97]"
            :style="kindCardStyle(k)"
            @click="filter = k"
          >
            <text :style="{ color: KIND[k].color }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="KIND[k].color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(p, pi) in KIND[k].paths" :key="pi" :d="p" /></svg>
            </text>
            <text class="block tabular-nums" :style="kindAmtStyle">${{ byKind[k].usdt.toFixed(0) }}</text>
            <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ t.commissions.kind[k] }}</text>
            <text class="block font-mono-tabular" :style="kindCountStyle">{{ byKind[k].count }} {{ t.commissions.events }}</text>
          </view>
        </view>

        <!-- filter pills -->
        <scroll-view scroll-x class="nx-no-scrollbar" style="white-space: nowrap; width: 100%">
          <view class="inline-flex" style="gap: 6px">
            <view class="shrink-0 rounded-full grid place-items-center active:opacity-70" :style="pillStyle(filter === 'all', 'var(--v5-brand)')" @click="filter = 'all'">
              <text :style="pillTextStyle(filter === 'all', 'var(--v5-brand)')">{{ t.commissions.all }} ({{ commission.events.length }})</text>
            </view>
            <view
              v-for="k in KIND_ORDER"
              :key="k"
              class="shrink-0 rounded-full grid place-items-center active:opacity-70"
              :style="pillStyle(filter === k, KIND[k].color)"
              @click="filter = k"
            >
              <text :style="pillTextStyle(filter === k, KIND[k].color)">{{ t.commissions.kind[k] }} ({{ byKind[k].count }})</text>
            </view>
          </view>
        </scroll-view>

        <!-- event list — transparent hairline group on the page floor -->
        <EmptyState v-if="filtered.length === 0" :kind="filter === 'all' ? 'empty-list' : 'no-filter-results'" :title="filter === 'all' ? t.empty.commissionsTitle : t.empty.filterTitle" :desc="filter === 'all' ? t.empty.commissionsDesc : t.empty.filterDesc" />
        <view v-else :style="listGroupStyle">
            <view
              v-for="(e, i) in filtered"
              :key="e.id"
              class="flex items-center"
              :style="eventRowStyle(i === filtered.length - 1)"
            >
              <view class="grid place-items-center shrink-0" :style="eventIconStyle(e.kind)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="KIND[e.kind].color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(p, pi) in KIND[e.kind].paths" :key="pi" :d="p" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <view class="flex items-center" style="gap: 6px">
                  <text class="truncate" :style="{ fontSize: '13px', color: 'var(--v5-ink)' }">{{ e.sourceUserName }}</text>
                  <text v-if="e.layer" class="font-mono-tabular" :style="e.layer === 1 ? directBadgeStyle : extendedBadgeStyle">{{ e.layer === 1 ? t.commissions.directBadge : t.commissions.extendedBadge }}</text>
                </view>
                <text class="block font-mono-tabular" :style="eventMetaStyle">{{ eventMeta(e) }}</text>
              </view>
              <view class="text-right">
                <text v-if="e.amountUSDT > 0" class="block font-mono-tabular tabular-nums" :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-brand)' }">+${{ e.amountUSDT.toFixed(2) }}</text>
                <text v-if="e.amountNEX > 0" class="block font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: 'var(--v5-warning)' }">+{{ e.amountNEX.toLocaleString() }} NEX</text>
                <text v-if="e.status === 'cooling'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-warning)', marginTop: '2px' }">{{ coolingTag(e) }}</text>
                <text v-else-if="e.status === 'unlocked'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-success)', marginTop: '2px' }">{{ t.commissions.readyTag }}</text>
                <text v-else-if="e.status === 'withdrawn'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ t.commissions.withdrawnTag }}</text>
              </view>
            </view>
        </view>
        </template>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import {
  useCommission,
  type CommissionEvent,
  type CommissionKind,
} from "@/store/commission";
import { remoteApiEnabled } from "@/api/runtime";

const t = useT();
const commission = useCommission();

type Filter = "all" | CommissionKind;
const filter = ref<Filter>("all");

const KIND_ORDER: CommissionKind[] = ["unilevel", "binary", "peer", "cultivation", "leadership", "genesis"];

interface KindSpec {
  color: string;
  paths: string[];
}
const KIND: Record<CommissionKind, KindSpec> = {
  unilevel: { color: "var(--v5-brand)", paths: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"] },
  binary: { color: "var(--v5-warning)", paths: ["M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z"] },
  peer: { color: "var(--v5-tech-cyan)", paths: ["m11 17 2 2a1 1 0 1 0 3-3", "m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4", "M21 3v9h-9"] },
  cultivation: { color: "var(--v5-success)", paths: ["M7 20h10", "M10 20c5.5-2.5.8-6.4 3-10", "M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z", "M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"] },
  leadership: { color: "var(--v5-tech-cyan)", paths: ["m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"] },
  genesis: { color: "var(--v5-brand-2)", paths: ["M6 3h12l4 6-10 13L2 9z", "M11 3 8 9l4 13 4-13-3-6", "M2 9h20"] },
};

onMounted(() => {
  commission.unlockMatured();
});
onShow(() => { if (remoteApiEnabled) void commission.refreshCanonicalEvents(); });

const events = computed(() => commission.events);
const byKind = computed(() => commission.byKind());
const filtered = computed(() =>
  filter.value === "all" ? events.value : events.value.filter((e) => e.kind === filter.value),
);

const coolingOverviewText = computed(() => {
  const next = events.value
    .filter((event) => event.status === "cooling" && Number.isFinite(event.unlockAt))
    .sort((a, b) => a.unlockAt - b.unlockAt)[0];
  if (!next) return remoteApiEnabled ? "—" : t.value.commissions.unlocksIn30d;
  const days = Math.max(0, Math.ceil((next.unlockAt - Date.now()) / 86400000));
  return fmt(t.value.commissions.coolingTag, { n: days });
});

const noKindText = computed(() =>
  fmt(t.value.commissions.noKindEvents, { kind: t.value.commissions.kind[filter.value as CommissionKind] }),
);

function eventMeta(e: CommissionEvent): string {
  const kindLabel = t.value.commissions.kind[e.kind];
  const order = e.orderAmountUSD ? ` · ${t.value.commissions.orderPrefix}${e.orderAmountUSD}` : "";
  const date = new Date(e.ts).toLocaleDateString(dateLocale());
  return `${kindLabel}${order} · ${date}`;
}
function coolingTag(e: CommissionEvent): string {
  const days = Math.max(0, Math.ceil((e.unlockAt - Date.now()) / 86400000));
  return fmt(t.value.commissions.coolingTag, { n: days });
}

function go(url: string) {
  uni.navigateTo({ url, fail: () => {} });
}

// ─── styles ───
// Soft tint pill — chip idiom, fill only (no border, single visual difference).
const howItWorksStyle: CSSProperties = {
  gap: "6px",
  padding: "0 12px",
  height: "44px",  // 《07》tap≥44(原 34)
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};
// De-carded overview hero — numbers on the page floor; hairline footer closes the block.
const heroWrapStyle: CSSProperties = { padding: "6px 2px 0" };
// -2px side margins pull the hairline back to full width (2px optical inset above).
const heroFooterStyle: CSSProperties = {
  margin: "12px -2px 0",
  padding: "12px 2px 0",
  borderTop: "1px solid var(--v5-border)",
  gap: "8px",
  fontSize: "12px",
};
const overviewCapStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
function overviewBigStyle(color: string): CSSProperties {
  return {
    marginTop: "4px",
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: "20px",
    letterSpacing: "-0.018em",
    color,
  };
}
const overviewSmallStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };

// Selection tiles — filled, no border/ring; active = soft kind tint (single difference).
function kindCardStyle(k: CommissionKind): CSSProperties {
  const active = filter.value === k;
  return {
    padding: "10px",
    borderRadius: "12px",
    background: active ? `color-mix(in srgb, ${KIND[k].color} 12%, transparent)` : "var(--v5-surface)",
  };
}
const kindAmtStyle: CSSProperties = {
  marginTop: "6px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
  lineHeight: 1,
};
const kindCountStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};

function pillStyle(active: boolean, color: string): CSSProperties {
  return {
    height: "44px",
    padding: "0 16px",
    // 未选中态原用 surface-2,与页面底同色(亮色 ΔE 2.2)不可辨,改 L1 surface。
    background: active ? color : "var(--v5-surface)",
  };
}
// Bright active fill → on-brand text (brand-2 fill takes on-brand-2), incl. inactive fallback.
function pillTextStyle(active: boolean, color: string): CSSProperties {
  return {
    fontSize: "12px",
    fontWeight: 600,
    color: active
      ? color === "var(--v5-brand-2)"
        ? "var(--v5-on-brand-2)"
        : "var(--v5-on-brand)"
      : "var(--v5-ink-3)",
  };
}

// Empty state — dashed outline hint, no fill (V5 empty-state idiom).
const emptyStyle: CSSProperties = { borderRadius: "16px", border: "1px dashed var(--v5-border-strong)", padding: "32px", fontSize: "12px", color: "var(--v5-ink-3)" };
// Transparent hairline group — border-top opens the group, rows separate with hairlines.
const listGroupStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
function eventRowStyle(isLast: boolean): CSSProperties {
  return {
    padding: "12px 0",
    gap: "12px",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
function eventIconStyle(kind: CommissionKind): CSSProperties {
  return {
    width: "36px",
    height: "36px",
    borderRadius: "12px",
    background: `color-mix(in srgb, ${KIND[kind].color} 20%, transparent)`,
  };
}
const directBadgeStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand)",
  background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)",
  padding: "0 4px",
  borderRadius: "4px",
};
const extendedBadgeStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
  background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)",
  padding: "0 4px",
  borderRadius: "4px",
};
const eventMetaStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
</script>
