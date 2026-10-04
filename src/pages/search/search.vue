<!--
  Global search — ported from Nexion-prototype/app/(main)/search/page.tsx.

  Single search input indexes routes, published Help Center FAQs, live store
  products, user devices, and network members. Real-time filter, grouped results.

  Wrapped in <AppChassis active="home"> (reached from Home). SetPageHeader
  backHref="/" → SubPageHeader back="/pages/index/index". Search
  navigation reports a visible recovery action when the target cannot open.
-->
<template>
  <AppChassis active="home">
    <CardStagger class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/index/index" />

      <!-- Search input -->
      <view class="mx-4">
        <view class="flex items-center" :style="inputWrapStyle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            v-model="q"
            type="text"
            :placeholder="t.search.placeholder"
            :style="inputStyle"
            placeholder-class="nx-search-ph"
            :aria-label="t.search.inputLabel"
          />
        </view>
      </view>

      <view v-if="navigationError" class="mx-4 mt-3" :style="navigationErrorStyle" role="alert">
        <text class="block" :style="navigationErrorTextStyle">{{ t.search.navigationFailed }}</text>
        <view class="active:opacity-70" :style="navigationRetryStyle" role="button" tabindex="0"
          @click="retryNavigation" @keydown.enter.prevent="retryNavigation" @keydown.space.prevent="retryNavigation">
          <text>{{ t.search.retryNavigation }}</text>
        </view>
      </view>

      <!-- Empty state -->
      <view v-if="!q.trim()" class="nx-empty mx-4 mt-4 rounded-2xl text-center" :style="emptyCardStyle">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 8px"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <text class="block" style="font-size: 13px; color: var(--v5-ink)">{{ t.search.emptyTitle }}</text>
        <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px; line-height: 1.625">{{ t.search.emptyBody }}</text>
        <view class="nx-search-help active:opacity-75" role="button" tabindex="0"
          @click="openHelp" @keydown.enter.prevent="openHelp" @keydown.space.prevent="openHelp">
          <text>{{ t.me.helpFaq }}</text>
        </view>
      </view>

      <view v-else-if="searchResultState.body === 'loading'" class="nx-empty mx-4 mt-4 rounded-2xl text-center" :style="emptyCardStyle">
        <text class="block" style="font-size: 13px; color: var(--v5-ink-3)">{{ t.home.networkStatUpdating }}</text>
      </view>

      <EmptyState
        v-else-if="searchResultState.body === 'recoverable-error'"
        kind="recoverable-error"
        :title="t.authOtp.errorServiceUnavailable"
        :cta-label="t.ui.retry"
        @cta="retrySearchSources"
      />

      <!-- 无搜索结果 —— 《06》no-search-results:插画 + 引导 + 清除搜索 -->
      <EmptyState
        v-else-if="searchResultState.body === 'empty'"
        kind="no-search-results"
        :title="t.empty.searchTitle"
        :desc="t.empty.searchDesc"
        :cta-label="t.me.helpFaq"
        @cta="openHelp"
      />

      <EmptyState
        v-if="searchResultState.showSourceError"
        class="mx-4 mt-4"
        kind="recoverable-error"
        :title="t.authOtp.errorServiceUnavailable"
        :cta-label="t.ui.retry"
        compact
        @cta="retrySearchSources"
      />

      <!-- Results -->
      <view v-if="searchResultState.body === 'results'" class="mx-4 mt-3 space-y-3">
        <view v-for="grp in groupedList" :key="grp.group">
          <text class="block font-mono-tabular" :style="groupLabelStyle">{{ groupLabel(grp.group) }}</text>
          <view :style="resultCardStyle">
            <view
              v-for="(h, i) in grp.hits"
              :key="`${h.group}-${h.label}-${i}`"
              class="flex items-center nx-search-row"
              role="button" tabindex="0"
              :style="rowStyle(i === grp.hits.length - 1)"
              @click="openHit(h)"
              @keydown.enter.prevent="openHit(h)" @keydown.space.prevent="openHit(h)"
            >
              <view class="flex-1 min-w-0">
                <text class="block truncate" style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ h.label }}</text>
                <text v-if="h.sublabel" class="block truncate" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 2px">{{ h.sublabel }}</text>
              </view>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
            </view>
          </view>
        </view>
      </view>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, type CSSProperties } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import CardStagger from "@/components/card-stagger.vue";
import EmptyState from "@/components/empty-state.vue";
import { useT } from "@/i18n/use-t";
import { useApp } from "@/store/app";
import { useNetwork } from "@/store/network";
import { useLocaleStore } from "@/store/locale";
import { useStaking } from "@/store/staking";
import { PRODUCTS } from "@/mock/products";
import type { Product } from "@/mock/products";
import { productCopy, specRow } from "@/lib/product-copy";
import { deviceName, deviceGpuLabel } from "@/lib/device-copy";
import { remoteApiEnabled, supportApi } from "@/api/runtime";
import type { SupportFaq } from "@/domain/support";
import { readPublishedFaqPages } from "@/lib/published-faq-pages";
import { productCatalogState, productCatalogPresentation, refreshProductCatalog } from "@/store/product-catalog";
import { bindPageVisibilityRefresh, createPageVisibilityRefresh } from "@/lib/page-visibility-refresh";
import { searchStakingRateSummary } from "@/lib/search-staking-rate";
import { resolveSearchResultState, type SearchRemoteStatus } from "@/lib/search-source-state";
import { beginNavigationAttempt, completeNavigationAttempt } from "@/lib/navigation-attempt";
import { fmt } from "@/i18n/format";

type Group = "route" | "device" | "product" | "member" | "faq" | "help";
interface Hit {
  group: Group;
  label: string;
  sublabel?: string;
  href: string;
}

const t = useT();
const app = useApp();
const network = useNetwork();
const locale = useLocaleStore();
const staking = useStaking();

const q = ref("");

let searchSourceReadEpoch = 0;
const publishedFaqs = ref<SupportFaq[]>([]);
const publishedFaqStatus = ref<SearchRemoteStatus>("idle");
let publishedFaqReadEpoch = 0;

async function refreshPublishedFaqs(): Promise<void> {
  const readEpoch = ++publishedFaqReadEpoch;
  const accountKey = app.accountKey;
  const accountEpoch = app.accountBindingEpoch;
  const language = locale.code;
  const isCurrent = () => readEpoch === publishedFaqReadEpoch && accountKey === app.accountKey
    && accountEpoch === app.accountBindingEpoch && language === locale.code;
  publishedFaqs.value = [];
  publishedFaqStatus.value = "loading";
  try {
    const items = await readPublishedFaqPages(supportApi, language, isCurrent);
    if (!isCurrent()) return;
    publishedFaqs.value = items;
    publishedFaqStatus.value = "ready";
  } catch {
    if (isCurrent()) publishedFaqStatus.value = "error";
  }
}

async function refreshSearchSources(force = false): Promise<void> {
  if (!remoteApiEnabled) return;
  void refreshPublishedFaqs();
  const readEpoch = ++searchSourceReadEpoch;
  const accountKey = app.accountKey;
  const accountEpoch = app.accountBindingEpoch;
  // A successful catalogue read advances the runtime revision. Do not start
  // E3 fleet work under the revision it is about to invalidate.
  await refreshProductCatalog(force);
  if (readEpoch !== searchSourceReadEpoch
    || accountKey !== app.accountKey
    || accountEpoch !== app.accountBindingEpoch) return;
  void network.refreshCanonicalNetwork();
  void app.refreshRemoteFleet(undefined, { coalesce: !force });
  void staking.syncRemote();
}

const searchVisibility = createPageVisibilityRefresh((reason) => refreshSearchSources(reason === "return"));

bindPageVisibilityRefresh(searchVisibility, {
  mounted: onMounted,
  shown: onShow,
  hidden: onHide,
});
watch([() => String(app.accountKey), () => app.accountBindingEpoch, () => locale.code], () => refreshSearchSources(true));

function retrySearchSources() {
  refreshSearchSources(true);
}

const devices = computed(() => !remoteApiEnabled
  || app.remoteFleetStatus === "ready"
  || app.remoteFleetHasSnapshot
  ? app.visibleDevices
  : []);
const members = computed(() => !remoteApiEnabled || network.remoteStatus === "ready" ? network.members : []);
const searchableProducts = computed(() => !remoteApiEnabled ? PRODUCTS
  : productCatalogState.status === "ready" ? productCatalogPresentation.value?.products ?? [] : []);

function productSearchDetail(p: Product): string {
  if (!remoteApiEnabled) return productCopy(t.value, p).tagline;
  return [specRow(t.value.store.specGpu, p.gpu)?.v, specRow(t.value.store.specVram, p.vram)?.v]
    .filter(Boolean).join(" · ");
}

// Static route/FAQ catalog. Copy lives in i18n (search.routes / search.faqEntries);
// only the key→href binding stays here.
type RouteKey = keyof typeof t.value.search.routes;
type FaqKey = keyof typeof t.value.search.faqEntries;

const ROUTES: ReadonlyArray<{ key: RouteKey; href: string }> = [
  { key: "home", href: "/pages/index/index" },
  { key: "earn", href: "/pages/earn/earn" },
  { key: "store", href: "/pages/store/store" },
  { key: "orders", href: "/pages/store/orders" },
  { key: "tradeIn", href: "/pages/me/devices" },
  { key: "team", href: "/pages/team/team" },
  { key: "royalty", href: "/pages/team/unilevel" },
  { key: "networkMap", href: "/pages/team/network" },
  { key: "wallet", href: "/pages/me/wallet" },
  { key: "bankCards", href: "/pages/me/wallet-cards" },
  { key: "walletBills", href: "/pages/me/wallet-bills" },
  { key: "withdraw", href: "/pages/me/wallet-withdraw-method" },
  { key: "staking", href: "/pages/staking/staking" },
  { key: "genesis", href: "/pages/genesis/marketplace" },
  { key: "goals", href: "/pages/me/goals" },
  { key: "rewards", href: "/pages/me/rewards" },
  { key: "receipts", href: "/pages/me/receipts" },
  { key: "notifications", href: "/pages/me/notifications" },
  { key: "profile", href: "/pages/me/profile" },
  { key: "security", href: "/pages/me/security" },
  { key: "preferences", href: "/pages/me/preferences" },
  { key: "language", href: "/pages/me/language" },
  { key: "help", href: "/pages/me/help" },
  { key: "supportTickets", href: "/pages/me/support-tickets" },
  { key: "risk", href: "/pages/me/risk-disclosure" },
  { key: "trust", href: "/pages/trust/trust" },
  { key: "developer", href: "/pages/developer/developer" },
  { key: "globe", href: "/pages/globe/globe" },
  { key: "market", href: "/pages/market/market" },
  { key: "events", href: "/pages/events/events" },
  { key: "missions", href: "/pages/missions/missions" },
  { key: "courses", href: "/pages/learn/courses" },
];

const FAQ: ReadonlyArray<{ key: FaqKey; href: string }> = [
  { key: "royalty", href: "/pages/team/unilevel" },
  { key: "staking", href: "/pages/staking/staking" },
  { key: "genesis", href: "/pages/genesis/genesis" },
  { key: "nex", href: "/pages/me/wallet" },
];

const results = computed<Hit[]>(() => {
  const query = q.value.trim().toLowerCase();
  if (!query) return [];
  const out: Hit[] = [];
  // 过滤跑在当前语言的译文上,不是英文字面量 —— 换语言后搜索词跟着换语言可搜。
  const routeCopy = t.value.search.routes;
  const faqCopy = t.value.search.faqEntries;
  for (const r of ROUTES) {
    const c = routeCopy[r.key];
    const sublabel = r.key === "staking"
      ? searchStakingRateSummary({
        remoteReady: staking.remoteReady,
        pools: staking.pools,
        fallback: c.sub,
        formatApy: (apy) => fmt(t.value.home.quickStakeApyFormat, { n: apy }),
      })
      : c.sub;
    if (c.label.toLowerCase().includes(query) || sublabel.toLowerCase().includes(query)) {
      out.push({ group: "route", label: c.label, sublabel, href: r.href });
    }
  }
  for (const p of searchableProducts.value) {
    // Match the displayed SKU specs, never an unrelated marketing tagline.
    const detail = productSearchDetail(p);
    if (p.name.toLowerCase().includes(query) || detail.toLowerCase().includes(query)) {
      out.push({
        group: "product",
        label: p.name,
        sublabel: `$${p.price}${detail ? ` · ${detail}` : ""}`,
        href: `/pages/store/detail?id=${p.id}`,
      });
    }
  }
  for (const d of devices.value) {
    // Same rule as products above: match the strings the user can actually see.
    // SKU names and hardware models pass through untranslated on both sides.
    const name = deviceName(t.value, d);
    const gpu = deviceGpuLabel(t.value, d);
    if (name.toLowerCase().includes(query) || gpu.toLowerCase().includes(query)) {
      out.push({ group: "device", label: name, sublabel: gpu, href: "/pages/earn/earn" });
    }
  }
  for (const m of members.value) {
    if (m.name.toLowerCase().includes(query)) {
      out.push({
        group: "member",
        label: m.name,
        sublabel: `${m.city ?? ""} · V${m.vRank}`,
        href: "/pages/team/network",
      });
    }
  }
  for (const f of remoteApiEnabled ? [] : FAQ) {
    const c = faqCopy[f.key];
    if (c.label.toLowerCase().includes(query) || c.sub.toLowerCase().includes(query)) {
      out.push({ group: "faq", label: c.label, sublabel: c.sub, href: f.href });
    }
  }
  for (const faq of publishedFaqs.value) {
    if (faq.question.toLowerCase().includes(query) || faq.answer.toLowerCase().includes(query)) {
      out.push({ group: "faq", label: faq.question, sublabel: faq.answer,
        href: `/pages/me/help?faqId=${encodeURIComponent(faq.id)}` });
    }
  }
  const help: Hit = {
    group: "help",
    label: t.value.me.helpFaq,
    href: "/pages/me/help",
  };
  return out.length ? [...out.slice(0, 29), help] : [];
});

const searchResultState = computed(() => resolveSearchResultState({
  hasQuery: !!q.value.trim(),
  remoteCatalogueStatus: remoteApiEnabled ? productCatalogState.status : "ready",
  remoteNetworkStatus: remoteApiEnabled ? network.remoteStatus : "ready",
  remoteFleetStatus: remoteApiEnabled ? app.remoteFleetStatus : "ready",
  remoteFleetHasSnapshot: remoteApiEnabled ? app.remoteFleetHasSnapshot : true,
  remoteFaqStatus: remoteApiEnabled ? publishedFaqStatus.value : "ready",
  resultCount: results.value.length,
}));

// Grouped as an ordered list of { group, hits } (preserves insertion order,
// avoids Object.entries over a reactive Record per P-027 spirit).
const groupedList = computed<Array<{ group: Group; hits: Hit[] }>>(() => {
  const order: Group[] = [];
  const map: Record<string, Hit[]> = {};
  for (const h of results.value) {
    if (!map[h.group]) {
      map[h.group] = [];
      order.push(h.group);
    }
    map[h.group].push(h);
  }
  return order.map((g) => ({ group: g, hits: map[g] }));
});

function groupLabel(g: Group): string {
  const labels = t.value.search.groupLabels;
  return labels[g as keyof typeof labels] ?? g;
}

const navigationState = ref({ attempt: 0, pendingUrl: "", hasError: false });
const navigationError = computed(() => navigationState.value.hasError);
const pendingNavigationUrl = computed(() => navigationState.value.pendingUrl);

function navigateWithFeedback(url: string) {
  const started = beginNavigationAttempt(navigationState.value, url);
  navigationState.value = started;
  uni.navigateTo({
    url,
    success: () => {
      navigationState.value = completeNavigationAttempt(navigationState.value, started.attempt, "success");
    },
    fail: () => {
      navigationState.value = completeNavigationAttempt(navigationState.value, started.attempt, "failure");
    },
  });
}

function openHit(h: Hit) {
  navigateWithFeedback(h.href);
}

function openHelp() {
  navigateWithFeedback("/pages/me/help");
}

function retryNavigation() {
  if (pendingNavigationUrl.value) navigateWithFeedback(pendingNavigationUrl.value);
}

// ── styles ──
// 搜索框直接坐在页面底上,没有外层卡片可"凹陷"→ 用 L1 surface;surface-2 在亮色下与页面底几乎同色,搜索框会消失
const inputWrapStyle: CSSProperties = {
  gap: "8px",
  background: "var(--v5-surface)",
  borderRadius: "12px",
  padding: "0 12px",
  height: "48px",
};
const inputStyle: CSSProperties = {
  flex: "1",
  background: "transparent",
  fontSize: "15px",
  color: "var(--v5-ink)",
  height: "100%",
};
// White-list empty state: dashed border-strong, no fill.
const emptyCardStyle: CSSProperties = {
  padding: "20px",
  border: "1px dashed var(--v5-border-strong)",
  background: "transparent",
};
const noResultsStyle: CSSProperties = {
  padding: "20px",
  border: "1px dashed var(--v5-border-strong)",
  background: "transparent",
};
const navigationErrorStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid color-mix(in srgb, var(--v5-danger) 45%, var(--v5-border))",
  background: "color-mix(in srgb, var(--v5-danger) 8%, transparent)",
};
const navigationErrorTextStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink)" };
const navigationRetryStyle: CSSProperties = { display: "inline-flex", minHeight: "44px", alignItems: "center", color: "var(--v5-brand)", fontSize: "12px", fontWeight: 600 };
const groupLabelStyle: CSSProperties = {
  marginBottom: "6px",
  paddingLeft: "2px",
  fontSize: "12px",
  letterSpacing: "0.16em",
  color: "var(--v5-ink-3)",
};
// Transparent hairline group (earnings-ledger idiom): border-top opens the
// group + 2px optical inset; rows carry their own dividers (last = none).
const resultCardStyle: CSSProperties = {
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function rowStyle(isLast: boolean): CSSProperties {
  return {
    gap: "8px",
    padding: "13px 0",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
</script>

<style scoped>
.nx-search-ph {
  color: var(--v5-ink-4);
}
/* 原版 active:bg-[var(--v5-surface-2)] — row press feedback via bg, not opacity */
.nx-search-row:active {
  background: var(--v5-surface-2);
}
.nx-search-help {
  width: max-content;
  margin: 14px auto 0;
  padding: 9px 14px;
  border-radius: 999px;
  background: var(--v5-brand-soft);
  color: var(--v5-brand);
  font-size: 13px;
  font-weight: 600;
}
</style>
