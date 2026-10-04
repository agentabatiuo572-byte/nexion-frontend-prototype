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
  <view class="nx-conv-thread message-family">
    <!-- Message list. :scroll-into-view drives auto-scroll on App (native); on H5 it
         stays "" and domToBottom() handles it (uni's declarative scroll lands short
         of a freshly-laid-out bubble). -->
    <scroll-view scroll-y class="nx-conv-list" :scroll-into-view="scrollAnchor" :scroll-with-animation="true" :show-scrollbar="false">
      <view v-if="messages.length === 0 && emptyHint" class="nx-conv-empty">
        <text class="nx-conv-empty-t">{{ emptyHint }}</text>
      </view>

      <view v-for="m in messages" :key="m.id" class="nx-conv-msg-row">
        <!-- system notice -->
        <view v-if="m.tone === 'system'" class="nx-conv-sys">
          <text class="nx-conv-sys-t">{{ m.text }}</text>
        </view>
        <!-- chat bubble -->
        <view v-else class="nx-conv-bubble-row" :class="m.side === 'right' ? 'nx-conv-right' : 'nx-conv-left'">
          <view class="nx-conv-bubble" :style="bubbleStyle(m)">
            <view class="nx-conv-bubble-body">
              <view v-if="m.imageSrc" class="nx-conv-image-open" role="button" tabindex="0" :aria-label="imageLabels?.view"
                @click="openPreview(m.imageSrc)" @keydown.enter.prevent="openPreview(m.imageSrc)" @keydown.space.prevent="openPreview(m.imageSrc)">
                <image class="nx-conv-image" :src="m.imageSrc" mode="widthFix" />
                <text class="nx-conv-image-caption">{{ imageLabels?.view }}</text>
              </view>
              <text v-else-if="m.imageLoading" class="nx-conv-image-caption">{{ imageLabels?.loading }}</text>
              <view v-else-if="m.imageError" class="nx-conv-image-open family-control" role="button" tabindex="0" @click="m.imageAttachmentId && emit('retry-image', m.imageAttachmentId)" @keydown.enter.prevent="m.imageAttachmentId && emit('retry-image', m.imageAttachmentId)" @keydown.space.prevent="m.imageAttachmentId && emit('retry-image', m.imageAttachmentId)"><LiquidGlass :radius="22" /><text class="nx-conv-image-caption">{{ imageLabels?.failed }}</text></view>
              <view v-for="(line, li) in formatLines(m.text)" :key="li" class="nx-conv-line">
                <text
                  v-for="(seg, si) in line"
                  :key="si"
                  class="nx-conv-seg"
                  :class="{ 'nx-conv-seg--b': seg.bold }"
                  :style="{ color: segColor(m) }"
                >{{ seg.text }}</text>
                <text v-if="line.length === 0" class="nx-conv-seg">{{ " " }}</text>
              </view>
            </view>
	            <view v-if="m.ctaLabel && m.ctaHref" class="nx-conv-cta-row family-control" role="link" tabindex="0" :aria-label="m.ctaLabel" @click="onCta(m)" @keydown.enter.prevent="onKeyboardActivate($event, () => onCta(m))"><LiquidGlass :radius="22" />
              <text class="nx-conv-cta-t">{{ m.ctaLabel }}</text>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
            </view>
          </view>
          <text v-if="m.meta" class="nx-conv-message-meta">{{ m.meta }}</text>
        </view>
        <!-- delivery receipt (user messages only, pre-localised by the page) -->
        <view v-if="m.receipt && !m.queue" class="nx-conv-receipt" :class="m.side === 'left' ? 'nx-conv-receipt--left' : ''">
          <text class="nx-conv-receipt-t">{{ m.receipt }}</text>
        </view>
        <view v-if="m.queue && queueLabels" class="nx-conv-queue" :data-state="m.queue.state">
          <text class="nx-conv-queue-status" :role="m.queue.state === 'failed' ? 'alert' : 'status'" aria-live="polite">{{ m.queue.label }}</text>
          <view v-if="m.queue.state === 'editing'" class="nx-conv-edit">
            <textarea class="nx-conv-edit-input" :value="edits[m.queue.turnId] ?? m.text" :maxlength="2000" :aria-label="queueLabels.edit" auto-height @input="onEditInput(m.queue.turnId, $event)" />
            <view class="nx-conv-queue-actions">
              <view class="nx-conv-queue-action family-control" role="button" tabindex="0" @click="saveQueueEdit(m)" @keydown.enter.prevent="onKeyboardActivate($event, () => saveQueueEdit(m))" @keydown.space.prevent="onKeyboardActivate($event, () => saveQueueEdit(m))"><LiquidGlass :radius="22" /><text>{{ queueLabels.save }}</text></view>
              <view class="nx-conv-queue-action family-control" role="button" tabindex="0" @click="runQueueAction(m, 'cancel-edit')" @keydown.enter.prevent="onKeyboardActivate($event, () => runQueueAction(m, 'cancel-edit'))" @keydown.space.prevent="onKeyboardActivate($event, () => runQueueAction(m, 'cancel-edit'))"><LiquidGlass :radius="22" /><text>{{ queueLabels.cancelEdit }}</text></view>
            </view>
          </view>
          <view v-else class="nx-conv-queue-actions">
            <view v-if="m.queue.state === 'failed'" class="nx-conv-queue-action family-control" role="button" tabindex="0" @click="runQueueAction(m, 'retry')" @keydown.enter.prevent="onKeyboardActivate($event, () => runQueueAction(m, 'retry'))" @keydown.space.prevent="onKeyboardActivate($event, () => runQueueAction(m, 'retry'))"><LiquidGlass :radius="22" /><text>{{ queueLabels.retry }}</text></view>
            <template v-if="m.queue.state === 'queued' && m.queue.editable">
              <view class="nx-conv-queue-action family-control" role="button" tabindex="0" @click="startEdit(m)" @keydown.enter.prevent="onKeyboardActivate($event, () => startEdit(m))" @keydown.space.prevent="onKeyboardActivate($event, () => startEdit(m))"><LiquidGlass :radius="22" /><text>{{ queueLabels.edit }}</text></view>
              <view class="nx-conv-queue-action family-control" role="button" tabindex="0" @click="runQueueAction(m, 'cancel')" @keydown.enter.prevent="onKeyboardActivate($event, () => runQueueAction(m, 'cancel'))" @keydown.space.prevent="onKeyboardActivate($event, () => runQueueAction(m, 'cancel'))"><LiquidGlass :radius="22" /><text>{{ queueLabels.cancel }}</text></view>
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
    </scroll-view>

    <!-- Quick reply chips (AI only) -->
    <scroll-view v-if="quickChips && quickChips.length" scroll-x class="nx-conv-chips" :show-scrollbar="false">
      <view class="nx-conv-chips-inner">
	        <view v-for="q in quickChips" :key="q.key" class="nx-conv-chip family-control" role="button" tabindex="0" :aria-label="q.label" @click="emit('chip', q.key)" @keydown.enter.prevent="onKeyboardActivate($event, () => emit('chip', q.key))" @keydown.space.prevent="onKeyboardActivate($event, () => emit('chip', q.key))"><LiquidGlass :radius="22" />
          <text class="nx-conv-chip-emoji">{{ q.emoji }}</text>
          <text class="nx-conv-chip-t">{{ q.label }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- Closed session → the input is retired; one CTA restarts with a fresh agent.
         The "why" (timeout notice) is already a system message inside the thread. -->
    <view v-if="closed" class="nx-conv-closedbar">
	      <view class="nx-conv-restart active:opacity-80 family-control family-control--primary" role="button" tabindex="0" :aria-label="restartLabel" @click="emit('restart')" @keydown.enter.prevent="onKeyboardActivate($event, () => emit('restart'))" @keydown.space.prevent="onKeyboardActivate($event, () => emit('restart'))"><LiquidGlass :radius="22" tone="selection" />
        <text class="nx-conv-restart-t">{{ restartLabel }}</text>
      </view>
    </view>

    <view v-if="!closed && attachmentDraft" class="nx-conv-attachment" role="status" aria-live="polite">
      <view v-if="attachmentPreviewSrc" class="nx-conv-image-open" role="button" tabindex="0" :aria-label="imageLabels?.view" @click="openPreview(attachmentPreviewSrc)" @keydown.enter.prevent="openPreview(attachmentPreviewSrc)" @keydown.space.prevent="openPreview(attachmentPreviewSrc)"><image class="nx-conv-image" :src="attachmentPreviewSrc" mode="aspectFill" /></view>
      <text>{{ attachmentDraft.label }}</text>
      <view class="nx-conv-attachment-actions">
        <view v-if="attachmentDraft.state === 'failed' && !attachmentDraft.replaceOnly" role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('retry-upload')" @keydown.enter.prevent="emit('retry-upload')" @keydown.space.prevent="emit('retry-upload')"><LiquidGlass :radius="22" /><text>{{ imageLabels?.retryUpload }}</text></view>
        <view v-if="attachmentDraft.state !== 'uploading'" role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('replace-attachment')" @keydown.enter.prevent="emit('replace-attachment')" @keydown.space.prevent="emit('replace-attachment')"><LiquidGlass :radius="22" /><text>{{ imageLabels?.replace }}</text></view>
        <view role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('cancel-attachment')" @keydown.enter.prevent="emit('cancel-attachment')" @keydown.space.prevent="emit('cancel-attachment')"><LiquidGlass :radius="22" /><text>{{ imageLabels?.cancel }}</text></view>
      </view>
    </view>
    <view v-if="!closed && failedSendLabel" class="nx-conv-attachment" role="alert">
      <text>{{ failedSendLabel }}</text>
      <view class="nx-conv-attachment-actions">
        <view v-if="canRetrySend" role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('retry-message')" @keydown.enter.prevent="emit('retry-message')" @keydown.space.prevent="emit('retry-message')"><LiquidGlass :radius="22" /><text>{{ imageLabels?.retrySend }}</text></view>
        <view v-if="canDiscardSend" role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('edit-message')" @keydown.enter.prevent="emit('edit-message')" @keydown.space.prevent="emit('edit-message')"><LiquidGlass :radius="22" /><text>{{ imageLabels?.editSend }}</text></view>
        <view v-if="canDiscardSend" role="button" tabindex="0" class="nx-conv-attachment-action family-control" @click="emit('discard-message')" @keydown.enter.prevent="emit('discard-message')" @keydown.space.prevent="emit('discard-message')"><LiquidGlass :radius="22" /><text>{{ imageLabels?.discard }}</text></view>
      </view>
    </view>
    <!-- Input row -->
    <view v-else-if="!closed" class="nx-conv-input-row">
      <view v-if="imageLabels" class="nx-conv-attach-trigger family-control" role="button" tabindex="0" :aria-label="imageLabels.attach" :aria-disabled="attachDisabled ? 'true' : 'false'" :style="attachDisabled ? { opacity: 0.45 } : undefined" @click="!attachDisabled && emit('attach')" @keydown.enter.prevent="!attachDisabled && emit('attach')" @keydown.space.prevent="!attachDisabled && emit('attach')"><LiquidGlass :radius="22" /><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></view>
      <input
        class="nx-conv-input"
        :value="draft"
        :maxlength="maxInputLength ?? 140"
        :placeholder="inputPlaceholder"
        :aria-label="inputLabel"
        placeholder-class="nx-conv-input-ph"
        confirm-type="send"
        @input="onDraft"
        @blur="emit('typing', false)"
        @confirm="onSend"
      />
	      <view class="nx-conv-send family-control family-control--primary" :style="sendStyle" role="button" tabindex="0" :aria-label="sendLabel" :aria-disabled="!canSend" @click="onSend" @keydown.enter.prevent="onKeyboardActivate($event, onSend)" @keydown.space.prevent="onKeyboardActivate($event, onSend)"><LiquidGlass :radius="22" tone="selection" />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
      </view>
    </view>
    <view v-if="!closed && attachUnavailable" class="nx-conv-image-caption" role="status"><text>{{ attachUnavailable }}</text><view v-if="attachRetry" class="family-control" role="button" tabindex="0" @click="emit('retry-policy')" @keydown.enter.prevent="emit('retry-policy')" @keydown.space.prevent="emit('retry-policy')"><LiquidGlass :radius="22" /><text>{{ imageLabels?.retryPolicy }}</text></view></view>
    <view v-if="previewImage" class="nx-conv-image-overlay" role="dialog" aria-modal="true" :aria-label="imageLabels?.view">
      <view role="button" tabindex="0" class="nx-conv-image-close family-control" @click="closePreview" @keydown.enter.prevent="closePreview" @keydown.space.prevent="closePreview"><LiquidGlass :radius="22" /><text>{{ imageLabels?.close }}</text></view>
      <image :src="previewImage" class="nx-conv-image-full" mode="widthFix" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, type CSSProperties } from "vue";
import LiquidGlass from "@/components/liquid-glass.vue";
import type { ThreadMsg, QuickChip } from "./thread-types";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const props = defineProps<{
  messages: ThreadMsg[];
  inputPlaceholder: string;
  /** 输入框的**名称**(稳定),与 inputPlaceholder(提示,随可用性变)分开。
      见 lib/a11y-field-label.ts 的契约:placeholder 在输入后就消失,不是稳定的名称,
      而这里的 placeholder 还会在 Nova 不可用时换成状态句 —— 名称不能跟着它走。 */
  inputLabel: string;
  sendLabel: string;
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
  (e: "send", text: string, restore: () => void): void;
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

const draft = ref(props.initialDraft ?? "");
const previewImage = ref("");
function openPreview(src: string) {
  // #ifdef APP-PLUS
  uni.previewImage({ current: src, urls: [src], fail: () => { previewImage.value = src; } });
  return;
  // #endif
  previewImage.value = src;
}
function closePreview() { previewImage.value = ""; }
useDialogA11y(computed(() => !!previewImage.value), ".nx-conv-image-overlay", closePreview);
const canSend = computed(() => !props.sendBlocked && (Boolean(draft.value.trim()) || props.attachmentDraft?.state === "ready") && props.attachmentDraft?.state !== "failed" && props.attachmentDraft?.state !== "uploading");
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
  draft.value = (e as unknown as { detail: { value: string } }).detail.value;
  emit("draft-change", draft.value);
  emit("typing", Boolean(draft.value.trim()));
}

function onSend() {
  if (!canSend.value) return;
  const text = draft.value.trim();
  draft.value = "";
  emit("draft-change", "");
  emit("typing", false);
  emit("send", text, () => {
    draft.value = text;
    emit("draft-change", text);
  });
}

function onCta(m: ThreadMsg) {
  if (m.ctaHref) emit("cta", m.ctaHref, m.ctaLabel ?? "");
}

// ── auto-scroll to newest. uni's declarative :scroll-top / :scroll-into-view both
// compute against the pre-layout height, so a freshly-added reply bubble leaves
// them stopping short of the real bottom. On H5 we drive the real overflow node
// directly (scrollTop = scrollHeight), scoped to THIS thread's scroll-view via its
// ref (so a hidden sibling chat instance is never targeted); a delayed second pass
// compensates async bubble layout. On non-H5 (App) we fall back to scroll-into-view
// against the bottom anchor. ──
const scrollAnchor = ref("");
function scrollToEnd() {
  void nextTick(() => {
    // #ifdef H5
    domToBottom();
    setTimeout(domToBottom, 90);
    // #endif
    // #ifndef H5
    scrollAnchor.value = "";
    void nextTick(() => { scrollAnchor.value = "nx-conv-end"; });
    setTimeout(() => { scrollAnchor.value = ""; void nextTick(() => { scrollAnchor.value = "nx-conv-end"; }); }, 90);
    // #endif
  });
}
// #ifdef H5
function domToBottom() {
  // Drive the real overflow node directly. uni renders TWO nested nodes whose class
  // includes "uni-scroll-view" — only the deeper one actually overflows — so we pick
  // the descendant that truly scrolls (scrollHeight > clientHeight) rather than the
  // first class match (which is a non-scrolling wrapper). Every mounted list is
  // pinned to its bottom: only one chat thread is visible at a time, and a hidden
  // keep-alive sibling being scrolled is harmless (it should also open at bottom).
  document.querySelectorAll(".nx-conv-list").forEach((host) => {
    const scroller = [host, ...Array.from(host.querySelectorAll("*"))]
      .find((e) => (e as HTMLElement).scrollHeight - (e as HTMLElement).clientHeight > 4) as HTMLElement | undefined;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
}
// #endif
watch(
  () => [props.messages.length, props.typing, props.revealTick] as const,
  () => {
    scrollToEnd();
  },
);
onMounted(() => {
  scrollToEnd();
});

// ── bubble styling ──
function bubbleStyle(m: ThreadMsg): CSSProperties {
  if (m.tone === "user") return { background: "var(--v5-brand-soft)" };
  return { background: "var(--v5-surface-2)" };
}
function segColor(_m: ThreadMsg): string {
  return "var(--v5-ink)";
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

const sendStyle = computed<CSSProperties>(() => ({
  opacity: canSend.value ? 1 : 0.45,
}));

function onKeyboardActivate(event: KeyboardEvent, action: () => void) {
  if (event.repeat) return;
  action();
}
</script>

<style scoped>
.nx-conv-thread {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.nx-conv-list {
  flex: 1;
  min-height: 0; /* allow the scroll area to shrink so the input row stays visible */
  padding: 16px;
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
  margin-bottom: 12px;
}
.nx-conv-image-open { display: flex; flex-direction: column; gap: 6px; cursor: pointer; }
.nx-conv-image { width: min(220px, 58vw); max-height: 280px; border-radius: 10px; }
.nx-conv-image-caption { color: var(--v5-ink-3); font-size: 12px; line-height: 1.5; }
.nx-conv-right .nx-conv-image-caption { color: var(--v5-ink-2); }
.nx-conv-message-meta { display: block; color: var(--v5-ink-3); font-size: 12px; padding: 4px 3px 0; }
.nx-conv-attachment { margin: 6px 14px; padding: 10px 0; border-top: 1px solid var(--v5-border); color: var(--v5-ink); font-size: 13px; }
.nx-conv-attachment-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.nx-conv-attachment-action { display: flex; align-items: center; min-height: 44px; color: var(--v5-brand); }
.nx-conv-attach-trigger { display: flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; color: var(--v5-ink-2); font-size: 20px; }
.nx-conv-image-overlay { position: fixed; inset: 0; z-index: 800; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; padding: 24px; background: var(--v5-bg); }
.nx-conv-image-close { align-self: flex-end; display: flex; align-items: center; min-height: 44px; color: var(--v5-ink); }
.nx-conv-image-full { max-width: 100%; max-height: 78vh; }

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
.nx-conv-left {
  align-items: flex-start;
}
.nx-conv-right {
  align-items: flex-end;
}
.nx-conv-bubble {
  max-width: 82%;
  border-radius: 18px;
  overflow: hidden;
}
.nx-conv-bubble-body {
  padding: 10px 14px;
}
.nx-conv-line {
  display: block;
  min-height: 1.55em;
}
.nx-conv-seg {
  overflow-wrap: anywhere;
  font-family: var(--font-v5);
  font-size: 13px;
  line-height: 1.55;
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
  height: 1px;
}
.nx-conv-receipt {
  display: flex;
  justify-content: flex-end;
  padding: 3px 4px 0;
}
.nx-conv-receipt-t {
  font-size: 12px;
  color: var(--v5-ink-4);
}
.nx-conv-typing {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--v5-surface-2);
}
.nx-conv-receipt--left { justify-content: flex-start; }
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
.nx-conv-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  /* lift the input clear of the iOS home indicator (P-040 nova pattern) */
  padding-bottom: calc(env(safe-area-inset-bottom) + 22px);
  border-top: 1px solid var(--v5-border);
}
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
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--v5-surface-2);
  border: none;
  color: var(--v5-ink);
  font-family: var(--font-v5);
  font-size: 13px;
}
/* P-048: pin the inner native input height so the visible host == the real target. */
.nx-conv-input :deep(.uni-input-input) {
  height: 100%;
  min-height: 24px;
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
  transition: opacity 0.15s;
}
/* 《08》§2:发送是这个界面的主动作,原先按下去零反馈 */
.nx-conv-send:active {
  opacity: 0.7;
}
.message-family .nx-conv-send, .message-family .nx-conv-attach-trigger { width: 44px; padding: 0; flex-shrink: 0; }
.message-family .nx-conv-cta-row { margin: 0 12px 10px; padding: 0 16px; }
.message-family .nx-conv-queue-action, .message-family .nx-conv-chip { padding-inline: 16px; }
.nx-conv-queue-actions { flex-wrap: wrap; }
.nx-conv-attachment-actions { gap: 8px; margin-top: 8px; }
.nx-conv-image-caption { overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .nx-conv-send { transition: none; } .nx-conv-typing-dots view { animation: none; opacity: .65; } }
</style>

<style src="@/styles/message-family.css"></style>
