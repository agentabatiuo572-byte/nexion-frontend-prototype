<!--
  BillTypeIcon — inline SVG per BillType for the wallet-bills ledger.
  Replaces lucide-react icons (Coins / Sparkles / Award / ArrowDownLeft /
  ArrowUpRight / ShoppingBag / ArrowDownUp / ShieldCheck / Wallet / Wrench).
  stroke=currentColor driven by :color; rendered in both H5 + App (webview).
-->
<template>
  <!-- earn / swap share the Coins/ArrowDownUp split below -->
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- earn: Coins -->
    <template v-if="type === 'earn'">
      <circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" />
    </template>
    <!-- refer: Sparkles -->
    <template v-else-if="type === 'refer'">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" />
    </template>
    <!-- bonus / achievement: Award -->
    <template v-else-if="type === 'bonus' || type === 'achievement'">
      <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" /><circle cx="12" cy="8" r="6" />
    </template>
    <!-- topup: ArrowDownLeft -->
    <template v-else-if="type === 'topup'">
      <path d="M17 7 7 17" /><path d="M17 17H7V7" />
    </template>
    <!-- withdraw: ArrowUpRight -->
    <template v-else-if="type === 'withdraw'">
      <path d="M7 7h10v10" /><path d="M7 17 17 7" />
    </template>
    <!-- purchase: ShoppingBag -->
    <template v-else-if="type === 'purchase'">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
    </template>
    <!-- swap: ArrowDownUp -->
    <template v-else-if="type === 'swap'">
      <path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="m21 8-4-4-4 4" /><path d="M17 4v16" />
    </template>
    <!-- historical verification: ShieldCheck -->
    <template v-else-if="type === 'verification'">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />
    </template>
    <!-- stake: Wallet -->
    <template v-else-if="type === 'stake'">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </template>
    <!-- unstake: Wrench -->
    <template v-else-if="type === 'unstake'">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </template>
    <!-- other: canonical ledger row without a narrower product category -->
    <template v-else><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /></template>
  </svg>
</template>

<script setup lang="ts">
import type { BillType } from "@/store/bills";

defineProps<{ type: BillType; color: string }>();
</script>
