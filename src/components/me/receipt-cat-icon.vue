<!--
  ReceiptCatIcon — inline SVG per ReceiptCategory for the receipts list + modal.
  Replaces lucide (ImageIcon/Film/MessageSquare/Wrench/Database/Mic/ShieldCheck).
  stroke=currentColor driven by :color. Rendered in H5 + App (webview).
-->
<template>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- IG: Image -->
    <template v-if="category === 'IG'">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </template>
    <!-- VG: Film -->
    <template v-else-if="category === 'VG'">
      <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 3v18" /><path d="M3 7.5h4" /><path d="M3 12h18" /><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path d="M17 16.5h4" />
    </template>
    <!-- LL: MessageSquare -->
    <template v-else-if="category === 'LL'">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </template>
    <!-- FT: Wrench -->
    <template v-else-if="category === 'FT'">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </template>
    <!-- EM: Database -->
    <template v-else-if="category === 'EM'">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
    </template>
    <!-- SP: Mic -->
    <template v-else-if="category === 'SP'">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />
    </template>
    <!-- KY: ShieldCheck -->
    <template v-else>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import type { ReceiptCategory } from "@/mock/receipt";

defineProps<{ category: ReceiptCategory; color: string }>();
</script>
