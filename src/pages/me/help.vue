<!--
  Help Center (ported from Nexion-prototype/app/(main)/me/help/page.tsx).
  FAQ search + category chips + accordion, an inline NexGridBot chat (keyword
  match over the FAQ corpus), and a contact card. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" />
      <view class="px-4 flex justify-end" style="padding-bottom: 8px">
        <view class="flex items-center active:opacity-70" :style="contactLinkStyle" role="button" tabindex="0" :aria-label="w.contactSupport" @click="goSupport">
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
          @input="onSearch"
        />
      </view>

      <!-- Category chips -->
      <scroll-view scroll-x class="mx-4" style="margin-bottom: 12px; white-space: nowrap">
        <view
          class="active:opacity-70"
          :style="chipStyle(cat === 'all')"
          @click="cat = 'all'"
        >
          <text>{{ t.receipt.tabAll }}</text>
        </view>
        <view
          v-for="c in catOrder"
          :key="c"
          class="active:opacity-70"
          :style="chipStyle(cat === c)"
          @click="cat = c"
        >
          <text>{{ categoryLabel(c) }}</text>
        </view>
      </scroll-view>

      <!-- FAQ list -->
      <view class="mx-4" :style="faqWrapStyle">
        <EmptyState v-if="faqLoadError" kind="recoverable-error" :title="t.empty.errorTitle" :desc="t.empty.errorDesc" :cta-label="t.empty.errorCta" @cta="loadFaqs" />
        <EmptyState v-else-if="filtered.length === 0" :kind="query.trim() ? 'no-search-results' : 'empty-list'" :title="query.trim() ? t.empty.searchTitle : t.empty.listTitle" :desc="query.trim() ? t.empty.searchDesc : t.empty.listDesc" compact />
        <template v-else>
          <view
            v-for="(it, i) in filtered"
            :key="it.id"
            :style="i !== 0 ? faqDividerStyle : undefined"
          >
            <view class="w-full flex items-center active:opacity-90" :style="faqHeadStyle" @click="toggleFaq(it.id)">
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
      </view>

      <!-- NexGridBot -->
      <view class="mx-4" :style="botCardStyle">
        <view class="flex items-center" :style="botHeadStyle">
          <view class="grid place-items-center" :style="botIconBoxStyle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
          </view>
          <text :style="botTitleStyle">{{ w.askBot }}</text>
        </view>
        <scroll-view scroll-y :style="botScrollStyle" :scroll-top="botScrollTop" :scroll-with-animation="true">
          <view style="padding: 12px 16px; display: flex; flex-direction: column; gap: 8px">
            <view v-for="m in bot" :key="m.id" class="flex" :style="{ justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start' }">
              <view :style="bubbleStyle(m.from === 'user')">
                <text :style="bubbleTextStyle(m.from === 'user')">{{ m.text }}</text>
              </view>
            </view>
            <view v-if="thinking" class="flex" style="justify-content: flex-start">
              <view :style="thinkingStyle">
                <text :style="thinkingTextStyle">{{ w.botThinking }}</text>
              </view>
            </view>
          </view>
        </scroll-view>
        <view class="flex items-center" :style="botInputRowStyle">
          <input
            :value="botInput"
            :placeholder="w.botPlaceholder"
            :style="botInputStyle"
            placeholder-class="ph"
            confirm-type="send"
            @input="onBotInput"
            @confirm="sendToBot"
          />
          <!-- 输入为空时点了没用 → 显式 aria-disabled;有内容时给按下反馈 -->
          <view class="grid place-items-center" :class="{ 'active:opacity-80 transition-opacity': !!botInput.trim() }" role="button" tabindex="0" :aria-disabled="botInput.trim() ? 'false' : 'true'" :style="sendBtnStyle(!!botInput.trim())" @click="sendToBot">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="botInput.trim() ? 'var(--v5-on-brand)' : 'var(--v5-ink-4)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
          </view>
        </view>
      </view>

      <!-- Contact -->
      <view class="mx-4" :style="contactRowStyle">
        <view class="flex items-center" style="gap: 12px">
          <view class="grid place-items-center" :style="mailBoxStyle">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
          </view>
          <view class="min-w-0" style="flex: 1">
            <text class="block" :style="contactTitleStyle">{{ w.contactSupport }}</text>
            <text class="block" :style="contactHintStyle">{{ w.contactHint }}</text>
          </view>
          <view class="active:opacity-90 transition-opacity" :style="contactCtaStyle" role="button" tabindex="0" :aria-label="w.contactCta" @click="goTicketCreate">
            <text>{{ w.contactCta }}</text>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { supportApi } from "@/api/runtime";
import type { SupportFaq } from "@/domain/support";
import { useLocaleStore } from "@/store/locale";
import { navTo } from "@/lib/route";

const t = useT();
const w = computed(() => t.value.help);
const locale = useLocaleStore();
type FaqCategory = "getting-started" | "earnings" | "devices" | "payments" | "technical";
const faqs = ref<SupportFaq[]>([]);

const catOrder: FaqCategory[] = ["getting-started", "earnings", "devices", "payments", "technical"];

const query = ref("");
const cat = ref<FaqCategory | "all">("all");
const openId = ref<string | null>(null);
const faqLoadError = ref(false);

async function loadFaqs() {
  faqLoadError.value = false;
  try { faqs.value = await supportApi.faqs(locale.code); }
  catch { faqs.value = []; faqLoadError.value = true; }
}

onShow(() => { void loadFaqs(); });

function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onSearch(e: Event) {
  query.value = detailVal(e);
}
function toggleFaq(id: string) {
  openId.value = openId.value === id ? null : id;
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return faqs.value.map((it) => ({ ...it, q: it.question, a: it.answer })).filter((it) => {
    const inCat = cat.value === "all" || it.category === cat.value;
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

interface BotMessage {
  id: string;
  from: "user" | "bot";
  text: string;
}
const bot = ref<BotMessage[]>([{ id: "init", from: "bot", text: w.value.botGreeting }]);
const botInput = ref("");
const thinking = ref(false);
const botScrollTop = ref(0);

function bumpScroll() {
  // Nudge scroll-top to jump to the latest message (uni scroll-view).
  botScrollTop.value += 9999;
}
function onBotInput(e: Event) {
  botInput.value = detailVal(e);
}
function sendToBot() {
  const q = botInput.value.trim();
  if (!q) return;
  bot.value = [...bot.value, { id: `u-${Date.now()}`, from: "user", text: q }];
  botInput.value = "";
  thinking.value = true;
  bumpScroll();
  setTimeout(() => {
    const needle = q.toLowerCase();
    const hit = faqs.value.find((item) => item.question.toLowerCase().includes(needle)
      || item.answer.toLowerCase().includes(needle)
      || needle.split(/\s+/).some((word) => word.length > 3 && `${item.question} ${item.answer}`.toLowerCase().includes(word)));
    bot.value = [...bot.value, { id: `b-${Date.now()}`, from: "bot", text: hit ? hit.answer : w.value.botUnmatched }];
    thinking.value = false;
    bumpScroll();
  }, 900);
}

function goSupport() {
  navTo("/pages/me/support");
}
function goTicketCreate() {
  navTo("/pages/me/support-tickets?mode=create");
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
  fontSize: "13px",
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
const emptyStyle: CSSProperties = { padding: "24px", textAlign: "center" };
const emptyTextStyle: CSSProperties = { fontSize: "13px", color: "color-mix(in srgb, var(--v5-ink) 80%, transparent)" };
const faqDividerStyle: CSSProperties = { borderTop: "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)" };
const faqHeadStyle: CSSProperties = { gap: "12px", padding: "14px 0", minHeight: "48px" };
const faqQStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1.4 };
function chevStyle(open: boolean): CSSProperties {
  return { transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 150ms ease" };
}
const faqBodyStyle: CSSProperties = { padding: "0 0 14px" };
const faqAStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.62 };
// NexGridBot — a contained chat widget (single surface container, no border).
const botCardStyle: CSSProperties = {
  marginBottom: "12px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
  overflow: "hidden",
};
const botHeadStyle: CSSProperties = { gap: "8px", padding: "12px 16px", borderBottom: "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)" };
const botIconBoxStyle: CSSProperties = { width: "32px", height: "32px", borderRadius: "8px", background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)" };
const botTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const botScrollStyle: CSSProperties = { maxHeight: "280px" };
function bubbleStyle(isUser: boolean): CSSProperties {
  return {
    maxWidth: "80%",
    padding: "8px 12px",
    borderRadius: "16px",
    background: isUser ? "color-mix(in srgb, var(--v5-brand) 15%, transparent)" : "var(--v5-surface-2)",
  };
}
function bubbleTextStyle(isUser: boolean): CSSProperties {
  return {
    fontSize: "13px",
    color: isUser ? "var(--v5-ink)" : "color-mix(in srgb, var(--v5-ink) 90%, transparent)",
    lineHeight: 1.375,
  };
}
const thinkingStyle: CSSProperties = { background: "var(--v5-surface-2)", borderRadius: "16px", padding: "8px 12px" };
const thinkingTextStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const botInputRowStyle: CSSProperties = { gap: "8px", padding: "10px 12px", borderTop: "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)" };
const botInputStyle: CSSProperties = { flex: "1", background: "transparent", fontSize: "13px", color: "var(--v5-ink)" };
function sendBtnStyle(active: boolean): CSSProperties {
  return { width: "32px", height: "32px", borderRadius: "8px", background: active ? "var(--v5-brand-2)" : "var(--v5-surface-2)" };
}
// Contact — trailing action row on the floor; hairline opens it under the bot.
const contactRowStyle: CSSProperties = {
  padding: "16px 2px 0",
  borderTop: "1px solid var(--v5-border)",
};
const mailBoxStyle: CSSProperties = { width: "40px", height: "40px", borderRadius: "12px", background: "color-mix(in srgb, var(--v5-brand) 10%, transparent)" };
const contactTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const contactHintStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
const contactCtaStyle: CSSProperties = {
  // 《07》tap≥44:原 32px
  height: "44px",
  padding: "0 12px",
  display: "flex",
  alignItems: "center",
  borderRadius: "8px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontSize: "12px",
  fontWeight: 600,
};
</script>

<style scoped>
/* placeholder-class="ph" target — referenced by the search + bot inputs (P2). */
.ph {
  color: var(--v5-ink-4);
}
</style>
