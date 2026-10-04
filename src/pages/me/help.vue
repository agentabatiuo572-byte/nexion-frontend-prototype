<!--
  Help Center (ported from Nexion-prototype/app/(main)/me/help/page.tsx).
  FAQ search + category chips + accordion, an inline UVELBot chat (keyword
  match over the FAQ corpus), and a contact card. Wrapped in <AppChassis active="me">.
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

      <!-- UVELBot -->
      <view v-if="NOVA_SUPPORT_VISIBLE" class="nx-glass-card mx-4" :style="botCardStyle">
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
                <text :style="bubbleTextStyle(m.from === 'user')">{{ m.id === 'init' ? w.botGreeting : m.text }}</text>
                <text v-if="m.meta" class="block" :style="bubbleMetaStyle(m.from === 'user')">{{ m.meta }}</text>
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
            :aria-label="w.botInputLabel"
            @input="onBotInput"
            @confirm="sendToBot()"
          />
          <!-- 输入为空时点了没用 → 显式 aria-disabled;有内容时给按下反馈 -->
          <view class="grid place-items-center" :class="{ 'active:opacity-80 transition-opacity': !!botInput.trim() && !pendingBotRequest }" role="button" tabindex="0" :aria-label="w.botSendLabel" :aria-disabled="botInput.trim() && !pendingBotRequest ? 'false' : 'true'" :style="sendBtnStyle(!!botInput.trim() && !pendingBotRequest)" @click="sendToBot()"  @keydown.enter.prevent="sendToBot()" @keydown.space.prevent="sendToBot()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="botInput.trim() && !pendingBotRequest ? 'var(--v5-on-brand)' : 'var(--v5-ink-4)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
          </view>
        </view>
        <!-- BUG 175 降级入口:超时/失败后必须给用户出路 —— 重试同一提问,
             或转人工工单。没有这一行,用户只能看着「正在思考…」干等。 -->
        <view v-if="botFailure && !thinking" class="flex items-center" :style="botFallbackRowStyle" data-help-action="bot-fallback" role="status" aria-live="polite">
          <text class="flex-1" :style="botFallbackHintStyle">{{ botFailure === 'timeout' ? w.botTimeoutHint : w.remoteFailed }}</text>
          <view class="shrink-0 inline-flex items-center justify-center active:opacity-80" :style="botFallbackBtnStyle" data-help-action="bot-retry" role="button" tabindex="0" :aria-label="w.botRetry" @click="retryBot"  @keydown.enter.prevent="retryBot" @keydown.space.prevent="retryBot">
            <text>{{ w.botRetry }}</text>
          </view>
          <view class="shrink-0 inline-flex items-center justify-center active:opacity-80" :style="botFallbackTicketStyle" data-help-action="bot-ticket" role="button" tabindex="0" :aria-label="w.contactCta" @click="goTicketCreate"  @keydown.enter.prevent="goTicketCreate" @keydown.space.prevent="goTicketCreate">
            <text>{{ w.contactCta }}</text>
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
          <view class="active:opacity-90 transition-opacity" :style="contactCtaStyle" role="button" tabindex="0" :aria-label="w.contactCta" @click="goTicketCreate"  @keydown.enter.prevent="goTicketCreate" @keydown.space.prevent="goTicketCreate">
            <text>{{ w.contactCta }}</text>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type CSSProperties } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { novaAiApi, remoteApiEnabled, supportApi } from "@/api/runtime";
import { asApiError } from "@/api/errors";
import { buildRemoteHelpRequest, novaHelpSource } from "@/lib/help-bot-remote";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { createLatestAbortableRequest } from "@/lib/nova-thinking";
import { createHelpBotScope, type HelpBotRequest } from "@/lib/help-bot-scope";
import { NOVA_SUPPORT_VISIBLE } from "@/lib/nova-visibility";
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
  syncBotAccountScope();
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
  return faqs.value.map((it) => ({ ...it, q: it.question, a: it.answer })).filter((it) => {
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

interface BotMessage {
  id: string;
  from: "user" | "bot";
  text: string;
  meta?: string;
}
const helpScope = createHelpBotScope(remoteAccountScope);
let helpBound: HelpBotRequest = helpScope.capture();
const bot = ref<BotMessage[]>([]);
function resetBotTranscript() {
  helpScope.add({ from: "bot", text: w.value.botGreeting });
  bot.value = [{ id: "init", from: "bot", text: w.value.botGreeting }];
}
resetBotTranscript();
const botInput = ref("");
const thinking = ref(false);
const botScrollTop = ref(0);
// BUG 175: 远端 chat 的传输兜底是 120s —— 那是**传输**时限,不是 UI 时限。
// 把它当 UI 时限,用户会在「正在思考…」上无限等待,而输入框/发送按钮
// (thinking 期间被禁用)也一起被钉死,无法重试、无法改问。
const BOT_REPLY_TIMEOUT_MS = 25_000;
const botRequestControl = createLatestAbortableRequest();
// 失败后暴露降级入口(重试 / 提交工单);成功或新一轮提问时清掉。
const botFailure = ref<"timeout" | "error" | null>(null);
// A local deadline cannot cancel the model task. Keep its exact identity for replay.
const pendingBotRequest = ref<{ scope: HelpBotRequest; payload: ReturnType<typeof buildRemoteHelpRequest> } | null>(null);
let botDeadline: ReturnType<typeof setTimeout> | null = null;

function clearBotDeadline() {
  if (botDeadline) clearTimeout(botDeadline);
  botDeadline = null;
}

function syncBotAccountScope() {
  const current = helpScope.capture();
  if (helpScope.isCurrent(helpBound)) return;
  helpScope.sync();
  helpBound = current;
  resetBotTranscript();
  botInput.value = "";
  thinking.value = false;
  botFailure.value = null;
  pendingBotRequest.value = null;
  botRequestControl.cancel();
  clearBotDeadline();
}

watch([() => String(app.accountKey), () => app.accountBindingEpoch, () => locale.code], () => {
  syncBotAccountScope();
  requestedFaqId.value = "";
  query.value = "";
  resetFaqProjection();
  void loadFaqs();
});

function bumpScroll() {
  // Nudge scroll-top to jump to the latest message (uni scroll-view).
  botScrollTop.value += 9999;
}
function onBotInput(e: Event) {
  botInput.value = detailVal(e);
}
async function sendToBot(retryPending = false) {
  syncBotAccountScope();
  if (remoteApiEnabled && (thinking.value || (pendingBotRequest.value && !retryPending))) return;
  const pending = retryPending ? pendingBotRequest.value : null;
  const q = pending?.payload.message ?? botInput.value.trim();
  if (!q) return;
  if (!pending) {
    helpScope.add({ from: "user", text: q });
    bot.value = [...bot.value, { id: `u-${Date.now()}`, from: "user", text: q }];
    botInput.value = "";
  }
  botFailure.value = null;
  thinking.value = true;
  bumpScroll();
  if (remoteApiEnabled) {
    const language = locale.code === "zh" || locale.code === "vi" ? locale.code : "en";
    const request = pending?.scope ?? helpScope.capture(language);
    const payload = pending?.payload ?? buildRemoteHelpRequest(q, request.language, request.conversationId, requireCryptoUuid());
    pendingBotRequest.value = { scope: request, payload };
    // BUG 175: 超时/失败必须**必然**结束 thinking,并给出明确原因 + 降级入口。
    // 单靠 finally 不够:传输层忽略 signal 时 catch/finally 永远不会跑。
    const control = botRequestControl.begin();
    const appendBot = (text: string, meta?: string) => {
      const message = { from: "bot" as const, text, ...(meta ? { meta } : {}) };
      helpScope.add(message);
      bot.value = [...bot.value, { id: `b-${Date.now()}`, ...message }];
    };
    const abandon = (failure: "timeout" | "error") => {
      botRequestControl.cancel();
      botFailure.value = failure;
      appendBot(
        failure === "timeout" ? w.value.botTimeout : w.value.remoteFailed,
        failure === "timeout" ? w.value.botTimeoutHint : undefined,
      );
      thinking.value = false;
      bumpScroll();
    };
    clearBotDeadline();
    botDeadline = setTimeout(() => {
      if (!helpScope.isCurrent(request) || !botRequestControl.isCurrent(control.epoch)) return;
      abandon("timeout");
    }, BOT_REPLY_TIMEOUT_MS);
    try {
      let result: Awaited<ReturnType<typeof novaAiApi.chat>>;
      while (true) {
        try {
          result = await novaAiApi.chat(payload, control.signal);
          break;
        } catch (error) {
          const failure = asApiError(error);
          if (failure.status !== 429 || failure.message !== "NOVA_AI_TURN_IN_PROGRESS") throw error;
          // The original turn still owns the server slot. Poll the same turn;
          // its committed answer is replayed once the worker finishes.
          await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
          if (!helpScope.isCurrent(request) || !botRequestControl.isCurrent(control.epoch)) return;
        }
      }
      if (!helpScope.isCurrent(request)) {
        syncBotAccountScope();
        return;
      }
      // 已被超时分支收尾(epoch 已失效):迟到/被取消的应答不得再追加。
      if (!botRequestControl.isCurrent(control.epoch)) return;
      clearBotDeadline();
      pendingBotRequest.value = null;
      appendBot(result.reply, fmt(w.value.remoteSource, { source: novaHelpSource(result), language: request.language.toUpperCase() }));
    } catch (error) {
      if (!helpScope.isCurrent(request)) {
        syncBotAccountScope();
        return;
      }
      if (!botRequestControl.isCurrent(control.epoch)) return;
      clearBotDeadline();
      const failure = asApiError(error);
      if (failure.kind !== "network" && ![408, 429, 500, 502, 503, 504].includes(failure.status ?? 0)) pendingBotRequest.value = null;
      botFailure.value = "error";
      appendBot(w.value.remoteFailed, fmt(w.value.remoteError, { code: failure.message, language: request.language.toUpperCase() }));
    } finally {
      if (helpScope.isCurrent(request) && botRequestControl.isCurrent(control.epoch)) {
        thinking.value = false;
        bumpScroll();
      }
    }
    return;
  }
  const localRequest = helpScope.capture("en");
  setTimeout(() => {
    if (!helpScope.isCurrent(localRequest)) {
      syncBotAccountScope();
      thinking.value = false;
      return;
    }
    const needle = q.toLowerCase();
    const hit = faqs.value.find((item) => item.question.toLowerCase().includes(needle)
      || item.answer.toLowerCase().includes(needle)
      || needle.split(/\s+/).some((word) => word.length > 3 && `${item.question} ${item.answer}`.toLowerCase().includes(word)));
    const responseMessage = { from: "bot" as const, text: hit ? hit.answer : w.value.botUnmatched };
    helpScope.add(responseMessage);
    bot.value = [...bot.value, { id: `b-${Date.now()}`, ...responseMessage }];
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
/** Retry the same server turn while its outcome is unknown. */
function retryBot() {
  if (thinking.value) return;
  if (pendingBotRequest.value) {
    void sendToBot(true);
    return;
  }
  const lastUser = [...bot.value].reverse().find((m) => m.from === "user");
  if (!lastUser) return;
  botInput.value = lastUser.text;
  void sendToBot();
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
const emptyTextStyle: CSSProperties = { fontSize: "13px", color: "color-mix(in srgb, var(--v5-ink) 80%, transparent)" };
const faqDividerStyle: CSSProperties = { borderTop: "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)" };
const faqHeadStyle: CSSProperties = { gap: "12px", padding: "14px 0", minHeight: "48px" };
const faqQStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1.4 };
function chevStyle(open: boolean): CSSProperties {
  return { transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 150ms ease" };
}
const faqBodyStyle: CSSProperties = { padding: "0 0 14px" };
const faqAStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.62 };
const faqLoadMoreStyle: CSSProperties = { minHeight: "44px", color: "var(--v5-brand)", fontSize: "13px", fontWeight: 600, borderTop: "1px solid var(--v5-border)" };
// UVELBot — a contained chat widget (single surface container, no border).
const botCardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  marginBottom: "12px",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
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
function bubbleMetaStyle(isUser: boolean): CSSProperties {
  return {
    marginTop: "5px",
    fontSize: "12px",
    color: isUser ? "var(--v5-ink-3)" : "var(--v5-ink-4)",
    lineHeight: 1.35,
  };
}
const thinkingStyle: CSSProperties = { background: "var(--v5-surface-2)", borderRadius: "16px", padding: "8px 12px" };
const thinkingTextStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const botInputRowStyle: CSSProperties = { gap: "8px", padding: "10px 12px", borderTop: "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)" };
const botInputStyle: CSSProperties = { flex: "1", background: "transparent", fontSize: "13px", color: "var(--v5-ink)" };
const botFallbackRowStyle: CSSProperties = { gap: "8px", padding: "8px 12px 12px", flexWrap: "wrap" };
const botFallbackHintStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-warning)", lineHeight: 1.4, minWidth: "140px" };
const botFallbackBtnStyle: CSSProperties = { minHeight: "32px", padding: "0 12px", borderRadius: "999px", background: "color-mix(in srgb, var(--v5-brand) 12%, transparent)", color: "var(--v5-brand)", fontSize: "12px", fontWeight: 600 };
const botFallbackTicketStyle: CSSProperties = { minHeight: "32px", padding: "0 12px", borderRadius: "999px", border: "1px solid var(--v5-border)", color: "var(--v5-ink-2)", fontSize: "12px", fontWeight: 600 };
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

import GlassSegments from "@/components/glass-segments.vue";
const categoryOptions = computed(() => [{ value: "all", label: t.value.receipt.tabAll }, ...catOrder.map(value => ({ value, label: categoryLabel(value) }))]);
</script>

<style scoped>
/* placeholder-class="ph" target — referenced by the search + bot inputs (P2). */
.ph {
  color: var(--v5-ink-4);
}
</style>
