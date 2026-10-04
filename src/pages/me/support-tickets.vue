<!--
  Support tickets (ported from Nexion-prototype/app/(main)/me/support/tickets/page.tsx).
  Three local view modes: list (stat tiles + tabs + transparent hairline ticket
  rows), create (category/subject/description form), detail (message thread +
  reply). Tickets are backed by a Pinia store so create/reply/close persist
  across refresh. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view class="message-family ticket-page" style="padding-bottom: 32px">
      <SubPageHeader back="/pages/me/support" :title="mode.kind === 'create' ? t.tickets.create.title : mode.kind === 'detail' ? t.tickets.detailTitle : t.tickets.pageTitle" :plain="mode.kind === 'detail'" :action-label="mode.kind === 'detail' ? t.tickets.viewTicketList : undefined" :action="mode.kind === 'detail' ? showTicketList : undefined" />
      <text v-if="!supportSessionReady || ticketsStore.loading || (mode.kind === 'detail' && !detailTicket)" class="block px-4" role="status" aria-live="polite">{{ t.conversations.connecting }}</text>
      <view v-if="mode.kind === 'create'" class="px-4" style="padding-bottom: 8px">
        <view class="family-control" :style="backRowStyle" role="button" tabindex="0" :aria-label="t.tickets.backToTickets" @click="setMode({ kind: 'list' })">
            <LiquidGlass :radius="24" />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          <text>{{ t.tickets.backToTickets }}</text>
        </view>
      </view>

      <!-- LIST MODE -->
      <view v-if="mode.kind === 'list'" class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <view class="ticket-overview">
        <view class="ticket-stats">
          <StatBox tint="var(--v5-warning)" :label="t.tickets.statsOpen" :value="stats.open" :icon="alertIcon" />
          <StatBox tint="var(--v5-brand-2)" :label="t.tickets.statsAwaiting" :value="stats.awaiting" :icon="clockIcon" />
          <StatBox tint="var(--v5-brand)" :label="t.tickets.statsResolved" :value="stats.resolved" :icon="checkIcon" />
        </view>

        <view class="family-control family-control--primary ticket-new" :style="newBtnStyle" role="button" tabindex="0" :aria-label="t.tickets.newTicketCta" @click="setMode({ kind: 'create' })">
            <LiquidGlass :radius="24" tone="selection" />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
          <text>{{ t.tickets.newTicketCta }}</text>
        </view>
        </view>

        <text class="block" :style="slaNoticeStyle">{{ t.tickets.slaStatisticsUnavailable }}</text>

        <GlassSegments layout="scroll" :label="t.tickets.pageTitle" :model-value="tab" :options="tabOptions" @select="selectTab" />
        <text v-if="filterFeedback" class="block text-center" :style="filterFeedbackStyle">{{ filterFeedback }}</text>

        <view v-if="ticketsStore.error" class="ticket-error">
          <EmptyState kind="recoverable-error" :title="t.empty.errorTitle" :desc="t.empty.errorDesc" />
          <view class="family-control" role="button" tabindex="0" :aria-label="t.empty.errorCta" @click="reloadTickets"><LiquidGlass :radius="24" /><text>{{ t.empty.errorCta }}</text></view>
        </view>
        <EmptyState v-else-if="supportSessionReady && !ticketsStore.loading && filtered.length === 0" :kind="tab === 'all' ? 'empty-list' : 'no-filter-results'" :title="tab === 'all' ? t.empty.listTitle : t.empty.filterTitle" :desc="tab === 'all' ? t.empty.listDesc : t.empty.filterDesc" />
        <view v-else style="padding: 0 2px; border-top: 1px solid var(--v5-border)">
          <TicketRow v-for="(tk, i) in filtered" :key="tk.id" :tk="tk" :divider="i < filtered.length - 1" @open="openTicket(tk.id)" />
        </view>

        <!-- Remote mode exposes App-internal channels only (live chat / tickets),
             so the footer must not point at an off-App Telegram channel the user
             cannot find or verify from the product. #90 -->
        <text class="block text-center" :style="noteStyle">{{ remoteApiEnabled ? t.tickets.noteInternal : t.tickets.note }}</text>
      </view>

      <!-- CREATE MODE -->
      <view v-else-if="mode.kind === 'create'" class="px-4" style="display: flex; flex-direction: column; gap: 16px">
        <view class="ticket-creation-notice" role="status" aria-live="polite">
          <text>{{ creationNotice }}</text>
          <text v-if="creationPolicy && !creationPolicy.allowed && creationPolicy.retryAfterSeconds > 0" class="block">{{ fmt(t.tickets.policyRetryAfter, { n: Math.max(1, Math.ceil(creationPolicy.retryAfterSeconds / 60)) }) }}</text>
          <view class="ticket-creation-notice-actions">
            <view v-if="creationPolicy?.existingTicketNo" class="family-control" role="button" tabindex="0" @click="openTicket(creationPolicy.existingTicketNo)"><LiquidGlass :radius="24" /><text>{{ t.tickets.policyViewTicket }}</text></view>
            <view v-if="remoteApiEnabled && !creationPolicyLoading && (creationPolicyError || creationPolicy?.allowed === false)" class="family-control" role="button" tabindex="0" @click="loadCreationPolicy"><LiquidGlass :radius="24" /><text>{{ t.ui.retry }}</text></view>
          </view>
        </view>
        <view>
          <text class="block" :style="formLabelStyle">{{ t.tickets.create.catLabel }}</text>
          <!-- 分类是互斥单选(选一个,其余取消)。原先每个 chip 都是 role="button":
               读屏念「按钮」、没有组名,也读不出当前选中哪一个(默认「提现」无任何状态)。
               改 radiogroup/radio + aria-checked,roving tabindex + 方向键(与提现网络选择器同形)。 -->
          <view class="flex" style="flex-wrap: wrap; gap: 6px" role="radiogroup" :aria-label="t.tickets.create.catLabel">
            <view v-for="c in categoriesForNew" :key="c" class="nx-ticket-cat-radio family-control" :style="catChipStyle(newCat === c)" role="radio" :tabindex="newCat === c ? 0 : -1" :aria-checked="newCat === c ? 'true' : 'false'" :aria-label="catLabel(c)" @click="selectCategory(c)"    @keydown.left.prevent="moveCategory(-1)" @keydown.right.prevent="moveCategory(1)" @keydown.up.prevent="moveCategory(-1)" @keydown.down.prevent="moveCategory(1)">
              <LiquidGlass :radius="22" :tone="newCat === c ? 'selection' : 'control'" />
              <text>{{ catLabel(c) }}</text>
            </view>
          </view>
          <view v-if="newSlaTarget" :style="slaTargetStyle">
            <text class="block" :style="slaTargetLabelStyle">{{ t.tickets.slaTargetLabel }}</text>
            <text class="block" :style="slaTargetValueStyle">{{ fmt(t.tickets.slaTargetValue, { firstResponseMins: newSlaTarget.firstResponseMins, resolutionHours: newSlaTarget.resolutionHours }) }}</text>
            <text class="block" :style="slaStatisticsStyle">{{ t.tickets.slaStatisticsUnavailable }}</text>
          </view>
          <view v-if="ticketSuggestions.length" :style="suggestionsStyle">
            <text class="block" :style="formLabelStyle">{{ t.tickets.create.suggestionsLabel }}</text>
            <view v-for="faq in ticketSuggestions" :key="faq.id" :style="suggestionRowStyle">
              <text class="block" :style="suggestionQuestionStyle">{{ faq.question }}</text>
              <text class="block" :style="suggestionAnswerStyle">{{ faq.answer }}</text>
            </view>
            <view v-if="canLoadMoreTicketSuggestions" class="family-control" :style="ticketSuggestionLoadMoreStyle" role="button" tabindex="0" :aria-disabled="ticketSuggestionLoading ? 'true' : 'false'" @click="loadMoreTicketSuggestions"  @keydown.enter.prevent="loadMoreTicketSuggestions" @keydown.space.prevent="loadMoreTicketSuggestions">
              <LiquidGlass :radius="22" /><text>{{ ticketSuggestionLoading ? t.help.loadingMore : t.help.loadMore }}</text>
            </view>
          </view>
        </view>
        <view>
          <text class="block" :style="formLabelStyle">{{ t.tickets.create.subjectLabel }}</text>
          <!-- 输入框必须带可访问名:可见 <text> 标签与 uni 的 <input> 之间没有程序化关联,
               读屏只念「文本框」。名称 + 必填 + 长度提示都写在控件上,由平台层
               lib/a11y-field-label.ts 镜像到内部真控件(宿主上的 aria-* 不会自己下去)。 -->
          <input :value="subject" :maxlength="SUBJECT_MAX" :placeholder="t.tickets.create.subjectPlaceholder" placeholder-class="ph" :style="inputStyle" :aria-label="t.tickets.create.subjectLabel" aria-required="true" aria-describedby="ticket-subject-hint" :aria-invalid="subjectInvalid ? 'true' : 'false'" :aria-errormessage="subjectInvalid ? 'ticket-subject-error' : undefined" @input="onSubject" />
          <text id="ticket-subject-hint" class="block" :style="fieldHintStyle">{{ t.tickets.create.subjectHint }}</text>
          <text v-if="subjectInvalid" id="ticket-subject-error" class="block" :style="fieldErrorStyle" role="alert">{{ t.tickets.create.subjectRequired }}</text>
        </view>
        <view>
          <text class="block" :style="formLabelStyle">{{ t.tickets.create.descLabel }}</text>
          <textarea :value="desc" :maxlength="DESC_MAX" :placeholder="t.tickets.create.descPlaceholder" placeholder-class="ph" :style="textareaStyle" :aria-label="t.tickets.create.descLabel" aria-required="true" aria-describedby="ticket-desc-hint" :aria-invalid="descInvalid ? 'true' : 'false'" :aria-errormessage="descInvalid ? 'ticket-desc-error' : undefined" @input="onDesc" />
          <text id="ticket-desc-hint" class="block" :style="fieldHintStyle">{{ t.tickets.create.descHint }}</text>
          <text v-if="descInvalid" id="ticket-desc-error" class="block" :style="fieldErrorStyle" role="alert">{{ t.tickets.create.descRequired }}</text>
        </view>
        <view class="ticket-create-actions">
          <view class="family-control family-control--primary ticket-submit" :style="{ ...submitBtnStyle, opacity: creationDisabled ? 0.55 : 1 }" role="button" :tabindex="creationDisabled ? -1 : 0" :aria-disabled="creationDisabled" :aria-busy="createSubmitting" :aria-label="t.tickets.create.submit" @click="submitCreate">
            <LiquidGlass :radius="24" tone="selection" />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
            <text style="margin-left: 6px">{{ createSubmitting ? t.tickets.policySubmitting : t.tickets.create.submit }}</text>
          </view>
          <view class="family-control ticket-cancel" :style="cancelBtnStyle" role="button" tabindex="0" :aria-label="t.tickets.create.cancel" @click="setMode({ kind: 'list' })">
            <LiquidGlass :radius="24" />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            <text style="margin-left: 6px">{{ t.tickets.create.cancel }}</text>
          </view>
        </view>
      </view>

      <!-- DETAIL MODE -->
      <view v-else-if="detailTicket" class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <view :style="detailMetaStyle">
          <view class="flex items-center" style="gap: 6px">
            <text :style="statusTextStyle(detailTicket.status)">{{ statusLabel(detailTicket.status) }}</text>
            <text :style="dotSepStyle">·</text>
            <text :style="catTextStyle">{{ catLabel(detailTicket.category) }}</text>
          </view>
          <text class="block" :style="detailSubjectStyle">{{ detailTicket.subject }}</text>
          <text class="ticket-detail-id">{{ detailTicket.id }}</text>
          <view class="flex items-center justify-between" :style="detailTimesStyle">
            <text>{{ createdLabel }}</text>
            <text>{{ updatedLabel }}</text>
          </view>
          <view v-if="detailSlaTarget" :style="slaTargetStyle">
            <text class="block" :style="slaTargetLabelStyle">{{ t.tickets.slaTargetLabel }}</text>
            <text class="block" :style="slaTargetValueStyle">{{ fmt(t.tickets.slaTargetValue, { firstResponseMins: detailSlaTarget.firstResponseMins, resolutionHours: detailSlaTarget.resolutionHours }) }}</text>
            <text class="block" :style="slaStatisticsStyle">{{ t.tickets.slaStatisticsUnavailable }}</text>
          </view>
        </view>

        <view class="ticket-timeline-heading">
          <text>{{ t.tickets.detail.messagesLabel }}</text>
          <text class="ticket-timeline-order">{{ t.tickets.detail.chronological }}</text>
        </view>
        <text v-if="detailTicket.historyTruncated" class="block" role="status" aria-live="polite" :style="historyTruncatedStyle">{{ t.tickets.historyTruncated }}</text>
        <view v-if="detailTicket.historyNextCursor" class="family-control" :style="historyLoadEarlierStyle" role="button" tabindex="0" :aria-label="t.tickets.loadEarlier" @click="loadEarlierTicket"  @keydown.enter.prevent="loadEarlierTicket" @keydown.space.prevent="loadEarlierTicket">
            <LiquidGlass :radius="24" />
          <text>{{ t.tickets.loadEarlier }}</text>
        </view>
        <view class="ticket-timeline">
          <TicketMessageRecord v-for="(m, index) in detailTicket.messages" :key="`${app.accountKey}:${detailTicket.id}:${m.id}`" :message="m" :scope="`${app.accountKey}:${detailTicket.id}`" :show-date="index === 0 || messageDay(m.ts) !== messageDay(detailTicket.messages[index - 1].ts)" />
        </view>

        <view v-if="canReply(detailTicket)" class="ticket-reply" :style="replyCardStyle">
          <textarea :value="reply" :placeholder="t.tickets.detail.replyPlaceholder" :aria-label="t.tickets.detail.replyPlaceholder" placeholder-class="ph" :style="replyTextareaStyle" @input="onReply" />
          <view class="grid grid-cols-2 ticket-reply-actions">
            <view v-if="canClose(detailTicket)" class="family-control" :style="{ ...closeBtnStyle, opacity: !supportSessionReady || ticketsStore.mutating ? 0.55 : 1 }" role="button" tabindex="0" :aria-disabled="!supportSessionReady || ticketsStore.mutating" :aria-label="t.tickets.detail.closeBtn" @click="closeTicket">
            <LiquidGlass :radius="24" />
              <text>{{ t.tickets.detail.closeBtn }}</text>
            </view>
            <view class="family-control family-control--primary" :style="sendReplyStyle(supportSessionReady && !ticketsStore.mutating && !!reply.trim())" role="button" tabindex="0" :aria-disabled="!supportSessionReady || ticketsStore.mutating || !reply.trim()" :aria-label="t.tickets.detail.sendBtn" @click="sendReply">
            <LiquidGlass :radius="24" tone="selection" />
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
              <text style="margin-left: 6px">{{ t.tickets.detail.sendBtn }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch, onUnmounted, type CSSProperties } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import StatBox from "@/components/me/ticket-stat-box.vue";
import TicketRow from "@/components/me/ticket-row.vue";
import TicketMessageRecord from "@/components/me/ticket-message.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { toast } from "@/store/ui";
import { useTickets } from "@/store/tickets";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { binarySessionReady as accountSessionReady } from "@/lib/binary-session-ready";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { supportApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { TicketCreationDenied, type TicketCreationPolicy } from '@/api/support-ticket-policy';
import { useLocaleStore } from "@/store/locale";
import { navReplace } from "@/lib/route";
import { STATUS_COLOR, type Ticket, type TicketCategory, type TicketStatus, type SupportSlaTarget, type SupportFaq } from "@/domain/support";

type Mode = { kind: "list" } | { kind: "create" } | { kind: "detail"; id: string };
type Tab = "all" | "open" | "resolved" | "closed";

const t = useT();
const ticketsStore = useTickets();
const app = useApp();
const auth = useAuth();
const supportSessionReady = computed(() => {
  void app.accountBindingEpoch;
  return accountSessionReady({ remote: remoteApiEnabled, authenticated: auth.isAuthenticated,
    accountId: auth.accountId, appAccountKey: app.accountKey, sessionUserId: sessionVault.read()?.user.userId ?? null });
});
const ticketShowRevision = ref(0);
let ticketsPageVisible = false;
let ticketsPageEpoch = 0;
let ticketOpenRequest = 0;
let ticketAccountWasBound = app.accountKey !== "default";
const locale = useLocaleStore();
const mode = ref<Mode>({ kind: "list" });
const tab = ref<Tab>("all");
const tabs: Tab[] = ["all", "open", "resolved", "closed"];

// The URL owns the create/list intent so a refresh or a shared deep link
// reproduces what the user sees. `?mode=create` is the only query this page
// reflects; detail stays local because a ticket id would need its own load path.
function modeQueryHref(next: Mode): string {
  return next.kind === "create" ? "/pages/me/support-tickets?mode=create" : "/pages/me/support-tickets";
}
function setMode(next: Mode) {
  mode.value = next;
  // Replace (not push) keeps the back stack intact while making the visible
  // address match the visible form. Routed through the failure-aware adapter so
  // a rejected navigation still reports instead of failing silently.
  void navReplace(modeQueryHref(next));
}
function showTicketList() { setMode({ kind: 'list' }); }

// 新工单不再提供已下线的身份核验类目;历史工单仍可渲染(标签中性化)。
const categoriesForNew: TicketCategory[] = ["withdrawal", "deposit", "hardware", "account", "earnings", "genesis", "technical", "other"];
const newCat = ref<TicketCategory>("withdrawal");
const subject = ref("");
const desc = ref("");
const reply = ref("");
// 服务端 AppSupportService 对这两个字段的界:title 1–160、body 1–2000。
// 客户端只是把同一个界前移(maxlength + 提示),提交守卫仍在服务端。
const SUBJECT_MAX = 160;
const DESC_MAX = 2000;
// 校验态只在用户按过提交之后出现 —— 一进表单就把空字段标红是误报。
const submitAttempted = ref(false);
const subjectInvalid = computed(() => submitAttempted.value && !subject.value.trim());
const descInvalid = computed(() => submitAttempted.value && !desc.value.trim());
const creationPolicy = ref<TicketCreationPolicy | null>(null);
const creationPolicyLoading = ref(false);
const creationPolicyError = ref(false);
const createSubmitting = ref(false);
let creationPolicyGeneration = 0;
let createRequest = 0;
let creationRetryTimer: ReturnType<typeof setTimeout> | null = null;
const creationDisabled = computed(() => !supportSessionReady.value || ticketsStore.mutating || createSubmitting.value
  || (remoteApiEnabled && (creationPolicyLoading.value || creationPolicyError.value || creationPolicy.value?.allowed !== true)));
const creationNotice = computed(() => {
  if (!remoteApiEnabled) return t.value.tickets.policyHint;
  if (creationPolicyError.value) return t.value.tickets.policyUnavailable;
  if (creationPolicyLoading.value || !creationPolicy.value) return t.value.tickets.policyChecking;
  const policy = creationPolicy.value;
  switch (policy.reasonCode) {
    case 'SUPPORT_TICKET_CREATE_ACTIVE_LIMIT': return fmt(t.value.tickets.policyActiveLimit, { n: policy.activeTickets });
    case 'SUPPORT_TICKET_CREATE_DAILY_LIMIT': return fmt(t.value.tickets.policyDailyLimit, { hours: policy.windowHours });
    case 'SUPPORT_TICKET_CREATE_COOLDOWN': return t.value.tickets.policyCooldown;
    case 'SUPPORT_TICKET_CREATE_DUPLICATE': return t.value.tickets.policyDuplicate;
    default: return t.value.tickets.policyHint;
  }
});
function clearCreationRetry() {
  if (creationRetryTimer !== null) clearTimeout(creationRetryTimer);
  creationRetryTimer = null;
}
function acceptCreationPolicy(policy: TicketCreationPolicy) {
  clearCreationRetry();
  creationPolicy.value = policy;
  creationPolicyError.value = false;
  if (!policy.allowed && policy.retryAfterSeconds > 0 && mode.value.kind === 'create') {
    creationRetryTimer = setTimeout(() => { creationRetryTimer = null; void loadCreationPolicy(); }, Math.min(policy.retryAfterSeconds * 1000 + 250, 2_147_000_000));
  }
}
async function loadCreationPolicy() {
  if (!remoteApiEnabled || !ticketsPageVisible || !supportSessionReady.value || mode.value.kind !== 'create') return;
  clearCreationRetry();
  const generation = ++creationPolicyGeneration, epoch = ticketsPageEpoch, scope = captureAccountScope();
  const current = () => generation === creationPolicyGeneration && ticketsPageVisible && supportSessionReady.value
    && epoch === ticketsPageEpoch && isCurrentAccountScope(scope) && mode.value.kind === 'create';
  creationPolicyLoading.value = true;
  creationPolicyError.value = false;
  try { const policy = await supportApi.ticketCreationPolicy(); if (current()) acceptCreationPolicy(policy); }
  catch { if (current()) { creationPolicy.value = null; creationPolicyError.value = true; } }
  finally { if (current()) creationPolicyLoading.value = false; }
}
function resetCreationPolicy() {
  creationPolicyGeneration++;
  clearCreationRetry();
  creationPolicy.value = null;
  creationPolicyLoading.value = false;
  creationPolicyError.value = false;
}
watch(() => app.accountBindingEpoch, () => { resetCreationPolicy(); createRequest++; createSubmitting.value = false; }, { flush: 'sync' });
watch(() => mode.value.kind, kind => { resetCreationPolicy(); if (kind === 'create') void loadCreationPolicy(); });
watch([subject, desc, newCat], () => {
  if (creationPolicy.value?.reasonCode === 'SUPPORT_TICKET_CREATE_DUPLICATE') { resetCreationPolicy(); void loadCreationPolicy(); }
});
// An account switch must drop the previous account's draft, but it must not
// discard the intent the address carries: a reload of ?mode=create has to keep
// showing the create form rather than silently falling back to the list.
watch(() => app.accountKey, (next, previous) => {
  if (previous === "default" && !ticketAccountWasBound && next !== "default") { ticketAccountWasBound = true; return; }
  if (next !== "default") ticketAccountWasBound = true;
  ticketSuggestionGeneration++;
  subject.value = "";
  desc.value = "";
  reply.value = "";
  submitAttempted.value = false;
  if (mode.value.kind === "detail") mode.value = { kind: "list" };
}, { flush: "sync" });
const filterFeedback = ref("");
const slaTargets = ref<SupportSlaTarget[]>([]);
const ticketSuggestions = ref<SupportFaq[]>([]);
const TICKET_SUGGESTION_PAGE_SIZE = 20;
const ticketSuggestionPage = ref(0);
const ticketSuggestionTotal = ref(0);
const ticketSuggestionLoading = ref(false);
const ticketSuggestionCache = new Map<string, SupportFaq[]>();
const ticketSuggestionTotalCache = new Map<string, number>();
const canLoadMoreTicketSuggestions = computed(() => ticketSuggestions.value.length < ticketSuggestionTotal.value);

const historyTruncatedStyle: CSSProperties = {
  color: "var(--v5-warning)",
  fontSize: "12px",
  lineHeight: "18px",
  padding: "8px 10px",
  border: "1px solid color-mix(in srgb, var(--v5-warning) 38%, transparent)",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
};
const historyLoadEarlierStyle: CSSProperties = {
  fontSize: "13px", lineHeight: "20px", textAlign: "center", padding: "8px 16px",
};

onLoad((query) => {
  if (query?.mode === "create") mode.value = { kind: "create" };
  // 入口可带 ?cat= 预选分类(如充值页「充值未到账?」→ deposit);白名单外忽略。
  if (typeof query?.cat === "string" && (categoriesForNew as string[]).includes(query.cat)) {
    selectCategory(query.cat as TicketCategory);
  }
  if (typeof query?.ticket === "string") mode.value = { kind: "detail", id: query.ticket };
});

onShow(() => { ticketsPageVisible = true; ticketShowRevision.value++; });
function hideTicketPage() { ticketsPageVisible = false; ticketsPageEpoch++; ticketSuggestionGeneration++; ticketSuggestionLoading.value = false; resetCreationPolicy(); }
onHide(hideTicketPage);
onUnload(hideTicketPage);
onUnmounted(hideTicketPage);
watch([() => app.accountBindingEpoch, supportSessionReady, ticketShowRevision], () => {
  if (ticketsPageVisible && supportSessionReady.value) void activateTicketPage();
}, { flush: "post" });

async function activateTicketPage() {
  if (!ticketsPageVisible || !supportSessionReady.value) return;
  const epoch = ++ticketsPageEpoch, scope = captureAccountScope(), requestedMode = mode.value;
  const current = () => ticketsPageVisible && supportSessionReady.value && epoch === ticketsPageEpoch
    && isCurrentAccountScope(scope) && requestedMode === mode.value;
  // The create form renders from its own sources (categories, FAQ suggestions,
  // SLA targets). The ticket list only feeds the list view, so a list read that
  // fails while the user is composing a ticket must not surface as a blocking
  // failure about content they cannot see — that was the "unrelated failure"
  // toast on a ?mode=create refresh.
  const listIsVisible = mode.value.kind === "list";
  try {
    const [tickets] = await Promise.allSettled([ticketsStore.refresh(), loadSlaTargets(), loadTicketSuggestions(), loadCreationPolicy()]);
    if (!current()) return;
    if (tickets.status === "rejected" && listIsVisible) throw tickets.reason;
    if (mode.value.kind === "detail") await openTicket(mode.value.id);
  } catch {
    if (current()) toast.warn(t.value.security.opFailed);
  }
}

async function loadSlaTargets() {
  if (!ticketsPageVisible || !supportSessionReady.value) return;
  const epoch = ticketsPageEpoch, scope = captureAccountScope();
  const result = await supportApi.slaTargets();
  if (ticketsPageVisible && supportSessionReady.value && epoch === ticketsPageEpoch && isCurrentAccountScope(scope)) slaTargets.value = result;
}

let ticketSuggestionGeneration = 0;
function ticketSuggestionKey(requestedLocale: string, requestedCategory: TicketCategory) {
  return `${requestedLocale}:${requestedCategory}`;
}

async function loadTicketSuggestions() {
  if (!ticketsPageVisible || !supportSessionReady.value) return;
  const requestGeneration = ++ticketSuggestionGeneration;
  const requestedLocale = locale.code;
  const requestedCategory = newCat.value;
  const scopeKey = ticketSuggestionKey(requestedLocale, requestedCategory);
  ticketSuggestions.value = ticketSuggestionCache.get(scopeKey) ?? [];
  ticketSuggestionTotal.value = ticketSuggestionTotalCache.get(scopeKey) ?? ticketSuggestions.value.length;
  ticketSuggestionPage.value = ticketSuggestions.value.length > 0
    ? Math.ceil(ticketSuggestions.value.length / TICKET_SUGGESTION_PAGE_SIZE) : 0;
  ticketSuggestionLoading.value = true;
  try {
    const next = await supportApi.faqPage(requestedLocale, requestedCategory, "Ticket Create", 1, TICKET_SUGGESTION_PAGE_SIZE);
    if (requestGeneration === ticketSuggestionGeneration
        && requestedLocale === locale.code && requestedCategory === newCat.value) {
      ticketSuggestionCache.set(scopeKey, next.items);
      ticketSuggestionTotalCache.set(scopeKey, next.total);
      ticketSuggestions.value = next.items;
      ticketSuggestionPage.value = next.pageNum;
      ticketSuggestionTotal.value = next.total;
    }
  } catch {
    if (requestGeneration === ticketSuggestionGeneration
        && requestedLocale === locale.code && requestedCategory === newCat.value) {
      ticketSuggestions.value = ticketSuggestionCache.get(scopeKey) ?? [];
    }
  } finally {
    if (requestGeneration === ticketSuggestionGeneration
        && requestedLocale === locale.code && requestedCategory === newCat.value) ticketSuggestionLoading.value = false;
  }
}

async function loadMoreTicketSuggestions() {
  if (!ticketsPageVisible || !supportSessionReady.value) return;
  if (ticketSuggestionLoading.value || !canLoadMoreTicketSuggestions.value) return;
  const requestGeneration = ++ticketSuggestionGeneration;
  const requestedLocale = locale.code;
  const requestedCategory = newCat.value;
  const scopeKey = ticketSuggestionKey(requestedLocale, requestedCategory);
  const nextPage = ticketSuggestionPage.value + 1;
  ticketSuggestionLoading.value = true;
  try {
    const next = await supportApi.faqPage(requestedLocale, requestedCategory, "Ticket Create", nextPage, TICKET_SUGGESTION_PAGE_SIZE);
    if (requestGeneration === ticketSuggestionGeneration
        && requestedLocale === locale.code && requestedCategory === newCat.value) {
      const combined = [...new Map([...ticketSuggestions.value, ...next.items].map(item => [item.id, item])).values()];
      ticketSuggestionCache.set(scopeKey, combined);
      ticketSuggestionTotalCache.set(scopeKey, next.total);
      ticketSuggestions.value = combined;
      ticketSuggestionPage.value = next.pageNum;
      ticketSuggestionTotal.value = next.total;
    }
  } catch {
    // Keep the last good bounded snapshot; the load-more control remains retryable.
  } finally {
    if (requestGeneration === ticketSuggestionGeneration
        && requestedLocale === locale.code && requestedCategory === newCat.value) ticketSuggestionLoading.value = false;
  }
}

watch(() => [newCat.value, locale.code] as const, () => { void loadTicketSuggestions(); });

async function reloadTickets() {
  if (!ticketsPageVisible || !supportSessionReady.value) return;
  try { await ticketsStore.refresh(); }
  catch { toast.warn(t.value.security.opFailed); }
}

async function openTicket(id: string) {
  if (!ticketsPageVisible || !supportSessionReady.value || ticketsStore.mutating) return;
  const scope = captureAccountScope(), epoch = ticketsPageEpoch, request = ++ticketOpenRequest;
  let requestedMode = mode.value;
  const current = () => ticketsPageVisible && supportSessionReady.value && epoch === ticketsPageEpoch
    && request === ticketOpenRequest && isCurrentAccountScope(scope) && requestedMode === mode.value;
  try {
    const ticket = await ticketsStore.load(id);
    if (!current()) return;
    mode.value = { kind: "detail", id };
    requestedMode = mode.value;
    await nextTick();
    if (current() && mode.value.kind === "detail" && mode.value.id === id) {
      // The detail is already available. A stale read acknowledgement has its
      // own store-side readback and must not turn opening the ticket into an
      // erroneous user-facing failure toast.
      await ticketsStore.markRead(ticket).catch(() => undefined);
    }
  } catch {
    if (!current()) return;
    if (mode.value.kind === "detail" && !detailTicket.value) mode.value = { kind: "list" };
    toast.warn(t.value.security.opFailed);
  }
}

async function loadEarlierTicket() {
  if (!ticketsPageVisible || !supportSessionReady.value) return;
  const current = detailTicket.value;
  if (!current?.historyNextCursor) return;
  try { await ticketsStore.loadEarlier(current.id); }
  catch { toast.warn(t.value.security.opFailed); }
}

const alertIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>`;
const clockIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>`;
const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>`;

const stats = computed(() => ({
  open: ticketsStore.tickets.filter((x) => x.status === "open" || x.status === "in_progress").length,
  awaiting: ticketsStore.tickets.filter((x) => x.status === "pending_user").length,
  resolved: ticketsStore.tickets.filter((x) => x.status === "resolved").length,
}));

const filtered = computed(() => {
  const sorted = [...ticketsStore.tickets].sort((a, b) => b.updatedAt - a.updatedAt);
  switch (tab.value) {
    case "open":
      return sorted.filter((x) => x.status === "open" || x.status === "in_progress" || x.status === "pending_user");
    case "resolved":
      return sorted.filter((x) => x.status === "resolved");
    case "closed":
      return sorted.filter((x) => x.status === "closed");
    default:
      return sorted;
  }
});

const detailTicket = computed(() => {
  const m = mode.value;
  return m.kind === "detail" ? ticketsStore.tickets.find((x) => x.id === m.id) ?? null : null;
});
const newSlaTarget = computed(() => slaTargets.value.find(target => target.category === newCat.value));
const detailSlaTarget = computed(() => detailTicket.value
  ? slaTargets.value.find(target => target.category === detailTicket.value?.category)
  : undefined);
const createdLabel = computed(() => (detailTicket.value ? fmt(t.value.tickets.detail.created, { when: relWhen(detailTicket.value.createdAt) }) : ""));
const updatedLabel = computed(() => (detailTicket.value ? fmt(t.value.tickets.detail.lastUpdate, { when: relWhen(detailTicket.value.updatedAt) }) : ""));

function catLabel(c: TicketCategory): string {
  return t.value.tickets.category[c];
}
/** 选中一个分类。`?cat=` 预选与 chips 点击都走这里,免得两处状态更新漂移。 */
function selectCategory(c: TicketCategory) {
  newCat.value = c;
}
/** roving tabindex 的标准行为:方向键移一格并选上,焦点跟到新选中项。 */
function moveCategory(delta: number): void {
  const index = categoriesForNew.indexOf(newCat.value);
  const next = categoriesForNew[(index + delta + categoriesForNew.length) % categoriesForNew.length];
  if (!next) return;
  selectCategory(next);
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>(".nx-ticket-cat-radio[tabindex=\"0\"]")?.focus();
  });
}
function statusLabel(s: TicketStatus): string {
  return t.value.tickets.status[s];
}
function tabLabel(id: Tab): string {
  const key = id === "all" ? "tabAll" : id === "open" ? "tabOpen" : id === "resolved" ? "tabResolved" : "tabClosed";
  return (t.value.tickets as unknown as Record<string, string>)[key];
}
function selectTab(id: Tab) {
  if (tab.value === id) {
    filterFeedback.value = fmt(t.value.tickets.filterAlreadyShown, { tab: tabLabel(id) });
    return;
  }
  tab.value = id;
  filterFeedback.value = "";
}

function moveTab(index: number, step: number) {
  const next = tabs[(index + step + tabs.length) % tabs.length];
  if (!next) return;
  selectTab(next);
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('.nx-ticket-status-tab[aria-selected="true"]')?.focus();
  });
}
function canClose(tk: Ticket): boolean {
  return tk.status !== "closed" && tk.status !== "resolved";
}
function canReply(tk: Ticket): boolean {
  return tk.status !== "closed";
}
function relWhen(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return t.value.tickets.timeJustNow;
  if (ms < 3600_000) return fmt(t.value.tickets.timeMinutesAgo, { n: Math.floor(ms / 60_000) });
  if (ms < 86_400_000) return fmt(t.value.tickets.timeHoursAgo, { n: Math.floor(ms / 3600_000) });
  return fmt(t.value.tickets.timeDaysAgo, { n: Math.floor(ms / 86_400_000) });
}

function messageDay(ts: number): string {
  return new Date(ts).toDateString();
}

function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onSubject(e: Event) {
  subject.value = detailVal(e);
}
function onDesc(e: Event) {
  desc.value = detailVal(e);
}
function onReply(e: Event) {
  reply.value = detailVal(e);
}

async function submitCreate() {
  if (!ticketsPageVisible || creationDisabled.value) return;
  submitAttempted.value = true;
  if (!subject.value.trim() || !desc.value.trim()) {
    toast.info(t.value.tickets.create.missingFields, "");
    return;
  }
  const scope = captureAccountScope(), epoch = ticketsPageEpoch, requestedMode = mode.value;
  const current = () => ticketsPageVisible && supportSessionReady.value && epoch === ticketsPageEpoch
    && isCurrentAccountScope(scope) && requestedMode === mode.value;
  const request = ++createRequest;
  createSubmitting.value = true;
  try {
    const id = await ticketsStore.createTicket({ category: newCat.value, subject: subject.value, body: desc.value });
    if (!current()) return;
    toast.success(t.value.tickets.create.submittedToast, "");
    subject.value = "";
    desc.value = "";
    submitAttempted.value = false;
    mode.value = { kind: "detail", id };
  } catch (cause) {
    if (!current()) return;
    if (cause instanceof TicketCreationDenied) acceptCreationPolicy(cause.policy);
    else toast.error(t.value.security.opFailed);
  } finally { if (request === createRequest) createSubmitting.value = false; }
}
async function sendReply() {
  if (!ticketsPageVisible || !supportSessionReady.value || ticketsStore.mutating) return;
  const current = detailTicket.value;
  if (!current || !canReply(current) || !reply.value.trim()) return;
  const scope = captureAccountScope(), epoch = ticketsPageEpoch, requestedMode = mode.value;
  const active = () => ticketsPageVisible && supportSessionReady.value && epoch === ticketsPageEpoch
    && isCurrentAccountScope(scope) && requestedMode === mode.value;
  try {
    await ticketsStore.reply(current.id, reply.value);
    if (!active()) return;
    reply.value = "";
    toast.success(t.value.tickets.detail.sentToast, "");
  } catch { if (active()) toast.error(t.value.security.opFailed); }
}
async function closeTicket() {
  if (!ticketsPageVisible || !supportSessionReady.value || ticketsStore.mutating) return;
  const current = detailTicket.value;
  if (!current) return;
  const scope = captureAccountScope(), epoch = ticketsPageEpoch, requestedMode = mode.value;
  const active = () => ticketsPageVisible && supportSessionReady.value && epoch === ticketsPageEpoch
    && isCurrentAccountScope(scope) && requestedMode === mode.value;
  try {
    await ticketsStore.close(current.id);
    if (!active()) return;
    toast.success(t.value.tickets.detail.closedToast, "");
    mode.value = { kind: "list" };
  } catch { if (active()) toast.error(t.value.security.opFailed); }
}

const backRowStyle: CSSProperties = { minHeight: "44px", fontSize: "13px", color: "var(--v5-ink-2)" };
const newBtnStyle: CSSProperties = { minHeight: "48px", fontWeight: 600, fontSize: "13px" };
const slaNoticeStyle: CSSProperties = { padding: "0 6px", fontSize: "12px", color: "var(--v5-ink-3)" };
const slaTargetStyle: CSSProperties = { marginTop: "10px", padding: "10px 12px", borderRadius: "12px", background: "var(--v5-surface)" };
const slaTargetLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const slaTargetValueStyle: CSSProperties = { marginTop: "2px", fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const slaStatisticsStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", color: "var(--v5-ink-3)" };
const suggestionsStyle: CSSProperties = { marginTop: "12px", borderTop: "1px solid var(--v5-border)", paddingTop: "12px" };
const suggestionRowStyle: CSSProperties = { padding: "10px 0", borderBottom: "1px solid var(--v5-border)" };
const suggestionQuestionStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const suggestionAnswerStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", lineHeight: 1.625, color: "var(--v5-ink-3)" };
const ticketSuggestionLoadMoreStyle: CSSProperties = { minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--v5-brand)", fontSize: "13px", fontWeight: 600 };
// Empty state — dashed outline hint, no fill (V5 empty-state idiom).
const emptyStyle: CSSProperties = { borderRadius: "16px", border: "1px dashed var(--v5-border-strong)", padding: "32px", textAlign: "center" };
const emptyTextStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const noteStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625, paddingTop: "4px" };
const filterFeedbackStyle: CSSProperties = { marginTop: "-4px", fontSize: "12px", color: "var(--v5-ink-3)" };
const formLabelStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "12px", color: "var(--v5-ink-3)", marginBottom: "8px" };
// 必填/长度提示与字段错误:两者都在输入框下方,由 aria-describedby / aria-errormessage 关联。
const fieldHintStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)", lineHeight: "16px", marginTop: "6px" };
const fieldErrorStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-danger)", lineHeight: "16px", marginTop: "4px" };
function catChipStyle(active: boolean): CSSProperties {
  return {
    height: "44px",
    display: "inline-flex",
    alignItems: "center",
    padding: "0 16px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    color: active ? "var(--v5-bg)" : "var(--v5-ink-2)",
  };
}
// Inputs — 零 border。新建表单容器(模板 v-else-if create 那层)没有底色 → 输入框直接
// 贴页面底;原 surface-3 对页面底亮色仅 ΔE 2.7(分不出),整个输入框在亮色下看不见。改 L1。
// (该表单只在"新建工单"时渲染,自动扫描的默认渲染态覆盖不到,靠回源读模板发现。)
const inputStyle: CSSProperties = {
  width: "100%",
  height: "44px",
  borderRadius: "12px",
  background: "var(--v5-surface)",
  padding: "0 12px",
  fontSize: "15px",
  color: "var(--v5-ink)",
};
const textareaStyle: CSSProperties = {
  width: "100%",
  height: "140px",
  borderRadius: "12px",
  // 同 inputStyle:贴页面底,surface-3 亮色下 ΔE 2.7 不可辨 → L1
  background: "var(--v5-surface)",
  padding: "10px 12px",
  fontSize: "13px",
  color: "var(--v5-ink)",
  lineHeight: 1.625,
};
const cancelBtnStyle: CSSProperties = { minHeight: "48px", fontWeight: 500, fontSize: "15px" };
const submitBtnStyle: CSSProperties = { minHeight: "48px", fontWeight: 600, fontSize: "15px" };
// Ticket header — sits on the page floor, hairline closes the block.
const detailMetaStyle: CSSProperties = { padding: "4px 2px 14px", borderBottom: "1px solid var(--v5-border)" };
function statusTextStyle(s: TicketStatus): CSSProperties {
  return { fontFamily: "var(--font-v5)", fontSize: "12px", letterSpacing: "0.06em", fontWeight: 600, color: STATUS_COLOR[s] };
}
const dotSepStyle: CSSProperties = { color: "var(--v5-ink-4)", fontSize: "12px" };
const catTextStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "12px", color: "var(--v5-ink-3)" };
const detailSubjectStyle: CSSProperties = { marginTop: "10px", overflowWrap: "anywhere", fontSize: "20px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1.375 };
const detailTimesStyle: CSSProperties = { marginTop: "8px", flexWrap: "wrap", gap: "6px", fontFamily: "var(--font-v5)", fontSize: "12px", color: "var(--v5-ink-3)" };
// Reply zone — 外壳卡已删,textarea 自成一体。壳只剩 padding 无底色 → textarea 直接贴
// 页面底;原 surface-3 亮色下对页面底仅 ΔE 2.7(分不出),改 L1(同新建表单输入框)。
const replyCardStyle: CSSProperties = { padding: "4px 2px 0" };
const replyTextareaStyle: CSSProperties = {
  width: "100%",
  height: "84px",
  borderRadius: "12px",
  background: "var(--v5-surface)",
  padding: "8px 12px",
  fontSize: "15px",
  color: "var(--v5-ink)",
  lineHeight: 1.625,
};
const closeBtnStyle: CSSProperties = { minHeight: "48px", fontWeight: 500, fontSize: "13px" };
function sendReplyStyle(active: boolean): CSSProperties {
  return { minHeight: "48px", opacity: active ? 1 : 0.45, fontWeight: 600, fontSize: "13px" };
}

import GlassSegments from "@/components/glass-segments.vue";
import LiquidGlass from "@/components/liquid-glass.vue";
const tabOptions = computed(() => tabs.map(value => ({ value, label: tabLabel(value) })));
</script>

<style src="@/styles/message-family.css"></style>
<style scoped>
/* placeholder-class="ph" target — was referenced but never defined (audit P2). */
.ticket-overview { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.ticket-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); flex: 1; min-width: 180px; gap: 4px; }
.ticket-new { margin-left: auto; max-width: 100%; }
.ticket-create-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.ticket-reply-actions { gap: 12px; margin-top: 16px; }
.ticket-error { text-align: center; padding-bottom: 16px; }
.ticket-creation-notice { color: var(--v5-ink-3); font-size: 13px; line-height: 1.6; padding: 4px 0 12px; border-bottom: 1px solid var(--v5-border); }
.ticket-creation-notice-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.ticket-creation-notice-actions:empty { display: none; }
.ticket-detail-id { display: block; margin-top: 8px; overflow-wrap: anywhere; color: var(--v5-ink-3); font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; }
.ticket-timeline-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 10px 2px 8px; color: var(--v5-ink); font-size: 20px; font-weight: 600; }
.ticket-timeline-order { font-size: 12px; font-weight: 400; color: var(--v5-ink-3); }
.ticket-timeline { padding-top: 4px; }
.ph {
  color: var(--v5-ink-4);
}
</style>
