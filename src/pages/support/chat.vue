<!--
  Conversation chat — full-screen thread for one conversation. Bare full-screen
  (own header + ConversationThread), NOT wrapped in AppChassis: a focused chat wants
  no tabbar / support bubble, and its own flex column (header + scrolling messages +
  pinned input) would fight the chassis scroll container. Not standalone-page-shell
  either: the pinned input row owns the bottom safe-area itself (P-040), which the
  shell's reserved band would double — so this page draws its own status bar and
  home indicator.

  query ?cid=<id>              → an existing advisor / support conversation.
  query ?start=advisor|support → compose the opening message of a new one.
  Any other query (including the retired ?type=ai) returns to the message center.

  A separate route (vs in-page state) means each open gets a fresh onLoad, sidestepping
  the H5 same-page hash-query staleness (P-044/P-049). Bare text in <text> (P-026).
-->
<template>
  <view class="cp-root message-family">
    <!-- Simulated device status bar (preview shell only) — bare page draws its own. -->
    <DeviceStatusBar />

    <!-- Only the individual controls paint glass; messages scroll beneath this transparent overlay. -->
    <view ref="topOverlayHost" class="cp-top-overlay">
    <view class="cp-head" :style="{ paddingTop: statusBarHeight + 10 + 'px' }">
      <view class="cp-back active:opacity-60" role="button" tabindex="0" :aria-label="t.conversations.back" @click="goBack"  @keydown.enter.prevent="onKeyboardActivate($event, goBack)" @keydown.space.prevent="onKeyboardActivate($event, goBack)">
        <LiquidGlass rendering="frosted" :radius="22" />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>

      <view class="cp-identity">
        <LiquidGlass rendering="frosted" :radius="24" />
        <view class="cp-meta">
          <text class="cp-name">{{ headerName }}</text>
          <view v-if="headerRole" class="cp-role" :class="{ 'cp-role--online': headerRole === t.conversations.online }">
            <view class="cp-dot" :style="dotStyle" />
            <text class="cp-role-t">{{ headerRole }}</text>
          </view>
        </view>
      </view>
      <view class="cp-head-spacer" aria-hidden="true" />
    </view>

    </view>

    <!-- Thread body (messages + chips + input) -->
    <ConversationThread
      ref="conversationThread"
      :top-inset="topOverlayHeight"
      :history-content-key="historyContentKey"
      :time-locale="locale.code"
      @typing="convStore.setTyping($event)"
      :messages="threadMessages"
      :entrance-ready="humanOpenRequest === null && !humanHistoryRetryBusy && !humanEarlierBusy"
	      :input-placeholder="inputPlaceholder"
	      :input-label="inputLabel"
	      :send-label="t.conversations.send"
      :status-labels="t.conversations.delivery"
      :send-success-revision="sendSuccessRevision"
      :send-success-owner="sendSuccessOwner"
      :empty-hint="emptyHint"
      :typing="agentTyping"
      :typing-label="t.conversations.agentTyping"
      :reveal-tick="revealTick"
      :closed="isClosedSession"
      :restart-label="t.conversations.restartSession"
      :composer-key="app.accountBindingEpoch + ':' + convStore.scopeInvalidated + ':' + (cid || startType || '')"
      :initial-draft="draftText"
      :max-input-length="MESSAGE_MAX_LENGTH"
      :input-limit-hint="fmt(t.conversations.messageTooLong, { n: MESSAGE_MAX_LENGTH })"
      :image-labels="t.conversations.image"
      :attach-disabled="!supportSessionReady || attachmentPolicy?.available !== true"
      :attach-unavailable="attachmentPolicy?.available !== true ? (!remoteApiEnabled || attachmentPolicyError || attachmentPolicy?.available === false ? t.conversations.image.unavailable : t.conversations.image.checkingPolicy) : undefined"
      :attach-retry="remoteApiEnabled && attachmentPolicyError"
      :attachment-draft="attachmentDisplay"
      :attachment-preview-src="imageDraft?.filePath"
      :failed-send-label="failedHumanLabel"
      :can-discard-send="failedHumanSend?.settled"
      :can-retry-send="supportSessionReady && failedHumanSend?.retryable !== false && !humanSendBusy"
      :send-blocked="!supportSessionReady || !!failedHumanSend || humanSendBusy"
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
      @cta="onCta"
      @restart="onRestart"
    >
      <template #history-prefix>
      <view v-if="advisorApplies && convStore.advisorError" class="cp-history-error" role="alert">
        <text class="cp-ai-history-t">{{ t.conversations.image.advisorUnavailable }}</text>
        <view class="cp-history-text-action" role="button" :tabindex="convStore.advisorLoading ? -1 : 0" :aria-disabled="convStore.advisorLoading" :aria-busy="convStore.advisorLoading" @click="!convStore.advisorLoading && convStore.refreshAdvisor()" @keydown.enter.prevent="!convStore.advisorLoading && convStore.refreshAdvisor()" @keydown.space.prevent="!convStore.advisorLoading && convStore.refreshAdvisor()"><text>{{ t.conversations.image.retryPolicy }}</text></view>
      </view>
      <view v-if="conv?.historyTruncated" class="cp-ai-history" role="status" aria-live="polite">
        <text class="cp-ai-history-t">{{ t.conversations.historyTruncated }}</text>
      </view>
      <view v-if="conv?.historyNextCursor" class="cp-history-text-action" role="button" :tabindex="humanEarlierBusy || humanHistoryRetryBusy ? -1 : 0" :aria-disabled="humanEarlierBusy || humanHistoryRetryBusy" :aria-busy="humanEarlierBusy"
        :aria-label="t.conversations.loadEarlier" @click="loadEarlierHumanHistory"  @keydown.enter.prevent="onKeyboardActivate($event, loadEarlierHumanHistory)" @keydown.space.prevent="onKeyboardActivate($event, loadEarlierHumanHistory)">
        <text class="cp-ai-history-t">{{ t.conversations.loadEarlier }}</text>
      </view>
      <view v-if="humanHistoryError || humanHistoryListError" class="cp-history-error" role="alert"><text>{{ t.conversations.loadError }}</text><view class="cp-history-text-action" role="button" :tabindex="humanHistoryRetryBusy || humanEarlierBusy ? -1 : 0" :aria-disabled="humanHistoryRetryBusy || humanEarlierBusy" :aria-busy="humanHistoryRetryBusy" @click="retryHumanHistory" @keydown.enter.prevent="onKeyboardActivate($event, retryHumanHistory)" @keydown.space.prevent="onKeyboardActivate($event, retryHumanHistory)"><text>{{ t.conversations.retry }}</text></view></view>
      <view v-if="showUnassignedReceived" class="cp-ai-history" role="status"><text class="cp-ai-history-t">{{ t.conversations.image.unassignedReceived }}</text></view>
      </template>
    </ConversationThread>

    <!-- Home Indicator — bare page (no AppChassis) draws its own. Sits over the input
         row's bottom safe-area padding; pointer-events:none so it never blocks the input. -->
    <view class="cp-home">
      <DeviceHomeIndicator />
    </view>

    <!-- Overlay host — this is a bare full-screen page (no AppChassis), so it must
         carry its own GlobalUi or toast/confirm/netError raised here (e.g. the send
         rate-limit warning) would post to the store with nothing rendering them. -->
    <GlobalUi />
  </view>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, nextTick, onMounted, onUnmounted, getCurrentInstance, type CSSProperties } from "vue";
import { onLoad, onUnload, onShow, onHide } from "@dcloudio/uni-app";
import ConversationThread from "@/components/support/conversation-thread.vue";
import GlobalUi from "@/components/global-ui.vue";
import DeviceStatusBar from "@/components/device/device-status-bar.vue";
import DeviceHomeIndicator from "@/components/device/device-home-indicator.vue";
import type { ThreadMsg } from "@/components/support/thread-types";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { navTo, navBack, navReplace } from "@/lib/route";
import { conversationSendLimiter } from "@/lib/send-limiter";
import { MESSAGE_MAX_LENGTH, normalizeMessageText } from '@/lib/message-length-policy';
import { h5DevicePreviewStatusBarHeight } from "@/lib/device-preview";
import { useConversations, type CategoryRefreshOutcome, type HumanComposer } from "@/store/conversations";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { sessionVault, remoteApiEnabled, supportApi } from "@/api/runtime";
import { binarySessionReady as accountSessionReady } from "@/lib/binary-session-ready";
import { toast } from "@/store/ui";
import type { ConversationType, ConvMessage } from "@/domain/support";

import { ApiError, asApiError } from "@/api/errors";
import { isConversationDeliveryAmbiguous, isConversationPeerChanged } from '@/lib/conversation-delivery-policy';
import { isSupportAttachmentNotReady, type SupportAttachmentPolicy } from "@/api/support-api";
import { useLocaleStore } from "@/store/locale";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { createHumanConversationCreationRecovery, createHumanThreadRealtimeLifecycle } from "./conversation-realtime-page";

const t = useT();
const convStore = useConversations();
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
const localHumanSend = ref<ThreadMsg | null>(null);
let localHumanSequence = 0;
const sendSuccessRevision = ref(0);
const sendSuccessOwner = ref('');
function noteSendSuccess() {
  if (pageVisible && !chatDisposed) {
    sendSuccessOwner.value = JSON.stringify([app.accountKey, app.accountBindingEpoch, threadComposerKey.value]);
    sendSuccessRevision.value++;
  }
}
const draftText = ref("");
const attachmentPolicy = ref<SupportAttachmentPolicy | null>(null);
const attachmentPolicyError = ref(false);
let attachmentPolicyGeneration = 0;
type SupportImagePicker = { allowHidden: boolean; current: () => boolean };
let supportImagePicker: SupportImagePicker | null = null;
function resetAttachmentPolicy() {
  supportImagePicker = null;
  attachmentPolicyGeneration++;
  attachmentPolicy.value = null; attachmentPolicyError.value = false;
}
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
watch(() => [app.accountBindingEpoch, convStore.scopeInvalidated], ([binding], [previousBinding]) => {
  humanComposerResetting = true;
  try {
    clearPrivateImages(); imageDraft.value = null; resetAttachmentPolicy();
    if (binding !== previousBinding) { failedHumanSend.value = null; draftText.value = ""; }
  } finally { humanComposerResetting = false; }
  if (pageVisible && remoteApiEnabled && supportSessionReady.value) { void convStore.refreshAdvisor(); void loadAttachmentPolicy(); }
}, { flush: "sync" });
async function loadPrivateImages() {
  if (!supportSessionReady.value) return;
  const epoch = imageEpoch, binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated;
  const conversationId = conv.value?.id;
  if (!conversationId) return;
  for (const message of conv.value?.messages ?? []) {
    const avatarKey = avatarImageKey(message);
    const targets = [
      ...(message.attachmentId ? [{ id: message.attachmentId, read: () => supportApi.attachmentContent(message.attachmentId!) }] : []),
      ...(avatarKey ? [{ id: avatarKey, read: async () => {
        const source = await supportApi.authorAvatarContent(message.senderId!);
        try {
          if (epoch !== imageEpoch || binding !== app.accountBindingEpoch || scope !== convStore.scopeInvalidated || !pageVisible || conv.value?.id !== conversationId) return source;
          // The guarded endpoint returns the author's current photo; confirm its revision before caching.
          const before = Number(message.id) + 1;
          const sourceConversationId = humanHistory.value.find(row => row.messages.some(item=>item.id===message.id))?.id;
          if (!sourceConversationId) throw new Error("SUPPORT_MESSAGE_SOURCE_UNAVAILABLE");
          const latest = await supportApi.conversation(sourceConversationId, Number.isSafeInteger(before) ? before : undefined);
          const current = latest.messages.find(item => item.id === message.id);
          if (!current || avatarImageKey(current) !== avatarKey) throw new Error("SUPPORT_AVATAR_REVISION_CHANGED");
          return source;
        } catch (cause) {
          if (source.startsWith("blob:") && typeof URL !== "undefined") URL.revokeObjectURL(source);
          throw cause;
        }
      } }] : []),
    ];
    for (const { id, read } of targets) {
    if (!id || imageSources.value[id] || imageFailures.value[id] || imageLoads.has(id)) continue;
    imageLoads.add(id);
    try {
      const source = await read();
      if (epoch !== imageEpoch || binding !== app.accountBindingEpoch || scope !== convStore.scopeInvalidated || !pageVisible || conv.value?.id !== conversationId) {
        if (source.startsWith("blob:") && typeof URL !== "undefined") URL.revokeObjectURL(source);
        return;
      }
      imageSources.value = { ...imageSources.value, [id]: source };
    } catch { if (epoch === imageEpoch) imageFailures.value = { ...imageFailures.value, [id]: true }; }
    finally { if (epoch === imageEpoch) imageLoads.delete(id); }
    }
  }
}
function avatarImageKey(message: ConvMessage): string | undefined {
  return message.sender === "agent" && message.authorConfidence === "VERIFIED" && message.senderId && message.senderAvatar
    ? `author:${message.senderId}:${message.senderAvatar.assetId}:${message.senderAvatar.version}` : undefined;
}
const attachmentDisplay = computed(() => imageDraft.value ? {
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
  if (chatDisposed || !pageVisible || !supportSessionReady.value || supportImagePicker) return;
  if (imageDraft.value || failedHumanSend.value) return;
  const account = app.accountKey, binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated, key = humanComposerKey.value;
  const current = () => !chatDisposed && supportSessionReady.value && account === app.accountKey && binding === app.accountBindingEpoch
    && scope === convStore.scopeInvalidated && key === humanComposerKey.value;
  let picker: SupportImagePicker | null = null;
  try {
    if (!attachmentPolicy.value) await loadAttachmentPolicy();
    if (!pageVisible || !current() || supportImagePicker) return;
    const policy = attachmentPolicy.value, generation = attachmentPolicyGeneration;
    if (!policy?.available) return;
    picker = { allowHidden: false, current: () => current() && generation === attachmentPolicyGeneration && attachmentPolicy.value === policy };
    // #ifdef APP-PLUS
    // The native album/camera hides this page while its one picker owns the result.
    picker.allowHidden = true;
    // #endif
    supportImagePicker = picker;
    try {
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
      if (!selected || supportImagePicker !== picker || !picker.current() || !pageVisible && !picker.allowHidden) return;
      const path = selected.tempFilePaths[0];
      if (!path) return;
      const selectedFile = Array.isArray(selected.tempFiles) ? selected.tempFiles[0] : selected.tempFiles;
      if (policy.maxBytes && selectedFile?.size > policy.maxBytes) { toast.info(t.value.conversations.image.tooLarge, ""); return; }
      const id = requireCryptoUuid();
      imageDraft.value = { filePath: path, clientUploadId: id, key: `support-upload-${id}`, state: "uploading" };
    } catch (cause) {
      if (supportImagePicker !== picker || !picker.current()) return;
      throw cause;
    } finally {
      if (supportImagePicker === picker) {
        supportImagePicker = null;
        if (!pageVisible) resetAttachmentPolicy();
      }
    }
    await retrySupportUpload();
  } catch {
    if (!current() || !pageVisible && !picker?.allowHidden) return;
    toast.error(t.value.conversations.image.uploadFailed, "");
  }
}
async function loadAttachmentPolicy() {
  if (!supportSessionReady.value || !remoteApiEnabled || !pageVisible || chatDisposed) return;
  if (supportImagePicker?.allowHidden && supportImagePicker.current()) return;
  const binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated, key = humanComposerKey.value;
  const generation = ++attachmentPolicyGeneration;
  const current = () => generation === attachmentPolicyGeneration && !chatDisposed && pageVisible && supportSessionReady.value
    && binding === app.accountBindingEpoch && scope === convStore.scopeInvalidated && key === humanComposerKey.value;
  attachmentPolicy.value = null;
  attachmentPolicyError.value = false;
  try {
    const result = await supportApi.attachmentPolicy();
    if (current()) attachmentPolicy.value = result;
  } catch {
    if (current()) { attachmentPolicy.value = null; attachmentPolicyError.value = true; }
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
  if (!current() || !acquireSendSlot()) return;
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
const threadComposerKey = computed(() => app.accountBindingEpoch + ':' + convStore.scopeInvalidated + ':' + (cid.value || startType.value || ''));
let pageVisible = false;
let categoryGate: {
  category: ConversationType;
  promise: Promise<CategoryRefreshOutcome>;
} | null = null;
const startType = ref<Exclude<ConversationType, "ai"> | null>(null);
const humanComposerKey = computed(() => cid.value ? `conversation:${cid.value}` : startType.value ? `start:${startType.value}` : "");
watch(() => [app.accountBindingEpoch, humanComposerKey.value, convStore.clearedComposerThrough[humanComposerKey.value]] as const,
  ([binding, key, through], [previousBinding, previousKey, previousThrough]) => {
    if (binding !== previousBinding || key !== previousKey || through === undefined || through <= (previousThrough ?? -1)) return;
    // Only a confirmed clear of this owner's composer can retire its page mirror.
    humanComposerResetting = true;
    try {
      draftText.value = ""; failedHumanSend.value = null; imageDraft.value = null; localHumanSend.value = null;
      clearPrivateImages(); resetAttachmentPolicy();
    } finally { humanComposerResetting = false; }
    if (pageVisible && supportSessionReady.value) void loadAttachmentPolicy();
  }, { flush: 'sync' });
watch(() => [humanComposerKey.value, app.accountBindingEpoch, convStore.scopeInvalidated], () => { localHumanSend.value = null; }, { flush: 'sync' });
let recoveredNavigation = "";
function restoreRecoveredComposer(saved: HumanComposer | null | undefined, key: string) {
  if (!saved?.recoveredId || !startType.value || cid.value || !pageVisible || recoveredNavigation === saved.recoveredId) return;
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
  const hadPicker = supportImagePicker !== null;
  if (hadPicker) resetAttachmentPolicy();
  if (previous) convStore.saveComposer(previous, { ...convStore.composer(previous), text: draftText.value, imageDraft: imageDraft.value,
    failedSend: failedHumanSend.value ?? (humanSendBusy.value ? convStore.composer(previous).failedSend : null) });
  const saved = key ? convStore.composer(key) : null;
  draftText.value = saved?.text ?? "";
  imageDraft.value = saved?.imageDraft ?? null;
  failedHumanSend.value = saved?.failedSend ?? null;
  restoreRecoveredComposer(saved, key);
  if (hadPicker && pageVisible) void loadAttachmentPolicy();
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
  setTyping: active => convStore.setTyping(active),
  watch: id => convStore.watchRealtime(id),
});
const humanCreateRecovery = createHumanConversationCreationRecovery({
  visible: () => pageVisible,
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
  if (restoredId && pageVisible && type) {
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
  humanOpenRequest.value = null;
  humanRealtime.stop();
}

function startHumanThreadPolling(openEpoch: number, openId: string) {
  humanRealtime.watchIfCurrent(openEpoch, openId);
}

// The thread must observe history readiness even when no message/draft changes.
// Keep the request object unproxied so cancellation can still compare identity.
const humanOpenRequest = shallowRef<{ epoch: number; id: string; binding: number; scope: number } | null>(null);
async function openHumanConversation(epoch: number, id: string) {
  if (!supportSessionReady.value) return;
  const request = { epoch, id, binding: app.accountBindingEpoch, scope: convStore.scopeInvalidated };
  humanOpenRequest.value = request;
  const current = () => humanOpenRequest.value === request && request.binding === app.accountBindingEpoch
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
    if (humanOpenRequest.value === request) humanOpenRequest.value = null;
  }
}

watch([() => app.accountBindingEpoch, supportSessionReady, humanShowRevision], () => {
  if (!supportSessionReady.value) { stopHumanThreadPolling(); return; }
  if (pageVisible) void activateHumanPage();
}, { flush: "post" });

async function activateHumanPage() {
  if (!pageVisible || !supportSessionReady.value) return;
  stopHumanThreadPolling();
  const epoch = humanRealtime.show(), binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated;
  void convStore.refreshAdvisor(); void loadAttachmentPolicy();
  restoreCompletedHumanCreate();
  restoreRecoveredComposer(convStore.composer(humanComposerKey.value), humanComposerKey.value);
  const id = cid.value, type = startType.value;
  const current = () => pageVisible && supportSessionReady.value && binding === app.accountBindingEpoch
    && scope === convStore.scopeInvalidated && id === cid.value && type === startType.value;
  revealTick.value += 1;
  const savedCreate = type && !id ? convStore.composer(`start:${type}`).failedSend : null;
  let originalPending = false;
  if (type && savedCreate && !savedCreate.settled && remoteApiEnabled) {
    try { originalPending = await convStore.hasPendingHumanCreate(type, savedCreate.text, savedCreate.attachmentId); }
    catch {
      if (current()) toast.error(t.value.conversations.image.sendBlocked, "");
      return;
    }
    if (!current()) return;
  }
  if (type && !id && remoteApiEnabled && !originalPending) {
    const gate: NonNullable<typeof categoryGate> = { category: type, promise: convStore.refreshCategories() };
    categoryGate = gate;
    const outcome = await gate.promise;
    if (!current() || categoryGate !== gate || outcome === "stale") return;
    if (outcome === "failed" || !convStore.categoryEnabled(type)) {
      toast.info(t.value.conversations.categoryDisabled, ""); navBack("/pages/support/messages"); return;
    }
  }
  if (current() && id) { try { await convStore.refresh(current); if(current()) humanHistoryListError.value=false; } catch { if(current()) humanHistoryListError.value=true; } if (!current()) return; await openHumanConversation(epoch, id); if (current()) void loadPrivateImages(); }
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
  const routeCid = typeof q?.cid === "string" ? q.cid.trim() : "";
  if (routeCid) {
    cid.value = routeCid;
    return;
  }
  if (q?.start === "advisor" || q?.start === "support") {
    startType.value = q.start;
    return;
  }
  void navReplace("/pages/support/messages");
});

// onShow/onHide track the hidden-but-alive state that onUnload/onUnmounted miss.
// onShow fires on first open AND on navigateBack re-reveal; onHide fires when a
// forward navigateTo hides this page.
onShow(() => {
  measureTopOverlay();
  pageVisible = true;
  humanShowRevision.value += 1;
});
onHide(() => {
  pageVisible = false;
  topOverlayMeasureEpoch++;
  if (!supportImagePicker?.allowHidden || !supportImagePicker.current()) resetAttachmentPolicy();
  cancelHistoryRetry();
  clearPrivateImages();
  categoryGate = null;
  stopHumanThreadPolling();
});

const humanHistoryError = ref(false);
const humanHistoryListError = ref(false);
const humanHistoryRetry = ref(0);
const humanHistoryRetryBusy = ref(false), humanEarlierBusy = ref(false);
let historyRetryGeneration = 0;
function cancelHistoryRetry() { historyRetryGeneration++; humanHistoryRetryBusy.value=false; humanEarlierBusy.value=false; }
watch([cid,()=>app.accountBindingEpoch],cancelHistoryRetry,{flush:'sync'});
async function retryHumanHistory() {
  if(!pageVisible||!supportSessionReady.value||humanHistoryRetryBusy.value||humanEarlierBusy.value)return;
  const binding=app.accountBindingEpoch, id=cid.value, request=++historyRetryGeneration, scope=convStore.scopeInvalidated;
  humanHistoryRetryBusy.value=true;
  const current=()=>pageVisible && request===historyRetryGeneration && binding===app.accountBindingEpoch && scope===convStore.scopeInvalidated && id===cid.value;
  try { await convStore.refresh(current); if(current()) { humanHistoryListError.value=false; humanHistoryRetry.value++; } }
  catch { if(current()) humanHistoryListError.value=true; }
  finally { if(request===historyRetryGeneration)humanHistoryRetryBusy.value=false; }
}
const humanHistory = computed(() => {
  const ids = cid.value ? convStore.getThread(cid.value)?.conversationIds ?? [] : [];
  return convStore.conversations.filter(row => ids.includes(row.id));
});
const conv = computed(() => {
  const current = cid.value ? convStore.get(cid.value) : undefined;
  if (!current) return undefined;
  const messages = [...new Map(humanHistory.value.flatMap(row => row.messages).map(message => [message.id,message])).values()].sort((a,b)=>a.ts-b.ts || String(a.id).localeCompare(String(b.id)));
  return { ...current, messages, historyTruncated: humanHistory.value.some(row=>row.historyTruncated), historyNextCursor: humanHistory.value.find(row=>row.historyNextCursor)?.historyNextCursor };
});
watch([cid, () => app.accountBindingEpoch, supportSessionReady, () => humanHistory.value.map(row=>`${row.id}:${row.lastPublicMessageId ?? row.lastTs}`).sort().join("|"), humanHistoryRetry, humanShowRevision], async ([id,, ready],_,onCleanup) => {
  if (!id || !ready) return;
  let current = true; onCleanup(()=>{current=false;}); humanHistoryError.value=false;
  for (const row of humanHistory.value) {
    if (!current || !pageVisible) return;
    if (row.id === id) continue;
    try { await convStore.open(row.id,()=>current && pageVisible); } catch { if(current)humanHistoryError.value=true; }
  }
}, { immediate: true });
watch(() => conv.value?.messages?.map(message => [message.attachmentId, avatarImageKey(message)].join(":")).join("|"), () => { if (pageVisible) void loadPrivateImages(); });
const humanType = computed<Exclude<ConversationType, "ai"> | null>(() =>
  conv.value?.type === "advisor" || conv.value?.type === "support" ? conv.value.type : startType.value,
);

// The App only permits replies to the same states accepted by AppSupportService.
// A transferred thread is history: a restart creates a new user-owned conversation.
const replyAllowedStatuses = new Set(["open", "resolved", "closed"]);
const isTransferredSession = computed(() => conv.value?.status === "transferred" || convStore.peerChangedIds[cid.value] === true);
const isReplyAllowed = computed(() => !isTransferredSession.value && (!conv.value || replyAllowedStatuses.has(conv.value.status)));
const isClosedSession = computed(() => !!conv.value && !isReplyAllowed.value);
// Account advisor identity belongs to new composition. Existing conversation
// headers and waiting state use the server's owner for that exact conversation id.
const advisorApplies = computed(() => !isClosedSession.value && !cid.value && !!startType.value);
const showUnassignedReceived = computed(() => !isClosedSession.value && !!conv.value
  && isWaitingForAgent(conv.value.agentName) && conv.value.messages.some(message => message.sender === "user"));
const headerName = computed(() => {
  if (advisorApplies.value && convStore.advisor?.assignmentState === "UNBOUND") return t.value.conversations.image.unassigned;
  if (advisorApplies.value && convStore.advisor?.currentAdvisorName) return convStore.advisor.currentAdvisorName;
  if (advisorApplies.value && convStore.advisorError) return t.value.conversations.typeAdvisor;
  if (advisorApplies.value && convStore.advisorLoading) return t.value.conversations.typeAdvisor;
  if (conv.value) return displayAgentName(conv.value.agentName);
  return humanType.value ? t.value.conversations.typeAdvisor : "";
});

function displayAgentName(name: string): string {
  const normalized = name.trim();
  return isWaitingForAgent(normalized) ? t.value.conversations.unassignedAgent : normalized;
}
const agentTyping = computed(() => cid.value ? convStore.typingIds[cid.value] === true : false);
function isWaitingForAgent(name: string): boolean {
  const normalized = name.trim();
  return !normalized || normalized.toLowerCase() === "unassigned" || normalized === "备勤池" || normalized === "待分配";
}
const waitingForAgent = computed(() => (advisorApplies.value && convStore.advisor?.assignmentState === "UNBOUND")
  || (!!conv.value && (!advisorApplies.value || !convStore.advisor) && isWaitingForAgent(conv.value.agentName)));
const humanPresence = computed(() => {
  const online = cid.value ? convStore.onlineIds[cid.value] : undefined;
  return {
    online,
    mutedDot: isClosedSession.value || isTransferredSession.value || waitingForAgent.value
      || !remoteApiEnabled || !convStore.realtimeReady || online !== true,
  };
});
const headerRole = computed(() => {
  if (!supportSessionReady.value) return t.value.conversations.connecting;
  if (advisorApplies.value && convStore.advisorError) return "";
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
  if (agentTyping.value) return t.value.conversations.agentTyping;
  if (humanPresence.value.online === true) return t.value.conversations.online;
  return t.value.conversations[conv.value.roleKey];
});
// Never show a live dot until a human conversation has an assigned, current
// websocket presence. Unknown, reconnecting, and offline stay visually neutral.
const dotStyle = computed<CSSProperties>(() =>
  humanPresence.value.mutedDot
    ? { background: "var(--v5-ink-4)", animation: "none" }
    : { background: "var(--nx-presence-green)" },
);

// The field keeps a stable accessible name separate from its placeholder hint.
const inputPlaceholder = computed(() => t.value.conversations.inputPlaceholder);
const inputLabel = computed(() => t.value.conversations.inputPlaceholder);
const emptyHint = computed(() => {
  if (advisorApplies.value && convStore.advisorError) return "";
  if (!supportSessionReady.value) return t.value.conversations.connecting;
  if (waitingForAgent.value) return t.value.conversations.image.unassignedHint;
  return humanType.value === "advisor" ? t.value.conversations.listEmptyAdvisor : t.value.conversations.listEmptySupport;
});

// Keep the latest outgoing receipt and explicitly supplied incoming receipts.
// An incoming read status is this user's server-acknowledged read, never inferred.
function receiptFor(status: "sent" | "read" | undefined, isLatestReceipt: boolean): string | undefined {
  if (!status || !isLatestReceipt) return undefined;
  return status === "read" ? t.value.conversations.receiptRead : t.value.conversations.receiptSent;
}

const conversationThread = ref<{ prepareHistoryPrepend(): Promise<boolean> } | null>(null);

function humanMessageRecommendation(message: ConvMessage): Partial<ThreadMsg> {
  if (message.kind !== "SKU" && message.kind !== "LINK") return {};
  const copy = t.value.conversations.recommendation;
  const skuName = message.skuName;
  const body = message.text;
  const text = message.kind === "SKU"
    ? message.skuName === message.text ? skuName ?? message.text : [body, skuName].filter(Boolean).join("\n")
    : message.text;
  if (message.targetAvailability !== "AVAILABLE") return { text: [text,
    message.targetAvailability === "UNAVAILABLE" ? copy.unavailable : copy.unknown].filter(Boolean).join("\n") };
  if (message.kind === "SKU" && message.skuId) return { text, ctaLabel: copy.product, ctaHref: `/pages/store/detail?id=${encodeURIComponent(message.skuId)}` };
  const target = message.linkTarget?.type;
  if (target === "HOME") return { text, ctaLabel: copy.home, ctaHref: "/home" };
  if (target === "WALLET") return { text, ctaLabel: copy.wallet, ctaHref: "/pages/me/me" };
  if (target === "SUPPORT") return { text, ctaLabel: copy.support, ctaHref: "/pages/support/messages" };
  return { text };
}
const threadMessages = computed<ThreadMsg[]>(() => {
  const c = conv.value;
  const failed = failedHumanSend.value;
  const pending: ThreadMsg | null = humanSendBusy.value && localHumanSend.value
    ? { ...localHumanSend.value, deliveryState: 'sending' }
    : failed ? {
      id: localHumanSend.value?.id ?? `pending-human:${humanComposerKey.value}`,
      side: 'right', tone: 'user', text: failed.text || t.value.conversations.image.message,
      timestamp: localHumanSend.value?.timestamp, meta: t.value.conversations.image.you,
      clientMessageId: localHumanSend.value?.clientMessageId,
      imageSrc: failed.attachmentId ? imageDraft.value?.filePath : undefined,
      deliveryState: failed.settled ? 'failed' : 'unknown', localSend: true,
    } : null;
  if (!c) return pending ? [pending] : [];
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
    timestamp: m.ts,
    meta: m.sender === "user" ? t.value.conversations.image.you : m.authorName || (c.type === "advisor" ? t.value.conversations.typeAdvisor : t.value.conversations.typeSupport),
    receipt: receiptFor(m.status, i === lastUser || m.sender === "agent"),
    deliveryState: m.sender === 'system' ? undefined : m.status,
    authorAvatarSrc: imageSources.value[avatarImageKey(m) ?? ""],
    ...humanMessageRecommendation(m),
  }));
  const last = c.messages[c.messages.length - 1];
  const idleClose = c.status === "closed" && c.lastMessageKind === "IDLE_TIMEOUT_CLOSE" && (!last || c.lastTs > last.ts)
    ? localizedIdleClose(c.lastMessage, t.value.conversations) : null;
  const confirmedPending = pending?.clientMessageId && c.messages.some(message => message.sender === 'user' && message.clientMessageId === pending.clientMessageId);
  if (pending && !confirmedPending) messages.push(pending);
  return idleClose ? [...messages, {
    id: `idle-close:${c.id}:${c.lastTs}`, side: "left" as const,
    tone: "system" as const, text: idleClose, timestamp: c.lastTs,
  }] : messages;
});

async function loadEarlierHumanHistory() {
  if (!supportSessionReady.value || humanEarlierBusy.value || humanHistoryRetryBusy.value) return;
  const activeId = cid.value;
  const scope = activeId ? humanRealtime.capture(activeId) : null;
  if (!scope) return;
  humanEarlierBusy.value=true;
  const request=historyRetryGeneration;
  try {
    const prepared = await conversationThread.value?.prepareHistoryPrepend();
    if (!humanRealtime.isCurrent(scope.epoch, scope.id) || request !== historyRetryGeneration) return;
    if (prepared !== true) { toast.warn(t.value.security.opFailed); return; }
    await convStore.loadEarlierThread(scope.id, () => humanRealtime.isCurrent(scope.epoch, scope.id));
  } catch {
    if (humanRealtime.isCurrent(scope.epoch, scope.id)) toast.warn(t.value.security.opFailed);
  } finally { if(request===historyRetryGeneration)humanEarlierBusy.value=false; }
}

// Restart returns to the same server-backed compose path. A durable conversation
// is created only after the user submits the opening message.
function onRestart() {
  const type = humanType.value;
  if (!type) return;
  navTo("/pages/support/chat?start=advisor");
}

function cleanup() {
  chatDisposed = true;
  pageVisible = false;
  resetAttachmentPolicy();
  clearPrivateImages();
  categoryGate = null;
  stopHumanThreadPolling();
}
onUnload(cleanup);
onUnmounted(cleanup);

// ── send rate limit — anti-spam guard across every channel of this chat
// (advisor / support). A real backend answers
// 429 + Retry-After remains authoritative; the local budget protects the UI.
const SEND_MAX = 5; // max sends…
const SEND_WINDOW_MS = 15_000; // …per rolling window
const SEND_MIN_GAP_MS = 1000; // min gap between two consecutive sends
const sendLimiter = () => conversationSendLimiter(app.accountKey, cid.value || 'start:' + startType.value,
  SEND_MAX, SEND_WINDOW_MS, SEND_MIN_GAP_MS);

function acquireSendSlot(): boolean {
  // Navigation may still be pending or have failed; never spend a send without a target.
  if (!cid.value && !startType.value) {
    void navReplace("/pages/support/messages");
    return false;
  }
  const verdict = sendLimiter().tryAcquire();
  if (!verdict.ok) {
    toast.warn(
      t.value.conversations.rateLimited,
      fmt(t.value.conversations.rateLimitedRetry, { n: verdict.retryInSec }),
    );
  }
  return verdict.ok;
}

async function onSend(text: string, restore?: () => void, settled?: (accepted?: boolean) => void) {
  let accepted = false;
  try {
  try { text = normalizeMessageText(text, { allowEmpty: imageDraft.value?.state === 'ready' }); }
  catch { restore?.(); toast.warn(fmt(t.value.conversations.messageTooLong, { n: MESSAGE_MAX_LENGTH })); return; }
  if (!supportSessionReady.value) { restore?.(); return; }
  if (humanSendBusy.value) { restore?.(); return; }
  humanSendBusy.value = true;
  try {
  // Do not supersede an in-flight page read; preserve the draft for its result.
  if (humanOpenRequest.value !== null) { restore?.(); return; }
  if (!cid.value && startType.value && remoteApiEnabled) {
    const binding = app.accountBindingEpoch, scope = convStore.scopeInvalidated, type = startType.value;
    let originalPending = false;
    try { originalPending = await convStore.hasPendingHumanCreate(type, text, imageDraft.value?.state === "ready" ? imageDraft.value.attachmentId : undefined); }
    catch {
      if (binding !== app.accountBindingEpoch || scope !== convStore.scopeInvalidated || !pageVisible || startType.value !== type || cid.value) return;
      restore?.(); toast.error(t.value.conversations.image.sendBlocked, ""); return;
    }
    if (binding !== app.accountBindingEpoch || scope !== convStore.scopeInvalidated || !pageVisible || startType.value !== type || cid.value) return;
    if (!originalPending && convStore.categoryAvailabilityStatus !== "ready") {
      const outcome = await convStore.refreshCategories();
      if (binding !== app.accountBindingEpoch || scope !== convStore.scopeInvalidated || !pageVisible || startType.value !== type || cid.value) return;
      if (outcome !== "applied") { restore?.(); return; }
    }
    if (!originalPending && !convStore.categoryEnabled(type)) { restore?.(); toast.info(t.value.conversations.categoryDisabled, ""); return; }
  }
  if (!acquireSendSlot()) {
    restore?.(); // rejected send must not swallow the typed message
    return;
  }
  accepted = (await sendHumanMessage(text, imageDraft.value?.state === "ready" ? imageDraft.value.attachmentId : undefined, restore)) === true;
  } finally { humanSendBusy.value = false; }
  } finally { settled?.(accepted); }
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
    let originalPending = false;
    try { originalPending = remoteApiEnabled && await convStore.hasPendingHumanCreate(type, text, attachmentId); }
    catch (cause) {
      if (!humanCreateRecovery.isCurrent(creation) || supportScope !== convStore.scopeInvalidated) return;
      humanCreateRecovery.finish(); humanSendFailed(text, attachmentId, cause, attempts); restore?.(); return;
    }
    if (!humanCreateRecovery.isCurrent(creation) || supportScope !== convStore.scopeInvalidated) return;
    if (remoteApiEnabled && !originalPending && !convStore.categoryEnabled(type)) {
      humanCreateRecovery.finish();
      restore?.();
      toast.info(t.value.conversations.categoryDisabled, "");
      return;
    }
    if (!stageHumanSend(text, attachmentId, attempts, restore)) { humanCreateRecovery.finish(); return; }
    try {
      const createdId = await convStore.startConversation(type, text, attachmentId, bindHumanDispatchKey());
      if (!humanCreateRecovery.isCurrent(creation) || supportScope !== convStore.scopeInvalidated) return;
      conversationSendLimiter.transfer(app.accountKey, 'start:' + type, createdId);
      humanCreateRecovery.complete(createdId, creation);
      if (imageDraft.value?.attachmentId === attachmentId) imageDraft.value = null;
      convStore.saveComposer(`start:${type}`, { text: draftText.value, imageDraft: null, failedSend: null, recoveredId: createdId });
      restoreCompletedHumanCreate(true);
      noteSendSuccess();
      return true;
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
  const composerKey = humanComposerKey.value, clearThrough = convStore.clearedComposerThrough[composerKey];
  if (!stageHumanSend(text, attachmentId, attempts, restore)) return;
  try {
    await convStore.sendUser(id, text, attachmentId, bindHumanDispatchKey());
    if (replyBinding !== app.accountBindingEpoch || cid.value !== id || supportScope !== convStore.scopeInvalidated
        || clearThrough !== convStore.clearedComposerThrough[composerKey]) return;
    if (imageDraft.value?.attachmentId === attachmentId) imageDraft.value = null;
    if (humanComposerKey.value) convStore.saveComposer(humanComposerKey.value, { text: draftText.value, imageDraft: imageDraft.value, failedSend: null });
    noteSendSuccess();
    return true;
  } catch (cause) {
    if (replyBinding !== app.accountBindingEpoch || cid.value !== id
        || clearThrough !== convStore.clearedComposerThrough[composerKey]) return;
    // A same-account assignment notification does not undo this explicit refusal.
    if (supportScope !== convStore.scopeInvalidated && !isConversationPeerChanged(cause)) return;
    humanSendFailed(text, attachmentId, cause, attempts);
  }
}

function bindHumanDispatchKey() {
  const owner = threadComposerKey.value, binding = app.accountBindingEpoch, localId = localHumanSend.value?.id;
  return (key: string) => {
    if (owner === threadComposerKey.value && binding === app.accountBindingEpoch && localId && localHumanSend.value?.id === localId)
      localHumanSend.value = { ...localHumanSend.value, clientMessageId: key };
  };
}

function stageHumanSend(text: string, attachmentId: string | undefined, attempts: number, restore?: () => void): boolean {
  localHumanSend.value = {
    id: attempts > 1 ? localHumanSend.value?.id ?? `pending-human:${humanComposerKey.value}` : `pending-human:${app.accountBindingEpoch}:${++localHumanSequence}`,
    side: 'right', tone: 'user', text: text || t.value.conversations.image.message,
    timestamp: attempts > 1 ? localHumanSend.value?.timestamp : Date.now(),
    meta: t.value.conversations.image.you, deliveryState: 'sending', localSend: true,
    imageSrc: attachmentId ? imageDraft.value?.filePath : undefined,
  };
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
  if (cause instanceof ApiError && cause.retryAfterMs !== undefined) sendLimiter().defer(cause.retryAfterMs);
  const expired = isSupportAttachmentNotReady(cause);
  const settled = expired || !isConversationDeliveryAmbiguous(cause);
  const draft = imageDraft.value;
  if (expired && draft && draft.attachmentId === attachmentId) {
    draft.state = "failed";
    draft.error = "expired";
    draft.replaceOnly = true;
  }
  failedHumanSend.value = { text, attachmentId, settled, retryable: !expired && !isConversationPeerChanged(cause), attempts,
    kind: expired ? "expired" : settled ? "failed" : "unknown" };
  if (humanComposerKey.value) convStore.saveComposer(humanComposerKey.value, { text: draftText.value, imageDraft: imageDraft.value, failedSend: failedHumanSend.value });
}

let humanConvertRequest: { binding: number; id: string } | null = null;
function onCta(href: string) {
  navTo(href);
}

function goBack() {
  navBack("/pages/support/messages");
}

function onKeyboardActivate(event: KeyboardEvent, action: () => void) {
  if (event.repeat) return;
  void action();
}

const topOverlayHost = ref<unknown>(null);
const topOverlayHeight = ref(statusBarHeight.value + 74);
const chatInstance = getCurrentInstance()?.proxy;
let topOverlayObserver: ResizeObserver | undefined;
let topOverlayMeasureEpoch = 0;
function measureTopOverlay() {
  const epoch = ++topOverlayMeasureEpoch;
  void nextTick(() => {
    if (chatDisposed || !pageVisible || epoch !== topOverlayMeasureEpoch) return;
    const apply = (height?: number) => {
      if (!chatDisposed && pageVisible && epoch === topOverlayMeasureEpoch && height && Number.isFinite(height)) topOverlayHeight.value = height;
    };
    const node = (topOverlayHost.value as { $el?: HTMLElement } | null)?.$el ?? topOverlayHost.value as HTMLElement | null;
    if (node?.getBoundingClientRect) { apply(node.getBoundingClientRect().height); return; }
    if (typeof uni === 'undefined' || !uni.createSelectorQuery) return;
    try {
      const query = uni.createSelectorQuery().in(chatInstance);
      query.select('.cp-top-overlay').boundingClientRect();
      query.exec(rows => apply((rows[0] as UniApp.NodeInfo)?.height));
    } catch { /* Keep the conservative status-bar and control spacing. */ }
  });
}
onMounted(() => {
  measureTopOverlay();
  const node = (topOverlayHost.value as { $el?: HTMLElement } | null)?.$el ?? topOverlayHost.value as HTMLElement | null;
  if (typeof ResizeObserver !== 'undefined' && node?.getBoundingClientRect) {
    topOverlayObserver = new ResizeObserver(measureTopOverlay);
    topOverlayObserver.observe(node);
  }
});
watch(() => [headerName.value, headerRole.value, locale.code, statusBarHeight.value], measureTopOverlay);
const historyContentKey = computed(() => JSON.stringify([remoteApiEnabled, advisorApplies.value,
  convStore.advisorError, convStore.advisorLoading, humanHistoryError.value, humanHistoryListError.value,
  humanEarlierBusy.value, humanHistoryRetryBusy.value, showUnassignedReceived.value,
  conv.value?.historyTruncated, conv.value?.historyNextCursor]));
onUnmounted(() => { topOverlayMeasureEpoch++; topOverlayObserver?.disconnect(); });

import LiquidGlass from "@/components/liquid-glass.vue";
</script>

<style scoped>
.cp-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--v5-bg);
}
.cp-head {
  --nx-presence-green: #37C96A;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  column-gap: 8px;
  flex-shrink: 0;
  padding: 10px 16px 12px;
  /* top padding is bound inline to the device status-bar height (see cp-head :style) */
}
.cp-top-overlay {
  position: absolute; inset: 0 0 auto; z-index: 100;
  background: transparent; pointer-events: none;
}
.cp-top-overlay > * { pointer-events: auto; }
.cp-top-overlay .cp-head { pointer-events: none; }
.cp-head > :not(.cp-head-spacer) { pointer-events: auto; }
.cp-head {
  --v5-liquid-tint: rgba(38, 42, 44, .46);
  --v5-liquid-shadow: inset 0 1px 1px rgba(255,255,255,.1), 0 2px 8px rgba(0,0,0,.12);
}
:global([data-theme="light"] .cp-head) { --v5-liquid-tint: rgba(255,255,255,.58); --v5-liquid-shadow: inset 0 1px 1px rgba(255,255,255,.8), 0 2px 8px rgba(30,45,65,.06); }
.cp-head :deep(.nx-liquid-glass[data-glass-strategy="frosted"]) { backdrop-filter: blur(18px) saturate(135%); -webkit-backdrop-filter: blur(18px) saturate(135%); }
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
  width: 44px;
  height: 44px;
  margin-left: 0;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  position: relative;
}
.cp-head-spacer { width: 44px; height: 44px; pointer-events: none; }
.cp-identity {
  position: relative; min-height: 44px; padding: 5px 18px; border-radius: 24px; box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-self: center;
  min-width: 0;
  max-width: 100%;
}
.cp-meta {
  min-width: 0;
  position: relative; text-align: center;
}
.cp-name {
  display: block;
  font-family: var(--font-v5);
  font-weight: 600;
  font-size: 17px;
  line-height: 1.3;
  overflow-wrap: anywhere;
  letter-spacing: -0.008em;
  color: var(--v5-ink);
}
.cp-role {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 2px;
}
.cp-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
  animation: mc-pulse 1.6s ease-in-out infinite;
}
.cp-role-t {
  font-size: 12px;
  line-height: 1.4;
  color: var(--v5-ink-3);
}
:global([data-theme="light"] .cp-head) { --nx-presence-green: #177D3B; }
.cp-role--online .cp-role-t { color: var(--nx-presence-green); }
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
.cp-back { overflow: visible; }
.cp-back > svg { position: relative; z-index: 1; }
.cp-history-error { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:12px; padding:7px 16px; text-align:start; color:var(--v5-ink-3); font-size:12px; }
.cp-history-error > text { min-width:0; overflow-wrap:anywhere; }
.cp-history-error > .cp-history-text-action { min-width:44px; padding-inline:0; white-space:nowrap; font:600 13px/20px var(--font-v5); }
.cp-history-text-action { display:flex; align-items:center; justify-content:center; min-height:44px; padding:0 16px; box-sizing:border-box; border:0; background:transparent; color:var(--v5-ink-2); font-size:13px; text-align:center; cursor:pointer; }
.cp-history-text-action[aria-disabled="true"] { opacity:.5; cursor:default; }
.cp-history-text-action:focus-visible { outline:2px solid var(--v5-brand); outline-offset:-2px; }
.cp-role-t { overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .cp-dot { animation: none; } }
</style>

<style src="@/styles/message-family.css"></style>
