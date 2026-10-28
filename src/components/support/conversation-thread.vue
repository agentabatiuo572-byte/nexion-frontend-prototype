<!--
  ConversationThread — presentational chat body shared by the conversation center's
  chat page across all categories (Nova AI / advisor / support). Ported from the
  body of the retired nova-drawer (message bubbles + **bold**/\n segments + CTA row
  + quick chips + input), minus the header (the chat page owns its own header).

  Pure/presentational: pages normalise their store into ThreadMsg[] and wire actions
  via @send / @chip / @cta / @restart. Bare text lives in <text> (P-026); the <input> reads
  e.detail.value (P-033) and pins its inner native height (P-048). Stable nx-conv-*
  class names give automation real click/fill targets (P-048).
-->
<template>
  <view class="nx-conv-thread message-family" @touchstart="sounds.unlock" @mousedown="sounds.unlock" @keydown="sounds.unlock">
    <!-- Message list. :scroll-into-view drives auto-scroll on App (native); on H5 it
         stays "" and domToBottom() handles it (uni's declarative scroll lands short
         of a freshly-laid-out bubble). Programmatic positioning is immediate:
         a UniApp content transition can otherwise commit an obsolete target later. -->
    <scroll-view ref="listHost" scroll-y class="nx-conv-list" :scroll-top="scrollTop" :scroll-into-view="scrollAnchor" :scroll-with-animation="false" :show-scrollbar="false" @scroll="onThreadScroll">
      <view class="nx-conv-content" :style="{ paddingTop: (topInset || 0) + 'px', paddingBottom: composerVisible ? (composerMeasured ? composerSpace + 'px' : 'calc(' + composerSpace + 'px + env(safe-area-inset-bottom))') : undefined }">
      <view v-if="$slots['history-prefix']" class="nx-conv-history-prefix" :class="{ 'nx-conv-history-prefix--measured': historyPrefixMeasured }" :style="{ height: historyPrefixMeasured ? historyPrefixHeight + 'px' : undefined }">
        <view ref="historyPrefixHost" class="nx-conv-history-content"><slot name="history-prefix" /></view>
      </view>
      <view v-if="messages.length === 0 && emptyHint" class="nx-conv-empty">
        <text class="nx-conv-empty-t">{{ emptyHint }}</text>
      </view>

      <view v-for="m in messages" :key="messageKey(m)" :id="messageRowId(m.id) + '-preview'" class="nx-conv-msg-row" :class="{ 'nx-conv-msg-row--joined': compactGroups[m.id] }" :style="{ minHeight: previewRowHeights[m.id] ? previewRowHeights[m.id] + 'px' : undefined }">
        <view v-if="timeGroups[m.id]" class="nx-conv-time-divider" role="separator" :aria-label="messageTimes[m.id]?.full">
          <text>{{ timeGroups[m.id] }}</text>
        </view>
        <!-- system notice -->
        <view v-if="m.tone === 'system'" :id="messageRowId(m.id)" class="nx-conv-sys" :title="messageTimes[m.id]?.full">
          <text class="nx-conv-sys-t">{{ m.text }}</text>
        </view>
        <!-- chat bubble -->
        <view v-else :id="messageRowId(m.id)" class="nx-conv-bubble-row" :class="m.side === 'right' ? 'nx-conv-right' : 'nx-conv-left'" v-bind="entranceBindings(m)">
          <image v-if="m.authorAvatarSrc" class="nx-conv-author-avatar" :src="m.authorAvatarSrc" mode="aspectFill" :aria-label="m.meta" />
          <view class="nx-conv-bubble-line" :class="m.side === 'right' ? 'nx-conv-bubble-line--right' : ''">
          <view class="nx-conv-bubble" :class="{ 'nx-conv-bubble--retry': canRetryStatus(m) }" :style="bubbleStyle(m)">
            <view class="nx-conv-bubble-body">
              <view v-if="m.imageSrc" class="nx-conv-image-open" role="button" tabindex="0" :aria-label="imageLabels?.view"
                @click="openPreview(m.imageSrc)" @keydown.enter.prevent="openPreview(m.imageSrc)" @keydown.space.prevent="openPreview(m.imageSrc)">
                <image class="nx-conv-image" :id="messageRowId(m.id) + '-preview-image'" :src="m.imageSrc" mode="widthFix" :style="{ minHeight: previewImageHeights[m.id] ? previewImageHeights[m.id] + 'px' : undefined, maxHeight: previewImageHeights[m.id] ? previewImageHeights[m.id] + 'px' : undefined }" :onLoad="imageLoadHandler(m.id, m.imageSrc)" />
                <text class="nx-conv-image-caption">{{ imageLabels?.view }}</text>
              </view>
              <text v-else-if="m.imageLoading" class="nx-conv-image-caption">{{ imageLabels?.loading }}</text>
              <view v-else-if="m.imageError" class="nx-conv-image-open family-control" role="button" tabindex="0" @click="m.imageAttachmentId && emit('retry-image', m.imageAttachmentId)" @keydown.enter.prevent="m.imageAttachmentId && emit('retry-image', m.imageAttachmentId)" @keydown.space.prevent="m.imageAttachmentId && emit('retry-image', m.imageAttachmentId)"><LiquidGlass rendering="frosted" :radius="22" /><text class="nx-conv-image-caption">{{ imageLabels?.failed }}</text></view>
              <view v-for="(line, li) in formatLines(m.text)" :key="li" class="nx-conv-line">
                <text
                  v-for="(seg, si) in line"
                  :key="si"
                  class="nx-conv-seg"
                  :class="{ 'nx-conv-seg--b': seg.bold }"
                >{{ seg.text }}</text>
                <text v-if="line.length === 0" class="nx-conv-seg">{{ " " }}</text>
              </view>
            </view>
	            <view v-if="m.ctaLabel && m.ctaHref" class="nx-conv-cta-row family-control" role="link" tabindex="0" :aria-label="m.ctaLabel" @click="onCta(m)" @keydown.enter.prevent="onKeyboardActivate($event, () => onCta(m))"><LiquidGlass rendering="frosted" :radius="22" />
              <text class="nx-conv-cta-t">{{ m.ctaLabel }}</text>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
            </view>
            <view v-if="messageTimes[m.id]?.clock || (m.side === 'right' && receiptState(m))" class="nx-conv-bubble-meta" :class="{ 'nx-conv-bubble-meta--retry': canRetryStatus(m) }">
              <text v-if="messageTimes[m.id]?.clock" class="nx-conv-message-time" :title="messageTimes[m.id]?.full" :aria-label="[m.meta, messageTimes[m.id]?.full].filter(Boolean).join(' · ')">{{ messageTimes[m.id]?.clock }}</text>
              <view v-if="m.side === 'right' && receiptState(m)" class="nx-conv-receipt" :class="{ 'nx-conv-receipt--action': canRetryStatus(m) }" :data-state="receiptState(m)" :role="canRetryStatus(m) ? 'button' : 'img'" :tabindex="canRetryStatus(m) ? 0 : undefined" :aria-label="receiptLabel(m)" @click="retryStatus(m)" @keydown.enter.prevent="onKeyboardActivate($event, () => retryStatus(m))" @keydown.space.prevent="onKeyboardActivate($event, () => retryStatus(m))">
                <MessageStatusIcon :state="receiptState(m) || 'sent'" />
              </view>
            </view>
          </view>
          </view>
        </view>
        <view v-if="m.queue && queueLabels" class="nx-conv-queue" :data-state="m.queue.state">
          <view v-if="m.queue.state === 'editing'" class="nx-conv-edit">
            <textarea class="nx-conv-edit-input" :value="edits[m.queue.turnId] ?? m.text" :maxlength="2000" :aria-label="queueLabels.edit" auto-height @input="onEditInput(m.queue.turnId, $event)" />
            <view class="nx-conv-queue-actions">
              <view class="nx-conv-queue-action family-control" role="button" tabindex="0" @click="saveQueueEdit(m)" @keydown.enter.prevent="onKeyboardActivate($event, () => saveQueueEdit(m))" @keydown.space.prevent="onKeyboardActivate($event, () => saveQueueEdit(m))"><LiquidGlass rendering="frosted" :radius="22" /><text>{{ queueLabels.save }}</text></view>
              <view class="nx-conv-queue-action family-control" role="button" tabindex="0" @click="runQueueAction(m, 'cancel-edit')" @keydown.enter.prevent="onKeyboardActivate($event, () => runQueueAction(m, 'cancel-edit'))" @keydown.space.prevent="onKeyboardActivate($event, () => runQueueAction(m, 'cancel-edit'))"><LiquidGlass rendering="frosted" :radius="22" /><text>{{ queueLabels.cancelEdit }}</text></view>
            </view>
          </view>
          <view v-else class="nx-conv-queue-actions">
            <template v-if="(m.queue.state === 'queued' || m.queue.state === 'failed') && m.queue.editable">
              <view class="nx-conv-queue-action family-control" role="button" tabindex="0" @click="startEdit(m)" @keydown.enter.prevent="onKeyboardActivate($event, () => startEdit(m))" @keydown.space.prevent="onKeyboardActivate($event, () => startEdit(m))"><LiquidGlass rendering="frosted" :radius="22" /><text>{{ queueLabels.edit }}</text></view>
              <view class="nx-conv-queue-action family-control" role="button" tabindex="0" @click="runQueueAction(m, 'cancel')" @keydown.enter.prevent="onKeyboardActivate($event, () => runQueueAction(m, 'cancel'))" @keydown.space.prevent="onKeyboardActivate($event, () => runQueueAction(m, 'cancel'))"><LiquidGlass rendering="frosted" :radius="22" /><text>{{ queueLabels.cancel }}</text></view>
            </template>
          </view>
        </view>
      </view>

      <!-- "agent is typing" bubble — three blinking dots, agent side -->
      <view v-if="typing" class="nx-conv-msg-row">
        <view class="nx-conv-bubble-row nx-conv-left">
          <view class="nx-conv-bubble nx-conv-typing" role="status" :aria-label="typingLabel">
            <view class="nx-conv-typing-dots" aria-hidden="true">
              <view />
              <view />
              <view />
            </view>
            <text v-if="typingLabel" class="nx-conv-typing-label">{{ typingLabel }}</text>
          </view>
        </view>
      </view>
      <view id="nx-conv-end" class="nx-conv-bottom-anchor" />
      </view>
    </scroll-view>

    <!-- Quick reply chips (AI only) -->
    <scroll-view v-if="quickChips && quickChips.length" scroll-x class="nx-conv-chips" :show-scrollbar="false">
      <view class="nx-conv-chips-inner">
	        <view v-for="q in quickChips" :key="q.key" class="nx-conv-chip family-control" role="button" tabindex="0" :aria-label="q.label" @click="emit('chip', q.key)" @keydown.enter.prevent="onKeyboardActivate($event, () => emit('chip', q.key))" @keydown.space.prevent="onKeyboardActivate($event, () => emit('chip', q.key))"><LiquidGlass rendering="frosted" :radius="22" />
          <text class="nx-conv-chip-emoji">{{ q.emoji }}</text>
          <text class="nx-conv-chip-t">{{ q.label }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- Closed session → the input is retired; one CTA restarts with a fresh agent.
         The "why" (timeout notice) is already a system message inside the thread. -->
    <view v-if="closed" class="nx-conv-closedbar">
	      <view class="nx-conv-restart active:opacity-80 family-control family-control--primary" role="button" tabindex="0" :aria-label="restartLabel" @click="emit('restart')" @keydown.enter.prevent="onKeyboardActivate($event, () => emit('restart'))" @keydown.space.prevent="onKeyboardActivate($event, () => emit('restart'))"><LiquidGlass rendering="frosted" :radius="22" tone="selection" />
        <text class="nx-conv-restart-t">{{ restartLabel }}</text>
      </view>
    </view>

    <view v-if="!closed && attachmentDraft" class="nx-conv-attachment" role="status" aria-live="polite">
      <view v-if="attachmentPreviewSrc" class="nx-conv-image-open" role="button" tabindex="0" :aria-label="imageLabels?.view" @click="openPreview(attachmentPreviewSrc)" @keydown.enter.prevent="openPreview(attachmentPreviewSrc)" @keydown.space.prevent="openPreview(attachmentPreviewSrc)"><image class="nx-conv-image" :src="attachmentPreviewSrc" mode="aspectFill" /></view>
      <text>{{ attachmentDraft.label }}</text>
      <view class="nx-conv-attachment-actions">
        <view v-if="attachmentDraft.state === 'failed' && !attachmentDraft.replaceOnly" role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('retry-upload')" @keydown.enter.prevent="emit('retry-upload')" @keydown.space.prevent="emit('retry-upload')"><LiquidGlass rendering="frosted" :radius="22" /><text>{{ imageLabels?.retryUpload }}</text></view>
        <view v-if="attachmentDraft.state !== 'uploading'" role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('replace-attachment')" @keydown.enter.prevent="emit('replace-attachment')" @keydown.space.prevent="emit('replace-attachment')"><LiquidGlass rendering="frosted" :radius="22" /><text>{{ imageLabels?.replace }}</text></view>
        <view role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('cancel-attachment')" @keydown.enter.prevent="emit('cancel-attachment')" @keydown.space.prevent="emit('cancel-attachment')"><LiquidGlass rendering="frosted" :radius="22" /><text>{{ imageLabels?.cancel }}</text></view>
      </view>
    </view>
    <view v-if="!closed && failedSendLabel && canDiscardSend" class="nx-conv-recovery-actions">
      <view class="nx-conv-attachment-actions">
        <view v-if="canDiscardSend" role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('edit-message')" @keydown.enter.prevent="emit('edit-message')" @keydown.space.prevent="emit('edit-message')"><LiquidGlass rendering="frosted" :radius="22" /><text>{{ imageLabels?.editSend }}</text></view>
        <view v-if="canDiscardSend" role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('discard-message')" @keydown.enter.prevent="emit('discard-message')" @keydown.space.prevent="emit('discard-message')"><LiquidGlass rendering="frosted" :radius="22" /><text>{{ imageLabels?.discard }}</text></view>
      </view>
    </view>
    <!-- Input row -->
    <view v-else-if="!closed" ref="composerHost" class="nx-conv-composer">
    <view class="nx-conv-input-row">
      <view v-if="imageLabels" class="nx-conv-attach-trigger family-control" role="button" :tabindex="attachDisabled ? -1 : 0" :aria-label="attachDisabled && attachUnavailable ? imageLabels.attach + ' · ' + attachUnavailable : imageLabels.attach" :aria-disabled="attachDisabled ? 'true' : 'false'" :style="attachDisabled ? { opacity: 0.45 } : undefined" @click="!attachDisabled && emit('attach')" @keydown.enter.prevent="!attachDisabled && emit('attach')" @keydown.space.prevent="!attachDisabled && emit('attach')"><LiquidGlass rendering="frosted" :radius="22" /><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></view>
      <view class="nx-conv-compose-field" :style="composerLightStyle">
      <LiquidGlass rendering="sampled" backdrop=".nx-conv-list" :radius="25" :blur="24" />
      <view class="nx-conv-compose-content">
      <textarea
        class="nx-conv-input"
        :value="draft"
        :maxlength="-1"
        :style="{ height: inputHeight + 'px' }"
        :auto-height="false"
        :show-confirm-bar="false"
        :fixed="true"
        :placeholder="inputPlaceholder"
        :aria-label="inputLabel"
        placeholder-class="nx-conv-input-ph"
        confirm-type="return"
        @input="onDraft"
        @linechange="onInputLines"
        @blur="emit('typing', false)"
      />
      <view v-if="showInputLength" class="nx-conv-length" :class="{ 'nx-conv-length--over': inputOverLimit }" role="status"><text>{{ inputLength }} / {{ inputLimit }}</text><text v-if="inputOverLimit">{{ inputLimitHint }}</text></view>
      <view v-if="attachRetry" class="nx-conv-policy-retry" role="button" tabindex="0" @click="emit('retry-policy')" @keydown.enter.prevent="emit('retry-policy')" @keydown.space.prevent="emit('retry-policy')"><text>{{ imageLabels?.retryPolicy }}</text></view>
      </view>
      <view class="nx-conv-send" :class="{ 'nx-conv-send--ready': canSend || sendFeedback || sendTurning, 'nx-conv-send--feedback': sendFeedback, 'nx-conv-send--turning': sendTurning }" role="button" :tabindex="canSend ? 0 : -1" :aria-label="sendLabel" :aria-disabled="!canSend" :aria-busy="sendTurning" @click="onSend" @keydown.enter.prevent="onKeyboardActivate($event, onSend)" @keydown.space.prevent="onKeyboardActivate($event, onSend)">
        <view class="nx-conv-send-face" aria-hidden="true"><LiquidGlass rendering="frosted" :radius="22" /><svg class="nx-conv-send-plane" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg></view>
      </view>
      </view>
    </view>
    </view>
    <view v-if="previewImage" class="nx-conv-image-overlay" role="dialog" aria-modal="true" :aria-label="imageLabels?.view">
      <view role="button" tabindex="0" class="nx-conv-image-close family-control" @click="closePreview" @keydown.enter.prevent="closePreview" @keydown.space.prevent="closePreview"><LiquidGlass rendering="frosted" :radius="22" /><text>{{ imageLabels?.close }}</text></view>
      <image :src="previewImage" class="nx-conv-image-full" mode="aspectFit" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onScopeDispose, getCurrentInstance, type CSSProperties } from "vue";
import LiquidGlass from "@/components/liquid-glass.vue";
import MessageStatusIcon from './message-status-icon.vue';
import type { ThreadMsg, QuickChip, MessageDeliveryState } from "./thread-types";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { onHide, onShow } from '@/composables/use-tab-page-lifecycle';
import { useApp } from '@/store/app';
import { usePreferences } from '@/store/preferences';
import { createConversationAudio } from '@/lib/conversation-audio';
import { useConversationEntrance } from './conversation-entrance';
import { conversationScrollChange, preservedConversationTop } from './conversation-scroll';
import { buildConversationTimeGroups, formatConversationTime, type ConversationTimeOptions } from './conversation-time';
import { bubbleViewportPosition, bubbleFill, compactMessageGroups, composerReflection, type ConversationRect } from './conversation-bubble-layout';

const props = defineProps<{
  messages: ThreadMsg[];
  /** Measured floating header height; only the first message reserves it. */
  topInset?: number;
  /** Changes when the scrolling history slot changes its notice/action layout. */
  historyContentKey?: string;
  /** False while an authoritative history snapshot is being read. */
  entranceReady?: boolean;
  timeLocale?: string;
  inputPlaceholder: string;
  /** 输入框的**名称**(稳定),与 inputPlaceholder(提示,随可用性变)分开。
      见 lib/a11y-field-label.ts 的契约:placeholder 在输入后就消失,不是稳定的名称,
      而这里的 placeholder 还会在 Nova 不可用时换成状态句 —— 名称不能跟着它走。 */
  inputLabel: string;
  sendLabel: string;
  statusLabels?: Record<MessageDeliveryState, string> & { retry: string };
  /** Authoritative successes across send, retry and quick actions; independent of button motion. */
  sendSuccessRevision?: number;
  sendSuccessOwner?: string;
  quickChips?: QuickChip[];
  emptyHint?: string;
  /** "Agent is typing" indicator (pre-localised aria label via typingLabel). */
  typing?: boolean;
  typingLabel?: string;
  /** Bumped by the page on re-reveal (navigateBack) to force a re-scroll to bottom. */
  revealTick?: number;
  /** Closed session (support timeout) → swap the input row for the restart CTA. */
  closed?: boolean;
  restartLabel?: string;
  queueLabels?: { edit: string; cancel: string; retry: string; save: string; cancelEdit: string };
  composerKey?: string;
  initialDraft?: string;
  maxInputLength?: number;
  inputLimitHint?: string;
  imageLabels?: { view: string; loading: string; failed: string; attach: string; retryUpload: string; replace: string; cancel: string; retrySend: string; editSend: string; discard: string; retryPolicy: string; expired: string; close: string };
  attachDisabled?: boolean;
  attachUnavailable?: string;
  attachRetry?: boolean;
  attachmentDraft?: { state: "uploading" | "ready" | "failed"; label: string; replaceOnly?: boolean } | null;
  attachmentPreviewSrc?: string;
  failedSendLabel?: string;
  canDiscardSend?: boolean;
  canRetrySend?: boolean;
  sendBlocked?: boolean;
}>();

const emit = defineEmits<{
  /** restore() puts the text back in the input — call it when the send is rejected
      (e.g. rate-limited) so the user's typed message isn't silently swallowed. */
  (e: "send", text: string, restore: () => void, settled: (accepted?: boolean) => void): void;
  (e: "typing", active: boolean): void;
  (e: "draft-change", text: string): void;
  (e: "retry-image", attachmentId: string): void;
  (e: "chip", key: string): void;
  (e: "cta", href: string, label: string): void;
  (e: "restart"): void;
  (e: "queue-action", turnId: string, action: "edit" | "cancel" | "retry" | "cancel-edit"): void;
  (e: "queue-save", turnId: string, text: string): void;
  (e: "attach" | "retry-upload" | "replace-attachment" | "cancel-attachment" | "retry-message" | "edit-message" | "discard-message" | "retry-policy"): void;
}>();

const app = useApp(), threadVisible = ref(true), entranceReveal = ref(0);
const clockNow = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | undefined;
function stopClock() { clearInterval(clockTimer); clockTimer = undefined; }
function startClock() {
  stopClock(); clockNow.value = Date.now();
  clockTimer = setInterval(() => { clockNow.value = Date.now(); }, 60_000);
}
onMounted(startClock);
onShow(startClock);
onHide(stopClock);
onScopeDispose(stopClock);
const timeOptions = computed<ConversationTimeOptions>(() => {
  const language = props.timeLocale ?? 'zh';
  return { locale: language === 'zh' || language === 'vi' ? language : 'en' as const, now: clockNow.value };
});
const timeGroups = computed(() => buildConversationTimeGroups(props.messages, timeOptions.value));
const messageTimes = computed(() => Object.fromEntries(props.messages.map(message => [message.id, formatConversationTime(message.timestamp, timeOptions.value)])));
// New messages can arrive between minute ticks. Refresh the display clock from
// the device, so an ordinary live message is not briefly labelled as future.
watch(() => props.messages.map(message => [message.id, message.timestamp]), () => {
  if (threadVisible.value) clockNow.value = Date.now();
});
const compactGroups = computed(() => compactMessageGroups(props.messages, timeGroups.value));
onHide(() => { threadVisible.value = false; });
onShow(() => { entranceReveal.value++; threadVisible.value = true; });
const preferences = usePreferences();
const sounds = createConversationAudio({ enabled: () => preferences.soundEnabled, visible: () => threadVisible.value });
onHide(sounds.stop);
onScopeDispose(sounds.destroy);
watch(() => [preferences.soundEnabled, app.accountKey, app.accountBindingEpoch, props.composerKey], sounds.stop, { flush: 'sync' });
watch(() => props.sendSuccessRevision, (revision, previous) => {
  const owner = JSON.stringify([app.accountKey, app.accountBindingEpoch, props.composerKey]);
  if (threadVisible.value && props.sendSuccessOwner === owner && previous !== undefined && revision !== undefined && revision > previous) sounds.play('send');
}, { flush: 'post' });
const { entranceBindings, messageKey } = useConversationEntrance(() => ({
  identity: JSON.stringify([app.accountKey, app.accountBindingEpoch, props.composerKey, props.revealTick, entranceReveal.value]),
  visible: threadVisible.value, ready: props.entranceReady === true, messages: props.messages,
}), () => sounds.play('receive'));
function receiptText(message: ThreadMsg): string | undefined {
  return message.queue ? props.queueLabels ? message.queue.label : undefined : message.receipt;
}
function receiptState(message: ThreadMsg): MessageDeliveryState | undefined {
  if (message.deliveryState) return message.deliveryState;
  if (message.queue) return message.queue.state === 'failed' ? 'failed' : message.queue.state === 'tracking' ? 'unknown' : message.queue.state === 'processing' ? 'sending' : 'queued';
  return message.receipt ? 'sent' : undefined;
}
function canRetryStatus(message: ThreadMsg): boolean {
  if (message.side !== 'right') return false;
  return message.queue?.state === 'failed' || !!(message.localSend && ['failed', 'unknown'].includes(receiptState(message) ?? '') && props.canRetrySend);
}
function receiptLabel(message: ThreadMsg): string {
  const state = receiptState(message);
  const label = state ? props.statusLabels?.[state] ?? receiptText(message) ?? '' : '';
  return canRetryStatus(message) ? `${label} · ${props.statusLabels?.retry ?? props.imageLabels?.retrySend ?? props.queueLabels?.retry ?? ''}` : label;
}
function retryStatus(message: ThreadMsg) {
  if (!canRetryStatus(message)) return;
  if (message.queue) runQueueAction(message, 'retry'); else emit('retry-message');
}

const draft = ref(props.initialDraft ?? "");
const inputHeight = ref(24);
const composerHost = ref<unknown>(null), composerSpace = ref(86), composerMeasured = ref(false);
const composerVisible = computed(() => !props.closed && !(props.failedSendLabel && props.canDiscardSend));
const inputLimit = computed(() => props.maxInputLength ?? 2000);
const inputLength = computed(() => draft.value.trim().length);
const showInputLength = computed(() => inputLength.value >= inputLimit.value * .9);
const inputOverLimit = computed(() => inputLength.value > inputLimit.value);
function onInputLines(event: { detail: { height: number } }) {
  if (Number.isFinite(event.detail.height)) inputHeight.value = Math.max(24, Math.min(144, event.detail.height));
}
watch(draft, value => { if (!value) inputHeight.value = 24; });
const sendFeedback = ref(false);
const sendTurning = ref(false);
let sendVisualEpoch = 0;
let sendReturnTimer: ReturnType<typeof setTimeout> | undefined;
let sendFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
function clearSendFeedback() { clearTimeout(sendFeedbackTimer); sendFeedback.value = false; }
function resetSendVisuals() {
  ++sendVisualEpoch; clearTimeout(sendReturnTimer); sendTurning.value = false; clearSendFeedback();
}
onHide(resetSendVisuals);
onScopeDispose(resetSendVisuals);
watch(() => [props.composerKey, props.revealTick, app.accountKey, app.accountBindingEpoch], resetSendVisuals, { flush: 'sync' });
const previewImage = ref("");
function openPreview(src: string) {
  // #ifdef APP-PLUS
  const launch = (reading: PreviewReading) => uni.previewImage({ current: src, urls: [src], fail: () => {
    if (nativePreviewReading !== reading || reading.owner !== previewReadingOwner() || historyDisposed) return;
    nativePreviewReading = null;
    clearPreviewRowHeights();
    if (props.attachmentPreviewSrc === src || props.messages.some(message => message.imageSrc === src)) previewImage.value = src;
  } });
  if (typeof listRoot()?.querySelectorAll === 'function') launch(rememberNativePreviewReading());
  else prepareNativePreviewReading(src, launch);
  return;
  // #endif
  previewImage.value = src;
}
function closePreview() { previewImage.value = ""; }
useDialogA11y(computed(() => !!previewImage.value), ".nx-conv-image-overlay", closePreview);
const canSend = computed(() => !props.sendBlocked && draft.value.trim().length <= inputLimit.value && (Boolean(draft.value.trim()) || props.attachmentDraft?.state === "ready") && props.attachmentDraft?.state !== "failed" && props.attachmentDraft?.state !== "uploading");
const edits = ref<Record<string, string>>({});
watch(() => props.composerKey, () => { draft.value = props.initialDraft ?? ""; edits.value = {}; previewImage.value = ""; });
watch(() => props.revealTick, () => { previewImage.value = ""; });
watch(() => props.initialDraft, value => { if (value !== undefined && value !== draft.value) draft.value = value; });
watch(() => props.messages, () => {
  for (const id of Object.keys(edits.value)) {
    if (!props.messages.some(m => m.queue?.turnId === id && m.queue.state === "editing")) delete edits.value[id];
  }
});

function startEdit(m: ThreadMsg) {
  if (!m.queue) return;
  edits.value[m.queue.turnId] = m.text;
  emit("queue-action", m.queue.turnId, "edit");
}

function runQueueAction(m: ThreadMsg, action: "cancel" | "retry" | "cancel-edit") {
  if (!m.queue) return;
  emit("queue-action", m.queue.turnId, action);
}

function saveQueueEdit(m: ThreadMsg) {
  if (!m.queue) return;
  emit("queue-save", m.queue.turnId, edits.value[m.queue.turnId] ?? m.text);
}

function onEditInput(turnId: string, e: Event) {
  edits.value[turnId] = (e as unknown as { detail: { value: string } }).detail.value;
}

function onDraft(e: Event) {
  sounds.unlock();
  draft.value = (e as unknown as { detail: { value: string } }).detail.value;
  emit("draft-change", draft.value);
  emit("typing", Boolean(draft.value.trim()));
}

function onSend() {
  if (!canSend.value) return;
  // Sending is an explicit request to reveal the new reply; passive incoming
  // messages must not interrupt somebody reading earlier history.
  followingTail = true;
  sounds.unlock();
  clearTimeout(sendReturnTimer);
  const epoch = ++sendVisualEpoch, started = Date.now();
  let settled = false;
  sendTurning.value = true;
  clearSendFeedback(); sendFeedback.value = true;
  sendFeedbackTimer = setTimeout(clearSendFeedback, 220);
  const text = draft.value.trim();
  draft.value = "";
  emit("draft-change", "");
  emit("typing", false);
  emit("send", text, () => {
    if (epoch !== sendVisualEpoch) return;
    draft.value = text;
    emit("draft-change", text);
  }, _accepted => {
    if (settled || epoch !== sendVisualEpoch) return;
    settled = true;
    // The timer only preserves the short turn on fast acknowledgements; it never
    // treats an elapsed duration as delivery success or retries the message.
    sendReturnTimer = setTimeout(() => {
      if (epoch === sendVisualEpoch) sendTurning.value = false;
    }, Math.max(0, 160 - (Date.now() - started)));
  });
}

function onCta(m: ThreadMsg) {
  if (m.ctaHref) emit("cta", m.ctaHref, m.ctaLabel ?? "");
}

// Appends follow only while already at the tail; history stays at its anchor.
const scrollAnchor = ref(""), scrollTop = ref(0), listHost = ref<unknown>(null);
const threadInstance = getCurrentInstance();
const historyPrefixHost = ref<unknown>(null), historyPrefixHeight = ref(0);
const historyPrefixBaseline = ref<number | null>(null);
const historyPrefixMeasured = ref(false);
// Initially the slot flows naturally, even if its first measurement fails.
// Adopting that height must not compensate space which was already present.
const positionInset = computed(() => (props.topInset || 0) + historyPrefixHeight.value - (historyPrefixBaseline.value ?? 0));
let scrollGeneration = 0, scrollTimer: ReturnType<typeof setTimeout> | undefined;
let pendingTailGeneration: number | undefined;
let lastScrollTop = 0;
let followingTail = true, measuredViewportHeight = 0;
const HISTORY_MEASURE_MS = 500;
let positionTimer: ReturnType<typeof setTimeout> | undefined, historyDisposed = false;
let preparedHistory: { id: string; prefix: number; inset: number; owner: string; host: unknown; root: unknown } | null = null;
type PositionAdjustment = { owner: string; host: unknown; root: unknown; top: number; inset: number; tail: boolean; id?: string; prefix?: number;
  expiresAt: number; settled: Promise<boolean>; settle: (applied: boolean) => void };
let pendingPosition: PositionAdjustment | null = null;
let historyPreparation = 0;
const historyOwner = () => JSON.stringify([app.accountKey, app.accountBindingEpoch, props.composerKey, props.revealTick]);
const listRoot = () => (listHost.value as { $el?: HTMLElement } | null)?.$el ?? listHost.value as HTMLElement | null;
type PreviewReading = { owner: string; host: unknown; root: unknown; top: number; inset: number; tail: boolean; returning: boolean };
let nativePreviewReading: PreviewReading | null = null;
const previewRowHeights = ref<Record<string, number>>({});
const previewImageHeights = ref<Record<string, number>>({});
const previewImageFrames = ref<Record<string, number>>({});
let previewReservationGeneration = 0;
let previewPreparation = 0;
let stopPreviewPreparation: (() => void) | undefined;
function cancelPreviewPreparation() { previewPreparation++; stopPreviewPreparation?.(); stopPreviewPreparation = undefined; }
function clearPreviewRowHeights() { cancelPreviewPreparation(); previewReservationGeneration++; previewRowHeights.value = {}; previewImageHeights.value = {}; previewImageFrames.value = {}; }
const previewReadingOwner = () => JSON.stringify([app.accountKey, app.accountBindingEpoch, props.composerKey]);
function rememberNativePreviewReading(measured?: Record<string, number>, images: Record<string, number> = {}): PreviewReading {
  const node = scroller();
  const rows = Array.from(listRoot()?.querySelectorAll?.('.nx-conv-msg-row') ?? []);
  const heights: Record<string, number> = {};
  props.messages.forEach((message, index) => {
    const height = message.imageSrc ? rows[index]?.getBoundingClientRect?.().height : undefined;
    if (height !== undefined && Number.isFinite(height) && height > 0) heights[message.id] = height;
  });
  previewReservationGeneration++;
  previewImageFrames.value = {};
  previewRowHeights.value = measured ?? heights;
  previewImageHeights.value = images;
  return nativePreviewReading = { owner: previewReadingOwner(), host: listHost.value, root: listRoot(),
    top: node?.scrollTop ?? lastScrollTop, inset: positionInset.value,
    tail: node ? node.scrollHeight - node.clientHeight - node.scrollTop <= 24 : followingTail, returning: false };
}
// App's logic-layer host has no DOM. Measure real view rows, then confirm that
// their numeric reservation reached the view before a preview can hide the page.
function prepareNativePreviewReading(src: string, launch: (reading: PreviewReading) => void) {
  nativePreviewReading = null; clearPreviewRowHeights();
  const ticket = previewPreparation, owner = historyOwner(), host = listHost.value, root = listRoot();
  let generation = previewReservationGeneration, reading: PreviewReading | null = null;
  const current = () => ticket === previewPreparation && generation === previewReservationGeneration
    && !historyDisposed && threadVisible.value && owner === historyOwner() && host === listHost.value && root === listRoot()
    && (!reading || reading === nativePreviewReading)
    && (props.attachmentPreviewSrc === src || props.messages.some(message => message.imageSrc === src));
  const cancel = () => { if (ticket === previewPreparation) { nativePreviewReading = null; clearPreviewRowHeights(); } };
  const fallback = () => { const usable = current(); cancel(); if (usable) previewImage.value = src; };
  if (!current()) return;
  stopPreviewPreparation = watch([() => props.messages, () => props.attachmentPreviewSrc, historyOwner], cancel, { deep: true, flush: 'sync' });
  const queryRows = (committed: boolean, done: (rows: UniApp.NodeInfo[], images: UniApp.NodeInfo[]) => void) => {
    try {
      if (typeof uni === 'undefined' || !uni.createSelectorQuery) { fallback(); return; }
      const query = uni.createSelectorQuery().in(threadInstance);
      query.selectAll('.nx-conv-msg-row').fields({ id: true, size: true, ...(committed ? { computedStyle: ['min-height'] } : {}) }, () => {});
      query.selectAll('.nx-conv-image').fields({ id: true, size: true, ...(committed ? { computedStyle: ['min-height', 'max-height'] } : {}) }, () => {});
      query.exec(result => {
        if (!current()) return;
        done(Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [], Array.isArray(result) && Array.isArray(result[1]) ? result[1] : []);
      });
    } catch { fallback(); }
  };
  queryRows(false, (rows, images) => {
    const heights: Record<string, number> = {}, imageHeights: Record<string, number> = {};
    for (const message of props.messages) if (message.imageSrc) {
      const matches = rows.filter(row => row.id === messageRowId(message.id) + '-preview');
      const height = matches.length === 1 ? matches[0].height : undefined;
      if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) { fallback(); return; }
      heights[message.id] = height;
      const imageMatches = images.filter(image => image.id === messageRowId(message.id) + '-preview-image');
      const imageHeight = imageMatches.length === 1 ? imageMatches[0].height : undefined;
      if (typeof imageHeight !== 'number' || !Number.isFinite(imageHeight) || imageHeight <= 0) { fallback(); return; }
      imageHeights[message.id] = imageHeight;
    }
    reading = rememberNativePreviewReading(heights, imageHeights); generation = previewReservationGeneration;
    void nextTick(() => {
      if (!current()) return;
      queryRows(true, (committed, images) => {
        for (const [id, height] of Object.entries(heights)) {
          const matches = committed.filter(row => row.id === messageRowId(id) + '-preview');
          const row = matches.length === 1 ? matches[0] : undefined;
          const minimum = parseFloat(String((row as unknown as Record<string, unknown> | undefined)?.['min-height'] ?? ''));
          if (!row || typeof row.height !== 'number' || !Number.isFinite(row.height) || row.height < height - .5
            || !Number.isFinite(minimum) || minimum < height - .5) { fallback(); return; }
          const imageMatches = images.filter(image => image.id === messageRowId(id) + '-preview-image');
          const image = imageMatches.length === 1 ? imageMatches[0] : undefined, imageHeight = imageHeights[id];
          const styles = image as unknown as Record<string, unknown> | undefined;
          const imageMin = parseFloat(String(styles?.['min-height'] ?? '')), imageMax = parseFloat(String(styles?.['max-height'] ?? ''));
          if (!image || typeof image.height !== 'number' || !Number.isFinite(image.height) || Math.abs(image.height - imageHeight) > .5
            || !Number.isFinite(imageMin) || Math.abs(imageMin - imageHeight) > .5
            || !Number.isFinite(imageMax) || Math.abs(imageMax - imageHeight) > .5) { fallback(); return; }
        }
        cancelPreviewPreparation(); launch(reading!);
      });
    });
  });
}
onShow(() => { if (nativePreviewReading) nativePreviewReading.returning = true; });
onHide(() => {
  if (stopPreviewPreparation || !nativePreviewReading || nativePreviewReading.returning) { nativePreviewReading = null; clearPreviewRowHeights(); }
});
watch(() => [previewReadingOwner(), listHost.value, listRoot()], () => { nativePreviewReading = null; clearPreviewRowHeights(); }, { flush: 'sync' });
onScopeDispose(() => { nativePreviewReading = null; clearPreviewRowHeights(); });
watch(() => props.messages.map(message => [message.id, message.imageSrc] as const), (messages, previous) => {
  if (!Object.keys(previewRowHeights.value).length) return;
  const frames = { ...previewImageFrames.value };
  let changed = false;
  for (const [id, src] of messages) if (id in previewRowHeights.value && previous?.find(row => row[0] === id)?.[1] !== src) {
    frames[id] = (frames[id] ?? 0) + 1; changed = true;
  }
  if (changed) previewImageFrames.value = frames;
}, { flush: 'sync' });
type ImageLoad = { detail?: { width?: number; height?: number } };
function imageLoadHandler(id: string, src: string | undefined) {
  const generation = previewReservationGeneration, frame = previewImageFrames.value[id] ?? 0;
  return (event?: Event) => onMessageImageLoad(id, src, generation, frame, event as ImageLoad | undefined);
}
function onMessageImageLoad(id: string, src: string | undefined, generation: number, frame: number, event?: ImageLoad) {
  scheduleBubblePositions();
  const owner = previewReadingOwner(), host = listHost.value, root = listRoot();
  const current = () => threadVisible.value && (!nativePreviewReading || nativePreviewReading.returning)
    && owner === previewReadingOwner() && generation === previewReservationGeneration
    && host === listHost.value && root === listRoot()
    && frame === (previewImageFrames.value[id] ?? 0)
    && typeof src === 'string' && props.messages.some(message => message.id === id && message.imageSrc === src)
    && id in previewRowHeights.value;
  if (!current()) return;
  void nextTick(() => {
    if (!current()) return;
    const release = () => {
      if (!current()) return;
      const heights = { ...previewRowHeights.value }; delete heights[id]; previewRowHeights.value = heights;
      const images = { ...previewImageHeights.value }; delete images[id]; previewImageHeights.value = images;
    };
    if (!(id in previewImageHeights.value)) { release(); return; }
    const width = event?.detail?.width, height = event?.detail?.height;
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0
      || typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return;
    // App emits load before its queued widthFix writes inline height. This
    // view round trip runs after that load task/microtasks. Only remove our
    // min/max constraints; never clear the height owned by Uni's Image.
    try {
      const query = uni.createSelectorQuery().in(threadInstance), imageId = messageRowId(id) + '-preview-image';
      query.select('#' + imageId).fields({ id: true, size: true }, () => {});
      query.exec(result => {
        const image = Array.isArray(result) ? result[0] as UniApp.NodeInfo | undefined : undefined;
        if (image?.id === imageId && typeof image.width === 'number' && Number.isFinite(image.width) && image.width > 0
          && typeof image.height === 'number' && Number.isFinite(image.height) && image.height > 0) release();
      });
    } catch { /* Keep numeric bounds until a current view load can be confirmed. */ }
  });
}
function resumeNativePreviewReading(): boolean {
  const reading = nativePreviewReading;
  nativePreviewReading = null;
  if (!reading?.returning || reading.tail || reading.owner !== previewReadingOwner()
    || reading.host !== listHost.value || reading.root !== listRoot()) return false;
  followingTail = false;
  pendingPosition = { ...beginPosition(reading.inset), top: reading.top, tail: false };
  preservePosition(reading.inset);
  return true;
}
function settlePosition(applied = false) {
  const position = pendingPosition;
  pendingPosition = null;
  clearTimeout(positionTimer); positionTimer = undefined;
  position?.settle(applied);
}
function cancelScroll(keepPosition = false) {
  scrollGeneration++; clearTimeout(scrollTimer); clearTimeout(positionTimer); scrollAnchor.value = '';
  pendingTailGeneration = undefined;
  if (!keepPosition) settlePosition();
}
function invalidateHistoryPosition() { cancelScroll(); preparedHistory = null; historyPreparation++; }
onScopeDispose(() => { historyDisposed = true; invalidateHistoryPosition(); });
onHide(invalidateHistoryPosition);
watch(() => [historyOwner(), listHost.value, listRoot()], invalidateHistoryPosition, { flush: 'sync' });
function scroller(): HTMLElement | undefined {
  const host = listRoot();
  if (!host?.querySelectorAll) return;
  return [host, ...Array.from(host.querySelectorAll('*'))].find(node =>
    (node as HTMLElement).scrollHeight - (node as HTMLElement).clientHeight > 4) as HTMLElement | undefined;
}
function onThreadScroll(event: { detail: { scrollTop: number; scrollHeight?: number } }) {
  if (stopPreviewPreparation) { nativePreviewReading = null; clearPreviewRowHeights(); }
  pendingTailGeneration = undefined;
  // Mirror the native position so a later prepend can reapply the same target.
  if (pendingPosition) pendingPosition.top += event.detail.scrollTop - lastScrollTop;
  lastScrollTop = event.detail.scrollTop;
  scrollTop.value = lastScrollTop;
  const node = scroller();
  if (node) followingTail = node.scrollHeight - node.clientHeight - node.scrollTop <= 24;
  else if (event.detail.scrollHeight !== undefined && measuredViewportHeight > 0)
    followingTail = event.detail.scrollHeight - measuredViewportHeight - lastScrollTop <= 24;
  if (threadVisible.value && nativePreviewReading?.returning) {
    nativePreviewReading.top = lastScrollTop; nativePreviewReading.inset = positionInset.value; nativePreviewReading.tail = followingTail;
  }
  scheduleBubblePositions();
}
function messageRowId(id: string) { return 'nx-conv-message-' + Array.from(id).map(char=>char.charCodeAt(0).toString(16)).join('-'); }
function measurePrefix(firstId: string, done: (height: number | null) => void) {
  const root = listRoot(), host = listHost.value, owner = historyOwner();
  const finish = (height: number | null) => done(!historyDisposed && threadVisible.value && host === listHost.value
    && root === listRoot() && owner === historyOwner() && height !== null && Number.isFinite(height) ? height : null);
  try {
    const content = root?.querySelector?.('.nx-conv-content'), first = root?.querySelector?.('#' + messageRowId(firstId));
    if (content && first) { finish(first.getBoundingClientRect().top - content.getBoundingClientRect().top); return; }
    if (typeof uni === 'undefined' || !uni.createSelectorQuery) { finish(null); return; }
    const query = uni.createSelectorQuery().in(threadInstance);
    query.select('.nx-conv-content').boundingClientRect(); query.select('#' + messageRowId(firstId)).boundingClientRect();
    query.exec(rows => {
      const [body, anchor] = (Array.isArray(rows) ? rows : []) as UniApp.NodeInfo[];
      finish(typeof body?.top === 'number' && typeof anchor?.top === 'number' ? anchor.top - body.top : null);
    });
  } catch { finish(null); }
}
// Capture before the request mutates history. Native selector queries are async;
// waiting here also accounts for a first-row date marker disappearing on prepend.
async function prepareHistoryPrepend(): Promise<boolean> {
  const owner = historyOwner(), host = listHost.value, root = listRoot(), preparation = ++historyPreparation;
  const current = () => !historyDisposed && threadVisible.value && preparation === historyPreparation
    && owner === historyOwner() && host === listHost.value && root === listRoot();
  if (!current()) return false;
  // The parent finishes its data request before the native post-layout callback.
  // Wait for that bounded transaction; never erase its unpaid prefix delta.
  if (pendingPosition && !await pendingPosition.settled) return false;
  if (!current()) return false;
  cancelScroll(); preparedHistory = null;
  const id = props.messages[0]?.id, inset = positionInset.value;
  if (!id) return false;
  return new Promise<boolean>(resolve => {
    let finished = false;
    const timeout = setTimeout(() => { finished = true; resolve(false); }, HISTORY_MEASURE_MS);
    measurePrefix(id, prefix => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      const valid = typeof prefix === 'number' && Number.isFinite(prefix) && current()
        && props.messages[0]?.id === id && inset === positionInset.value;
      if (valid) preparedHistory = { id, prefix: prefix as number, inset, owner, host, root };
      resolve(valid);
    });
  });
}
defineExpose({ prepareHistoryPrepend });
function scrollToEnd() {
  cancelScroll(); const ticket = scrollGeneration;
  pendingTailGeneration = ticket;
  const messages = props.messages.map(message=>message.id).join('\u0000');
  const owner = JSON.stringify([app.accountKey,app.accountBindingEpoch,props.composerKey,props.revealTick]);
  const current = () => ticket === scrollGeneration && !historyDisposed && threadVisible.value
    && followingTail
    && messages === props.messages.map(message=>message.id).join('\u0000')
    && owner === JSON.stringify([app.accountKey,app.accountBindingEpoch,props.composerKey,props.revealTick]);
  followingTail = true;
  const apply = () => {
    if (!current()) return;
    const node = scroller();
    if (node) {
      node.scrollTop = node.scrollHeight; lastScrollTop = node.scrollTop;
      // UniApp also reapplies this prop during mounting; do not leave a stale
      // zero command behind while waiting for the DOM scroll event.
      scrollTop.value = lastScrollTop; pendingTailGeneration = undefined;
    }
    else { scrollAnchor.value = ''; void nextTick(() => { if (current()) scrollAnchor.value = 'nx-conv-end'; }); }
    scheduleBubblePositions();
  };
  void nextTick(() => {
    if (!current()) return;
    apply(); scrollTimer = setTimeout(apply, 90);
  });
}
function beginPosition(previousInset: number, node?: HTMLElement): PositionAdjustment {
  let settle!: (applied: boolean) => void;
  const settled = new Promise<boolean>(resolve => { settle = resolve; });
  return { owner: historyOwner(), host: listHost.value, root: listRoot(), top: node?.scrollTop ?? lastScrollTop, inset: previousInset,
    // A new layout can precede the first queued tail placement. Its old DOM
    // position is not evidence that the user chose to read earlier history.
    tail: (followingTail && pendingTailGeneration === scrollGeneration)
      || (node ? node.scrollHeight - node.clientHeight - node.scrollTop <= 24 : followingTail),
    expiresAt: Date.now() + HISTORY_MEASURE_MS, settled, settle };
}
function preservePosition(previousInset: number, firstId?: string) {
  const node = scroller(), owner = historyOwner(), host = listHost.value, root = listRoot();
  // Keep the original reading anchor while native measurements are pending.
  // A later header resize or second prepend supersedes the measurement, not
  // the baseline; its total prefix delta will be applied exactly once.
  if (pendingPosition && (pendingPosition.owner !== owner || pendingPosition.host !== host || pendingPosition.root !== root)) cancelScroll();
  const adjustment = pendingPosition ?? beginPosition(previousInset, node);
  if (firstId && !adjustment.id) {
    let prefix: number | null = null;
    if (preparedHistory?.id === firstId && preparedHistory.owner === owner && preparedHistory.host === host && preparedHistory.root === root)
      prefix = preparedHistory.prefix + adjustment.inset - preparedHistory.inset;
    // H5 can capture the still-unpatched DOM synchronously. Normalize its
    // header/prefix space to the transaction's original inset.
    if (node) measurePrefix(firstId, value => { prefix = value === null ? null : value + adjustment.inset - previousInset; });
    preparedHistory = null;
    if (prefix === null || !Number.isFinite(prefix)) { cancelScroll(); return; }
    adjustment.id = firstId; adjustment.prefix = prefix;
  }
  cancelScroll(true); pendingPosition = adjustment;
  const ticket = scrollGeneration, inset = positionInset.value;
  const ids = props.messages.map(message => message.id).join('\u0000');
  const current = () => ticket === scrollGeneration && pendingPosition === adjustment && !historyDisposed && threadVisible.value
    && owner === historyOwner() && host === listHost.value && root === listRoot() && inset === positionInset.value
    && ids === props.messages.map(message => message.id).join('\u0000');
  // Coalescing another layout change keeps the original deadline. Unknown geometry
  // releases the transaction without guessing a delta or moving a history reader.
  positionTimer = setTimeout(() => { if (pendingPosition === adjustment && ticket === scrollGeneration) settlePosition(); },
    Math.max(0, adjustment.expiresAt - Date.now()));
  const apply = (delta: number) => {
    if (!current() || !Number.isFinite(delta)) return;
    settlePosition(true);
    const nextTop = preservedConversationTop(adjustment.top, delta), target = scroller();
    if (target) target.scrollTop = nextTop;
    scrollTop.value = nextTop; lastScrollTop = nextTop;
    scheduleBubblePositions();
  };
  void nextTick(() => {
    if (!current()) return;
    if (adjustment.id && adjustment.prefix !== undefined) {
      measurePrefix(adjustment.id, prefix => {
        if (!current()) return;
        if (prefix !== null && Number.isFinite(prefix)) apply(prefix - adjustment.prefix!);
        else settlePosition();
      });
    } else if (adjustment.tail && followingTail) { settlePosition(true); scrollToEnd(); }
    else apply(inset - adjustment.inset);
  });
}
watch(
  () => [props.messages.map(message => message.id), props.typing, props.revealTick, props.composerKey, positionInset.value] as const,
  ([ids, typing, reveal, key, inset], previous) => {
    if (!threadVisible.value) { cancelScroll(); return; }
    if (!previous || key !== previous[3]) { nativePreviewReading = null; scrollToEnd(); return; }
    if (reveal !== previous[2]) { if (!resumeNativePreviewReading()) scrollToEnd(); return; }
    if (inset !== previous[4]) historyPreparation++;
    const change = conversationScrollChange(previous[0], ids);
    if (change === 'prepend' || pendingPosition || inset !== previous[4])
      preservePosition(previous[4], change === 'prepend' ? previous[0][0] : undefined);
    else if ((change === 'append' || (typing && !previous[1])) && followingTail) scrollToEnd();
  },
);
onMounted(() => {
  scrollToEnd();
});
let historyPrefixMeasureEpoch = 0;
let historyPrefixObserver: ResizeObserver | undefined;
let historyPrefixTimer: ReturnType<typeof setTimeout> | undefined;
const historyPrefixRoot = () => (historyPrefixHost.value as { $el?: HTMLElement } | null)?.$el ?? historyPrefixHost.value as HTMLElement | null;
function invalidateHistoryPrefixMeasure() {
  historyPrefixMeasureEpoch++; clearTimeout(historyPrefixTimer); historyPrefixTimer = undefined;
}
function measureHistoryPrefix() {
  invalidateHistoryPrefixMeasure();
  const epoch = historyPrefixMeasureEpoch, owner = historyOwner();
  const host = historyPrefixHost.value, root = historyPrefixRoot(), deadline = Date.now() + HISTORY_MEASURE_MS;
  let finished = false;
  const current = () => !finished && !historyDisposed && threadVisible.value && epoch === historyPrefixMeasureEpoch
    && owner === historyOwner() && host === historyPrefixHost.value && root === historyPrefixRoot();
  if (!host || !current()) return;
  const finish = () => { finished = true; clearTimeout(historyPrefixTimer); historyPrefixTimer = undefined; };
  const fallback = () => {
    if (!current()) return;
    finish();
    // An old zero/short height must not clip newly available history controls.
    // Release to natural flow without inventing an unmeasured scroll delta.
    historyPrefixMeasured.value = false;
  };
  historyPrefixTimer = setTimeout(fallback, HISTORY_MEASURE_MS);
  void nextTick(() => {
    if (!current()) return;
    const apply = (height?: number) => {
      if (!current()) return;
      if (Date.now() > deadline || typeof height !== 'number' || !Number.isFinite(height) || height < 0) { fallback(); return; }
      finish();
      const nextHeight = !historyPrefixMeasured.value || Math.abs(height - historyPrefixHeight.value) > .25 ? height : historyPrefixHeight.value;
      if (historyPrefixBaseline.value === null) historyPrefixBaseline.value = nextHeight;
      else if (!historyPrefixMeasured.value) {
        // Natural flow already occupied this space during the failed read.
        historyPrefixBaseline.value += nextHeight - historyPrefixHeight.value;
      }
      historyPrefixHeight.value = nextHeight;
      historyPrefixMeasured.value = true;
    };
    try {
      if (root?.getBoundingClientRect) { apply(root.getBoundingClientRect().height); return; }
      if (typeof uni === 'undefined' || !uni.createSelectorQuery) { fallback(); return; }
      const query = uni.createSelectorQuery().in(threadInstance);
      query.select('.nx-conv-history-content').boundingClientRect();
      query.exec(rows => apply((rows?.[0] as UniApp.NodeInfo)?.height));
    } catch { fallback(); }
  });
}
function observeHistoryPrefix() {
  historyPrefixObserver?.disconnect(); historyPrefixObserver = undefined;
  invalidateHistoryPrefixMeasure();
  if (historyDisposed || !threadVisible.value) return;
  measureHistoryPrefix();
  const root = historyPrefixRoot(), host = historyPrefixHost.value, owner = historyOwner();
  if (typeof ResizeObserver !== 'undefined' && root?.getBoundingClientRect) {
    historyPrefixObserver = new ResizeObserver(() => {
      if (!historyDisposed && threadVisible.value && root === historyPrefixRoot() && host === historyPrefixHost.value && owner === historyOwner()) measureHistoryPrefix();
    });
    historyPrefixObserver.observe(root);
  }
}
watch(() => [historyOwner(), historyPrefixHost.value, historyPrefixRoot(), threadVisible.value], invalidateHistoryPrefixMeasure, { flush: 'sync' });
watch(() => [historyOwner(), historyPrefixHost.value, historyPrefixRoot(), threadVisible.value], observeHistoryPrefix, { flush: 'post' });
watch(() => [props.historyContentKey, props.timeLocale], measureHistoryPrefix, { flush: 'post' });
onMounted(observeHistoryPrefix);
onScopeDispose(() => { invalidateHistoryPrefixMeasure(); historyPrefixObserver?.disconnect(); });
let composerMeasureEpoch = 0;
function invalidateComposerMeasure() { composerMeasureEpoch++; }
onHide(invalidateComposerMeasure);
onScopeDispose(invalidateComposerMeasure);
watch(historyOwner, invalidateComposerMeasure, { flush: 'sync' });
function measureComposer(follow = followingTail) {
  const owner = historyOwner(), epoch = ++composerMeasureEpoch;
  void nextTick(() => {
    if (epoch !== composerMeasureEpoch || !threadVisible.value || !composerVisible.value) return;
    const apply = (height: number | undefined) => {
      if (epoch !== composerMeasureEpoch || !threadVisible.value || !composerVisible.value || owner !== historyOwner() || !height || !Number.isFinite(height)) return;
      composerSpace.value = height;
      composerMeasured.value = true;
      if (follow && followingTail && !preparedHistory && !pendingPosition) scrollToEnd();
      else scheduleBubblePositions();
    };
    const node = (composerHost.value as { $el?: HTMLElement } | null)?.$el ?? composerHost.value as HTMLElement | null;
    if (node?.getBoundingClientRect) { apply(node.getBoundingClientRect().height); return; }
    if (typeof uni === 'undefined' || !uni.createSelectorQuery) return;
    try {
      const query = uni.createSelectorQuery().in(threadInstance);
      query.select('.nx-conv-composer').boundingClientRect();
      query.exec(rows => apply((rows[0] as UniApp.NodeInfo)?.height));
    } catch { /* The conservative initial spacing stays available without a bridge. */ }
  });
}
let composerResizeObserver: ResizeObserver | undefined;
function observeComposer() {
  composerResizeObserver?.disconnect();
  composerResizeObserver = undefined;
  invalidateComposerMeasure();
  measureComposer();
  const node = (composerHost.value as { $el?: HTMLElement } | null)?.$el ?? composerHost.value as HTMLElement | null;
  if (typeof ResizeObserver !== 'undefined' && node?.getBoundingClientRect) {
    composerResizeObserver = new ResizeObserver(() => measureComposer());
    composerResizeObserver.observe(node);
  }
}
watch(composerHost, observeComposer, { flush: 'post' });
onMounted(observeComposer);
onScopeDispose(() => composerResizeObserver?.disconnect());
watch(() => [inputHeight.value, showInputLength.value, inputOverLimit.value, composerVisible.value,
  props.attachRetry, props.imageLabels?.retryPolicy, props.inputLimitHint, props.timeLocale], () => {
  const node = scroller();
  const atTail = node ? node.scrollHeight - node.clientHeight - node.scrollTop <= 24 : followingTail;
  // Native fallback is ready immediately; layout measurement replaces it with
  // the exact input, counter and safe-area height once the bridge responds.
  composerSpace.value = inputHeight.value + 62 + (showInputLength.value ? 36 : 0) + (inputOverLimit.value ? 36 : 0) + (props.attachRetry ? 44 : 0);
  composerMeasured.value = false;
  measureComposer(atTail);
  if (atTail && threadVisible.value && !pendingPosition) scrollToEnd();
  else void nextTick(scheduleBubblePositions);
});

// Sample the whole visible conversation, never a gradient inside an individual bubble.
// Scroll events coalesce; no polling or permanent animation loop is needed.
const bubblePositions = ref<Record<string, number>>({});
const composerLight = ref(composerReflection(undefined, []));
const composerLightStyle = computed(() => ({ '--nx-rim-strength': composerLight.value.strength,
  '--nx-rim-x': composerLight.value.x + '%', '--nx-rim-width': composerLight.value.width + '%',
  '--nx-rim-dark': composerLight.value.dark, '--nx-rim-light': composerLight.value.light } as CSSProperties));
let bubblePositionTimer: ReturnType<typeof setTimeout> | undefined;
let bubbleMeasureEpoch = 0;
let bubbleMeasurementDisposed = false;
let bubbleResizeObserver: ResizeObserver | undefined;
function cancelBubblePositions() { clearTimeout(bubblePositionTimer); bubblePositionTimer = undefined; bubbleMeasureEpoch++; }
function scheduleBubblePositions() {
  if (bubbleMeasurementDisposed || !threadVisible.value || bubblePositionTimer !== undefined) return;
  bubblePositionTimer = setTimeout(() => { bubblePositionTimer = undefined; measureBubblePositions(); }, 16);
}
function measureBubblePositions() {
  if (bubbleMeasurementDisposed) return;
  const epoch = ++bubbleMeasureEpoch, owner = historyOwner();
  const measuredList = listHost.value, measuredComposer = composerHost.value;
  const messages = props.messages.filter(m => m.tone !== 'system');
  const apply = (viewport: { top?: number; height?: number } | undefined, rects: Array<Partial<ConversationRect>>, field?: ConversationRect) => {
    if (epoch !== bubbleMeasureEpoch || !threadVisible.value || owner !== historyOwner()
      || measuredList !== listHost.value || measuredComposer !== composerHost.value || !viewport?.height || viewport.top === undefined) return;
    measuredViewportHeight = viewport.height;
    const next: Record<string, number> = {};
    messages.forEach((message, index) => {
      const rect = rects[index];
      if (message.side === 'right' && rect?.top !== undefined && rect.height !== undefined) next[message.id] = bubbleViewportPosition(rect.top, rect.height, viewport.top! + (props.topInset || 0), Math.max(1, viewport.height! - (props.topInset || 0) - (composerVisible.value ? composerSpace.value : 0)));
    });
    if (JSON.stringify(next) !== JSON.stringify(bubblePositions.value)) bubblePositions.value = next;
    composerLight.value = composerReflection(composerVisible.value ? field : undefined,
      messages.map((message, index) => ({ top: rects[index]?.top ?? NaN, left: rects[index]?.left ?? NaN,
        width: rects[index]?.width ?? NaN, height: rects[index]?.height ?? NaN,
        outgoing: message.side === 'right', position: next[message.id] ?? .5 })));
  };
  const root = (listHost.value as { $el?: HTMLElement } | null)?.$el ?? listHost.value as HTMLElement | null;
  if (root?.getBoundingClientRect && root.querySelectorAll) {
    const composer = (composerHost.value as { $el?: HTMLElement } | null)?.$el ?? composerHost.value as HTMLElement | null;
    apply(root.getBoundingClientRect(), Array.from(root.querySelectorAll('.nx-conv-bubble')).map(node => node.getBoundingClientRect()), composer?.querySelector('.nx-conv-compose-field')?.getBoundingClientRect());
    return;
  }
  if (typeof uni === 'undefined' || !uni.createSelectorQuery) return;
  try {
    const query = uni.createSelectorQuery().in(threadInstance);
    query.select('.nx-conv-list').boundingClientRect();
    query.selectAll('.nx-conv-bubble').boundingClientRect();
    query.select('.nx-conv-compose-field').boundingClientRect();
    query.exec(rows => apply(rows[0] as UniApp.NodeInfo, rows[1] as UniApp.NodeInfo[], rows[2] as ConversationRect));
  } catch { /* An unavailable native bridge keeps a safe, uniform theme colour. */ }
}
watch(() => [historyOwner(), listHost.value, composerHost.value, threadVisible.value, composerVisible.value], () => {
  cancelBubblePositions();
  bubblePositions.value = {};
  composerLight.value = composerReflection(undefined, []);
  void nextTick(scheduleBubblePositions);
}, { flush: 'sync' });
watch(() => [props.messages.map(m => [m.id, m.text, m.imageSrc, m.deliveryState]), props.composerKey, props.revealTick, props.timeLocale, props.topInset], () => {
  cancelBubblePositions(); void nextTick(scheduleBubblePositions);
}, { flush: 'post' });
onMounted(() => {
  scheduleBubblePositions();
  const root = (listHost.value as { $el?: HTMLElement } | null)?.$el ?? listHost.value as HTMLElement | null;
  if (typeof ResizeObserver !== 'undefined' && root?.querySelector) {
    bubbleResizeObserver = new ResizeObserver(scheduleBubblePositions);
    bubbleResizeObserver.observe(root);
    const content = root.querySelector('.nx-conv-content'); if (content) bubbleResizeObserver.observe(content);
  }
});
onShow(() => { void nextTick(scheduleBubblePositions); });
onHide(cancelBubblePositions);
onScopeDispose(() => { bubbleMeasurementDisposed = true; cancelBubblePositions(); bubbleResizeObserver?.disconnect(); });

function bubbleStyle(m: ThreadMsg): CSSProperties {
  const position = bubblePositions.value[m.id] ?? 0.5;
  return m.side === 'right' ? { '--nx-bubble-position': `${(position * 100).toFixed(1)}%`,
    '--nx-bubble-fill-dark': bubbleFill(position, false), '--nx-bubble-fill-light': bubbleFill(position, true) } as CSSProperties : {};
}

// ── **bold** + \n → render segments. Bare text must live in <text> (P-026). ──
function formatLines(text: string): { text: string; bold: boolean }[][] {
  return text.split("\n").map((line) =>
    line
      .split(/(\*\*[^*]+\*\*)/g)
      .filter((p) => p.length > 0)
      .map((p) =>
        p.startsWith("**") && p.endsWith("**")
          ? { text: p.slice(2, -2), bold: true }
          : { text: p, bold: false },
      ),
  );
}

function onKeyboardActivate(event: KeyboardEvent, action: () => void) {
  if (event.repeat) return;
  action();
}
</script>

<style scoped>
.nx-conv-history-prefix { position: relative; }
.nx-conv-history-prefix--measured { overflow: hidden; }
.nx-conv-history-content { display: flex; flex-direction: column; }
.nx-conv-history-prefix--measured > .nx-conv-history-content { position: absolute; inset: 0 0 auto; }
.nx-conv-thread {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  --nx-chat-incoming: rgba(35, 41, 43, .76);
  --nx-chat-out-top: rgba(95, 123, 12, .84);
  --nx-chat-out-bottom: rgba(22, 88, 66, .84);
  --nx-chat-out-ink: #F7FBEF;
  --nx-chat-out-meta: #DCE8C2;
  --nx-chat-stroke: rgba(255, 255, 255, .09);
}
:global([data-theme="light"] .nx-conv-thread) {
  --nx-chat-incoming: rgba(255, 255, 255, .76);
  --nx-chat-out-top: rgba(130, 59, 191, .9);
  --nx-chat-out-bottom: color-mix(in srgb, color-mix(in srgb, var(--v5-brand) 75%, var(--v5-brand-deep)) 90%, transparent);
  --nx-chat-out-ink: #FFFFFF;
  --nx-chat-out-meta: #EEF2FF;
  --nx-chat-stroke: rgba(255, 255, 255, .24);
}
.nx-conv-list {
  flex: 1;
  min-height: 0; /* allow the scroll area to shrink so the input row stays visible */
  padding: 12px 12px 0;
}
/* Hide native scrollbars on both scroll areas — a mobile app shows no bars while
   keeping scroll/swipe. uni renders the real overflow node as an inner
   .uni-scroll-view, so :deep past the scoped boundary. Pairs with :show-scrollbar. */
.nx-conv-list :deep(.uni-scroll-view),
.nx-conv-chips :deep(.uni-scroll-view) {
  scrollbar-width: none; /* Firefox */
}
.nx-conv-list :deep(.uni-scroll-view)::-webkit-scrollbar,
.nx-conv-chips :deep(.uni-scroll-view)::-webkit-scrollbar {
  display: none; /* WebKit / Blink */
  width: 0;
  height: 0;
}
.nx-conv-empty {
  text-align: center;
  padding: 32px 16px;
}
.nx-conv-empty-t {
  font-size: 13px;
  color: var(--v5-ink-3);
  line-height: 1.55;
}
.nx-conv-msg-row {
  margin-top: 10px;
}
.nx-conv-msg-row:first-child { margin-top: 0; }
.nx-conv-msg-row--joined { margin-top: 3px; }
.nx-conv-image-open { display: flex; flex-direction: column; gap: 6px; cursor: pointer; }
.nx-conv-image { width: min(220px, 58vw); max-height: 280px; border-radius: 10px; }
.nx-conv-image-caption { color: var(--v5-ink-3); font-size: 12px; line-height: 1.5; }
.nx-conv-right .nx-conv-image-caption { color: var(--nx-chat-out-meta); }
.nx-conv-time-divider { display:flex; justify-content:center; padding:8px 0 12px; color:var(--v5-ink-3); font-family:var(--font-v5); font-size:12px; line-height:18px; text-align:center; overflow-wrap:anywhere; }
.nx-conv-attachment { margin: 6px 14px; padding: 10px 0; border-top: 1px solid var(--v5-border); color: var(--v5-ink); font-size: 13px; }
.nx-conv-attachment-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.nx-conv-attachment-action { display: flex; align-items: center; min-height: 44px; color: var(--v5-brand); }
.nx-conv-attach-trigger { display: flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; color: var(--v5-ink-2); font-size: 20px; }
.nx-conv-image-overlay { position: fixed; inset: 0; z-index: 800; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; box-sizing: border-box; padding: max(24px, var(--nx-overlay-top)) 24px var(--nx-overlay-bottom); overflow-y: auto; overscroll-behavior: contain; background: var(--v5-bg); }
.nx-conv-image-close { flex-shrink: 0; align-self: flex-end; display: flex; align-items: center; min-height: 44px; color: var(--v5-ink); }
.nx-conv-image-full { flex: none; width: 100%; height: min(78vh, calc(100vh - max(24px, var(--nx-overlay-top)) - var(--nx-overlay-bottom) - 60px)); min-height: 0; max-width: 100%; }

.nx-conv-queue { margin: 6px 0 0 auto; max-width: 90%; text-align: right; }
.nx-conv-queue-status { display: block; font-size: 12px; line-height: 1.5; color: var(--v5-ink-3); }
.nx-conv-queue[data-state="failed"] .nx-conv-queue-status { color: var(--v5-danger, #b42318); }
.nx-conv-queue-actions { display: flex; justify-content: flex-end; gap: 8px; }
.nx-conv-queue-action { display: inline-flex; align-items: center; justify-content: center; margin: 0; padding: 0 12px; min-height: 44px; line-height: 44px; font-size: 12px; color: var(--v5-brand); background: transparent; }
.nx-conv-edit-input { box-sizing: border-box; width: 100%; padding: 10px; margin-top: 8px; border: 1px solid var(--v5-border); border-radius: 10px; text-align: left; color: var(--v5-ink); background: var(--v5-surface); font-size: 13px; }
.nx-conv-sys {
  text-align: center;
  padding: 4px 0;
}
.nx-conv-sys-t {
  font-size: 12px;
  color: var(--v5-ink-4);
}
.nx-conv-bubble-row {
  display: flex;
  flex-direction: column;
}
.nx-conv-author-avatar { width: 28px; height: 28px; border-radius: 50%; margin-bottom: 4px; }
.nx-conv-left {
  align-items: flex-start;
}
.nx-conv-right {
  align-items: flex-end;
}
.nx-conv-bubble {
  position: relative;
  --nx-bubble-fill: var(--nx-chat-incoming);
  display: flow-root;
  max-width: 89%;
  min-width: 0;
  padding: 6px 10px 5px;
  border-radius: 17px;
  border: 1px solid var(--nx-chat-stroke);
  background-color: var(--nx-bubble-fill);
  background-image: none;
  color: var(--v5-ink);
  font-family: var(--font-v5);
  font-size: 14px;
  line-height: 21px;
  overflow-wrap: anywhere;
}
/* On the plain conversation canvas, one translucent tint gives the frosted
   surface without an independent backdrop filter per scrolling message.
   Text and metadata share this paint; only floating controls sample content. */
.nx-conv-right .nx-conv-bubble {
  --nx-bubble-fill: var(--nx-chat-out-bottom);
  --nx-bubble-fill: var(--nx-bubble-fill-dark, var(--nx-chat-out-bottom));
  color: var(--nx-chat-out-ink);
  border-bottom-right-radius: 6px;
}
:global([data-theme="light"] .nx-conv-right .nx-conv-bubble) { --nx-bubble-fill: var(--nx-bubble-fill-light, var(--nx-chat-out-bottom)); }
.nx-conv-left .nx-conv-bubble { border-bottom-left-radius: 6px; }
.nx-conv-msg-row--joined .nx-conv-right .nx-conv-bubble { border-top-right-radius: 6px; }
.nx-conv-msg-row--joined .nx-conv-left .nx-conv-bubble { border-top-left-radius: 6px; }
.nx-conv-bubble-body {
  display: contents;
}
.nx-conv-line {
  display: inline;
}
.nx-conv-line:not(:last-child)::after { content: '\A'; white-space: pre; }
.nx-conv-seg {
  overflow-wrap: anywhere;
  font-family: var(--font-v5);
  font-size: inherit;
  line-height: inherit;
  color: inherit;
}
.nx-conv-seg--b {
  font-weight: 600;
}
.nx-conv-cta-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  padding: 0 14px 10px;
}
.nx-conv-cta-t {
  color: var(--v5-brand);
  font-family: var(--font-v5);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: -0.005em;
}
.nx-conv-bottom-anchor {
  height: 8px;
}
.nx-conv-bubble-meta {
  display: inline-flex;
  float: right;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  height: 18px;
  margin: 3px 0 0 8px;
  color: var(--v5-ink-3);
  white-space: nowrap;
  line-height: 18px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.nx-conv-right .nx-conv-bubble-meta { color: var(--nx-chat-out-meta); }
.nx-conv-bubble-meta--retry { height: 44px; margin-top: 0; margin-bottom: -4px; }
.nx-conv-receipt {
  display: grid; place-items:center;
  flex: 0 0 17px; width:17px; height:18px;
  --nx-message-status-color: var(--nx-chat-out-meta);
  --nx-message-status-read: var(--nx-chat-out-ink);
  --nx-message-status-failed: #FFD6D1;
  --nx-message-status-unknown: #FFEDB0;
}
.nx-conv-receipt--action { flex-basis:44px; width:44px; height:44px; margin-right:-6px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.nx-conv-receipt--action:active { opacity:.65; }
.nx-conv-recovery-actions { padding:8px 16px calc(env(safe-area-inset-bottom) + 22px); }
.nx-conv-bubble-line { display:flex; align-items:flex-end; width:100%; min-width:0; }
.nx-conv-bubble-line--right { justify-content:flex-end; }
.nx-conv-enter-right { animation:nx-conv-enter-right 180ms linear both; }
.nx-conv-enter-left { animation:nx-conv-enter-left 180ms linear both; }
@keyframes nx-conv-enter-right { from { opacity:0; transform:translateX(12px) scale(.98); } to { opacity:1; transform:translateX(0) scale(1); } }
@keyframes nx-conv-enter-left { from { opacity:0; transform:translateX(-12px) scale(.98); } to { opacity:1; transform:translateX(0) scale(1); } }
@media(prefers-reduced-motion:reduce) { .nx-conv-enter-left,.nx-conv-enter-right { animation:none; transform:none; opacity:1; } }
.nx-conv-typing {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--v5-surface-2);
}
.nx-conv-typing-dots {
  display: flex;
  gap: 4px;
}
.nx-conv-typing-label {
  font-size: 12px;
  line-height: 1.4;
  color: var(--v5-ink-3);
}
.nx-conv-typing-dots view {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--v5-ink-3);
  animation: nx-typing-blink 1.2s ease-in-out infinite;
}
.nx-conv-typing-dots view:nth-child(2) {
  animation-delay: 0.15s;
}
.nx-conv-typing-dots view:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes nx-typing-blink {
  0%,
  60%,
  100% {
    opacity: 0.25;
  }
  30% {
    opacity: 1;
  }
}
.nx-conv-chips {
  border-top: 1px solid var(--v5-border);
  white-space: nowrap;
}
.nx-conv-chips-inner {
  display: inline-flex;
  gap: 6px;
  padding: 8px 12px;
}
.nx-conv-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  min-height: 44px;
  border-radius: 999px;
  background: transparent;
  flex-shrink: 0; /* keep chips at natural width so scroll-x overflows instead of squashing */
}
.nx-conv-chip-emoji {
  font-size: 12px;
}
.nx-conv-chip-t {
  color: var(--v5-ink-2);
  font-family: var(--font-v5);
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap; /* never wrap the label; long labels scroll horizontally */
}
.nx-conv-composer {
  position: absolute; bottom: 0; left: 0; right: 0; z-index: 2;
  pointer-events: none;
  padding-bottom: calc(env(safe-area-inset-bottom) + 22px);
  background: transparent;
}
.nx-conv-composer > * { pointer-events: auto; }
.nx-conv-policy-retry { min-height:44px; display:flex; align-items:center; justify-content:center; padding:0 16px; color:var(--v5-ink-3); font:600 13px/20px var(--font-v5); }
.nx-conv-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 0 12px 8px;
  --v5-liquid-tint: rgba(40,43,42,.46);
}
:global([data-theme="light"] .nx-conv-input-row) { --v5-liquid-tint: rgba(255,255,255,.58); }
.nx-conv-compose-field {
  position: relative; display: flex; align-items: flex-end;
  gap: 6px; flex: 1; min-width: 0; padding: 5px 5px 5px 14px;
  border: 1px solid transparent; border-radius: 25px;
  background: transparent;
  --v5-liquid-tint: rgba(40,43,42,.46);
  --v5-liquid-shadow: inset 0 1px 1px rgba(255,255,255,.1);
}
.nx-conv-compose-field > :not(.nx-liquid-glass) { position: relative; }
.nx-conv-compose-content { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.nx-conv-compose-field > :deep(.nx-liquid-glass[data-glass-strategy="frosted"]) { -webkit-backdrop-filter: blur(24px) saturate(135%); backdrop-filter: blur(24px) saturate(135%); }
.nx-conv-compose-field::before, .nx-conv-compose-field::after {
  content: ''; position: absolute; z-index: 1; inset: -1px 12px auto; height: 22px;
  border-radius: inherit; pointer-events: none; opacity: var(--nx-rim-strength, 0);
  background: radial-gradient(ellipse var(--nx-rim-width, 60%) 85% at var(--nx-rim-x, 50%) 0%, var(--nx-rim-dark, transparent), transparent 72%);
  filter: blur(4px);
}
.nx-conv-compose-field::after { height: 2px; filter: blur(.6px); }
:global([data-theme="light"] .nx-conv-compose-field) { --v5-liquid-tint: rgba(255,255,255,.58); --v5-liquid-shadow: inset 0 1px 1px rgba(255,255,255,.8); }
:global([data-theme="light"] .nx-conv-compose-field::before), :global([data-theme="light"] .nx-conv-compose-field::after) { background: radial-gradient(ellipse var(--nx-rim-width, 60%) 85% at var(--nx-rim-x, 50%) 0%, var(--nx-rim-light, transparent), transparent 72%); }
.nx-conv-compose-field .nx-conv-send { flex-shrink: 0; }
.nx-conv-compose-field :deep(textarea:focus-within),
.nx-conv-compose-field .nx-conv-input:focus-within { outline: none; }
.nx-conv-length { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px 8px; padding:0 0 4px; overflow-wrap:anywhere; color:var(--v5-ink-3); font-size:11px; line-height:16px; }
.nx-conv-length--over { color:var(--v5-danger); }
.nx-conv-closedbar {
  padding: 10px 12px;
  /* mirrors the input row's safe-area lift (it replaces that row) */
  padding-bottom: calc(env(safe-area-inset-bottom) + 22px);
  border-top: 1px solid var(--v5-border);
}
.nx-conv-restart {
  height: 44px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}
.nx-conv-restart-t {
  font-family: var(--font-v5);
  font-weight: 600;
  font-size: 13px;
  color: inherit;
}
.nx-conv-input {
  flex: none;
  min-width: 0;
  width: 100%; min-height: 24px; max-height: min(144px, 34dvh);
  margin: 10px 0; padding: 0;
  background: transparent;
  border: none;
  color: var(--v5-ink);
  font-family: var(--font-v5);
  font-size: 15px; line-height: 24px;
}
.nx-conv-input :deep(.uni-textarea-wrapper), .nx-conv-input :deep(.uni-textarea-textarea) {
  height: 100%;
  min-height: 24px;
  resize: none; scrollbar-width: none;
}
.nx-conv-input-ph {
  color: var(--v5-ink-4);
}
.nx-conv-send {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  position: relative;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.nx-conv-send[aria-disabled="true"] { cursor: default; }
.nx-conv-send-face {
  width: 44px; height: 44px; border-radius: inherit;
  position: relative;
  display: flex; align-items: center; justify-content: center;
  background: transparent; color: var(--v5-ink-3);
  --v5-liquid-shadow: inset 0 0 0 .5px var(--v5-border);
  transition: transform 80ms ease-out, color 120ms ease-out;
}
.nx-conv-send-face > svg { position: relative; z-index: 1; }
/* The send button sits on the already frosted input surface. Reuse that
   sample and keep its own tint/rim; a second backdrop here creates tile seams. */
.nx-conv-compose-field .nx-conv-send-face > :deep(.nx-liquid-glass--frosted) {
  backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
}
.nx-conv-send-plane { transform: rotate(0deg); transform-origin: center; transition: transform 200ms ease-out; }
.nx-conv-send--turning .nx-conv-send-plane { transform: rotate(-25deg); transition-duration: 160ms; }
.nx-conv-send--ready .nx-conv-send-face {
  --v5-liquid-tint: color-mix(in srgb, var(--v5-brand) 82%, transparent);
  --v5-liquid-highlight: rgba(255, 255, 255, .72);
  --v5-liquid-bottom: rgba(0, 0, 0, .38);
  --v5-liquid-shadow: inset 0 1px 2px rgba(255, 255, 255, .32), inset 0 -2px 3px rgba(0, 0, 0, .2);
  color: var(--v5-on-brand);
}
.nx-conv-send--ready .nx-conv-send-face :deep(.nx-liquid-tint) { background-image: linear-gradient(155deg, rgba(255, 255, 255, .26), rgba(255, 255, 255, .04) 44%, transparent 62%, rgba(0, 0, 0, .15)); }
.nx-conv-send--ready .nx-conv-send-face :deep(.nx-liquid-specular) { opacity: .6; }
.nx-conv-send--ready .nx-conv-send-face > :deep(.nx-liquid-glass--frosted) { background-image: linear-gradient(155deg, rgba(255,255,255,.26), rgba(255,255,255,.04) 44%, transparent 62%, rgba(0,0,0,.15)); }
.nx-conv-send--ready .nx-conv-send-face > :deep(.nx-liquid-glass--frosted[data-glass-strategy="solid"]) { background: var(--v5-brand); }
.nx-conv-send[aria-disabled="false"]:active .nx-conv-send-face { transform: scale(.92); }
.nx-conv-send--feedback .nx-conv-send-face { animation: nx-conv-send-tap 200ms cubic-bezier(.2,.8,.3,1) both; }
@keyframes nx-conv-send-tap { 0% { transform: scale(1); } 35% { transform: scale(.9); } 100% { transform: scale(1); } }
.message-family .nx-conv-send, .message-family .nx-conv-attach-trigger { width: 44px; padding: 0; flex-shrink: 0; }
.message-family .nx-conv-receipt[role="button"]:focus-visible { outline-offset: -3px; border-radius: 8px; }
.message-family .nx-conv-cta-row { margin: 0 12px 10px; padding: 0 16px; }
.message-family .nx-conv-queue-action, .message-family .nx-conv-chip { padding-inline: 16px; }
.nx-conv-thread .nx-conv-cta-row, .nx-conv-thread .nx-conv-chip { --v5-liquid-shadow: inset 0 1px 0 var(--v5-border); }
.nx-conv-queue-actions { flex-wrap: wrap; }
.nx-conv-attachment-actions { gap: 8px; margin-top: 8px; }
.nx-conv-image-caption { overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) {
  .nx-conv-send .nx-conv-send-face,
  .nx-conv-send[aria-disabled="false"]:active .nx-conv-send-face { transition: none; animation: none; transform: none; }
  .nx-conv-send .nx-conv-send-plane,
  .nx-conv-send--turning .nx-conv-send-plane { transition: none; transform: none; }
  .nx-conv-typing-dots view { animation: none; opacity: .65; }
}
</style>

<style src="@/styles/message-family.css"></style>
