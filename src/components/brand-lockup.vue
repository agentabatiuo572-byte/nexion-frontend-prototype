<template>
  <view
    class="uvel-brand"
    :class="{ 'uvel-brand--mark': markOnly }"
    role="img"
    aria-label="UVEL"
  >
    <image class="uvel-brand__dark" :src="`/static/img/brand/${markOnly ? 'app-icon' : 'header-logo'}-dark.png`" mode="aspectFit" />
    <image class="uvel-brand__light" :src="`/static/img/brand/${markOnly ? 'app-icon' : 'header-logo'}-light.png`" mode="aspectFit" />
  </view>
</template>

<script setup lang="ts">
defineProps<{ markOnly?: boolean }>();
</script>

<style>
.uvel-brand { display: block; flex-shrink: 0; width: 112px; height: 38.7px; }
.uvel-brand--mark { width: 32px; height: 32px; }
.uvel-brand image { display: block; width: 100%; height: 100%; }
.uvel-brand .uvel-brand__light { display: none; }
html[data-theme="light"] .uvel-brand__dark { display: none; }
html[data-theme="light"] .uvel-brand__light { display: block; }
</style>
