<!--
  Conversation management — horizontal category selection followed by a flat
  list of existing conversations. Tapping a row opens the full-screen chat page.

  The "ai" category is virtual: its single row is synthesised from the nova store
  (Nova's transcript + unread), so the existing proactive push channels keep feeding
  it untouched. Advisor / Support rows come from the conversations store. Wrapped in
  <AppChassis active="me">. Bare text in <text> (P-026); stable nx-conv-* selectors.
-->
<template>
  <AppChassis active="me">
    <view class="message-family" style="padding-bottom: 32px">
      <SubPageHeader back="/pages/me/me" :title="t.conversations.title" />

      <view class="nx-conv-center">
        <GlassSegments v-model="selectedType" :options="typeOptions" class="nx-conv-rail" :label="t.conversations.typeGroupLabel" />

        <!-- Conversation list -->
        <view class="nx-conv-listcol">
          <view
            v-if="convStore.categoryAvailabilityStatus === 'loading' && TYPES.length === 0 && !convStore.error"
            class="nx-conv-category-loading"
            role="status"
            aria-live="polite"
          >
            <text>{{ t.help.loadingMore }}</text>
          </view>
          <template v-else>
          <view v-if="remoteApiEnabled && selectedType !== 'ai' && convStore.realtimeFallback" class="nx-conv-refresh-warning" role="status" aria-live="polite">
            <text class="nx-conv-refresh-warning__text">{{ t.conversations.realtimeFallback }}</text>
            <view role="button" tabindex="0" class="nx-conv-refresh-warning__retry family-control" @click="retryConversations"  @keydown.enter.prevent="retryConversations" @keydown.space.prevent="retryConversations">
              <LiquidGlass :radius="24" />
              <text>{{ t.conversations.retry }}</text>
            </view>
          </view>
          <view v-if="remoteApiEnabled && selectedType !== 'ai' && convStore.advisorError" class="nx-conv-refresh-warning" role="alert">
            <text class="nx-conv-refresh-warning__text">{{ t.conversations.image.advisorUnavailable }}</text>
            <view role="button" tabindex="0" class="nx-conv-refresh-warning__retry family-control" :aria-label="t.conversations.retry"
              @click="convStore.refreshAdvisor()"  @keydown.enter.prevent="convStore.refreshAdvisor()" @keydown.space.prevent="convStore.refreshAdvisor()">
              <LiquidGlass :radius="24" />
              <text>{{ t.conversations.retry }}</text>
            </view>
          </view>
          <!-- A new turn opens a composer first. The authenticated user's text is the
               first durable timeline entry; this surface never invents an opening. -->
          <view
            v-if="canStartConversation"
            class="nx-conv-contact family-control active:opacity-80"
            :class="{ 'nx-conv-contact--advisor': selectedType === 'advisor' }"
            role="button"
            tabindex="0"
            :aria-label="contactLabel"
            @click="onStartConversation()"

            @keydown.enter.prevent="onStartConversation()" @keydown.space.prevent="onStartConversation()"
          >
              <LiquidGlass :radius="24" />
            <view class="nx-conv-contact-ico" aria-hidden="true"><view v-html="selectedType === 'advisor' ? ADVISOR_ICON : SUPPORT_ICON" /></view>
            <text class="nx-conv-contact-t">{{ contactLabel }}</text>
          </view>

          <view
            v-if="(convStore.error || convStore.categoryAvailabilityStatus === 'failed') && rows.length > 0"
            class="nx-conv-refresh-warning"
          >
            <text class="nx-conv-refresh-warning__text">{{ t.conversations.staleSnapshot }}</text>
            <view role="button" tabindex="0" class="nx-conv-refresh-warning__retry family-control" @click="retryConversations">
              <LiquidGlass :radius="24" />
              <text>{{ t.conversations.retry }}</text>
            </view>
          </view>
          <view v-if="(convStore.error || convStore.categoryAvailabilityStatus === 'failed') && rows.length === 0" class="nx-conv-retry-state">
            <EmptyState kind="recoverable-error" :title="t.conversations.loadError" :desc="t.conversations.loadErrorDesc" compact />
            <view class="family-control" role="button" tabindex="0" :aria-label="t.conversations.retry" @click="retryConversations"><LiquidGlass :radius="24" /><text>{{ t.conversations.retry }}</text></view>
          </view>
          <EmptyState
            v-else-if="convStore.categoryAvailabilityStatus === 'ready' && TYPES.length === 0"
            kind="empty-list"
            :title="t.conversations.categoryDisabled"
            compact
          />
          <EmptyState v-else-if="rows.length === 0" kind="empty-list" :title="t.empty.messagesTitle" :desc="emptyHint" compact />
          <text v-if="removeError" class="nx-conv-remove-error" role="alert">{{ removeError }}</text>
          <view
            v-for="r in rows"
            :key="r.id"
            class="nx-conv-rowgroup"
          >
          <view
            class="nx-conv-row active:opacity-80"
            role="button"
            tabindex="0"
            :aria-label="r.isAi ? t.conversations.openAiSession : r.name"
            @click="openRow(r)"

            @keydown.enter.prevent="openRow(r)" @keydown.space.prevent="openRow(r)"
          >
            <NovaAvatar v-if="r.isAi" :size="44" />
            <view v-else class="nx-conv-ava" :style="avaStyle(r.tint)">
              <view v-html="r.avatarIcon" />
            </view>
            <view class="nx-conv-rowmeta">
              <view class="nx-conv-rowtop">
                <text class="nx-conv-rowname">{{ r.name }}</text>
                <text v-if="r.time" class="nx-conv-rowtime">{{ r.time }}</text>
              </view>
              <view class="nx-conv-rowbot">
                <text class="nx-conv-rowprev" :style="r.typing ? { color: r.tint } : undefined">{{ r.preview }}</text>
                <view v-if="r.unread > 0" class="nx-conv-unread"><text class="nx-conv-unread-t">{{ formatUnreadBadge(r.unread) }}</text></view>
              </view>
            </view>
          </view>
          <view v-if="!r.isAi && convStore.dismissalAvailable" class="nx-conv-rowactions">
            <view role="button" tabindex="0" class="nx-conv-remove family-control"
              :aria-label="t.conversations.removeFromList + ' · ' + r.name" :aria-disabled="convStore.dismissingIds[r.id] === true"
              @click="removeRow(r)"  @keydown.enter.prevent="removeRow(r)" @keydown.space.prevent="removeRow(r)">
              <LiquidGlass :radius="24" />
              <text>{{ convStore.dismissingIds[r.id] ? t.conversations.removing : t.conversations.removeFromList }}</text>
            </view>
          </view>
          </view>
          <text v-if="selectedType !== 'ai' && rows.length > 0 && convStore.dismissalAvailable" class="nx-conv-remove-hint">{{ t.conversations.removeHint }}</text>
          </template>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import LiquidGlass from "@/components/liquid-glass.vue";
import NovaAvatar from "@/components/nova/nova-avatar.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { navTo } from "@/lib/route";
import { useConversations } from "@/store/conversations";
import { useNova } from "@/store/nova";
import type { Conversation, ConversationType, ConvMessage } from "@/domain/support";
import { novaAiApi, remoteApiEnabled } from "@/api/runtime";
import { NOVA_SUPPORT_VISIBLE } from "@/lib/nova-visibility";
import { useApp } from "@/store/app";
import { registerActivePageRefresh } from "@/lib/active-page-refresh";
import { formatUnreadBadge } from "@/lib/unread-badge";

const t = useT();
const convStore = useConversations();
const nova = useNova();
const app = useApp();

const selectedType = ref<ConversationType>("advisor");
const removeError = ref("");
let inboxVisible = false;
watch(() => [app.accountKey, app.accountBindingEpoch], () => {
  removeError.value = "";
  // Account binding invalidates in-flight store reads. A visible page must start
  // replacements after the synchronous account-scoped stores have been rebound.
  if (inboxVisible) void refreshInbox();
});

// Entering the inbox is a lazy timeout checkpoint (chat entry and session start
// sweep too): stale-active support sessions flip to closed here (real backend
// closes server-side and pushes the status).
async function refreshInbox(): Promise<void> {
  if (!inboxVisible) return;
  const tasks: Promise<unknown>[] = [convStore.refresh(), convStore.refreshCategories()];
  if (remoteApiEnabled) tasks.push(convStore.refreshAdvisor());
  if (NOVA_SUPPORT_VISIBLE && remoteApiEnabled) {
    tasks.push(nova.ensureRemoteHistory(app.accountKey, () => novaAiApi.history()));
  }
  await Promise.allSettled(tasks);
}

let releaseActiveRefresh = () => {};
onShow(async () => {
  inboxVisible = true;
  releaseActiveRefresh();
  releaseActiveRefresh = registerActivePageRefresh(refreshInbox);
  await refreshInbox();
});
function leaveInbox() {
  inboxVisible = false;
  releaseActiveRefresh();
}
onHide(leaveInbox);
onUnmounted(leaveInbox);

function retryConversations() {
  if (convStore.realtimeFallback) {
    convStore.stopRealtime();
    convStore.startRealtime();
  }
  void refreshInbox();
}

// Both human categories expose the same contact path, including a brand-new inbox.
const canStartConversation = computed(() =>
  selectedType.value !== "ai"
    && ((!convStore.error && convStore.categoryEnabled(selectedType.value))
      || convStore.conversations.some(c => c.type === selectedType.value && (c.sessionStatus === "active" || c.status === "transferred")))
    && !convStore.byType(selectedType.value).some((c) => c.sessionStatus === "active" || c.status === "transferred"),
);

function onStartConversation(type?: Exclude<ConversationType, "ai">) {
  const target = type ?? (selectedType.value === "advisor" || selectedType.value === "support" ? selectedType.value : null);
  if (!target) return;
  const ongoing = convStore.conversations.find(c => c.type === target && (c.sessionStatus === "active" || c.status === "transferred"));
  if (ongoing) { navTo("/pages/support/chat?cid=" + encodeURIComponent(ongoing.id)); return; }
  if (!convStore.categoryEnabled(target)) return;
  navTo("/pages/support/chat?start=" + target);
}

async function removeRow(r: Row) {
  if (r.isAi || convStore.dismissingIds[r.id]) return;
  const accountEpoch = app.accountBindingEpoch;
  removeError.value = "";
  try { await convStore.dismissConversation(r.id); }
  catch { if (accountEpoch === app.accountBindingEpoch) removeError.value = t.value.conversations.removeFailed; }
}

// Inline category icons (stroke=currentColor → tinted via container `color`).
const ADVISOR_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" /><path d="M6 21a6 6 0 0 1 12 0" /></svg>`;
const SUPPORT_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 16a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /></svg>`;
const AI_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.8 3.2 11 7l3.8 1.2L11 9.4 9.8 13 8.6 9.4 4.8 8.2 8.6 7z" /><path d="M17.5 13.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z" /></svg>`;

const TYPES = computed<{ key: ConversationType; tint: string; icon: string }[]>(() => {
  const available: { key: ConversationType; tint: string; icon: string }[] = [
    { key: "advisor", tint: "var(--v5-brand)", icon: ADVISOR_ICON },
    { key: "support", tint: "var(--v5-tech-cyan)", icon: SUPPORT_ICON },
  ];
  if (NOVA_SUPPORT_VISIBLE) available.push({ key: "ai", tint: "var(--v5-brand-2)", icon: AI_ICON });
  return available.filter((row) => convStore.categoryReadable(row.key));
});

watch(TYPES, (available) => {
  if (!available.some((row) => row.key === selectedType.value) && available[0]) selectedType.value = available[0].key;
}, { immediate: true });

interface Row {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
  isAi: boolean;
  /** Agent is typing right now → preview swaps to the live "typing…" hint. */
  typing: boolean;
  tint: string;
  avatarIcon: string;
}

function typeLabel(key: ConversationType): string {
  const c = t.value.conversations;
  return key === "ai" ? c.typeAi : key === "advisor" ? c.typeAdvisor : c.typeSupport;
}

function typeUnread(key: ConversationType): number {
  if (key === "ai") return nova.unread;
  return convStore.byType(key).reduce((sum, c) => sum + c.unread, 0);
}

// Rail tabs are one roving-tabindex group: arrows move the selection and carry the
// focus ring with it (same idiom as team/leaderboard.vue and team/unilevel.vue).
function selectType(key: ConversationType) {
  selectedType.value = key;
}
function moveType(delta: -1 | 1) {
  const keys = TYPES.value.map((row) => row.key);
  const currentIndex = keys.indexOf(selectedType.value);
  if (currentIndex < 0) return;
  selectedType.value = keys[(currentIndex + delta + keys.length) % keys.length];
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>(".nx-conv-rail-tab[tabindex='0']")?.focus();
  });
}

function cleanPreview(s: string): string {
  return s.replace(/\*\*/g, "").replace(/\s*\n+\s*/g, " ").trim();
}

function msgText(m: ConvMessage, c: Conversation): string {
  if (m.kind === "IMAGE" && !m.text) return t.value.conversations.image.message;
  return m.sender === "system" && c.lastMessageKind === "IDLE_TIMEOUT_CLOSE"
    ? localizedIdleClose(m.text, t.value.conversations) ?? m.text : m.text;
}

function displayAgentName(name: string): string {
  const normalized = name.trim();
  return normalized && normalized.toLowerCase() !== "unassigned"
    ? normalized
    : t.value.conversations.unassignedAgent;
}

function relTime(ts: number): string {
  const ms = Date.now() - ts;
  const c = t.value.conversations;
  if (ms < 60_000) return c.tJustNow;
  if (ms < 3_600_000) return fmt(c.tMinAgo, { n: Math.floor(ms / 60_000) });
  if (ms < 86_400_000) return fmt(c.tHrAgo, { n: Math.floor(ms / 3_600_000) });
  return fmt(c.tDayAgo, { n: Math.floor(ms / 86_400_000) });
}

const rows = computed<Row[]>(() => {
  const sel = selectedType.value;
  if (!convStore.categoryReadable(sel)) return [];
  if (sel === "ai") {
    const msgs = nova.messages;
    const last = msgs.length ? msgs[msgs.length - 1] : null;
    return [
      {
        id: "ai",
        name: t.value.nova.name,
        preview: nova.typing ? t.value.conversations.agentTyping : last ? cleanPreview(last.text) : t.value.conversations.roleAi,
        time: last ? relTime(last.ts) : "",
        unread: nova.unread,
        isAi: true,
        typing: nova.typing,
        tint: "var(--v5-brand-2)",
        avatarIcon: "",
      },
    ];
  }
  const avatarIcon = sel === "advisor" ? ADVISOR_ICON : SUPPORT_ICON;
  return convStore.byType(sel).map((c) => {
    const last = c.messages.length ? c.messages[c.messages.length - 1] : null;
    const typing = convStore.typingIds[c.id] === true;
    // The server excludes SYSTEM rows from detail history, so the closed header
    // can be newer than the last loaded user/agent message.
    const idleClose = c.status === "closed" && c.lastMessageKind === "IDLE_TIMEOUT_CLOSE" && (!last || c.lastTs > last.ts)
      ? localizedIdleClose(c.lastMessage, t.value.conversations) : null;
    const latestText = idleClose ?? (last && last.ts >= c.lastTs ? msgText(last, c) : c.lastMessage);
    return {
      id: c.id,
      name: remoteApiEnabled && c.type === "advisor" && (c.status === "open" || c.status === "resolved")
        ? convStore.advisorLoading ? t.value.conversations.image.loadingAdvisor
          : convStore.advisorError || !convStore.advisor ? t.value.conversations.image.advisorUnavailable
            : convStore.advisor.assignmentState === "UNBOUND" ? t.value.conversations.image.unassigned
              : convStore.advisor.currentAdvisorName ?? t.value.conversations.image.advisorUnavailable
        : displayAgentName(c.agentName),
      preview: typing ? t.value.conversations.agentTyping : cleanPreview(latestText) || t.value.conversations[c.roleKey],
      time: relTime(c.lastTs),
      unread: c.unread,
      isAi: false,
      typing,
      tint: c.avatarTint,
      avatarIcon,
    };
  });
});

const emptyHint = computed(() =>
  convStore.advisor?.assignmentState === "UNBOUND" && selectedType.value !== "ai"
    ? t.value.conversations.image.unassignedHint
    :
  selectedType.value === "support"
    ? t.value.conversations.listEmptySupport
    : t.value.conversations.listEmptyAdvisor,
);
const contactLabel = computed(() => selectedType.value === "advisor"
  ? t.value.conversations.contactAdvisor : t.value.conversations.contactSupport);

function openRow(r: Row) {
  if (r.isAi) {
    navTo("/pages/support/chat?type=ai");
    return;
  }
  navTo("/pages/support/chat?cid=" + r.id);
}

// ── styles ──
function railItemStyle(key: ConversationType, tint: string): CSSProperties {
  const on = selectedType.value === key;
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "5px",
    minHeight: "64px",
    padding: "10px 4px",
    borderRadius: "14px",
    background: on ? `color-mix(in srgb, ${tint} 12%, transparent)` : "transparent",
  };
}
function avaStyle(tint: string): CSSProperties {
  return {
    width: "44px",
    height: "44px",
    borderRadius: "999px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    color: "var(--v5-ink-2)",
    background: "var(--v5-surface-2)",
  };
}

import GlassSegments from "@/components/glass-segments.vue";
const typeOptions = computed(() => TYPES.value.map(type => ({ value: type.key, label: typeLabel(type.key), icon: type.icon, tint: type.tint, count: formatUnreadBadge(typeUnread(type.key)) || undefined, className: "nx-conv-rail-item" })));
</script>

<style scoped>
.nx-conv-rowactions { display: flex; justify-content: flex-end; padding: 0 16px 4px; }
.nx-conv-remove { min-height: 44px; display: flex; align-items: center; color: var(--v5-ink-3); font-size: 12px; padding: 0 16px; }
.nx-conv-remove[aria-disabled="true"] { opacity: .5; }
.nx-conv-remove-hint, .nx-conv-remove-error { display: block; padding: 12px 16px; color: var(--v5-ink-3); font-size: 12px; line-height: 1.6; }
.nx-conv-remove-error { color: var(--v5-danger, #c44); }
.nx-conv-center {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px;
}
.nx-conv-rail { width: 100%; flex-shrink: 0; box-sizing: border-box; }
.nx-conv-rail :deep(.nx-conv-rail-item) { min-height: 44px; }
.nx-conv-rail-ico {
  position: relative;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
}
.nx-conv-rail-dot {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--v5-brand-2);
  border: 1.5px solid var(--v5-bg);
}
.nx-conv-rail-label {
  font-family: var(--font-v5);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.005em;
}
.nx-conv-listcol {
  flex: 1;
  min-width: 0;
  padding: 4px 0;
}
.nx-conv-contact {
  --contact-tint: var(--v5-tech-cyan);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  margin: 4px 0 12px;
  border-radius: 14px;
  background: transparent;
  color: var(--v5-ink-2);
  width: 100%;
}
.nx-conv-contact--advisor {
  --contact-tint: var(--v5-brand);
}
.nx-conv-contact-ico {
  display: grid;
  place-items: center;
}
.nx-conv-contact-t {
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 600;
  color: inherit;
}

.nx-conv-category-loading {
  min-height: 144px;
  display: grid;
  place-items: center;
  font-size: 13px;
  color: var(--v5-ink-3);
}
.nx-conv-refresh-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--v5-warning-soft);
}
.nx-conv-refresh-warning__text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--v5-ink-3);
}
.nx-conv-refresh-warning__retry {
  min-height: 44px;
  padding: 0 16px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--v5-surface);
  color: var(--v5-ink-2);
  font-size: 12px;
  font-weight: 600;
}
.nx-conv-listempty {
  padding: 40px 20px;
  text-align: center;
}
.nx-conv-listempty-t {
  font-size: 13px;
  color: var(--v5-ink-3);
  line-height: 1.6;
}
.nx-conv-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 20px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--v5-border) 70%, transparent);
}
.nx-conv-ava {
  /* supplied inline (tint) */
}
.nx-conv-rowmeta {
  flex: 1;
  min-width: 0;
}
.nx-conv-rowtop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.nx-conv-rowname {
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.008em;
  color: var(--v5-ink);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nx-conv-rowtime {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--v5-ink-4);
}
.nx-conv-rowbot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 3px;
}
.nx-conv-rowprev {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--v5-ink-3);
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nx-conv-unread {
  flex-shrink: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--v5-brand-soft);
  display: grid;
  place-items: center;
}
.nx-conv-unread-t {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-v5);
  color: var(--v5-brand);
  line-height: 1;
}
.nx-conv-retry-state { text-align: center; padding-bottom: 16px; }
.nx-conv-rowtop { flex-wrap: wrap; }
.nx-conv-rowname { overflow-wrap: anywhere; white-space: normal; }
.nx-conv-refresh-warning { flex-wrap: wrap; }
.nx-conv-refresh-warning__text { flex-basis: 180px; }
</style>

<style src="@/styles/message-family.css"></style>
