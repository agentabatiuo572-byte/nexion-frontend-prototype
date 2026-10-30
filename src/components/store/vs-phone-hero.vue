<!--
  VsPhoneHero — phone-vs-S1 yield contrast (ported from store/page.tsx
  VsPhoneHeroV5). $0.06/d ↔ 117× more ↔ $7.00/d, with NEX/d sublines. Brand +
  brand-2 radial ambient. Drives the core "117× your phone" conversion hook.
  Both sides are estimate comparisons, so figures use the metric font (DS-27);
  device names and "/d" stay in the interface font.
-->
<template>
  <view class="nx-glass-card relative overflow-hidden" :style="rootStyle">
    <view aria-hidden :style="auroraStyle" />
    <view class="relative grid gap-2.5 items-center" style="grid-template-columns: 1fr auto 1fr">
      <!-- Base device label resolves from DeviceKind at render time (lib/device-copy.ts):
           the stored name is English ("Your phone") and would freeze that locale into
           the card, while the same device reads 「你的手机」 on Home / Earn / inventory. -->
      <view>
        <text class="block" :style="deviceStyle">{{ baseName }}</text>
        <view class="mt-1 tabular-nums whitespace-nowrap overflow-hidden" :aria-label="storefrontUsdFull(authority.phone)" :style="phoneNumStyle">
          <text>{{ storefrontUsd(authority.phone) }}</text><text :style="unitStyle">{{ t.store.vsPerDay }}</text>
        </view>
        <!-- 「/天」后缀恒用弱化色(与本卡美元侧同档 ink-4),不跟数字的强调色走 -->
        <view class="block mt-1 min-w-0 overflow-hidden nx-num-metric whitespace-nowrap" :aria-label="phoneNexFullText" style="font-size: 12px; color: var(--v5-brand); font-weight: 500"><text>{{ phoneNexText }}</text><text :style="subUnitStyle">{{ t.store.vsPerDay }}</text></view>
      </view>
      <!-- Arrow + 117× chip -->
      <view class="flex flex-col items-center px-1" style="gap: 6px">
        <text style="font-size: 15px; color: var(--v5-ink-4); line-height: 1" aria-hidden="true">→</text>
        <text class="whitespace-nowrap nx-num-metric" :style="chipStyle">{{ multiplierText }}</text>
      </view>
      <!-- S1 -->
      <view class="text-right">
        <text class="block" :style="deviceStyle">{{ t.store.ladderS1 }}</text>
        <view class="mt-1 tabular-nums whitespace-nowrap overflow-hidden" :aria-label="storefrontUsdFull(authority.entry)" :style="s1NumStyle">
          <text>{{ storefrontUsd(authority.entry) }}</text><text :style="unitStyle">{{ t.store.vsPerDay }}</text>
        </view>
        <view class="block mt-1 min-w-0 overflow-hidden nx-num-metric whitespace-nowrap" :aria-label="entryNexFullText" style="font-size: 12px; color: var(--v5-brand); font-weight: 500"><text>{{ entryNexText }}</text><text :style="subUnitStyle">{{ t.store.vsPerDay }}</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { storefrontNex, storefrontNexFull, storefrontUsd, storefrontUsdFull, type StoreYieldAuthority } from "@/lib/store-yield-authority";

const t = useT();
const props = defineProps<{ authority: StoreYieldAuthority }>();
const authority = computed(() => props.authority);
const baseName = computed(() => t.value.store.ladderPhone);
const multiplierText = computed(() => props.authority.multiplier === null ? '—' : `${props.authority.multiplier}×`);
const phoneNexText = computed(() => `+${storefrontNex(authority.value.phone)} UVT`);
const entryNexText = computed(() => `+${storefrontNex(authority.value.entry)} UVT`);
const phoneNexFullText = computed(() => `+${storefrontNexFull(authority.value.phone)}${t.value.store.vsPerDay}`);
const entryNexFullText = computed(() => `+${storefrontNexFull(authority.value.entry)}${t.value.store.vsPerDay}`);

const rootStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
  padding: "16px",
};

const deviceStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "var(--ui-type-meta)", lineHeight: "var(--ui-type-meta-lh)", color: "var(--v5-ink-3)" };
const unitStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "var(--ui-type-list-subtitle)", fontWeight: 400, color: "var(--v5-ink-3)" };
const subUnitStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontWeight: 400, color: "var(--v5-ink-3)" };

const auroraStyle: CSSProperties = {
  position: "absolute",
  inset: "-20%",
  background:
    "radial-gradient(40% 50% at 90% 50%, var(--v5-brand-soft) 0%, transparent 60%)," +
    "radial-gradient(40% 50% at 10% 50%, var(--v5-brand-2-soft) 0%, transparent 60%)",
  filter: "blur(12px)",
  opacity: 0.4,
  pointerEvents: "none",
};

const phoneNumStyle: CSSProperties = {
  fontFamily: "var(--font-metric)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 500,
  fontSize: "20px",
  lineHeight: "28px",
  color: "var(--v5-ink-2)",
};

const s1NumStyle: CSSProperties = {
  fontFamily: "var(--font-metric)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 500,
  fontSize: "20px",
  lineHeight: "28px",
  color: "var(--v5-success-ink)",
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: "28px",
  padding: "0 12px",
  boxSizing: "border-box",
  background: "color-mix(in srgb, var(--v5-brand-2) 16%, transparent)",
  color: "var(--v5-brand-2-ink)",
  borderRadius: "999px",
  fontFamily: "var(--font-metric)",
  fontWeight: 500,
  fontSize: "13px",
  lineHeight: "18px",
};


</script>
