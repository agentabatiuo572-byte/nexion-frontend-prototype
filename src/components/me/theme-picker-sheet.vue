<!--
  ThemePickerSheet — centered modal for choosing the appearance mode
  (light / dark / system). Opened from the /me theme settings row; applies the
  choice immediately via the theme store (setMode → data-theme on H5) and closes.

  Centered-modal范式(scrim flex-centers panel, both `nx-sheet-fade-in`, prop
  `open` / emit `close`, P-032 page-mounted) — same convention as global-ui.vue
  nx-mask/nx-modal. Overlay z-index 790/800 对齐主流 sheet(trial-claim / slot-action
  等),盖过 chassis header/tabbar/nova(z 90–110);device-deactivate 的 79/80 会被那些
  chrome 浮在遮罩之上,勿照抄。
  Device-local preference — no backend call.
-->
<template>
  <view v-if="open">
    <view class="nx-sheet-fade-in" :style="scrimStyle" @click="emit('close')">
      <view class="nx-sheet-fade-in" :style="panelStyle" @click.stop>
        <!-- Title row -->
        <view class="flex items-start justify-between" style="gap: 12px; margin-bottom: 14px">
          <text class="block" :style="titleStyle">{{ t.me.themePickerTitle }}</text>
          <view class="grid place-items-center shrink-0 active:opacity-60" :style="closeBtnStyle" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
        </view>

        <!-- Options -->
        <view
          v-for="opt in options"
          :key="opt.mode"
          class="flex items-center active:opacity-80"
          :style="optionStyle(opt.mode)"
          @click="choose(opt.mode)"
        >
          <view class="grid place-items-center shrink-0" :style="iconChipStyle(opt.mode)">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" :stroke="isActive(opt.mode) ? 'var(--v5-brand)' : 'var(--v5-ink-2)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path v-for="d in opt.paths" :key="d" :d="d" />
            </svg>
          </view>
          <text class="flex-1" :style="labelStyle(opt.mode)">{{ opt.label }}</text>
          <!-- Check on the active mode -->
          <svg v-if="isActive(opt.mode)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { useTheme, type ThemeMode } from "@/store/theme";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const t = useT();
const theme = useTheme();

const SUN = ["M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8"];
const MOON = ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"];
const MONITOR = ["M3 4h18v12H3z", "M8 20h8", "M12 16v4"];

const options = computed<{ mode: ThemeMode; label: string; paths: string[] }[]>(() => [
  { mode: "light", label: t.value.me.themeLight, paths: SUN },
  { mode: "dark", label: t.value.me.themeDark, paths: MOON },
  { mode: "system", label: t.value.me.themeSystem, paths: MONITOR },
]);

function isActive(m: ThemeMode): boolean {
  return theme.mode === m;
}

function choose(next: ThemeMode) {
  theme.setMode(next);
  emit("close");
}

// ── styles ──
const scrimStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 790,
  background: "rgba(8,8,12,0.45)",
  backdropFilter: "blur(8px) saturate(150%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
};
const panelStyle: CSSProperties = {
  width: "100%",
  maxWidth: "320px",
  zIndex: 800,
  borderRadius: "16px",
  background: "var(--v5-surface)",
  border: "1px solid var(--v5-border)",
  padding: "18px 16px 20px",
};
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const closeBtnStyle: CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
};
function optionStyle(m: ThemeMode): CSSProperties {
  const on = isActive(m);
  return {
    gap: "12px",
    minHeight: "52px",
    marginTop: "8px",
    padding: "0 14px",
    borderRadius: "14px",
    background: on ? "color-mix(in srgb, var(--v5-brand) 12%, transparent)" : "var(--v5-surface-2)",
  };
}
function iconChipStyle(m: ThemeMode): CSSProperties {
  const on = isActive(m);
  return {
    width: "34px",
    height: "34px",
    borderRadius: "10px",
    background: on ? "color-mix(in srgb, var(--v5-brand) 16%, transparent)" : "var(--v5-surface-3)",
  };
}
function labelStyle(m: ThemeMode): CSSProperties {
  const on = isActive(m);
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "15px",
    fontWeight: on ? 600 : 500,
    color: on ? "var(--v5-ink)" : "var(--v5-ink-2)",
  };
}
</script>
