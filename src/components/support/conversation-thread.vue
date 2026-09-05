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
  <view class="nx-conv-thread">
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
            <view v-if="m.ctaLabel && m.ctaHref" class="nx-conv-cta-row" @click="onCta(m)">
              <text class="nx-conv-cta-t">{{ m.ctaLabel }}</text>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
            </view>
          </view>
        </view>
        <!-- delivery receipt (user messages only, pre-localised by the page) -->
        <view v-if="m.receipt" class="nx-conv-receipt">
          <text class="nx-conv-receipt-t">{{ m.receipt }}</text>
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
          </view>
        </view>
      </view>
      <view id="nx-conv-end" class="nx-conv-bottom-anchor" />
    </scroll-view>

    <!-- Quick reply chips (AI only) -->
    <scroll-view v-if="quickChips && quickChips.length" scroll-x class="nx-conv-chips" :show-scrollbar="false">
      <view class="nx-conv-chips-inner">
        <view v-for="q in quickChips" :key="q.key" class="nx-conv-chip" @click="emit('chip', q.key)">
          <text class="nx-conv-chip-emoji">{{ q.emoji }}</text>
          <text class="nx-conv-chip-t">{{ q.label }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- Closed session → the input is retired; one CTA restarts with a fresh agent.
         The "why" (timeout notice) is already a system message inside the thread. -->
    <view v-if="closed" class="nx-conv-closedbar">
      <view class="nx-conv-restart active:opacity-80" role="button" tabindex="0" :aria-label="restartLabel" @click="emit('restart')">
        <text class="nx-conv-restart-t">{{ restartLabel }}</text>
      </view>
    </view>

    <!-- Input row -->
    <view v-else class="nx-conv-input-row">
      <input
        class="nx-conv-input"
        :value="draft"
        :placeholder="inputPlaceholder"
        placeholder-class="nx-conv-input-ph"
        confirm-type="send"
        @input="onDraft"
        @confirm="onSend"
      />
      <view class="nx-conv-send" :style="sendStyle" @click="onSend">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="draft.trim() ? 'var(--v5-on-brand)' : 'var(--v5-ink-4)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, type CSSProperties } from "vue";
import type { ThreadMsg, QuickChip } from "./thread-types";

const props = defineProps<{
  messages: ThreadMsg[];
  inputPlaceholder: string;
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
}>();

const emit = defineEmits<{
  /** restore() puts the text back in the input — call it when the send is rejected
      (e.g. rate-limited) so the user's typed message isn't silently swallowed. */
  (e: "send", text: string, restore: () => void): void;
  (e: "chip", key: string): void;
  (e: "cta", href: string, label: string): void;
  (e: "restart"): void;
}>();

const draft = ref("");

function onDraft(e: Event) {
  draft.value = (e as unknown as { detail: { value: string } }).detail.value;
}

function onSend() {
  const text = draft.value.trim();
  if (!text) return;
  draft.value = "";
  emit("send", text, () => {
    draft.value = text;
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
  if (m.tone === "user") return { background: "var(--v5-brand)" };
  return { background: "var(--v5-surface-2)" };
}
function segColor(m: ThreadMsg): string {
  return m.tone === "user" ? "var(--v5-on-brand)" : "var(--v5-ink)";
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
  background: draft.value.trim() ? "var(--v5-brand)" : "var(--v5-surface)", // 输入条自身无底色,按钮贴页面底:原 surface-2 与页面底同色不可辨,改 L1
}));
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
}
.nx-conv-left {
  justify-content: flex-start;
}
.nx-conv-right {
  justify-content: flex-end;
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
  background: var(--v5-surface-2);
}
.nx-conv-typing-dots {
  display: flex;
  gap: 4px;
  padding: 13px 14px;
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
  height: 32px;
  border-radius: 999px;
  background: var(--v5-surface-2);
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
  background: color-mix(in srgb, var(--v5-tech-cyan) 14%, transparent);
}
.nx-conv-restart-t {
  font-family: var(--font-v5);
  font-weight: 600;
  font-size: 13px;
  color: var(--v5-tech-cyan);
}
.nx-conv-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--v5-surface-2);
  border: 1px solid var(--v5-border);
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
</style>
