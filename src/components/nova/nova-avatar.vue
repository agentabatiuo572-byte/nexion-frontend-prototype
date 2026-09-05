<!--
  NovaAvatar — anthropomorphic cartoon portrait (ported from
  Nexion-prototype/app/components/nova/nova-avatar.tsx; next/image → <image>).

  Same external contract: `size` + `pulse` (+ caller class via attr inherit).
  The brand-tinted ring is a static boxShadow on the image; the pulse halo is a
  CSS ring (@keyframes v5-nova-halo) around the avatar — works at every size
  from 28px to 56px without re-rendering.
-->
<template>
  <view class="relative inline-block shrink-0" :style="{ width: size + 'px', height: size + 'px' }">
    <image
      class="block rounded-full"
      src="/static/img/marketing/nova-avatar.png"
      mode="aspectFill"
      :style="{
        width: size + 'px',
        height: size + 'px',
        borderRadius: '9999px',
        boxShadow:
          '0 0 0 1.5px color-mix(in oklab, var(--v5-brand) 35%, transparent), 0 4px 10px rgba(0,0,0,0.35)',
      }"
    />
    <view
      v-if="pulse"
      class="absolute inset-0 rounded-full pointer-events-none"
      :style="{
        animation: 'v5-nova-halo 1.8s ease-in-out infinite',
        boxShadow: '0 0 0 0 color-mix(in oklab, var(--v5-brand) 60%, transparent)',
      }"
    />
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number; pulse?: boolean }>(), {
  size: 36,
  pulse: false,
});
</script>
