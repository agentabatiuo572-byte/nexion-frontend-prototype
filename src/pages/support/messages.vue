<!--
  Conversation center — full-screen unified support inbox. Left vertical rail
  switches customer-service category (Advisor / Support / Nova AI); the right column
  lists that category's conversations. Tapping a row opens the full-screen chat page.

  The "ai" category is virtual: its single row is synthesised from the nova store
  (Nova's transcript + unread), so the existing proactive push channels keep feeding
  it untouched. Advisor / Support rows come from the conversations store. Wrapped in
  <AppChassis active="me">. Bare text in <text> (P-026); stable nx-conv-* selectors.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 32px">
      <SubPageHeader back="/pages/me/me" :title="t.conversations.title" />

      <view class="nx-conv-center">
        <!-- Left type rail -->
        <view class="nx-conv-rail">
          <view
            v-for="ty in TYPES"
            :key="ty.key"
            class="nx-conv-rail-item active:opacity-80"
            :style="railItemStyle(ty.key, ty.tint)"
            role="button"
            tabindex="0"
            :aria-label="typeLabel(ty.key)"
            @click="selectedType = ty.key"
          >
            <view class="nx-conv-rail-ico" :style="{ color: selectedType === ty.key ? ty.tint : 'var(--v5-ink-3)' }">
              <view v-html="ty.icon" />
              <view v-if="typeUnread(ty.key) > 0" class="nx-conv-rail-dot" />
            </view>
            <text class="nx-conv-rail-label" :style="{ color: selectedType === ty.key ? ty.tint : 'var(--v5-ink-3)' }">{{ typeLabel(ty.key) }}</text>
          </view>
        </view>

        <!-- Right conversation list -->
        <view class="nx-conv-listcol">
          <!-- A new turn opens a composer first. The authenticated user's text is the
               first durable timeline entry; this surface never invents an opening. -->
          <view
            v-if="selectedType === 'support' && rows.length > 0 && !hasActiveSupport"
            class="nx-conv-contact active:opacity-80"
            role="button"
            tabindex="0"
            :aria-label="t.conversations.contactSupport"
            @click="onStartConversation('support')"
          >
            <view class="nx-conv-contact-ico" aria-hidden="true"><view v-html="SUPPORT_ICON" /></view>
            <text class="nx-conv-contact-t">{{ t.conversations.contactSupport }}</text>
          </view>

          <EmptyState v-if="rows.length === 0" kind="empty-list" :title="t.empty.messagesTitle" :desc="emptyHint" :cta-label="startConversationLabel" emphasis compact @cta="onStartConversation" />
          <view
            v-for="r in rows"
            :key="r.id"
            class="nx-conv-row active:opacity-80"
            role="button"
            tabindex="0"
            :aria-label="r.name"
            @click="openRow(r)"
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
                <view v-if="r.unread > 0" class="nx-conv-unread"><text class="nx-conv-unread-t">{{ r.unread > 9 ? "9+" : String(r.unread) }}</text></view>
              </view>
            </view>
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
import NovaAvatar from "@/components/nova/nova-avatar.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { useConversations } from "@/store/conversations";
import { useNova } from "@/store/nova";
import type { ConversationType, ConvMessage } from "@/domain/support";
import { remoteApiEnabled } from "@/api/runtime";
import { useApp } from "@/store/app";

const t = useT();
const convStore = useConversations();
const nova = useNova();
const app = useApp();

const selectedType = ref<ConversationType>("advisor");

// Entering the inbox is a lazy timeout checkpoint (chat entry and session start
// sweep too): stale-active support sessions flip to closed here (real backend
// closes server-side and pushes the status).
onShow(async () => {
  if (remoteApiEnabled) nova.bindRemoteAccount(app.accountKey);
  try { await convStore.refresh(); } catch { /* honest empty state is rendered */ }
});

// Contact-support entry shows only when no live session exists.
const hasActiveSupport = computed(() =>
  convStore.byType("support").some((c) => c.sessionStatus === "active"),
);

function onStartConversation(type?: Exclude<ConversationType, "ai">) {
  const target = type ?? (selectedType.value === "advisor" || selectedType.value === "support" ? selectedType.value : null);
  if (!target) return;
  navTo("/pages/support/chat?start=" + target);
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
  available.push({ key: "ai", tint: "var(--v5-brand-2)", icon: AI_ICON });
  return available;
});

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

function cleanPreview(s: string): string {
  return s.replace(/\*\*/g, "").replace(/\s*\n+\s*/g, " ").trim();
}

function msgText(m: ConvMessage, _name: string): string { return m.text; }

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
    return {
      id: c.id,
      name: displayAgentName(c.agentName),
      preview: typing ? t.value.conversations.agentTyping : last ? cleanPreview(msgText(last, c.agentName)) : cleanPreview(c.lastMessage) || t.value.conversations[c.roleKey],
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
  selectedType.value === "support"
    ? t.value.conversations.listEmptySupport
    : t.value.conversations.listEmptyAdvisor,
);
const startConversationLabel = computed(() => t.value.conversations.startConversation);

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
    color: tint,
    background: `color-mix(in srgb, ${tint} 14%, transparent)`,
  };
}
</script>

<style scoped>
.nx-conv-center {
  display: flex;
  gap: 0;
  /* No top padding — the sub-page header already supplies the 24px header→content gap. */
  padding: 0;
}
.nx-conv-rail {
  width: 76px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 8px 8px 10px;
  border-right: 1px solid var(--v5-border);
}
.nx-conv-rail-item {
  /* layout supplied inline (active tint bg) */
}
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  margin: 10px 16px 4px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--v5-tech-cyan) 12%, transparent);
  color: var(--v5-tech-cyan);
}
.nx-conv-contact-ico {
  display: grid;
  place-items: center;
}
.nx-conv-contact-t {
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-tech-cyan);
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
  padding: 12px 16px;
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
  font-size: 13px;
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
  background: var(--v5-brand-2);
  display: grid;
  place-items: center;
}
.nx-conv-unread-t {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-v5);
  color: var(--v5-on-brand-2);
  line-height: 1;
}
</style>
