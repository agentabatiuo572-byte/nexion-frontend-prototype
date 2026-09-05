<!--
  QuickActionRow — ZONE 2 four-up quick links (ported from mission-control.tsx
  QuickActionRow + QuickChip). Stake / Genesis / Missions / Daily, each a tappable
  chip with a smooth linear (lucide-style) icon + label + live sub-stat.
  Icon stroke follows the chip tone accent token (no hardcoded hex).
-->
<template>
  <view class="grid grid-cols-4 gap-2">
    <view
      v-for="c in chips"
      :key="c.href"
      class="text-center active:opacity-70"
      :style="chipStyle(c.tone)"
      @click="go(c.href)"
    >
      <view class="grid place-items-center" style="height: 24px">
        <!-- 质押 — gem (lucide) -->
        <svg v-if="c.icon === 'gem'" width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="iconColor(c.tone)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 3h12l4 6-10 13L2 9Z" />
          <path d="M11 3 8 9l4 13 4-13-3-6" />
          <path d="M2 9h20" />
        </svg>
        <!-- 创世 — crown (lucide) -->
        <svg v-else-if="c.icon === 'crown'" width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="iconColor(c.tone)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" />
          <path d="M5 20h14" />
        </svg>
        <!-- 任务 — target (lucide) -->
        <svg v-else-if="c.icon === 'target'" width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="iconColor(c.tone)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
        <!-- 签到 — flame (lucide) -->
        <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="iconColor(c.tone)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      </view>
      <text class="block mt-1" style="font-family: var(--font-v5); font-weight: 600; font-size: 12px; color: var(--v5-ink)">{{ c.label }}</text>
      <text class="block font-mono-tabular" :style="{ fontSize: '12px', color: iconColor(c.tone), marginTop: '1px' }">{{ c.sub }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useNexFaucet } from "@/store/nex-faucet";
import { useGenesis } from "@/store/genesis";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";

const t = useT();
const faucet = useNexFaucet();
const genesis = useGenesis();
// 🔴 首页快捷入口的「剩 N 席」也是名额紧迫文案(独立验收 P2-14):创世页与商城卡都关了,
//   这里没关,关闭态下首页仍在催「仅剩 153 席」。判据走同一个 composable,不另写。
// 🔴 阻断说明走 blockText **唯一出口**(独立验收 P1-3):上一版这里写死 `.default`,
//   把 5 档阻断塌缩成一句「市场暂未开放」—— 售罄时首页说「暂未开放」、创世页说「已售罄」,
//   同刻互相矛盾且首页是事实错误。售罄档落 `ctaSoldOut`(blockText 只管三档阻断说明)。
const { showUrgency: genesisUrgencyOk, blockText: genesisBlockText } = useGenesisSaleGate();

const chips = computed(() => [
  { href: "/pages/staking/staking", icon: "gem", label: t.value.home.quickStake, sub: t.value.home.quickStakeApy, tone: "brand" as const },
  { href: "/pages/genesis/genesis", icon: "crown", label: t.value.home.quickGenesisLabel, sub: genesisUrgencyOk.value ? fmt(t.value.home.quickGenesisLeft, { n: genesis.totalSlots - genesis.soldSlots }) : (genesisBlockText.value ?? t.value.genesis.ctaSoldOut), tone: "warm" as const },
  { href: "/pages/missions/missions", icon: "target", label: t.value.home.quickMissions, sub: t.value.home.quickMissionsActive, tone: "brand" as const },
  { href: "/pages/daily/daily", icon: "flame", label: t.value.home.quickDaily, sub: fmt(t.value.home.quickDailyStreak, { n: faucet.signInStreak }), tone: "warm" as const },
]);

function iconColor(tone: "brand" | "warm"): string {
  return tone === "warm" ? "var(--v5-brand-2)" : "var(--v5-brand)";
}
function chipStyle(tone: "brand" | "warm"): CSSProperties {
  const accent = tone === "warm" ? "var(--v5-brand-2)" : "var(--v5-brand)";
  return {
    padding: "10px 8px",
    background: `color-mix(in srgb, ${accent} 14%, var(--v5-surface))`,
    borderRadius: "12px",
  };
}
function go(href: string) {
  uni.navigateTo({ url: href, fail: () => {} });
}
</script>
