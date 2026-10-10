<!--
  Conversation chat — full-screen thread for one conversation. Bare full-screen
  (own header + ConversationThread), NOT wrapped in AppChassis: a focused chat wants
  no tabbar / nova bubble, and its own flex column (header + scrolling messages +
  pinned input) would fight the chassis scroll container. Not standalone-page-shell
  either: the pinned input row owns the bottom safe-area itself (P-040), which the
  shell's reserved band would double — so this page draws its own status bar and
  home indicator.

  query ?type=ai     → backed by the nova store (Nova): quick prompt chips (human
                       support lives in the conversation center's support tab).
  query ?cid=<id>    → backed by the conversations store (advisor / support).

  A separate route (vs in-page state) means each open gets a fresh onLoad, sidestepping
  the H5 same-page hash-query staleness (P-044/P-049). Bare text in <text> (P-026).
-->
<template>
  <view class="cp-root message-family">
    <template v-if="!hiddenAiRoute">
    <!-- Simulated device status bar (preview shell only) — bare page draws its own. -->
    <DeviceStatusBar />

    <!-- Header -->
    <view class="cp-head" :style="{ paddingTop: statusBarHeight + 10 + 'px' }">
      <view class="cp-back active:opacity-60" role="button" tabindex="0" :aria-label="t.conversations.back" @click="goBack"  @keydown.enter.prevent="onKeyboardActivate($event, goBack)" @keydown.space.prevent="onKeyboardActivate($event, goBack)">
        <LiquidGlass :radius="22" />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>

      <NovaAvatar v-if="isAi" :size="40" pulse />
      <view v-else class="cp-ava" :style="avaStyle">
        <view v-html="headerIcon" />
      </view>

      <view class="cp-meta">
        <text class="cp-name">{{ headerName }}</text>
        <view class="cp-role">
          <view class="cp-dot" :style="dotStyle" />
          <text class="cp-role-t">{{ headerRole }}</text>
        </view>
      </view>
      <view v-if="isAi && remoteApiEnabled" class="cp-ticket active:opacity-70 family-control" role="button" tabindex="0" :aria-label="t.conversations.restartSession" @click="onStartNewConversation"  @keydown.enter.prevent="onKeyboardActivate($event, onStartNewConversation)" @keydown.space.prevent="onKeyboardActivate($event, onStartNewConversation)"><LiquidGlass :radius="22" />
        <text>{{ t.conversations.restartSession }}</text>
      </view>
      <view v-if="advisorApplies && convStore.advisorError" class="cp-ticket active:opacity-70 family-control" role="button" tabindex="0" :aria-label="t.conversations.image.retryPolicy" @click="convStore.refreshAdvisor()"  @keydown.enter.prevent="convStore.refreshAdvisor()" @keydown.space.prevent="convStore.refreshAdvisor()"><LiquidGlass :radius="22" /><text>{{ t.conversations.image.retryPolicy }}</text></view>
      <view v-if="!isAi && conv && !isClosedSession" class="cp-ticket active:opacity-70 family-control" role="button" tabindex="0" :aria-label="t.conversations.convertTicket" @click="onConvertToTicket"  @keydown.enter.prevent="onKeyboardActivate($event, onConvertToTicket)" @keydown.space.prevent="onKeyboardActivate($event, onConvertToTicket)"><LiquidGlass :radius="22" />
        <text>{{ t.conversations.convertTicket }}</text>
      </view>
    </view>

    <view v-if="isAi && remoteApiEnabled" class="cp-ai-safety" role="note">
      <text class="cp-ai-safety-t">{{ t.nova.localSafetyNotice }}</text>
    </view>
    <view v-if="isAi && remoteApiEnabled" class="cp-ai-history">
      <text v-if="handoffRecommended" class="cp-ai-history-t">{{ handoffCopy.recommend }}</text>
      <view class="cp-ai-history-action active:opacity-70 family-control" role="button" tabindex="0" :aria-disabled="handoffBusy ? 'true' : 'false'" :aria-busy="handoffBusy ? 'true' : 'false'" @click="!handoffBusy && onHumanHandoff()"><LiquidGlass :radius="22" /><text>{{ handoffCopy.action }}</text></view>
    </view>
    <view v-if="isAi && remoteApiEnabled && nova.historyTruncated" class="cp-ai-history" role="status" aria-live="polite">
      <text class="cp-ai-history-t">{{ t.nova.historyTruncated }}</text>
    </view>
    <view v-if="isAi && remoteApiEnabled && nova.historyNextCursor" class="cp-ai-history cp-ai-history-action family-control" role="button" tabindex="0"
      :aria-label="t.nova.loadEarlier" @click="loadEarlierNovaHistory"  @keydown.enter.prevent="onKeyboardActivate($event, loadEarlierNovaHistory)" @keydown.space.prevent="onKeyboardActivate($event, loadEarlierNovaHistory)"><LiquidGlass :radius="22" />
      <text class="cp-ai-history-t">{{ t.nova.loadEarlier }}</text>
    </view>
    <view v-if="!isAi && conv?.historyTruncated" class="cp-ai-history" role="status" aria-live="polite">
      <text class="cp-ai-history-t">{{ t.conversations.historyTruncated }}</text>
    </view>
    <view v-if="!isAi && conv?.historyNextCursor" class="cp-ai-history cp-ai-history-action family-control" role="button" tabindex="0"
      :aria-label="t.conversations.loadEarlier" @click="loadEarlierHumanHistory"  @keydown.enter.prevent="onKeyboardActivate($event, loadEarlierHumanHistory)" @keydown.space.prevent="onKeyboardActivate($event, loadEarlierHumanHistory)"><LiquidGlass :radius="22" />
      <text class="cp-ai-history-t">{{ t.conversations.loadEarlier }}</text>
    </view>
    <view v-if="showUnassignedReceived" class="cp-ai-history" role="status"><text class="cp-ai-history-t">{{ t.conversations.image.unassignedReceived }}</text></view>

    <view v-if="ticketCreationBlock" class="cp-ticket-limit" role="status" aria-live="polite">
      <text>{{ ticketCreationBlockText }}</text>
      <text v-if="ticketCreationBlock.retryAfterSeconds > 0">{{ fmt(t.tickets.policyRetryAfter, { n: Math.max(1, Math.ceil(ticketCreationBlock.retryAfterSeconds / 60)) }) }}</text>
      <view v-if="ticketCreationBlock.existingTicketNo" class="family-control" role="button" tabindex="0" @click="navTo('/pages/me/support-tickets?ticket=' + encodeURIComponent(ticketCreationBlock.existingTicketNo))"><LiquidGlass :radius="24" /><text>{{ t.tickets.policyViewTicket }}</text></view>
    </view>
    <!-- Thread body (messages + chips + input) -->
    <ConversationThread
      @typing="!isAi && convStore.setTyping($event)"
      :messages="threadMessages"
	      :input-placeholder="inputPlaceholder"
	      :input-label="inputLabel"
	      :send-label="t.conversations.send"
      :quick-chips="quickChips"
      :empty-hint="emptyHint"
      :typing="agentTyping"
      :typing-label="thinkingLabel"
      :reveal-tick="revealTick"
      :closed="isClosedSession"
      :restart-label="isAi && remoteApiEnabled ? t.nova.localRetry : t.conversations.restartSession"
      :queue-labels="isAi && remoteApiEnabled ? t.nova.queue : undefined"
      :composer-key="isAi ? app.accountKey + ':' + nova.conversationId : app.accountBindingEpoch + ':' + convStore.scopeInvalidated + ':' + (cid || startType || '')"
      :initial-draft="!isAi ? draftText : undefined"
      :max-input-length="isAi && remoteApiEnabled ? 2000 : undefined"
      :image-labels="!isAi ? t.conversations.image : undefined"
      :attach-disabled="!isAi && (!supportSessionReady || attachmentPolicy?.available !== true)"
      :attach-unavailable="!isAi && attachmentPolicy?.available !== true ? (!remoteApiEnabled || attachmentPolicyError || attachmentPolicy?.available === false ? t.conversations.image.unavailable : t.conversations.image.checkingPolicy) : undefined"
      :attach-retry="remoteApiEnabled && attachmentPolicyError"
      :attachment-draft="attachmentDisplay"
      :attachment-preview-src="!isAi ? imageDraft?.filePath : undefined"
      :failed-send-label="failedHumanLabel"
      :can-discard-send="failedHumanSend?.settled"
      :can-retry-send="supportSessionReady && failedHumanSend?.retryable !== false && !humanSendBusy"
      :send-blocked="(!isAi && !supportSessionReady) || !!failedHumanSend || humanSendBusy"
      @send="onSend"
      @draft-change="draftText = $event"
      @attach="chooseSupportImage"
      @retry-policy="loadAttachmentPolicy"
      @retry-upload="retrySupportUpload"
      @replace-attachment="replaceSupportAttachment"
      @cancel-attachment="cancelSupportAttachment"
      @retry-image="retryPrivateImage"
      @retry-message="retryHumanSend"
      @edit-message="editHumanSend"
      @discard-message="discardHumanSend"
      @queue-action="onQueueAction"
      @queue-save="onQueueSave"
      @chip="onChip"
      @cta="onCta"
      @restart="onRestart"
    />

    <!-- Home Indicator — bare page (no AppChassis) draws its own. Sits over the input
         row's bottom safe-area padding; pointer-events:none so it never blocks the input. -->
    <view class="cp-home">
      <DeviceHomeIndicator />
    </view>

    <!-- Overlay host — this is a bare full-screen page (no AppChassis), so it must
         carry its own GlobalUi or toast/confirm/netError raised here (e.g. the send
         rate-limit warning) would post to the store with nothing rendering them. -->
    <GlobalUi />
    </template>
    <view v-else style="display: flex; align-items: center; justify-content: center; gap: 12px; padding: 24px">
      <text role="status">{{ t.conversations.categoryDisabled }}</text>
      <view role="button" tabindex="0" @click="navReplace('/pages/support/messages')"  @keydown.enter.prevent="navReplace('/pages/support/messages')" @keydown.space.prevent="navReplace('/pages/support/messages')">
        <text>{{ t.me.supportHubRow }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, type CSSProperties } from "vue";
import { onLoad, onUnload, onShow, onHide } from "@dcloudio/uni-app";
import NovaAvatar from "@/components/nova/nova-avatar.vue";
import ConversationThread from "@/components/support/conversation-thread.vue";
import GlobalUi from "@/components/global-ui.vue";
import DeviceStatusBar from "@/components/device/device-status-bar.vue";
import DeviceHomeIndicator from "@/components/device/device-home-indicator.vue";
import type { ThreadMsg, QuickChip } from "@/components/support/thread-types";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { navTo, navBack, navReplace } from "@/lib/route";
import { NOVA_SUPPORT_VISIBLE } from "@/lib/nova-visibility";
import { createSendLimiter } from "@/lib/send-limiter";
import { h5DevicePreviewStatusBarHeight } from "@/lib/device-preview";
import { isDeviceOnline } from "@/lib/hashpower";
import { useConversations, type CategoryRefreshOutcome, type HumanComposer } from "@/store/conversations";
import { useNova } from "@/store/nova";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { sessionVault, novaAiApi, remoteApiEnabled, supportApi } from "@/api/runtime";
import { binarySessionReady as accountSessionReady } from "@/lib/binary-session-ready";
import { toast, confirm, useUI } from "@/store/ui";
import { replyToQuickPrompt, type QuickPromptKey } from "@/mock/nova-templates";
import type { ConversationType } from "@/domain/support";

import { ApiError, isSettledRejection, asApiError } from "@/api/errors";
import { isSupportAttachmentNotReady, type SupportAttachmentPolicy } from "@/api/support-api";
import { TicketCreationDenied, isTicketReplyRequired, type TicketCreationPolicy } from '@/api/support-ticket-policy';
import { novaFailure } from "@/lib/nova-failure";
import { useLocaleStore } from "@/store/locale";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { createHumanConversationCreationRecovery, createHumanThreadRealtimeLifecycle } from "./conversation-realtime-page";
import { createLatestAbortableRequest, NOVA_THINKING_CHECKING_MS, NOVA_THINKING_COMPOSING_MS, novaThinkingNow, remainingNovaThinkingMs, type NovaThinkingStage } from "@/lib/nova-thinking";

const t = useT();
const convStore = useConversations();
const nova = useNova();
const app = useApp();
const auth = useAuth();
const supportSessionReady = computed(() => {
  // The vault is not reactive; a same-account restore still advances binding.
  void app.accountBindingEpoch;
  return accountSessionReady({ remote: remoteApiEnabled, authenticated: auth.isAuthenticated,
    accountId: auth.accountId, appAccountKey: app.accountKey, sessionUserId: sessionVault.read()?.user.userId ?? null });
});
const humanShowRevision = ref(0);
let chatDisposed = false;
const locale = useLocaleStore();
type ImageDraft = { filePath: string; clientUploadId: string; key: string; state: "uploading" | "ready" | "failed"; attachmentId?: string; error?: "tooLarge" | "unsupported" | "uploadFailed" | "expired"; replaceOnly?: boolean };
type FailedHumanSend = { text: string; attachmentId?: string; kind: "unknown" | "failed" | "expired"; settled: boolean; retryable: boolean; attempts: number };
const imageDraft = ref<ImageDraft | null>(null);
const failedHumanSend = ref<FailedHumanSend | null>(null);
const humanSendBusy = ref(false);
const ticketCreationBlock = ref<TicketCreationPolicy | null>(null);
const ticketCreationBlockText = computed(() => {
  const policy = ticketCreationBlock.value;
  if (!policy) return '';
  switch (policy.reasonCode) {
    case 'SUPPORT_TICKET_CREATE_ACTIVE_LIMIT': return fmt(t.value.tickets.policyActiveLimit, { n: policy.activeTickets });
    case 'SUPPORT_TICKET_CREATE_DAILY_LIMIT': return fmt(t.value.tickets.policyDailyLimit, { hours: policy.windowHours });
    case 'SUPPORT_TICKET_CREATE_DUPLICATE': return t.value.tickets.policyDuplicate;
    default: return t.value.tickets.policyCooldown;
  }
});
const draftText = ref("");
const attachmentPolicy = ref<SupportAttachmentPolicy | null>(null);
const attachmentPolicyError = ref(false);
const imageSources = ref<Record<string, string>>({});
const imageFailures = ref<Record<string, boolean>>({});
let imageEpoch = 0;
let humanComposerResetting = false;
let imageLoads = new Set<string>();
function clearPrivateImages() {
  imageEpoch += 1;
  imageLoads = new Set();
  for (const source of Object.values(imageSources.value)) if (source.startsWith("blob:") && typeof URL !== "undefined") URL.revokeObjectURL(source);
  imageSources.value = {}; imageFailures.value = {};
}
watch(() => [app.accountBindingEpoch, convStore.scopeInvalidated], () => {
  humanComposerResetting = true;
  try {
    clearPrivateImages(); imageDraft.value = null; failedHumanSend.value = null; draftText.value = ""; attachmentPolicy.value = null; attachmentPolicyError.value = false;
    ticketCreationBlock.value = null;
  } finally { humanComposerResetting = false; }
  if (novaPageVisible && !isAi.value && remoteApiEnabled && supportSessionReady.value) { void convStore.refreshAdvisor(); void loadAttachmentPolicy(); }
}, { flush: "sync" });
async function loadPrivateImages() {
  if (!supportSessionReady.value) return;
  const epoch = imageEpoch, binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated;
  for (const message of conv.value?.messages ?? []) {
    const id = message.attachmentId;
    if (!id || imageSources.value[id] || imageFailures.value[id] || imageLoads.has(id)) continue;
    imageLoads.add(id);
    try {
      const source = await supportApi.attachmentContent(id);
      if (epoch !== imageEpoch || binding !== app.accountBindingEpoch || scope !== convStore.scopeInvalidated || !novaPageVisible) {
        if (source.startsWith("blob:") && typeof URL !== "undefined") URL.revokeObjectURL(source);
        return;
      }
      imageSources.value = { ...imageSources.value, [id]: source };
    } catch { if (epoch === imageEpoch) imageFailures.value = { ...imageFailures.value, [id]: true }; }
    finally { if (epoch === imageEpoch) imageLoads.delete(id); }
  }
}
const attachmentDisplay = computed(() => imageDraft.value && !isAi.value ? {
  state: imageDraft.value.state,
  replaceOnly: imageDraft.value.replaceOnly,
  label: imageDraft.value.state === "ready" ? t.value.conversations.image.ready
    : imageDraft.value.state === "uploading" ? t.value.conversations.image.uploading
      : t.value.conversations.image[imageDraft.value.error ?? "uploadFailed"],
} : null);
const failedHumanLabel = computed(() => failedHumanSend.value
  ? `${failedHumanSend.value.kind === "expired" ? t.value.conversations.image.expired
    : failedHumanSend.value.kind === "failed" ? t.value.conversations.image.sendFailed
      : t.value.conversations.image.sendUnknown} · ${t.value.conversations.image.attempts} ${failedHumanSend.value.attempts}`
  : undefined);

async function chooseSupportImage() {
  if (chatDisposed || !supportSessionReady.value) return;
  if (isAi.value || imageDraft.value || failedHumanSend.value) return;
  const binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated, key = humanComposerKey.value;
  const current = () => !chatDisposed && supportSessionReady.value && binding === app.accountBindingEpoch
    && scope === convStore.scopeInvalidated && key === humanComposerKey.value;
  try {
    const policy = attachmentPolicy.value ?? await supportApi.attachmentPolicy();
    if (!current()) return;
    attachmentPolicy.value = policy;
    if (!policy.available) { toast.info(t.value.conversations.image.unavailable, ""); return; }
    const selected = await new Promise<UniNamespace.ChooseImageSuccessCallbackResult | null>((resolve, reject) =>
      uni.chooseImage({ count: 1, sizeType: ["original"], sourceType: ["album", "camera"], success: resolve, fail: (cause) => {
        let cancelled = /^(?:chooseImage:fail\s+)?cancel(?:led|ed)?$/i.test(cause instanceof Error ? cause.message : cause.errMsg);
        // #ifdef APP-PLUS
        // Uni's native source actionSheet reports cancellation without a message.
        cancelled = cancelled || cause.errMsg === "chooseImage:fail" && (cause as { code?: unknown }).code === 0
          && Object.getOwnPropertyNames(cause).every(key => key === "errMsg" || key === "code");
        // #endif
        if (cancelled) resolve(null); else reject(cause);
      } }));
    if (!selected || !current()) return;
    const path = selected.tempFilePaths[0];
    if (!path) return;
    const selectedFile = Array.isArray(selected.tempFiles) ? selected.tempFiles[0] : selected.tempFiles;
    if (policy.maxBytes && selectedFile?.size > policy.maxBytes) { toast.info(t.value.conversations.image.tooLarge, ""); return; }
    const id = requireCryptoUuid();
    imageDraft.value = { filePath: path, clientUploadId: id, key: `support-upload-${id}`, state: "uploading" };
    await retrySupportUpload();
  } catch {
    if (!current()) return;
    toast.error(t.value.conversations.image.uploadFailed, "");
  }
}
async function loadAttachmentPolicy() {
  if (!supportSessionReady.value) return;
  if (!remoteApiEnabled) return;
  const binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated;
  attachmentPolicyError.value = false;
  try {
    const result = await supportApi.attachmentPolicy();
    if (binding === app.accountBindingEpoch && scope === convStore.scopeInvalidated) attachmentPolicy.value = result;
  } catch {
    if (binding === app.accountBindingEpoch && scope === convStore.scopeInvalidated) { attachmentPolicy.value = null; attachmentPolicyError.value = true; }
  }
}
async function retrySupportUpload() {
  if (chatDisposed || !supportSessionReady.value) return;
  const draft = imageDraft.value;
  if (!draft || draft.state === "ready" || draft.replaceOnly || !draft.filePath) return;
  const binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated, key = humanComposerKey.value;
  const current = () => !chatDisposed && supportSessionReady.value && binding === app.accountBindingEpoch
    && scope === convStore.scopeInvalidated && key === humanComposerKey.value && imageDraft.value === draft;
  draft.state = "uploading";
  try {
    const result = await supportApi.uploadAttachment(draft.filePath, draft.clientUploadId, draft.key);
    if (!current()) return;
    draft.attachmentId = result.id; draft.state = "ready"; draft.error = undefined;
  } catch (cause) {
    if (!current()) return;
    draft.state = "failed";
    const error = asApiError(cause);
    draft.error = error.status === 413 ? "tooLarge" : error.status === 415 ? "unsupported" : "uploadFailed";
  }
}
async function cancelSupportAttachment() {
  if (chatDisposed || !supportSessionReady.value) return;
  const draft = imageDraft.value;
  if (!draft) return;
  const account = app.accountKey, binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated, key = humanComposerKey.value;
  const current = () => !chatDisposed && supportSessionReady.value && account === app.accountKey
    && binding === app.accountBindingEpoch && scope === convStore.scopeInvalidated
    && key === humanComposerKey.value && imageDraft.value === draft;
  if (draft.attachmentId && !draft.replaceOnly) {
    try { await supportApi.cancelAttachment(draft.attachmentId, `support-cancel-${draft.clientUploadId}`); }
    catch (cause) {
      if (asApiError(cause).status !== 404) { if (current()) toast.error(t.value.conversations.image.cancelFailed, ""); return; }
    }
  }
  if (imageDraft.value === draft) imageDraft.value = null;
}
async function replaceSupportAttachment() {
  if (!supportSessionReady.value) return;
  if (failedHumanSend.value || humanSendBusy.value) return;
  const binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated, key = humanComposerKey.value;
  await cancelSupportAttachment();
  if (chatDisposed || !supportSessionReady.value || binding !== app.accountBindingEpoch
      || scope !== convStore.scopeInvalidated || key !== humanComposerKey.value) return;
  if (!imageDraft.value) await chooseSupportImage();
}
function retryPrivateImage(id: string) {
  if (!conv.value?.messages.some(message => message.attachmentId === id)) return;
  delete imageFailures.value[id];
  void loadPrivateImages();
}
async function retryHumanSend() {
  if (!supportSessionReady.value) return;
  const failed = failedHumanSend.value;
  if (!failed?.retryable || humanSendBusy.value) return;
  const binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated, key = humanComposerKey.value;
  const current = () => binding === app.accountBindingEpoch && scope === convStore.scopeInvalidated
    && key === humanComposerKey.value && failedHumanSend.value === failed;
  if (!failed.settled) {
    try {
      const pending = await convStore.hasPendingHumanSend(key, failed);
      if (!current()) return;
      if (!pending) {
        failedHumanSend.value = { ...failed, settled: true, retryable: false, kind: "failed" };
        return;
      }
    } catch { return; }
  }
  if (!current()) return;
  failedHumanSend.value = null;
  humanSendBusy.value = true;
  try { await sendHumanMessage(failed.text, failed.attachmentId, undefined, failed.attempts + 1); }
  finally { humanSendBusy.value = false; }
}
function discardHumanSend() { if (failedHumanSend.value?.settled) failedHumanSend.value = null; }
function editHumanSend() {
  if (!failedHumanSend.value?.settled) return;
  draftText.value = failedHumanSend.value.text;
  failedHumanSend.value = null;
}

const cid = ref("");
const isAi = ref(false);
const hiddenAiRoute = ref(false);
const initialPrompt = ref("");
// Nova availability belongs only to ?type=ai. Human advisor/support routes must
// never inherit a provisional local-model state before their route is resolved.
const novaProviderHold = ref(false);
const novaStatusLoading = ref(false);
const novaAiRequestInFlight = ref(false);
const novaHistoryLoading = ref(false);
const handoffBusy = ref(false);
const handoffRecommended = ref(false);
const handoffNeedsFreshQuestion = ref(false);
let handoffAttemptEpoch = 0;
let pendingHandoff: { account: string; epoch: number; conversation: string; turn: string; key: string } | null = null;
const handoffCopy = computed(() => t.value.nova.handoff);
watch(() => [app.accountKey, app.accountBindingEpoch, nova.conversationId], () => {
  ++handoffAttemptEpoch;
  handoffNeedsFreshQuestion.value = false;
  pendingHandoff = null; handoffRecommended.value = false; handoffBusy.value = false;
});
let novaPageVisible = false;
let novaHistoryEpoch = 0;
let novaDispatchTimer: ReturnType<typeof setTimeout> | undefined;
let novaReplyDeadline: { turnId: string; expiresAt: number } | undefined;
const dialogOwner = `nova-chat-${Date.now()}`;
const novaThinkingStage = ref<NovaThinkingStage>("understanding");
let novaStatusEpoch = 0;
let categoryGate: {
  category: ConversationType;
  promise: Promise<CategoryRefreshOutcome>;
} | null = null;
const novaRequestControl = createLatestAbortableRequest();
const startType = ref<Exclude<ConversationType, "ai"> | null>(null);
watch([cid, startType], () => { ticketCreationBlock.value = null; });
const humanComposerKey = computed(() => cid.value ? `conversation:${cid.value}` : startType.value ? `start:${startType.value}` : "");
let recoveredNavigation = "";
function restoreRecoveredComposer(saved: HumanComposer | null | undefined, key: string) {
  if (!saved?.recoveredId || !startType.value || cid.value || !novaPageVisible || recoveredNavigation === saved.recoveredId) return;
  const id = saved.recoveredId;
  const binding = app.accountBindingEpoch;
  const scope = convStore.scopeInvalidated;
  recoveredNavigation = id;
  void navReplace(`/pages/support/chat?cid=${encodeURIComponent(id)}`).then(ok => {
    if (binding !== app.accountBindingEpoch || scope !== convStore.scopeInvalidated) return;
    if (ok) convStore.clearComposer(key);
    else recoveredNavigation = "";
  });
}
watch(humanComposerKey, (key, previous) => {
  if (previous) convStore.saveComposer(previous, { ...convStore.composer(previous), text: draftText.value, imageDraft: imageDraft.value,
    failedSend: failedHumanSend.value ?? (humanSendBusy.value ? convStore.composer(previous).failedSend : null) });
  const saved = key ? convStore.composer(key) : null;
  draftText.value = saved?.text ?? "";
  imageDraft.value = saved?.imageDraft ?? null;
  failedHumanSend.value = saved?.failedSend ?? null;
  restoreRecoveredComposer(saved, key);
}, { flush: "sync" });
watch([draftText, imageDraft, failedHumanSend], () => {
  if (humanComposerResetting) return;
  if (humanComposerKey.value) convStore.saveComposer(humanComposerKey.value, { text: draftText.value, imageDraft: imageDraft.value,
    failedSend: failedHumanSend.value ?? (humanSendBusy.value ? convStore.composer(humanComposerKey.value).failedSend : null) });
}, { deep: true, flush: "sync" });
watch([() => convStore.humanComposers[humanComposerKey.value], humanSendBusy], ([saved]) => {
  if (!saved) return;
  humanComposerResetting = true;
  try {
    if (!draftText.value && saved.text && (saved.retainDraft || saved.failedSend)) draftText.value = saved.text;
    if (!humanSendBusy.value && !failedHumanSend.value && saved.failedSend) failedHumanSend.value = saved.failedSend;
    if (failedHumanSend.value && !saved.failedSend) failedHumanSend.value = null;
  } finally { humanComposerResetting = false; }
  restoreRecoveredComposer(saved, humanComposerKey.value);
});
const humanRealtime = createHumanThreadRealtimeLifecycle({
  currentId: () => cid.value,
  isAi: () => isAi.value,
  setTyping: active => convStore.setTyping(active),
  watch: id => convStore.watchRealtime(id),
});
const humanCreateRecovery = createHumanConversationCreationRecovery({
  visible: () => novaPageVisible,
  account: () => app.accountKey,
  binding: () => app.accountBindingEpoch,
  currentId: () => cid.value,
  startType: () => startType.value,
  restore: id => {
    cid.value = id;
    startType.value = null;
    revealTick.value += 1;
  },
});

function restoreCompletedHumanCreate(activateRealtime = false) {
  const type = startType.value;
  const restoredId = humanCreateRecovery.restore();
  if (restoredId && activateRealtime) humanRealtime.activateIfCurrent(restoredId);
  if (restoredId && novaPageVisible && type) {
    const key = `start:${type}`;
    const binding = app.accountBindingEpoch;
    const scope = convStore.scopeInvalidated;
    recoveredNavigation = restoredId;
    void navReplace(`/pages/support/chat?cid=${encodeURIComponent(restoredId)}`).then(ok => {
      if (binding !== app.accountBindingEpoch || scope !== convStore.scopeInvalidated) return;
      if (ok) convStore.clearComposer(key);
      else recoveredNavigation = "";
    });
  }
}

function stopHumanThreadPolling() {
  humanOpenRequest = null;
  humanRealtime.stop();
}

function startHumanThreadPolling(openEpoch: number, openId: string) {
  humanRealtime.watchIfCurrent(openEpoch, openId);
}

let humanOpenRequest: { epoch: number; id: string; binding: number; scope: number } | null = null;
async function openHumanConversation(epoch: number, id: string) {
  if (!supportSessionReady.value) return;
  const request = { epoch, id, binding: app.accountBindingEpoch, scope: convStore.scopeInvalidated };
  humanOpenRequest = request;
  const current = () => humanOpenRequest === request && request.binding === app.accountBindingEpoch
    && humanRealtime.isCurrent(request.epoch, request.id);
  try {
    await convStore.open(id, current);
    if (current()) startHumanThreadPolling(epoch, id);
  } catch (cause) {
    if (cause instanceof Error && !(cause instanceof ApiError) && cause.message === "SUPPORT_ACCOUNT_SCOPE_CHANGED"
        && request.scope === convStore.scopeInvalidated) {
      if (current()) startHumanThreadPolling(epoch, id);
      return;
    }
    if (current()) navBack("/pages/support/messages");
  } finally {
    if (humanOpenRequest === request) humanOpenRequest = null;
  }
}

watch([() => app.accountBindingEpoch, supportSessionReady, humanShowRevision], () => {
  if (isAi.value) return;
  if (!supportSessionReady.value) { stopHumanThreadPolling(); return; }
  if (novaPageVisible) void activateHumanPage();
}, { flush: "post" });

async function activateHumanPage() {
  if (!novaPageVisible || isAi.value || !supportSessionReady.value) return;
  stopHumanThreadPolling();
  const epoch = humanRealtime.show(), binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated;
  void convStore.refreshAdvisor(); void loadAttachmentPolicy();
  restoreCompletedHumanCreate();
  restoreRecoveredComposer(convStore.composer(humanComposerKey.value), humanComposerKey.value);
  const id = cid.value, type = startType.value;
  const current = () => novaPageVisible && supportSessionReady.value && binding === app.accountBindingEpoch
    && scope === convStore.scopeInvalidated && id === cid.value && type === startType.value;
  revealTick.value += 1;
  if (type && !id && remoteApiEnabled) {
    const gate: NonNullable<typeof categoryGate> = { category: type, promise: convStore.refreshCategories() };
    categoryGate = gate;
    const outcome = await gate.promise;
    if (!current() || categoryGate !== gate || outcome === "stale") return;
    if (outcome === "failed" || !convStore.categoryEnabled(type)) {
      toast.info(t.value.conversations.categoryDisabled, ""); navBack("/pages/support/messages"); return;
    }
  }
  if (current() && id) { await openHumanConversation(epoch, id); if (current()) void loadPrivateImages(); }
}

// Bare full-screen page (no AppChassis), so it must reserve the device status-bar
// space itself. Match the chassis source (real device height, else the H5
// device-preview simulated height) — env(safe-area-inset-top) is 0 inside the H5
// shell iframe, which left the header tucked under the simulated status bar.
const statusBarHeight = computed(() => {
  try {
    return uni.getSystemInfoSync().statusBarHeight || h5DevicePreviewStatusBarHeight();
  } catch {
    return h5DevicePreviewStatusBarHeight();
  }
});
// Bumped on every re-reveal so the thread re-pins to the newest message. uni H5
// navigateTo pushes a keep-alive page and hides it with display:none (zeroing the
// inner list's scrollTop); on navigateBack the page is re-shown, not re-mounted,
// so neither onMounted nor the messages/typing watch fires — without this the list
// would sit stuck at the top after any forward-then-back (P1: "messages vanished").
const revealTick = ref(0);

onLoad((q) => {
  if (q?.type === "ai") {
    if (!NOVA_SUPPORT_VISIBLE) {
      hiddenAiRoute.value = true;
      void navReplace("/pages/support/messages");
      return;
    }
    isAi.value = true;
    if (typeof q?.prompt === "string") initialPrompt.value = q.prompt.trim().slice(0, 800);
    return;
  }
  if (typeof q?.cid === "string") {
    cid.value = q.cid;
    return;
  }
  if (q?.start === "advisor" || q?.start === "support") startType.value = q.start;
});

// onShow/onHide track the hidden-but-alive state that onUnload/onUnmounted miss.
// onShow fires on first open AND on navigateBack re-reveal; onHide fires when a
// forward navigateTo hides this page. Managing Nova's open flag here (not only in
// cleanup) fixes the unread-suppression bug: leaving the AI chat forward used to
// leave isOpen=true forever, so every later proactive push silently zeroed unread.
// While a human-support thread is on screen the idle state machine must advance
// LIVE (quiet 1 min → in-thread countdown warning; quiet 5 min → auto-close), so a
// coarse interval keeps calling the sweep. Store-side idempotence (idleWarnedAt /
// sessionStatus guards) makes redundant ticks free. A real backend pushes these
// events — the interval then becomes a harmless no-op.
onShow(async () => {
  if (hiddenAiRoute.value) return;
  novaPageVisible = true;
  if (!isAi.value) { humanShowRevision.value += 1; return; }
  novaHistoryLoading.value = false;
  revealTick.value += 1;
  const requestedCategory = isAi.value ? "ai" : startType.value;
  // Bind the local account boundary synchronously. Input can become interactive
  // before the category request finishes, and must never capture the previous
  // account/conversation generation during that await gap.
  if (isAi.value && remoteApiEnabled) {
    try {
      nova.bindRemoteAccount(app.accountKey);
    } catch {
      novaProviderHold.value = true;
      novaStatusLoading.value = false;
      return;
    }
  }
  if (requestedCategory && remoteApiEnabled) {
    const gate: NonNullable<typeof categoryGate> = {
      category: requestedCategory,
      promise: convStore.refreshCategories(),
    };
    categoryGate = gate;
    const categoryOutcome = await gate.promise;
    if (categoryGate !== gate || !novaPageVisible || categoryOutcome === "stale") return;
    if (categoryOutcome === "failed" || !convStore.categoryEnabled(requestedCategory)) {
      toast.info(t.value.conversations.categoryDisabled, "");
      navBack("/pages/support/messages");
      return;
    }
  }
  if (isAi.value) {
    nova.open(); // mark Nova as being viewed → clears + tracks unread
    if (remoteApiEnabled) {
      await Promise.allSettled([refreshNovaAvailability(), refreshNovaHistory()]);
      void drainNovaQueue();
    }
  }
});
onHide(() => {
  novaPageVisible = false;
  clearPrivateImages();
  categoryGate = null;
  ++handoffAttemptEpoch;
  handoffBusy.value = false;
  novaStatusEpoch += 1;
  novaHistoryEpoch += 1;
  useUI().clearConfirmsBy(dialogOwner);
  if (isAi.value) {
    cancelNovaThinking();
    nova.close(); // no longer viewing Nova → later pushes accrue unread
  }
  stopHumanThreadPolling();
});

const ADVISOR_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" /><path d="M6 21a6 6 0 0 1 12 0" /></svg>`;
const SUPPORT_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 16a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /></svg>`;

watch(() => app.accountKey, () => {
  if (!isAi.value || !remoteApiEnabled) return;
  categoryGate = null;
  cancelNovaThinking();
  novaStatusEpoch += 1;
  novaHistoryEpoch += 1;
  novaHistoryLoading.value = false;
  useUI().clearConfirmsBy(dialogOwner);
  try { nova.bindRemoteAccount(app.accountKey); } catch { novaProviderHold.value = true; return; }
  if (novaPageVisible) {
    const accountKey = app.accountKey;
    const gate = { category: "ai" as const, promise: convStore.refreshCategories() };
    categoryGate = gate;
    void gate.promise.then(outcome => {
      if (categoryGate !== gate || !novaPageVisible || accountKey !== app.accountKey || outcome === "stale") return;
      if (outcome === "failed" || !convStore.categoryEnabled("ai")) {
        toast.info(t.value.conversations.categoryDisabled, "");
        navBack("/pages/support/messages");
        return;
      }
      void Promise.allSettled([refreshNovaAvailability(), refreshNovaHistory()]);
    });
  }
}, { flush: "sync" });

const conv = computed(() => (cid.value ? convStore.get(cid.value) : undefined));
watch(() => conv.value?.messages?.map(message => message.attachmentId).join("|"), () => { if (novaPageVisible && !isAi.value) void loadPrivateImages(); });
const humanType = computed<Exclude<ConversationType, "ai"> | null>(() =>
  conv.value?.type === "advisor" || conv.value?.type === "support" ? conv.value.type : startType.value,
);

// The App only permits replies to the same states accepted by AppSupportService.
// A transferred thread is history: a restart creates a new user-owned conversation.
const replyAllowedStatuses = new Set(["open", "resolved"]);
const isReplyAllowed = computed(() => !conv.value || replyAllowedStatuses.has(conv.value.status));
const isTransferredSession = computed(() => !isAi.value && conv.value?.status === "transferred");
const isClosedSession = computed(() =>
  isAi.value ? novaProviderHold.value : !!conv.value && !isReplyAllowed.value,
);
// Account advisor state applies to advisor replies and the existing new-compose
// flow. Other threads, including ended history, keep their server-owned identity.
const advisorApplies = computed(() => !isAi.value && !isClosedSession.value
  && (humanType.value === "advisor" || (!cid.value && !!startType.value)));
const showUnassignedReceived = computed(() => advisorApplies.value && convStore.advisor?.assignmentState === "UNBOUND"
  && !!conv.value?.messages.some(message => message.sender === "user"));

const headerName = computed(() => {
  if (isAi.value) return t.value.nova.name;
  if (advisorApplies.value && convStore.advisor?.assignmentState === "UNBOUND") return t.value.conversations.image.unassigned;
  if (advisorApplies.value && convStore.advisor?.currentAdvisorName) return convStore.advisor.currentAdvisorName;
  if (advisorApplies.value && convStore.advisorError) return t.value.conversations.image.advisorUnavailable;
  if (advisorApplies.value && convStore.advisorLoading) return t.value.conversations.image.loadingAdvisor;
  if (conv.value) return displayAgentName(conv.value.agentName);
  return humanType.value === "advisor" ? t.value.conversations.typeAdvisor : humanType.value === "support" ? t.value.conversations.typeSupport : "";
});

function displayAgentName(name: string): string {
  const normalized = name.trim();
  return normalized && normalized.toLowerCase() !== "unassigned"
    ? normalized
    : t.value.conversations.unassignedAgent;
}
const agentTyping = computed(() =>
  isAi.value ? nova.typing : (cid.value ? convStore.typingIds[cid.value] === true : false),
);
const thinkingLabel = computed(() => {
  if (!isAi.value || !remoteApiEnabled) return t.value.conversations.agentTyping;
  switch (novaThinkingStage.value) {
    case "checking": return t.value.nova.thinkingChecking;
    case "composing": return t.value.nova.thinkingComposing;
    default: return t.value.nova.thinkingUnderstanding;
  }
});
function isWaitingForAgent(name: string): boolean {
  const normalized = name.trim();
  return !normalized || normalized.toLowerCase() === "unassigned" || normalized === "备勤池" || normalized === "待分配";
}
const waitingForAgent = computed(() => (advisorApplies.value && convStore.advisor?.assignmentState === "UNBOUND")
  || (!!conv.value && (!advisorApplies.value || !convStore.advisor) && isWaitingForAgent(conv.value.agentName)));
const humanPresence = computed(() => {
  // Nova never consumes a human thread's connection or presence state.
  if (isAi.value) return { online: undefined, mutedDot: false };
  const online = cid.value ? convStore.onlineIds[cid.value] : undefined;
  return {
    online,
    mutedDot: isClosedSession.value || isTransferredSession.value || waitingForAgent.value
      || !remoteApiEnabled || !convStore.realtimeReady || online !== true,
  };
});
const headerRole = computed(() => {
  if (isAi.value) {
    if (agentTyping.value) return thinkingLabel.value;
    if (novaStatusLoading.value) return t.value.nova.localConnecting;
    if (novaProviderHold.value) return t.value.nova.localUnavailable;
    return remoteApiEnabled ? t.value.nova.localRole : t.value.conversations.roleAi;
  }
  if (!supportSessionReady.value) return t.value.conversations.connecting;
  if (advisorApplies.value && convStore.advisorError) return t.value.conversations.image.advisorUnavailable;
  if (startType.value && advisorApplies.value && convStore.advisor?.assignmentState === "UNBOUND") return t.value.conversations.waitingAgent;
  if (startType.value && advisorApplies.value && convStore.advisor?.assignmentState === "ADVISOR_DISABLED") return t.value.conversations.image.disabledAdvisor;
  if (startType.value && advisorApplies.value && convStore.advisor?.availability === "BUSY") return t.value.conversations.image.busyAdvisor;
  if (startType.value) return t.value.conversations.startConversation;
  if (!conv.value) return "";
  if (isTransferredSession.value) return t.value.conversations.sessionTransferred;
  if (isClosedSession.value) return t.value.conversations.sessionEnded;
  if (!remoteApiEnabled) return t.value.conversations[conv.value.roleKey];
  if (advisorApplies.value && convStore.advisor?.assignmentState === "ADVISOR_DISABLED") return t.value.conversations.image.disabledAdvisor;
  if (advisorApplies.value && convStore.advisor?.availability === "BUSY") return t.value.conversations.image.busyAdvisor;
  if (waitingForAgent.value) return t.value.conversations.waitingAgent;
  if (!convStore.realtimeReady) return t.value.conversations.connecting;
  if (humanPresence.value.online === false) return t.value.conversations.offline;
  if (agentTyping.value) return thinkingLabel.value;
  if (humanPresence.value.online === true) return t.value.conversations.online;
  return t.value.conversations[conv.value.roleKey];
});
const headerTint = computed(() =>
  isAi.value ? "var(--v5-brand-2)" : conv.value?.avatarTint ?? (humanType.value === "advisor" ? "var(--v5-brand)" : "var(--v5-tech-cyan)"),
);
// Never show a live dot until a human conversation has an assigned, current
// websocket presence. Unknown, reconnecting, and offline stay visually neutral.
const dotStyle = computed<CSSProperties>(() =>
  humanPresence.value.mutedDot
    ? { background: "var(--v5-ink-4)", animation: "none" }
    : { background: headerTint.value },
);
const headerIcon = computed(() => (humanType.value === "advisor" ? ADVISOR_ICON : SUPPORT_ICON));
const avaStyle = computed<CSSProperties>(() => ({
  color: headerTint.value,
  background: `color-mix(in srgb, ${headerTint.value} 14%, transparent)`,
}));

const inputPlaceholder = computed(() =>
  isAi.value && novaProviderHold.value
    ? t.value.nova.localUnavailable
    : isAi.value
      ? remoteApiEnabled ? t.value.nova.localInputPlaceholder : t.value.nova.inputPlaceholder
      : t.value.conversations.inputPlaceholder,
);
// 输入框的**名称**,与 inputPlaceholder(提示)分开。
// 本仓 lib/a11y-field-label.ts 的契约写得很明白:placeholder 是提示不是名称 ——
// 「拿 placeholder 冒充可访问名会把『提示』和『名称』混为一谈(placeholder 在输入后
// 就消失了,不是稳定的名称)」。而 placeholder 这一侧是**随可用性变**的
// (Nova 不可用时换成 localUnavailable),名称不能跟着一个会变的提示走。
const inputLabel = computed(() =>
  isAi.value
    ? remoteApiEnabled ? t.value.nova.localInputPlaceholder : t.value.nova.inputPlaceholder
    : t.value.conversations.inputPlaceholder,
);
const emptyHint = computed(() => {
  if (isAi.value && novaStatusLoading.value) return t.value.nova.localConnecting;
  if (isAi.value && novaProviderHold.value) return t.value.nova.localUnavailable;
  if (isAi.value) return remoteApiEnabled ? t.value.nova.localEmptyHint : t.value.nova.emptyHint;
  if (!supportSessionReady.value) return t.value.conversations.connecting;
  if (advisorApplies.value && convStore.advisor?.assignmentState === "UNBOUND") return t.value.conversations.image.unassignedHint;
  return humanType.value === "advisor" ? t.value.conversations.listEmptyAdvisor : t.value.conversations.listEmptySupport;
});

const quickChips = computed<QuickChip[]>(() =>
  isAi.value && !novaProviderHold.value
    ? [
        ...(initialPrompt.value ? [{ key: "search-query", emoji: "🔎", label: initialPrompt.value }] : []),
        { key: "explain-today", emoji: "📦", label: quickLabel("explain-today") },
        { key: "how-to-boost", emoji: "🎫", label: quickLabel("how-to-boost") },
        { key: "whats-hot", emoji: "🔐", label: quickLabel("whats-hot") },
        { key: "show-top-jobs", emoji: "💬", label: quickLabel("show-top-jobs") },
      ]
    : [],
);

// Human messages carry the authenticated user's delivery/read receipt. Show it
// only under the newest outgoing USER bubble; Nova has its own projection above.
function receiptFor(status: "sent" | "read" | undefined, isLatestReceipt: boolean): string | undefined {
  if (!status || !isLatestReceipt) return undefined;
  return status === "read" ? t.value.conversations.receiptRead : t.value.conversations.receiptSent;
}

// Native engines can ignore locale options; retain each language's local clock.
function humanMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  const hour = date.getHours(), minute = String(date.getMinutes()).padStart(2, "0");
  return locale.code === "zh" || locale.code === "vi"
    ? `${String(hour).padStart(2, "0")}:${minute}`
    : `${String(hour % 12 || 12).padStart(2, "0")}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

const threadMessages = computed<ThreadMsg[]>(() => {
  if (isAi.value) {
    const msgs = nova.messages;
    const lastUser = msgs.map((m) => m.sender).lastIndexOf("user");
    return msgs.map((m, i) => ({
      id: m.id,
      side: m.sender === "user" ? "right" : "left",
      tone: m.sender === "user" ? "user" : "agent",
      text: m.text,
      receipt: receiptFor(m.status, i === lastUser),
      queue: m.delivery ? {
        turnId: m.turnId!, state: m.delivery,
        label: m.delivery === "failed" ? t.value.nova.queue[m.failure ?? "failed"]
          : m.serverPending && ["processing", "tracking"].includes(m.delivery) ? t.value.nova.queue.tracking
          : m.delivery === "processing" ? t.value.nova.queue.processing
          : m.delivery === "editing" ? t.value.nova.queue.editing
          : nova.pendingRemote[0]?.delivery === "failed" ? t.value.nova.queue.paused
          : nova.pendingRemote.indexOf(m) === 0 ? t.value.nova.queue.ready
          : fmt(t.value.nova.queue.waiting, { n: nova.pendingRemote.indexOf(m) }),
        editable: !m.attempted,
      } : undefined,
      ctaLabel: m.ctaLabel,
      ctaHref: m.ctaHref,
    }));
  }
  const c = conv.value;
  if (!c) return [];
  const lastUser = c.messages.map((m) => m.sender).lastIndexOf("user");
  const messages: ThreadMsg[] = c.messages.map((m, i) => ({
    id: m.id,
    side: m.sender === "user" ? "right" : "left",
    tone: m.sender === "user" ? "user" : m.sender === "system" ? "system" : "agent",
    text: m.sender === "system" && c.lastMessageKind === "IDLE_TIMEOUT_CLOSE"
      ? localizedIdleClose(m.text, t.value.conversations) ?? m.text : m.text,
    imageSrc: m.attachmentId ? imageSources.value[m.attachmentId] : undefined,
    imageAttachmentId: m.attachmentId,
    imageLoading: !!m.attachmentId && !imageSources.value[m.attachmentId] && !imageFailures.value[m.attachmentId],
    imageError: !!m.attachmentId && !!imageFailures.value[m.attachmentId],
    meta: `${m.sender === "user" ? t.value.conversations.image.you : m.authorName || (c.type === "advisor" ? t.value.conversations.typeAdvisor : t.value.conversations.typeSupport)} · ${humanMessageTime(m.ts)}`,
    receipt: receiptFor(m.status, i === lastUser),
  }));
  const last = c.messages[c.messages.length - 1];
  const idleClose = c.status === "closed" && c.lastMessageKind === "IDLE_TIMEOUT_CLOSE" && (!last || c.lastTs > last.ts)
    ? localizedIdleClose(c.lastMessage, t.value.conversations) : null;
  return idleClose ? [...messages, {
    id: `idle-close:${c.id}:${c.lastTs}`, side: "left" as const,
    tone: "system" as const, text: idleClose,
  }] : messages;
});

async function loadEarlierHumanHistory() {
  if (!supportSessionReady.value) return;
  const activeId = cid.value;
  const scope = activeId ? humanRealtime.capture(activeId) : null;
  if (!scope) return;
  try {
    await convStore.loadEarlier(scope.id, () => humanRealtime.isCurrent(scope.epoch, scope.id));
  } catch {
    if (humanRealtime.isCurrent(scope.epoch, scope.id)) toast.warn(t.value.security.opFailed);
  }
}

// Restart returns to the same server-backed compose path. A durable conversation
// is created only after the user submits the opening message.
function onRestart() {
  if (isAi.value && remoteApiEnabled) {
    void refreshNovaAvailability();
    return;
  }
  const type = humanType.value;
  if (!type) return;
  navTo("/pages/support/chat?start=" + type);
}

async function onHumanHandoff() {
  if (handoffBusy.value || !novaPageVisible) return;
  if (handoffNeedsFreshQuestion.value) {
    toast.info(handoffCopy.value.fresh, "");
    navTo("/pages/support/chat?start=support");
    return;
  }
  const lastReply = [...nova.messages].reverse().find(message => message.sender === "nova" && /^[0-9a-f-]{36}:nova$/i.test(message.id));
  if (!lastReply) { navTo("/pages/support/chat?start=support"); return; }
  const attemptEpoch = ++handoffAttemptEpoch;
  const account = app.accountKey;
  const bindingEpoch = app.accountBindingEpoch;
  const conversation = nova.conversationId;
  const current = () => novaPageVisible && attemptEpoch === handoffAttemptEpoch
    && account === app.accountKey && bindingEpoch === app.accountBindingEpoch
    && conversation === nova.conversationId;
  handoffBusy.value = true;
  let hasRequestKey = false;
  try {
    const request = pendingHandoff ?? {
      account, epoch: bindingEpoch, conversation,
      turn: lastReply.id.slice(0, 36), key: requireCryptoUuid(),
    };
    hasRequestKey = true;
    if (!await confirm({ title: handoffCopy.value.action, message: handoffCopy.value.confirm,
      confirmLabel: handoffCopy.value.action, owner: dialogOwner }) || !current()) return;
    pendingHandoff = request;
    const conversationNo = await novaAiApi.confirmHandoff(request.conversation, request.turn, request.key);
    if (!current()) return;
    pendingHandoff = null;
    navTo(`/pages/support/chat?cid=${encodeURIComponent(conversationNo)}`);
  } catch {
    if (current()) {
      if (!hasRequestKey) {
        toast.info(handoffCopy.value.fresh, "");
        navTo("/pages/support/chat?start=support");
      } else toast.error(t.value.nova.localFailed, t.value.nova.localRetry);
    }
  } finally { if (attemptEpoch === handoffAttemptEpoch) handoffBusy.value = false; }
}

async function refreshNovaAvailability() {
  if (!remoteApiEnabled || !isAi.value) return;
  const epoch = ++novaStatusEpoch;
  const accountKey = app.accountKey;
  novaStatusLoading.value = true;
  try {
    const status = await novaAiApi.status();
    if (epoch !== novaStatusEpoch || accountKey !== app.accountKey) return;
    novaProviderHold.value = !status.available;
  } catch {
    if (epoch !== novaStatusEpoch || accountKey !== app.accountKey) return;
    novaProviderHold.value = true;
  } finally {
    if (epoch === novaStatusEpoch && accountKey === app.accountKey) {
      novaStatusLoading.value = false;
      void drainNovaQueue();
    }
  }
}

async function refreshNovaHistory() {
  if (!remoteApiEnabled || !isAi.value || nova.historyLoaded || nova.pendingRemote.length) return;
  const epoch = ++novaHistoryEpoch;
  novaHistoryLoading.value = true;
  try {
    await nova.ensureRemoteHistory(app.accountKey, () => novaAiApi.history());
  } finally {
    if (epoch === novaHistoryEpoch) {
      novaHistoryLoading.value = false;
      void drainNovaQueue();
    }
  }
}

async function loadEarlierNovaHistory() {
  if (!remoteApiEnabled || !isAi.value || !novaPageVisible) return;
  try {
    await nova.loadEarlierRemote(app.accountKey, cursor => novaAiApi.history(nova.conversationId, cursor));
  } catch {
    toast.warn(t.value.nova.localFailed, t.value.nova.localRetry);
  }
}

function quickLabel(k: QuickPromptKey): string {
  if (remoteApiEnabled) {
    switch (k) {
      case "explain-today": return t.value.nova.localQOrder;
      case "how-to-boost": return t.value.nova.localQTicket;
      case "whats-hot": return t.value.nova.localQSecurity;
      case "show-top-jobs": return t.value.nova.localQHuman;
    }
  }
  switch (k) {
    case "explain-today": return t.value.nova.qExplainToday;
    case "how-to-boost": return t.value.nova.qHowToBoost;
    case "whats-hot": return t.value.nova.qWhatsHot;
    case "show-top-jobs": return t.value.nova.qShowTopJobs;
  }
}

// One-shot reply timers — tracked so they can be cancelled if the user leaves the
// chat before the reply lands. Otherwise a ghost reply posts to the singleton store
// after unmount; for AI it would also bump unread once isOpen is reset below.
const pendingTimers: ReturnType<typeof setTimeout>[] = [];
function schedule(fn: () => void, ms: number) {
  pendingTimers.push(setTimeout(fn, ms));
}

const novaThinkingTimers = new Set<ReturnType<typeof setTimeout>>();
let pendingNovaThinkingWait: {
  timer: ReturnType<typeof setTimeout>;
  resolve: (completed: boolean) => void;
} | undefined;

function clearNovaThinkingTimers() {
  novaThinkingTimers.forEach(clearTimeout);
  novaThinkingTimers.clear();
}

function scheduleNovaThinkingStage(stage: NovaThinkingStage, ms: number, epoch: number) {
  const timer = setTimeout(() => {
    novaThinkingTimers.delete(timer);
    if (novaRequestControl.isCurrent(epoch)) novaThinkingStage.value = stage;
  }, ms);
  novaThinkingTimers.add(timer);
}

function beginNovaThinking() {
  clearNovaThinkingTimers();
  const request = novaRequestControl.begin();
  novaThinkingStage.value = "understanding";
  nova.setTyping(true);
  scheduleNovaThinkingStage("checking", NOVA_THINKING_CHECKING_MS, request.epoch);
  scheduleNovaThinkingStage("composing", NOVA_THINKING_COMPOSING_MS, request.epoch);
  return request;
}

function waitForNovaThinkingDelay(ms: number, epoch: number): Promise<boolean> {
  if (!novaRequestControl.isCurrent(epoch)) return Promise.resolve(false);
  if (ms <= 0) return Promise.resolve(true);
  if (pendingNovaThinkingWait) {
    clearTimeout(pendingNovaThinkingWait.timer);
    pendingNovaThinkingWait.resolve(false);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pendingNovaThinkingWait?.timer === timer) pendingNovaThinkingWait = undefined;
      resolve(novaRequestControl.isCurrent(epoch));
    }, ms);
    pendingNovaThinkingWait = { timer, resolve };
  });
}

function finishNovaThinking(epoch: number) {
  if (!novaRequestControl.finish(epoch)) return;
  clearNovaThinkingTimers();
  nova.setTyping(false);
}

function cancelNovaThinking() {
  if (novaDispatchTimer !== undefined) clearTimeout(novaDispatchTimer);
  novaDispatchTimer = undefined;
  novaReplyDeadline = undefined;
  novaRequestControl.cancel();
  clearNovaThinkingTimers();
  if (pendingNovaThinkingWait) {
    clearTimeout(pendingNovaThinkingWait.timer);
    pendingNovaThinkingWait.resolve(false);
    pendingNovaThinkingWait = undefined;
  }
  nova.setTyping(false);
  novaAiRequestInFlight.value = false;
  nova.interruptRemote();
}

function cleanup() {
  chatDisposed = true;
  novaPageVisible = false;
  clearPrivateImages();
  categoryGate = null;
  novaStatusEpoch += 1;
  novaHistoryEpoch += 1;
  useUI().clearConfirmsBy(dialogOwner);
  stopHumanThreadPolling();
  pendingTimers.forEach(clearTimeout);
  pendingTimers.length = 0;
  // Cancelled timers would otherwise leave a ghost "typing…" flag on the store
  // (it bleeds into the list preview) — always drop it on the way out.
  cancelNovaThinking();
  // Reset Nova's open flag (the AI chat page acted as the "open" view). Without this
  // isOpen stays true forever and every future proactive push would silently zero
  // unread → the bubble would never surface Nova news again after one AI visit.
  if (isAi.value) nova.close();
}
onUnload(cleanup);
onUnmounted(cleanup);

// ── send rate limit — anti-spam guard across every channel of this chat
// (advisor / support / AI free text, incl. quick chips). A real backend answers
// 429 + Retry-After with the same policy; the limiter mirrors that contract.
const SEND_MAX = 5; // max sends…
const SEND_WINDOW_MS = 15_000; // …per rolling window
const SEND_MIN_GAP_MS = 1000; // min gap between two consecutive sends
const sendLimiter = createSendLimiter(SEND_MAX, SEND_WINDOW_MS, SEND_MIN_GAP_MS);
// Continuous input is accepted immediately. Apply the original anti-spam
// budget to actual dispatch (including retries), without discarding input.
let novaDispatchLimiter = createSendLimiter(SEND_MAX, SEND_WINDOW_MS, SEND_MIN_GAP_MS);
let novaDispatchAccount = app.accountKey;

function acquireSendSlot(): boolean {
  const verdict = sendLimiter.tryAcquire();
  if (!verdict.ok) {
    toast.warn(
      t.value.conversations.rateLimited,
      fmt(t.value.conversations.rateLimitedRetry, { n: verdict.retryInSec }),
    );
  }
  return verdict.ok;
}

// Reply choreography (ms after send): agent reads → types → answers.
const AI_TYPING_ON_MS = 300;
const AI_REPLY_MS = 1100;
const NOVA_SERVER_TRACK_RETRY_MS = 3000;
const NOVA_REPLY_DEADLINE_MS = 75_000;

async function waitForNovaReply<T>(reply: Promise<T>, abort: () => void, remainingMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reply,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { abort(); reject(new Error("request:fail timeout")); }, remainingMs);
      }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

async function onSend(text: string, restore?: () => void) {
  if (!isAi.value && !supportSessionReady.value) { restore?.(); return; }
  if (isAi.value && remoteApiEnabled) {
    const accountKey = app.accountKey;
    const conversationBoundary = nova.conversationBoundary;
    let gate = categoryGate;
    if (!gate || gate.category !== "ai") {
      gate = { category: "ai", promise: convStore.refreshCategories() };
      categoryGate = gate;
    }
    const categoryOutcome = await gate.promise;
    if (categoryGate !== gate || categoryOutcome !== "applied" || !convStore.categoryEnabled("ai")) {
      restore?.();
      return;
    }
    if (!novaPageVisible || accountKey !== app.accountKey
      || conversationBoundary !== nova.conversationBoundary) {
      restore?.();
      return;
    }
    if (!nova.historyLoaded) {
      try {
        await refreshNovaHistory();
      } catch {
        restore?.();
        toast.error(t.value.nova.localFailed, t.value.nova.localRetry);
        return;
      }
      if (!novaPageVisible || accountKey !== app.accountKey
        || conversationBoundary !== nova.conversationBoundary || !nova.historyLoaded) {
        restore?.();
        return;
      }
    }
    if (!text.trim() || text.length > 2000) {
      restore?.(); toast.warn(t.value.nova.queue.invalid); return;
    }
    if (nova.pendingRemote.length >= 4) {
      restore?.(); toast.info(t.value.nova.queue.full); return;
    }
    if (novaProviderHold.value) {
      restore?.(); toast.info(t.value.nova.localUnavailable, t.value.nova.localRetry); return;
    }
    // Bound admission by queue capacity. Only the serial worker sends requests.
    try {
      if (!nova.enqueueRemote(requireCryptoUuid(), text,
        locale.code === "zh" || locale.code === "vi" ? locale.code : "en")) {
        restore?.(); toast.warn(t.value.nova.queue.failed); return;
      }
    } catch { restore?.(); toast.error(t.value.nova.queue.failed); return; }
    void drainNovaQueue();
    return;
  }
  if (humanSendBusy.value) { restore?.(); return; }
  humanSendBusy.value = true;
  try {
  // Do not supersede an in-flight page read; preserve the draft for its result.
  if (!isAi.value && humanOpenRequest !== null) { restore?.(); return; }
  if (!isAi.value && !cid.value && startType.value && remoteApiEnabled) {
    const binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated, type = startType.value;
    if (convStore.categoryAvailabilityStatus !== "ready") {
      const outcome = await convStore.refreshCategories();
      if (binding !== app.accountBindingEpoch || scope !== convStore.scopeInvalidated || !novaPageVisible || startType.value !== type || cid.value) return;
      if (outcome !== "applied") { restore?.(); return; }
    }
    if (!convStore.categoryEnabled(type)) { restore?.(); toast.info(t.value.conversations.categoryDisabled, ""); return; }
  }
  if (!acquireSendSlot()) {
    restore?.(); // rejected send must not swallow the typed message
    return;
  }
  if (isAi.value) {
    nova.sendUser(text);
    nova.markUserRead(); // Nova reads instantly
    schedule(() => nova.setTyping(true), AI_TYPING_ON_MS);
    schedule(() => {
      nova.setTyping(false);
      nova.push({ kind: "nova-reply", text: t.value.conversations.aiFreeFormReply });
    }, AI_REPLY_MS);
    return;
  }
  await sendHumanMessage(text, imageDraft.value?.state === "ready" ? imageDraft.value.attachmentId : undefined, restore);
  } finally { humanSendBusy.value = false; }
}

async function sendHumanMessage(text: string, attachmentId?: string, restore?: () => void, attempts = 1) {
  if (!supportSessionReady.value) { restore?.(); return; }
  const supportScope = convStore.scopeInvalidated;
  const id = cid.value;
  if (!id) {
    const type = startType.value;
    if (!type) {
      restore?.();
      return;
    }
    const creation = humanCreateRecovery.begin(type);
    if (!creation) {
      restore?.();
      return;
    }
    if (remoteApiEnabled && !convStore.categoryEnabled(type)) {
      humanCreateRecovery.finish();
      restore?.();
      toast.info(t.value.conversations.categoryDisabled, "");
      return;
    }
    if (!stageHumanSend(text, attachmentId, attempts, restore)) { humanCreateRecovery.finish(); return; }
    try {
      const createdId = await convStore.startConversation(type, text, attachmentId);
      if (!humanCreateRecovery.isCurrent(creation) || supportScope !== convStore.scopeInvalidated) return;
      humanCreateRecovery.complete(createdId, creation);
      if (imageDraft.value?.attachmentId === attachmentId) imageDraft.value = null;
      convStore.saveComposer(`start:${type}`, { text: draftText.value, imageDraft: null, failedSend: null, recoveredId: createdId });
      restoreCompletedHumanCreate(true);
    } catch (cause) {
      if (!humanCreateRecovery.isCurrent(creation) || supportScope !== convStore.scopeInvalidated) return;
      humanSendFailed(text, attachmentId, cause, attempts);
    } finally {
      humanCreateRecovery.finish();
    }
    return;
  }
  if (!isReplyAllowed.value) {
    restore?.();
    toast.info(isTransferredSession.value ? t.value.conversations.sessionTransferred : t.value.conversations.sessionEnded, "");
    return;
  }
  const replyBinding = app.accountBindingEpoch;
  if (!stageHumanSend(text, attachmentId, attempts, restore)) return;
  try {
    await convStore.sendUser(id, text, attachmentId);
    if (replyBinding !== app.accountBindingEpoch || cid.value !== id || supportScope !== convStore.scopeInvalidated) return;
    if (imageDraft.value?.attachmentId === attachmentId) imageDraft.value = null;
    if (humanComposerKey.value) convStore.saveComposer(humanComposerKey.value, { text: draftText.value, imageDraft: imageDraft.value, failedSend: null });
  } catch (cause) {
    if (replyBinding !== app.accountBindingEpoch || cid.value !== id || supportScope !== convStore.scopeInvalidated) return;
    humanSendFailed(text, attachmentId, cause, attempts);
  }
}

function stageHumanSend(text: string, attachmentId: string | undefined, attempts: number, restore?: () => void): boolean {
  if (!remoteApiEnabled || !humanComposerKey.value) return true;
  try {
    convStore.saveComposer(humanComposerKey.value, { text: draftText.value, imageDraft: imageDraft.value,
      failedSend: { text, attachmentId, settled: false, retryable: true, attempts, kind: "unknown" } }, true);
    return true;
  } catch {
    convStore.saveComposer(humanComposerKey.value, { text: draftText.value, imageDraft: imageDraft.value, failedSend: null });
    restore?.();
    toast.error(t.value.conversations.image.sendFailed, "");
    return false;
  }
}

function humanSendFailed(text: string, attachmentId: string | undefined, cause: unknown, attempts: number) {
  const expired = isSupportAttachmentNotReady(cause);
  const settled = expired || isSettledRejection(cause);
  const draft = imageDraft.value;
  if (expired && draft && draft.attachmentId === attachmentId) {
    draft.state = "failed";
    draft.error = "expired";
    draft.replaceOnly = true;
  }
  failedHumanSend.value = { text, attachmentId, settled, retryable: !expired, attempts,
    kind: expired ? "expired" : settled ? "failed" : "unknown" };
  if (humanComposerKey.value) convStore.saveComposer(humanComposerKey.value, { text: draftText.value, imageDraft: imageDraft.value, failedSend: failedHumanSend.value });
}

async function drainNovaQueue() {
  if (!novaPageVisible || !isAi.value || !remoteApiEnabled || novaProviderHold.value
      || novaStatusLoading.value || novaHistoryLoading.value || novaAiRequestInFlight.value) return;
  const headDelivery = nova.pendingRemote[0]?.delivery;
  if (!headDelivery || !["queued", "tracking"].includes(headDelivery) || novaDispatchTimer !== undefined) return;
  const headTurnId = nova.pendingRemote[0].turnId!;
  if (headDelivery === "tracking" && novaReplyDeadline?.turnId === headTurnId
      && Date.now() >= novaReplyDeadline.expiresAt) {
    nova.failRemote(headTurnId, "timeout");
    novaReplyDeadline = undefined;
    handoffNeedsFreshQuestion.value = true;
    handoffRecommended.value = true;
    return;
  }
  if (novaDispatchAccount !== app.accountKey) {
    novaDispatchAccount = app.accountKey;
    novaDispatchLimiter = createSendLimiter(SEND_MAX, SEND_WINDOW_MS, SEND_MIN_GAP_MS);
  }
  if (headDelivery === "queued") {
    const verdict = novaDispatchLimiter.tryAcquire();
    if (!verdict.ok) {
      novaDispatchTimer = setTimeout(() => {
        novaDispatchTimer = undefined;
        void drainNovaQueue();
      }, verdict.retryInSec * 1000);
      return;
    }
  }
  const item = nova.claimRemote();
  if (!item) return;
  if (!novaReplyDeadline || novaReplyDeadline.turnId !== item.turnId || headDelivery === "queued") {
    novaReplyDeadline = { turnId: item.turnId, expiresAt: Date.now() + NOVA_REPLY_DEADLINE_MS };
  }
  const accountKey = app.accountKey;
  const conversationId = nova.conversationId;
  const requestStartedAt = novaThinkingNow();
  const request = beginNovaThinking();
  novaAiRequestInFlight.value = true;
  const current = () => novaPageVisible && novaRequestControl.isCurrent(request.epoch)
    && accountKey === app.accountKey && conversationId === nova.conversationId;
  try {
    const result = await waitForNovaReply(novaAiApi.chat({ message: item.text, language: item.language,
      conversationId, turnId: item.turnId }, request.signal), request.abort,
      Math.max(0, novaReplyDeadline.expiresAt - Date.now()));
    if (!current()) return;
    const completed = await waitForNovaThinkingDelay(
      remainingNovaThinkingMs(requestStartedAt, novaThinkingNow()), request.epoch);
    if (!completed || !current()) return;
    nova.completeRemote(item.turnId, result.reply);
    novaReplyDeadline = undefined;
    handoffNeedsFreshQuestion.value = false;
    handoffRecommended.value = !!result.handoffReason;
  } catch (error) {
    if (current()) {
      const failure = novaFailure(error);
      if (Date.now() < novaReplyDeadline!.expiresAt
          && (failure === "timeout" || failure === "network" || (item.tracking && failure === "busy"))) {
        nova.trackRemote(item.turnId);
        novaDispatchTimer = setTimeout(() => {
          novaDispatchTimer = undefined;
          void drainNovaQueue();
        }, Math.min(NOVA_SERVER_TRACK_RETRY_MS, novaReplyDeadline!.expiresAt - Date.now()));
      } else {
        nova.failRemote(item.turnId, Date.now() >= novaReplyDeadline!.expiresAt ? "timeout" : failure);
        novaReplyDeadline = undefined;
        handoffNeedsFreshQuestion.value = true;
        handoffRecommended.value = true;
      }
    }
  } finally {
    if (novaRequestControl.isCurrent(request.epoch)) {
      finishNovaThinking(request.epoch);
      novaAiRequestInFlight.value = false;
      void drainNovaQueue();
    }
  }
}

function onQueueAction(turnId: string, action: "edit" | "cancel" | "retry" | "cancel-edit") {
  if (!isAi.value || !remoteApiEnabled || !novaPageVisible) return;
  if (action === "edit") nova.editRemote(turnId);
  if (action === "cancel") nova.cancelRemote(turnId);
  if (action === "cancel-edit") nova.cancelRemoteEdit(turnId);
  if (action === "retry") nova.retryRemote(turnId);
  void drainNovaQueue();
}

function onQueueSave(turnId: string, text: string) {
  if (!novaPageVisible || !isAi.value || !remoteApiEnabled) return;
  if (!nova.saveRemoteEdit(turnId, text)) toast.warn(t.value.nova.queue.invalid);
  void drainNovaQueue();
}

let humanConvertRequest: { binding: number; id: string } | null = null;
async function onConvertToTicket() {
  if (!supportSessionReady.value) return;
  const current = conv.value;
  if (!current) return;
  const binding = app.accountBindingEpoch;
  if (humanConvertRequest?.binding === binding && humanConvertRequest.id === current.id) return;
  const request = { binding, id: current.id };
  humanConvertRequest = request;
  ticketCreationBlock.value = null;
  const isCurrent = () => binding === app.accountBindingEpoch && novaPageVisible && cid.value === current.id;
  try {
    const ticketId = await convStore.convertToTicket(current.id, "technical", `Conversation ${current.id}`);
    if (!isCurrent()) return;
    navTo(`/pages/me/support-tickets?ticket=${encodeURIComponent(ticketId)}`);
    } catch (cause) {
      if (!isCurrent()) return;
      if (cause instanceof TicketCreationDenied) ticketCreationBlock.value = cause.policy;
      else if (isTicketReplyRequired(cause))
        toast.warn(t.value.conversations.convertTicketReplyRequired);
      else toast.error(t.value.conversations.convertTicketFailed, "");
    }
  finally { if (humanConvertRequest === request) humanConvertRequest = null; }
}

function onChip(key: string) {
  if (remoteApiEnabled) {
    const message = key === "search-query" ? initialPrompt.value : quickLabel(key as QuickPromptKey);
    void onSend(message);
    return;
  }
  if (!acquireSendSlot()) return;
  const k = key as QuickPromptKey;
  const onlineCount = app.visibleDevices.filter((d) => d.activatedAt !== null && isDeviceOnline(d, Date.now())).length;
  nova.sendUser(quickLabel(k), "user-quick");
  nova.markUserRead();
  schedule(() => nova.setTyping(true), AI_TYPING_ON_MS);
  schedule(() => {
    nova.setTyping(false);
    nova.push(replyToQuickPrompt(t.value, k, { earningsToday: app.earnings.today, devices: app.visibleDevices, onlineCount }));
  }, AI_REPLY_MS);
}

function onCta(href: string) {
  navTo(href);
}

async function onStartNewConversation() {
  const accountKey = app.accountKey;
  const conversationId = nova.conversationId;
  if (nova.pendingRemote.length && !await confirm({
    title: t.value.conversations.restartSession, message: t.value.nova.queue.newConfirm,
    confirmLabel: t.value.nova.queue.newConfirmAction, owner: dialogOwner,
  })) return;
  if (!novaPageVisible || accountKey !== app.accountKey || conversationId !== nova.conversationId) return;
  try {
    novaHistoryEpoch += 1;
    novaHistoryLoading.value = false;
    cancelNovaThinking();
    nova.startNewConversation();
    initialPrompt.value = "";
    revealTick.value += 1;
  } catch {
    novaProviderHold.value = true;
    toast.error(t.value.nova.localFailed, t.value.nova.localRetry);
  }
}

function goBack() {
  navBack("/pages/support/messages");
}

function onKeyboardActivate(event: KeyboardEvent, action: () => void) {
  if (event.repeat) return;
  void action();
}

import LiquidGlass from "@/components/liquid-glass.vue";
</script>

<style scoped>
.cp-ticket-limit { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 16px; padding: 12px 0; color: var(--v5-ink-3); font-size: 13px; line-height: 1.6; border-bottom: 1px solid var(--v5-border); }
.cp-ticket-limit > text { flex-basis: 100%; }
.cp-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--v5-bg);
}
.cp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 16px 16px;
  /* top padding is bound inline to the device status-bar height (see cp-head :style) */
  border-bottom: 1px solid color-mix(in srgb, var(--v5-border) 55%, transparent);
}
.cp-ai-safety {
  padding: 8px 16px;
  background: color-mix(in srgb, var(--v5-tech-cyan) 8%, var(--v5-bg));
  border-bottom: 1px solid color-mix(in srgb, var(--v5-tech-cyan) 18%, var(--v5-border));
}
.cp-ai-safety-t {
  display: block;
  font-size: 12px;
  line-height: 1.45;
  color: var(--v5-ink-3);
}
.cp-ai-history {
  padding: 7px 16px;
  background: color-mix(in srgb, var(--v5-warning) 9%, var(--v5-bg));
  border-bottom: 1px solid color-mix(in srgb, var(--v5-warning) 22%, var(--v5-border));
}
.cp-ai-history-t {
  display: block;
  font-size: 12px;
  line-height: 1.45;
  color: var(--v5-ink-2);
}
.cp-back {
  /* 《07》tap≥44:原 36×36。负 margin 由 -6 调到 -10,图标视觉位置不动、只有热区变大 */
  width: 44px;
  height: 44px;
  margin-left: 0;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.cp-ava {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.cp-meta {
  flex: 1;
  min-width: 100px;
}
.cp-ticket {
  min-height: 44px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  color: var(--v5-ink-2);
  font-size: 12px;
  font-weight: 500;
  margin-left: auto;
  max-width: 100%;
}
.cp-name {
  display: block;
  font-family: var(--font-v5);
  font-weight: 600;
  font-size: 20px;
  overflow-wrap: anywhere;
  letter-spacing: -0.008em;
  color: var(--v5-ink);
}
.cp-role {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
.cp-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  animation: mc-pulse 1.6s ease-in-out infinite;
}
.cp-role-t {
  font-size: 12px;
  color: var(--v5-ink-3);
}
/* Home Indicator overlay — pinned to the bottom safe area over the input row's
   padding (.cp-root is position:fixed, so absolute anchors to it). */
.cp-home {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 110;
  pointer-events: none;
}
.cp-back { position: relative; overflow: visible; }
.cp-back > svg { position: relative; z-index: 1; }
.cp-root .cp-ai-history-action { background: transparent; border: none; margin: 6px 16px; }
.cp-root .cp-ai-history-action .cp-ai-history-t { position: relative; }
.cp-role-t { overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .cp-dot { animation: none; } }
</style>

<style src="@/styles/message-family.css"></style>
