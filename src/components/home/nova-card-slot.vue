<!--
  NovaCardSlot — ZONE 3 AI-advisor bridge (ported from mission-control.tsx
  NovaCardSlot + NovaCard). Chat-bubble identity: dominant avatar + speech
  bubble with asymmetric tail + flowing aurora blobs. Hidden when the chassis
  NovaBubble takes over (unread > 0). Taps to open the Nova drawer.
-->
<template>
  <view
    v-if="unread === 0"
    class="block w-full relative active:scale-[0.98] transition"
    style="margin-top: 6px; padding: 2px"
    @click="open"
  >
    <view class="flex items-end gap-2.5">
      <NovaAvatar :size="44" pulse />

      <view class="flex-1 min-w-0 relative overflow-hidden" style="padding: 12px 14px; background: var(--v5-surface); border-radius: 18px 18px 18px 4px">
        <!-- Flowing aurora blobs (clipped by parent overflow-hidden) -->
        <view class="pointer-events-none absolute" :style="blob1" />
        <view class="pointer-events-none absolute" :style="blob2" />
        <view class="pointer-events-none absolute" :style="blob3" />

        <view class="relative" style="z-index: 1">
          <view class="flex items-center gap-1.5" style="font-size: 12px; color: var(--v5-ink-3)">
            <text style="color: var(--v5-brand); font-weight: 600; font-family: var(--font-v5)">{{ t.novaCard.senderName }}</text>
            <text style="color: var(--v5-ink-4)">· {{ t.novaCard.senderRole }}</text>
          </view>
          <view class="mt-1.5" style="font-family: var(--font-v5); font-size: 15px; line-height: 1.45; color: var(--v5-ink); font-weight: 500">
            <text>{{ msgBefore }}</text><text class="tabular-nums" style="color: var(--v5-brand); font-weight: 600">{{ yieldPct }}</text><text>{{ msgAfter }}</text>
          </view>
          <view class="mt-2 inline-flex items-center gap-1" style="font-family: var(--font-v5); font-size: 13px; font-weight: 500; color: var(--v5-brand)">
            <text style="color: var(--v5-brand)">{{ t.novaCard.openChatCta }}</text>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { useNova } from "@/store/nova";
import { navTo } from "@/lib/route";
import NovaAvatar from "@/components/nova/nova-avatar.vue";

const t = useT();
const nova = useNova();

const unread = computed(() => nova.unread);
const yieldPct = "0.16";

const msgBefore = computed(() => {
  const tpl = t.value.novaCard.messageWithPercent;
  const idx = tpl.indexOf("{pct}");
  return idx >= 0 ? tpl.slice(0, idx) : tpl;
});
const msgAfter = computed(() => {
  const tpl = t.value.novaCard.messageWithPercent;
  const idx = tpl.indexOf("{pct}");
  return idx >= 0 ? tpl.slice(idx + 5) : "";
});

function open() {
  navTo("/pages/support/chat?type=ai");
}

const blob1: CSSProperties = { left: "0", top: "0", width: "140px", height: "140px", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklab, var(--v5-brand) 35%, transparent) 0%, transparent 65%)", filter: "blur(14px)", animation: "v5-nova-blob-1 9s ease-in-out infinite" };
const blob2: CSSProperties = { left: "0", top: "0", width: "120px", height: "120px", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklab, var(--v5-brand-2) 30%, transparent) 0%, transparent 65%)", filter: "blur(16px)", animation: "v5-nova-blob-2 12s ease-in-out -3s infinite" };
const blob3: CSSProperties = { left: "0", top: "0", width: "100px", height: "100px", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklab, var(--v5-tech-cyan) 28%, transparent) 0%, transparent 65%)", filter: "blur(14px)", animation: "v5-nova-blob-3 14s ease-in-out -6s infinite" };
</script>
