<template>
  <NxSection :title="t.home.trustSnapshotTitle" :action="t.home.trustSnapshotOpen" class="home-trust" data-home-section="trust" @action="goTrust">
    <view class="home-trust__card" role="link" tabindex="0" @click="goTrust" @keydown.enter.stop.prevent="goTrust">
      <view v-if="profile" class="home-trust__identity">
        <view class="home-trust__mark" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
        </view>
        <view class="home-trust__entity">
          <text class="home-trust__eyebrow">{{ center.operator }}</text>
          <text class="home-trust__name">{{ profile.legalName }}</text>
        </view>
      </view>
      <view class="home-trust__copy">
        <text class="home-trust__headline">{{ center.headline }}</text>
        <text class="home-trust__body">{{ profile ? t.home.trustSnapshotBody : t.home.trustSnapshotUnavailable }}</text>
      </view>
      <!-- The documents response always carries all three registrations; each tag mirrors one of them. -->
      <view v-if="profile" class="home-trust__tags">
        <view class="home-trust__tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/></svg>
          <text>{{ t.home.trustSnapshotIncorporation }}</text>
        </view>
        <view class="home-trust__tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
          <text>{{ t.home.trustSnapshotMsb }}</text>
        </view>
        <view class="home-trust__tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>
          <text>{{ t.home.trustSnapshotEin }}</text>
        </view>
      </view>
      <template v-if="display">
        <view class="home-trust__rule" />
        <view class="home-trust__payout">
          <view class="home-trust__payout-label"><view class="home-trust__dot" aria-hidden="true" /><text>{{ t.home.trustSnapshotPayouts }}</text></view>
          <text class="home-trust__payout-value"><text class="nx-num-metric">{{ formatGroupedAmount(display.paid) }}</text><text class="home-trust__unit">USDT</text></text>
        </view>
      </template>
      <view class="home-trust__pitch">
        <text class="home-trust__slogan">{{ t.home.trustSnapshotSlogan }}</text>
        <text class="home-trust__pitch-note">{{ t.home.trustSnapshotSloganNote }}</text>
      </view>
    </view>
  </NxSection>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { apiClient } from "@/api/runtime";
import { navTo } from "@/lib/route";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { trustCenterCopy } from "@/i18n/trust-center";
import { formatGroupedAmount } from "@/lib/amount-display";
import { useTrustDocuments } from "@/composables/use-trust-documents";
import { createHomeDisplayPlayer, parseHomeDisplayBatch, type homeDisplayAt } from "@/lib/home-display-player";
import { onShow, onHide } from "@/composables/use-tab-page-lifecycle";
import NxSection from "@/components/ui/nx-section.vue";

const t = useT();
const locale = useLocaleStore();
const center = computed(() => trustCenterCopy(locale.code === "zh" || locale.code === "vi" ? locale.code : "en"));
const { documents, status, refresh } = useTrustDocuments();
const profile = computed(() => documents.value?.profile ?? null);
const goTrust = () => navTo("/pages/trust/trust");

// Same published display feed as the intro page and the home on-grid card; it ticks while home is visible.
const display = ref<ReturnType<typeof homeDisplayAt>>(null);
const player = createHomeDisplayPlayer({
  fetch: async () => parseHomeDisplayBatch(await apiClient.request({ path: "/api/config/home-display", authenticated: false })),
  now: () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now(),
  render: next => { display.value = next; },
});
let pageVisible = false;
function syncPlayer() {
  if (pageVisible && (typeof document === "undefined" || !document.hidden)) player.start();
  else player.stop();
}
onShow(() => {
  pageVisible = true;
  syncPlayer();
  if (status.value === "idle" || status.value === "error") void refresh();
});
onHide(() => { pageVisible = false; syncPlayer(); });

onMounted(() => {
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", syncPlayer);
});
onUnmounted(() => {
  player.stop();
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", syncPlayer);
});
</script>

<style scoped>
.home-trust__card { display:flex;flex-direction:column;gap:var(--ui-space-inset);padding:var(--ui-space-inset-hero);border:1px solid var(--v5-border);border-radius:var(--ui-radius-surface);background:var(--v5-surface);color:var(--v5-ink);cursor:pointer; }
.home-trust__card:active { opacity:.85; }
.home-trust__card:focus-visible { outline:2px solid var(--v5-brand);outline-offset:3px; }
.home-trust__identity { display:flex;align-items:center;gap:var(--ui-space-inline); }
.home-trust__mark { width:44px;height:44px;flex:none;display:grid;place-items:center;border-radius:var(--ui-radius-icon);background:color-mix(in srgb,var(--v5-genesis-gold) 14%,transparent);color:var(--v5-genesis-gold); }
.home-trust__entity { display:flex;flex-direction:column;min-width:0; }
.home-trust__eyebrow { font:var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5);color:var(--v5-ink-3); }
.home-trust__name { font:var(--ui-type-list-title-weight) var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5);overflow-wrap:anywhere; }
.home-trust__copy { display:flex;flex-direction:column;gap:4px; }
.home-trust__headline { font:var(--ui-type-card-title-weight) var(--ui-type-card-title)/var(--ui-type-card-title-lh) var(--font-v5); }
.home-trust__body { font:var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5);color:var(--v5-ink-2);text-wrap:balance; }
.home-trust__tags { display:flex;flex-wrap:wrap;gap:8px; }
.home-trust__tag { display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;height:28px;padding:0 8px;border-radius:var(--v5-radius-full);background:color-mix(in srgb,var(--v5-genesis-gold) 12%,transparent);color:var(--v5-genesis-gold);font:var(--ui-type-chip-weight) var(--ui-type-chip)/var(--ui-type-chip-lh) var(--font-v5);white-space:nowrap; }
.home-trust__rule { height:1px;background:var(--v5-border); }
.home-trust__payout { display:flex;align-items:center;justify-content:space-between;gap:var(--ui-space-inline); }
.home-trust__payout-label { display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font:var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5);color:var(--v5-ink-3); }
.home-trust__dot { width:6px;height:6px;border-radius:50%;background:var(--v5-genesis-gold);box-shadow:0 0 0 3px color-mix(in srgb,var(--v5-genesis-gold) 20%,transparent); }
.home-trust__payout-value { font:500 16px/22px var(--font-metric);white-space:nowrap; }
.home-trust__unit { margin-left:4px;font:500 12px/16px var(--font-v5);color:var(--v5-ink-3); }
.home-trust__pitch { display:flex;flex-direction:column;gap:4px;padding:14px 16px;border-radius:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--v5-genesis-gold) 16%,transparent),color-mix(in srgb,var(--v5-genesis-gold) 4%,transparent)); }
.home-trust__slogan { font:var(--ui-type-subheading-weight) var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5);color:var(--v5-genesis-gold-hi);text-wrap:balance; }
.home-trust__pitch-note { font:var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5);color:var(--v5-ink-2);text-wrap:balance; }
@media (max-width: 374px) {
  .home-trust__tags { gap:6px; }
  .home-trust__tag { padding:0 6px; }
}
</style>
