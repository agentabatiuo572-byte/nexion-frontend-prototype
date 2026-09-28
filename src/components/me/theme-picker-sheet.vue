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
  <view v-if="open" class="nx-theme-dialog" role="dialog" aria-modal="true" :aria-label="t.me.themePickerTitle">
    <view class="nx-sheet-fade-in" :style="scrimStyle" @click="emit('close')">
      <view class="nx-glass-sheet nx-sheet-fade-in" :style="panelStyle" @click.stop>
        <!-- Title row -->
        <view class="flex items-start justify-between" style="gap: 12px; margin-bottom: 14px">
          <text class="block" :style="titleStyle">{{ t.me.themePickerTitle }}</text>
          <view class="grid place-items-center shrink-0 active:opacity-60" :style="closeBtnStyle" role="button" tabindex="0" :aria-label="t.ui.close" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
        </view>

        <GlassSegments :model-value="theme.mode" :options="glassOptions" layout="vertical" class="nx-theme-options" :label="t.me.themePickerTitle" @select="choose">
          <template #option="{ option, selected }">
            <view class="grid place-items-center shrink-0" :style="iconChipStyle(option.value as ThemeMode)">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" :stroke="selected ? 'var(--v5-brand)' : 'var(--v5-ink-2)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path v-for="d in (option.paths as string[])" :key="d" :d="d" />
              </svg>
            </view>
            <text class="flex-1" :style="labelStyle(option.value as ThemeMode)">{{ option.label }}</text>
            <svg v-if="selected" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </template>
        </GlassSegments>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import GlassSegments from "@/components/glass-segments.vue";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { useTheme, type ThemeMode } from "@/store/theme";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const t = useT();
const theme = useTheme();
useDialogA11y(computed(() => props.open), ".nx-theme-dialog", () => emit("close"));

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
const panelStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  width: "100%",
  maxWidth: "320px",
  zIndex: 800,
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
  border: "none",
  padding: "18px 16px 20px",
};
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const closeBtnStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
};
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
const glassOptions = computed(() => options.value.map(option => ({ ...option, value: option.mode })));
</script>

<style scoped>
.nx-theme-options :deep(.nx-glass-option) { gap: 12px; min-height: 56px; }
</style>
