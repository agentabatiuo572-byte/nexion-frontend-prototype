<template>
  <view class="me-menu-card">
    <view
      v-for="item in items"
      :key="item.id"
      class="me-menu-tile active:scale-[0.98] active:opacity-80"
      @click="activate(item)"
    >
      <view class="me-menu-icon" :style="iconBoxStyle(item.tone)">
        <svg v-if="item.icon === 'trophy'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
        <svg v-else-if="item.icon === 'trophy-star'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /><path d="m12 5.8.75 1.52 1.68.24-1.21 1.18.28 1.67L12 9.62l-1.5.79.28-1.67-1.21-1.18 1.68-.24Z" /></svg>
        <svg v-else-if="item.icon === 'flame'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
        <svg v-else-if="item.icon === 'book'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /><path d="M8 7h8" /><path d="M8 11h6" /></svg>
        <svg v-else-if="item.icon === 'vault'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect width="17" height="14" x="3.5" y="5" rx="2" /><path d="M7 9h10v6H7z" /><circle cx="12" cy="12" r="2" /><path d="M12 10v4M10 12h4" /></svg>
        <svg v-else-if="item.icon === 'crown'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5 7.5 12 12 4l4.5 8 5-4.5-2 10.5h-15z" /><path d="M5 21h14" /></svg>
        <svg v-else-if="item.icon === 'gift'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
        <svg v-else-if="item.icon === 'target'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.6" /><path d="m15 9 4-4" /><path d="m19 5 .5-2.5L17 3" /></svg>
        <svg v-else-if="item.icon === 'sparkle'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /><path d="M5 3v4M3 5h4" /><path d="M19 17v4M17 19h4" /></svg>
        <svg v-else-if="item.icon === 'user'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
        <svg v-else-if="item.icon === 'shield'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
        <svg v-else-if="item.icon === 'key'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="14.5" r="4.5" /><path d="m11 11 8-8" /><path d="m16 6 2 2" /><path d="m14 8 2 2" /></svg>
        <svg v-else-if="item.icon === 'bell'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.27 21a2 2 0 0 0 3.46 0" /><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33" /></svg>
        <svg v-else-if="item.icon === 'receipt'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2z" /><path d="M8 7h8" /><path d="M8 11h8" /><path d="M8 15h5" /></svg>
        <svg v-else-if="item.icon === 'warning'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
        <svg v-else-if="item.icon === 'sliders'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M2 14h4" /><path d="M10 8h4" /><path d="M18 16h4" /></svg>
        <svg v-else-if="item.icon === 'sun'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
        <svg v-else-if="item.icon === 'moon'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
        <svg v-else-if="item.icon === 'globe'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
        <svg v-else-if="item.icon === 'replay'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
        <svg v-else-if="item.icon === 'help'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
        <svg v-else-if="item.icon === 'chat'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="M8 10h8" /><path d="M8 14h5" /></svg>
        <svg v-else-if="item.icon === 'code'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></svg>
      </view>
      <text class="me-menu-label">{{ item.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";

type MenuTone = "brand" | "orange" | "success" | "neutral" | "warning";

export type MeMenuItem = {
  id: string;
  label: string;
  href?: string;
  icon: string;
  tone: MenuTone;
};

defineProps<{ items: MeMenuItem[] }>();
const emit = defineEmits<{ select: [item: MeMenuItem] }>();

function activate(item: MeMenuItem) {
  emit("select", item);
  if (item.href) uni.navigateTo({ url: item.href, fail: () => {} });
}

function iconBoxStyle(tone: MenuTone): CSSProperties {
  const color =
    tone === "orange"
      ? "var(--v5-brand-2)"
      : tone === "success"
        ? "var(--v5-success)"
        : tone === "warning"
          ? "var(--v5-warning)"
          : tone === "neutral"
            ? "var(--v5-ink-2)"
            : "var(--v5-brand)";

  if (tone === "neutral") {
    return {
      background: "linear-gradient(180deg, var(--v5-surface-2) 0%, color-mix(in srgb, var(--v5-surface-2) 72%, #000 28%) 100%)",
      border: "1px solid var(--v5-border)",
      color,
    };
  }

  return {
    background: `linear-gradient(180deg, color-mix(in srgb, ${color} 20%, transparent) 0%, color-mix(in srgb, ${color} 9%, transparent) 100%)`,
    border: `1px solid color-mix(in srgb, ${color} 42%, transparent)`,
    color,
  };
}
</script>

<style scoped>
.me-menu-card {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px 8px;
  padding: 18px 10px 20px;
  border-radius: 20px;
  border: 1px solid var(--v5-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--v5-surface) 94%, #111317 6%) 0%, color-mix(in srgb, var(--v5-surface) 84%, #111317 16%) 100%);
  overflow: hidden;
}

.me-menu-tile {
  min-height: 98px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
  transform-origin: center;
}

.me-menu-icon {
  width: 58px;
  height: 58px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.me-menu-label {
  width: 100%;
  min-height: 32px;
  color: var(--v5-ink);
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
  letter-spacing: 0;
  text-align: center;
  white-space: normal;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
