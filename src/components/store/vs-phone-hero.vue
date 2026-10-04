<!--
  VsPhoneHero — phone-vs-S1 yield contrast (ported from store/page.tsx
  VsPhoneHeroV5). $0.06/d ↔ 117× more ↔ $7.00/d, with NEX/d sublines. Brand +
  brand-2 radial ambient. Drives the core "117× your phone" conversion hook.
-->
<template>
  <view class="nx-glass-card relative overflow-hidden" :style="rootStyle">
    <view aria-hidden :style="auroraStyle" />
    <view class="relative grid gap-2.5 items-center" style="grid-template-columns: 1fr auto 1fr">
      <!-- Base device label resolves from DeviceKind at render time (lib/device-copy.ts):
           the stored name is English ("Your phone") and would freeze that locale into
           the card, while the same device reads 「你的手机」 on Home / Earn / inventory. -->
      <view>
        <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-4)">{{ baseName }}</text>
        <view class="mt-1 tabular-nums whitespace-nowrap overflow-hidden" :aria-label="storefrontUsdFull(authority.phone)" :style="phoneNumStyle">
          <text>{{ storefrontUsd(authority.phone) }}</text><text style="font-size: 13px; color: var(--v5-ink-4); font-weight: 500">{{ t.store.vsPerDay }}</text>
        </view>
        <!-- 「/天」后缀恒用弱化色(与本卡美元侧同档 ink-4),不跟数字的强调色走 -->
        <view class="block mt-1 min-w-0 overflow-hidden font-mono-tabular whitespace-nowrap" :aria-label="phoneNexFullText" style="font-size: 12px; color: var(--v5-brand); font-weight: 500"><text>{{ phoneNexText }}</text><text style="color: var(--v5-ink-4)">{{ t.store.vsPerDay }}</text></view>
      </view>
      <!-- Arrow + 117× chip -->
      <view class="flex flex-col items-center gap-1 px-1">
        <text class="font-mono-tabular" style="font-size: 15px; color: var(--v5-ink-3); line-height: 1">→</text>
        <text class="whitespace-nowrap tabular-nums" :style="chipStyle">{{ multiplierText }}</text>
      </view>
      <!-- S1 -->
      <view class="text-right">
        <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-4)">{{ comparison.target.name }}</text>
        <view class="mt-1 tabular-nums whitespace-nowrap overflow-hidden" :aria-label="storefrontUsdFull(authority.entry)" :style="s1NumStyle">
          <text>{{ storefrontUsd(authority.entry) }}</text><text style="font-size: 13px; color: var(--v5-ink-4); font-weight: 500">{{ t.store.vsPerDay }}</text>
        </view>
        <view class="block mt-1 min-w-0 overflow-hidden font-mono-tabular whitespace-nowrap" :aria-label="entryNexFullText" style="font-size: 12px; color: var(--v5-brand); font-weight: 500"><text>{{ entryNexText }}</text><text style="color: var(--v5-ink-4)">{{ t.store.vsPerDay }}</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { deviceName } from "@/lib/device-copy";
import { storefrontNex, storefrontNexFull, storefrontUsd, storefrontUsdFull, type StoreYieldAuthority } from "@/lib/store-yield-authority";

const t = useT();
const props = defineProps<{ authority: StoreYieldAuthority; comparison: import("@/lib/store-upgrade").StoreUpgrade }>();
const authority = computed(() => ({
  phone: { usd: props.comparison.base.baseRate, nex: props.comparison.base.baseRateNEX },
  entry: { usd: props.comparison.target.dailyEarn, nex: props.comparison.target.dailyEarnNEX },
}));
/** The base slot is always the user's own hardware, so its label is descriptive
 *  copy, not a SKU brand mark — resolve it from `kind` through the shared helper
 *  the device cards use, instead of rendering the stored English name. */
const baseName = computed(() => deviceName(t.value, props.comparison.base));
const multiplierText = computed(() => `${props.comparison.multiplier}×`);
const phoneNexText = computed(() => `+${storefrontNex(authority.value.phone)} NEX`);
const entryNexText = computed(() => `+${storefrontNex(authority.value.entry)} NEX`);
const phoneNexFullText = computed(() => `+${storefrontNexFull(authority.value.phone)}${t.value.store.vsPerDay}`);
const entryNexFullText = computed(() => `+${storefrontNexFull(authority.value.entry)}${t.value.store.vsPerDay}`);

const rootStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
  padding: "14px 16px",
};

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
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  color: "var(--v5-ink-2)",
  letterSpacing: "-0.020em",
  lineHeight: 1,
};

const s1NumStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  color: "var(--v5-success-ink)",
  letterSpacing: "-0.020em",
  lineHeight: 1,
};

const chipStyle: CSSProperties = {
  padding: "4px 10px",
  background: "color-mix(in srgb, var(--v5-brand-2) 12%, transparent)",
  color: "var(--v5-brand-2-ink)",
  borderRadius: "999px",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};


</script>
