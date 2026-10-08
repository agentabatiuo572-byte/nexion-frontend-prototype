<template>
  <view class="promotion-action">
    <LiquidGlass :radius="999" tone="control" />
    <view class="promotion-action-content"><slot /></view>
  </view>
</template>
<script setup lang="ts">
import LiquidGlass from '@/components/liquid-glass.vue';
</script>
<style scoped>
.promotion-action { position:relative; isolation:isolate; overflow:hidden; }
.promotion-action-content { position:relative; z-index:1; }
</style>
