<template>
  <view class="event-icon" aria-hidden="true"><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <template v-if="kind==='referral'"><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M18 7v6m-3-3h6"/></template>
    <template v-else-if="kind==='wheel'"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7m9 2h-7m-2 9v-7m-9-2h7"/></template>
    <template v-else-if="kind==='regional'"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></template>
    <template v-else-if="kind==='boost'"><path d="m13 2-9 12h7l-1 8 10-13h-7z"/></template>
    <template v-else-if="kind==='holding'"><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7zM8 12l3 3 5-6"/></template>
    <template v-else><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3zm0 0h4a3 3 0 1 0-3-3z"/></template>
  </svg></view>
</template>
<script setup lang="ts">withDefaults(defineProps<{kind?:string;size?:number}>(),{kind:'gift',size:24});</script>
<style scoped>.event-icon{display:grid;place-items:center;color:var(--v5-brand);flex:none;}</style>
