<!--
  Global search — ported from Nexion-prototype/app/(main)/search/page.tsx.

  Single search input indexes a static route/FAQ catalog + live store products,
  user devices, and network members. Real-time filter, grouped results.

  Wrapped in <AppChassis active="home"> (reached from Home). SetPageHeader
  backHref="/" → SubPageHeader back="/pages/index/index". <Link> → uni.navigateTo
  with fail:()=>{} so taps to not-yet-ported routes are no-ops, not crashes.
  Route/FAQ catalog hrefs map to uni page paths; unported ones still listed
  (faithful catalog) but navigate is a graceful no-op.
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
          />
        </view>
      </view>

      <!-- Empty state -->
      <view v-if="!q.trim()" class="nx-empty mx-4 mt-4 rounded-2xl text-center" :style="emptyCardStyle">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 8px"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <text class="block" style="font-size: 13px; color: var(--v5-ink)">{{ t.search.emptyTitle }}</text>
        <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px; line-height: 1.625">{{ t.search.emptyBody }}</text>
        <view class="nx-search-nova active:opacity-75" role="button" tabindex="0"
          @click="openNova('')" @keydown.enter.prevent="openNova('')" @keydown.space.prevent="openNova('')">
          <text>{{ t.search.askNova }}</text>
        </view>
      </view>

      <!-- 无搜索结果 —— 《06》no-search-results:插画 + 引导 + 清除搜索 -->
      <EmptyState
        v-else-if="results.length === 0"
        kind="no-search-results"
        :title="t.empty.searchTitle"
        :desc="t.empty.searchDesc"
        :cta-label="t.search.askNova"
        @cta="openNova(q)"
      />

      <!-- Results -->
      <view v-else class="mx-4 mt-3 space-y-3">
        <view v-for="grp in groupedList" :key="grp.group">
          <text class="block font-mono-tabular" :style="groupLabelStyle">{{ groupLabel(grp.group) }}</text>
          <view :style="resultCardStyle">
            <view
              v-for="(h, i) in grp.hits"
              :key="`${h.group}-${h.label}-${i}`"
              class="flex items-center nx-search-row"
              :style="rowStyle(i === grp.hits.length - 1)"
              @click="openHit(h)"
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
import { ref, computed, onMounted, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import CardStagger from "@/components/card-stagger.vue";
import EmptyState from "@/components/empty-state.vue";
import { useT } from "@/i18n/use-t";
import { useApp } from "@/store/app";
import { useNetwork } from "@/store/network";
import { PRODUCTS } from "@/mock/products";
import { productCopy } from "@/lib/product-copy";
import { deviceName, deviceGpuLabel } from "@/lib/device-copy";
import { remoteApiEnabled } from "@/api/runtime";
import { productCatalogState, refreshProductCatalog } from "@/store/product-catalog";

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

const q = ref("");

onMounted(() => {
  if (!remoteApiEnabled) return;
  void refreshProductCatalog();
  void network.refreshCanonicalNetwork();
});

const devices = computed(() => app.visibleDevices);
const members = computed(() => network.members);
const searchableProducts = computed(() => !remoteApiEnabled || productCatalogState.status === "ready" ? PRODUCTS : []);

// Static route/FAQ catalog. Copy lives in i18n (search.routes / search.faqEntries);
// only the key→href binding stays here. href = uni page path when the page is
// ported, otherwise a placeholder path that navigate's fail:()=>{} swallows.
type RouteKey = keyof typeof t.value.search.routes;
type FaqKey = keyof typeof t.value.search.faqEntries;

const ROUTES: ReadonlyArray<{ key: RouteKey; href: string }> = [
  { key: "home", href: "/pages/index/index" },
  { key: "earn", href: "/pages/earn/earn" },
  { key: "store", href: "/pages/store/store" },
  { key: "tradeIn", href: "/pages/me/devices" },
  { key: "team", href: "/pages/team/team" },
  { key: "royalty", href: "/pages/team/unilevel" },
  { key: "networkMap", href: "/pages/team/network" },
  { key: "wallet", href: "/pages/me/wallet" },
  { key: "withdraw", href: "/pages/me/wallet-withdraw" },
  { key: "staking", href: "/pages/staking/staking" },
  { key: "genesis", href: "/pages/genesis/marketplace" },
  { key: "goals", href: "/pages/me/goals" },
  { key: "risk", href: "/pages/me/risk-disclosure" },
  { key: "developer", href: "/pages/developer/developer" },
  { key: "globe", href: "/pages/globe/globe" },
  { key: "market", href: "/pages/market/market" },
  { key: "events", href: "/pages/events/events" },
  { key: "missions", href: "/pages/missions/missions" },
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
    if (c.label.toLowerCase().includes(query) || c.sub.toLowerCase().includes(query)) {
      out.push({ group: "route", label: c.label, sublabel: c.sub, href: r.href });
    }
  }
  for (const p of searchableProducts.value) {
    // Match on the copy the user can actually see, so a Vietnamese query hits a
    // Vietnamese tagline. `name` is a brand mark — untranslated on both sides.
    const tagline = productCopy(t.value, p).tagline;
    if (p.name.toLowerCase().includes(query) || tagline.toLowerCase().includes(query)) {
      out.push({
        group: "product",
        label: p.name,
        sublabel: `$${p.price} · ${tagline}`,
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
  for (const m of members.value.slice(0, 30)) {
    if (m.name.toLowerCase().includes(query)) {
      out.push({
        group: "member",
        label: m.name,
        sublabel: `${m.city ?? ""} · V${m.vRank}`,
        href: "/pages/team/network",
      });
    }
  }
  for (const f of FAQ) {
    const c = faqCopy[f.key];
    if (c.label.toLowerCase().includes(query) || c.sub.toLowerCase().includes(query)) {
      out.push({ group: "faq", label: c.label, sublabel: c.sub, href: f.href });
    }
  }
  const help: Hit = {
    group: "help",
    label: t.value.search.askNova,
    sublabel: t.value.search.askNovaWithQuery.replace("{query}", q.value.trim()),
    href: `/pages/support/chat?type=ai&prompt=${encodeURIComponent(q.value.trim())}`,
  };
  return out.length ? [...out.slice(0, 29), help] : [];
});

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

function openHit(h: Hit) {
  uni.navigateTo({ url: h.href, fail: () => {} });
}

function openNova(query: string) {
  const suffix = query.trim() ? `&prompt=${encodeURIComponent(query.trim())}` : "";
  uni.navigateTo({ url: `/pages/support/chat?type=ai${suffix}`, fail: () => {} });
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
.nx-search-nova {
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
