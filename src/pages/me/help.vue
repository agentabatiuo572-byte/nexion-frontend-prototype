<!--
  Help Center (ported from Nexion-prototype/app/(main)/me/help/page.tsx).
  FAQ search + category chips + accordion. The header link opens support. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" />
      <view class="px-4 flex justify-end" style="padding-bottom: 8px">
        <view class="flex items-center active:opacity-70" :style="contactLinkStyle" role="button" tabindex="0" :aria-label="w.contactSupport" @click="goSupport"  @keydown.enter.prevent="goSupport" @keydown.space.prevent="goSupport">
          <text>{{ w.contactSupport }} →</text>
        </view>
      </view>

      <!-- Search -->
      <view class="mx-4" style="margin-bottom: 12px; position: relative">
        <view :style="searchIconStyle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        </view>
        <input
          :value="query"
          :placeholder="w.searchPlaceholder"
          :style="searchInputStyle"
          placeholder-class="ph"
          :aria-label="w.searchLabel"
          @input="onSearch"
        />
      </view>

      <view v-if="faqLanguageFallback" class="mx-4" :style="faqFallbackStyle" role="status" aria-live="polite">
        <text>{{ w.faqLanguageFallback }}</text>
      </view>

      <!-- Category chips -->
      <GlassSegments :label="w.categoryGroupLabel" semantics="radio"  :model-value="cat" @select="selectCategory" :options="categoryOptions" layout="scroll" style="margin: 0 16px 12px"  />

      <!-- FAQ list -->
      <view class="mx-4" :style="faqWrapStyle">
        <EmptyState v-if="faqLoadError && faqs.length === 0" kind="recoverable-error" :title="t.empty.errorTitle" :desc="t.empty.errorDesc" :cta-label="t.empty.errorCta" @cta="loadFaqs" />
        <EmptyState v-else-if="filtered.length === 0 && faqPageNum > 0 && !faqLoading && !faqLoadError && !canLoadMoreFaqs" :kind="query.trim() || requestedFaqId ? 'no-search-results' : 'empty-list'" :title="query.trim() || requestedFaqId ? t.empty.searchTitle : t.empty.listTitle" :desc="query.trim() || requestedFaqId ? t.empty.searchDesc : t.empty.listDesc" compact />
        <template v-else>
          <view
            v-for="(it, i) in filtered"
            :key="it.id"
            :style="i !== 0 ? faqDividerStyle : undefined"
          >
            <view class="w-full flex items-center active:opacity-90" :style="faqHeadStyle" role="button" tabindex="0" :aria-expanded="openId === it.id" @click="toggleFaq(it.id)"  @keydown.enter.prevent="toggleFaq(it.id)" @keydown.space.prevent="toggleFaq(it.id)">
              <text :style="faqQStyle" style="flex: 1">{{ it.q }}</text>
              <view :style="chevStyle(openId === it.id)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </view>
            </view>
            <view v-if="openId === it.id" :style="faqBodyStyle">
              <text :style="faqAStyle">{{ it.a }}</text>
            </view>
          </view>
        </template>
        <view v-if="faqLoading && faqs.length === 0" role="status" aria-live="polite" aria-busy="true" :style="faqFallbackStyle">
          <text>{{ w.loadingMore }}</text>
        </view>
        <view v-if="faqLoadError && faqs.length > 0" :style="faqFallbackStyle" role="status" aria-live="polite">
          <text>{{ t.empty.errorDesc }}</text>
          <view
            class="active:opacity-80"
            role="button"
            tabindex="0"
            :aria-label="t.empty.errorCta"
            :aria-disabled="faqLoading ? 'true' : 'false'"
            @click="retryFaqs"

            @keydown.enter.prevent="retryFaqs" @keydown.space.prevent="retryFaqs"
          >
            <text>{{ t.empty.errorCta }}</text>
          </view>
        </view>
        <view
          v-if="canLoadMoreFaqs"
          class="flex items-center justify-center active:opacity-80"
          :style="faqLoadMoreStyle"
          role="button"
          tabindex="0"
          :aria-disabled="faqLoading ? 'true' : 'false'"
          @click="loadMoreFaqs"

          @keydown.enter.prevent="loadMoreFaqs" @keydown.space.prevent="loadMoreFaqs"
        >
          <text>{{ faqLoading ? w.loadingMore : w.loadMore }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { platformDisplayText } from "@/lib/brand-copy";

import { computed, nextTick, ref, watch, type CSSProperties } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { supportApi } from "@/api/runtime";
import { remoteAccountScope } from "@/lib/remote-account-epoch";
import type { SupportFaq } from "@/domain/support";
import { useLocaleStore } from "@/store/locale";
import { useApp } from "@/store/app";
import { navTo } from "@/lib/route";
import { readPublishedFaqPages } from "@/lib/published-faq-pages";

const t = useT();
const w = computed(() => t.value.help);
const locale = useLocaleStore();
const app = useApp();
type FaqCategory = "getting-started" | "earnings" | "devices" | "payments" | "technical";
const faqs = ref<SupportFaq[]>([]);
const FAQ_PAGE_SIZE = 20;
const faqPageNum = ref(0);
const faqTotal = ref(0);
const faqLoading = ref(false);

const catOrder: FaqCategory[] = ["getting-started", "earnings", "devices", "payments", "technical"];

const query = ref("");
const requestedFaqId = ref("");
onLoad((options) => {
  requestedFaqId.value = typeof options?.faqId === "string" ? options.faqId.trim().slice(0, 128) : "";
});
const cat = ref<FaqCategory | "all">("all");
const openId = ref<string | null>(null);
const faqLoadError = ref(false);
let faqRequestGeneration = 0;
const canLoadMoreFaqs = computed(() => faqs.value.length < faqTotal.value);
const requestedFaqLanguage = computed(() => locale.code === "zh" ? "zh-CN" : locale.code === "vi" ? "vi-VN" : "en-US");
const faqLanguageFallback = computed(() => faqs.value.length > 0
  && faqs.value.some((faq) => faq.language.toLowerCase() !== requestedFaqLanguage.value.toLowerCase()));

async function loadFaqs() {
  const requestGeneration = ++faqRequestGeneration;
  const requestedLanguage = locale.code;
  const requestScope = remoteAccountScope.snapshot();
  faqLoadError.value = false;
  faqLoading.value = true;
  try {
    const targetId = requestedFaqId.value;
    const isCurrent = () => requestGeneration === faqRequestGeneration && requestedLanguage === locale.code
      && remoteAccountScope.isCurrent(requestScope);
    const allItems = targetId ? await readPublishedFaqPages(supportApi, requestedLanguage, isCurrent) : null;
    const next = allItems ? { items: allItems, total: allItems.length, pageNum: 1 }
      : await supportApi.faqPage(requestedLanguage, undefined, "Help Center", 1, FAQ_PAGE_SIZE);
    if (requestGeneration === faqRequestGeneration && requestedLanguage === locale.code && remoteAccountScope.isCurrent(requestScope)) {
      faqs.value = next.items;
      faqPageNum.value = next.pageNum;
      faqTotal.value = next.total;
      if (targetId && requestedFaqId.value === targetId) {
        const target = next.items.find(item => item.id === targetId);
        query.value = target?.question ?? "";
        openId.value = target?.id ?? null;
      }
    }
  } catch {
    if (requestGeneration === faqRequestGeneration && requestedLanguage === locale.code && remoteAccountScope.isCurrent(requestScope)) faqLoadError.value = true;
  } finally {
    if (requestGeneration === faqRequestGeneration && remoteAccountScope.isCurrent(requestScope)) faqLoading.value = false;
  }
}

async function loadMoreFaqs() {
  if (faqLoading.value || !canLoadMoreFaqs.value) return;
  const requestGeneration = ++faqRequestGeneration;
  const requestedLanguage = locale.code;
  const requestScope = remoteAccountScope.snapshot();
  const nextPage = faqPageNum.value + 1;
  faqLoadError.value = false;
  faqLoading.value = true;
  try {
    const next = await supportApi.faqPage(requestedLanguage, undefined, "Help Center", nextPage, FAQ_PAGE_SIZE);
    if (requestGeneration === faqRequestGeneration && requestedLanguage === locale.code && remoteAccountScope.isCurrent(requestScope)) {
      faqs.value = [...new Map([...faqs.value, ...next.items].map(item => [item.id, item])).values()];
      faqPageNum.value = next.pageNum;
      faqTotal.value = next.total;
    }
  } catch {
    if (requestGeneration === faqRequestGeneration && requestedLanguage === locale.code && remoteAccountScope.isCurrent(requestScope)) faqLoadError.value = true;
  } finally {
    if (requestGeneration === faqRequestGeneration && remoteAccountScope.isCurrent(requestScope)) faqLoading.value = false;
  }
}

function retryFaqs() {
  if (faqLoading.value) return;
  void loadFaqs();
}

function resetFaqProjection() {
  faqRequestGeneration += 1;
  faqs.value = [];
  faqPageNum.value = 0;
  faqTotal.value = 0;
  openId.value = null;
  faqLoadError.value = false;
  faqLoading.value = false;
}

onShow(() => {
  void loadFaqs();
});

function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onSearch(e: Event) {
  requestedFaqId.value = "";
  query.value = detailVal(e);
}
function selectCategory(value: FaqCategory | "all") {
  if (requestedFaqId.value) query.value = "";
  requestedFaqId.value = "";
  cat.value = value;
}
/**
 * 分类单选组的左右方向键:移一格并选上,焦点跟到新选中项(roving tabindex 的标准行为)。
 * 索引 0 是「全部」,其余按 catOrder 顺延 —— 与模板里的渲染顺序严格同序。
 */
const CATEGORY_ORDER: Array<FaqCategory | "all"> = ["all", ...catOrder];
function moveCategory(index: number, delta: number): void {
  const next = CATEGORY_ORDER[(index + delta + CATEGORY_ORDER.length) % CATEGORY_ORDER.length];
  if (!next || next === cat.value) return;
  selectCategory(next);
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('.nx-help-cat-chip[tabindex="0"]')?.focus();
  });
}
function toggleFaq(id: string) {
  openId.value = openId.value === id ? null : id;
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return faqs.value.map((it) => ({ ...it, q: platformDisplayText(it.question), a: platformDisplayText(it.answer) })).filter((it) => {
    if (requestedFaqId.value) return it.id === requestedFaqId.value;
    // M4 publishes canonical support categories; the app groups these into topics.
    const category = it.category.trim().toLowerCase();
    const inCat = cat.value === "all" || category === cat.value
      || (cat.value === "payments" && ["deposit", "withdrawal"].includes(category))
      || (cat.value === "devices" && ["hardware", "genesis"].includes(category))
      || (cat.value === "getting-started" && ["general", "account", "other"].includes(category));
    const inSearch = !q || it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q);
    return inCat && inSearch;
  });
});

const emptyResults = computed(() => fmt(w.value.emptyResults, { q: query.value }));

function categoryLabel(c: FaqCategory): string {
  switch (c) {
    case "getting-started":
      return w.value.catGettingStarted;
    case "earnings":
      return w.value.catEarnings;
    case "devices":
      return w.value.catDevices;
    case "payments":
      return w.value.catPayments;
    case "technical":
      return w.value.catTechnical;
  }
}

watch([() => String(app.accountKey), () => app.accountBindingEpoch, () => locale.code], ([accountKey], [previousAccountKey]) => {
  // A reload's first server-account binding must retain its URL target.
  if (previousAccountKey !== "default" || !/^user:[1-9]\d*$/.test(String(accountKey))) requestedFaqId.value = "";
  query.value = "";
  resetFaqProjection();
  void loadFaqs();
});

function goSupport() {
  navTo("/pages/me/support");
}
const contactLinkStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-brand)", minHeight: "44px", paddingLeft: "10px", paddingRight: "10px" };
const searchIconStyle: CSSProperties = { position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", zIndex: 1 };
// Search — 输入框贴在页面底上,零 border。原 surface-3 对页面底亮色仅 ΔE 2.7(分不出),
// 整个搜索框在亮色主题下看不见,改 L1 surface(对页面底 ΔE 6.42 亮 / 6.32 暗)。
const searchInputStyle: CSSProperties = {
  width: "100%",
  background: "var(--v5-surface)",
  borderRadius: "12px",
  padding: "10px 12px 10px 36px",
  fontSize: "var(--ui-type-input)",
  lineHeight: "var(--ui-type-input-lh)",
  color: "var(--v5-ink)",
};
function chipStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: "44px",
    padding: "0 16px",
    marginRight: "6px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 500,
    // 未选中原 surface-2 与页面底同色不可辨(亮色 ΔE 2.2),分类胶囊直接坐在页面底上 → 改 L1
    background: active ? "color-mix(in srgb, var(--v5-brand) 15%, transparent)" : "var(--v5-surface)",
    color: active ? "var(--v5-brand)" : "var(--v5-ink-3)",
  };
}
// FAQ list — transparent hairline group on the page floor (2px optical indent,
// border-top opens the group; per-item hairlines below). No card chrome.
const faqWrapStyle: CSSProperties = {
  marginBottom: "12px",
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
const faqFallbackStyle: CSSProperties = {
  marginBottom: "12px",
  padding: "9px 12px",
  borderRadius: "10px",
  background: "color-mix(in srgb, var(--v5-warning) 10%, var(--v5-surface))",
  color: "var(--v5-ink-2)",
  fontSize: "12px",
  lineHeight: 1.45,
};
const emptyStyle: CSSProperties = { padding: "24px", textAlign: "center" };
const emptyTextStyle: CSSProperties = { fontSize: "var(--ui-type-list-subtitle)", color: "color-mix(in srgb, var(--v5-ink) 80%, transparent)" };
const faqDividerStyle: CSSProperties = { borderTop: "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)" };
const faqHeadStyle: CSSProperties = { gap: "12px", padding: "14px 0", minHeight: "48px" };
const faqQStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1.4 };
function chevStyle(open: boolean): CSSProperties {
  return { transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 150ms ease" };
}
const faqBodyStyle: CSSProperties = { padding: "0 0 14px" };
const faqAStyle: CSSProperties = { fontSize: "var(--ui-type-long-form)", color: "var(--v5-ink-2)", lineHeight: "var(--ui-type-long-form-lh)" };
const faqLoadMoreStyle: CSSProperties = { minHeight: "44px", color: "var(--v5-brand)", fontSize: "13px", fontWeight: 600, borderTop: "1px solid var(--v5-border)" };

import GlassSegments from "@/components/glass-segments.vue";
const categoryOptions = computed(() => [{ value: "all", label: t.value.receipt.tabAll }, ...catOrder.map(value => ({ value, label: categoryLabel(value) }))]);
</script>

<style scoped>
/* placeholder-class="ph" target — referenced by the search input (P2). */
.ph {
  color: var(--v5-ink-4);
}
</style>
