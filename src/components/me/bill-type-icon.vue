<!--
  BillTypeIcon — inline SVG per BillType for the wallet-bills ledger.
  Replaces lucide-react icons (Coins / Sparkles / Award / ArrowDownLeft /
  ArrowUpRight / ShoppingBag / ArrowDownUp / ShieldCheck / Wallet / Wrench).
  stroke=currentColor driven by :color; rendered in both H5 + App (webview).
-->
<template>
  <!-- earn / swap share the Coins/ArrowDownUp split below -->
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- earn: Zap (compute earnings) -->
    <template v-if="type === 'earn'">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </template>
    <!-- refer: UserPlus -->
    <template v-else-if="type === 'refer'">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" />
    </template>
    <!-- bonus / achievement: medal -->
    <template v-else-if="type === 'bonus' || type === 'achievement'">
      <circle cx="12" cy="9" r="6" /><path d="m8.5 14.5-1.5 7 5-3 5 3-1.5-7" />
    </template>
    <!-- topup: ArrowUpFromLine -->
    <template v-else-if="type === 'topup'">
      <path d="m18 9-6-6-6 6" /><path d="M12 3v14" /><path d="M5 21h14" />
    </template>
    <!-- withdraw: ArrowDownToLine -->
    <template v-else-if="type === 'withdraw'">
      <path d="M12 3v14" /><path d="m6 11 6 6 6-6" /><path d="M19 21H5" />
    </template>
    <!-- purchase: bag -->
    <template v-else-if="type === 'purchase'">
      <path d="M6 7h12l-1 13H7z" /><path d="M9 7a3 3 0 0 1 6 0" />
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
