<!--
  NicknameSheet — centered modal for picking a display name from curated
  pool candidates (lib/nickname.ts). Free-text nickname input was removed
  (2026-07-15 content governance): this sheet is the only rename path.
  Centered-modal范式同 theme-picker-sheet(scrim 790 / panel 800,
  nx-sheet-fade-in,prop `open` / emit `close`,P-032 page-mounted)。
  emit pick(name) → 页面回填 edit buffer,持久化仍走页面 Save bar。
-->
<template>
  <view v-if="open">
    <view class="nx-sheet-fade-in" :style="scrimStyle" @click="emit('close')">
      <view class="nx-sheet-fade-in" :style="panelStyle" @click.stop>
        <!-- Title row -->
        <view class="flex items-start justify-between" style="gap: 12px">
          <text class="block" :style="titleStyle">{{ t.profile.nicknameSheetTitle }}</text>
          <view class="grid place-items-center shrink-0 active:opacity-60" :style="closeBtnStyle" role="button" tabindex="0" :aria-label="t.profile.nicknameSheetClose" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
        </view>
        <text class="block" :style="hintStyle">{{ t.profile.nicknameSheetHint }}</text>

        <!-- Candidates (single-select) -->
        <view
          v-for="c in displayedCandidates"
          :key="c"
          class="flex items-center active:opacity-80"
          :style="candidateStyle(c)"
          role="button"
          tabindex="0"
          :aria-label="c"
          @click="picked = c"
        >
          <text class="flex-1 truncate" :style="candidateTextStyle(c)">{{ c }}</text>
          <svg v-if="picked === c" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </view>

        <!-- Footer: reroll (secondary) + confirm (primary, disabled until picked) -->
        <view class="flex" style="gap: 10px; margin-top: 16px">
          <view class="grid place-items-center active:opacity-80" :style="rerollBtnStyle" role="button" tabindex="0" :aria-label="t.profile.nicknameReroll" @click="reroll">
            <text :style="rerollTextStyle">{{ t.profile.nicknameReroll }}</text>
          </view>
          <view class="grid place-items-center" :class="picked ? 'active:opacity-90' : ''" :style="confirmBtnStyle" role="button" tabindex="0" :aria-label="t.profile.nicknameConfirm" @click="confirm">
            <text :style="confirmTextStyle">{{ t.profile.nicknameConfirm }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { generateNicknameCandidates } from "@/lib/nickname";

const props = withDefaults(defineProps<{ open: boolean; serverCandidates?: string[]; authoritative?: boolean }>(), {
  serverCandidates: () => [],
  authoritative: false,
});
const emit = defineEmits<{ (e: "close"): void; (e: "pick", name: string): void; (e: "reroll"): void }>();

const t = useT();
const candidates = ref<string[]>(generateNicknameCandidates());
const picked = ref("");
const displayedCandidates = computed(() => props.authoritative ? props.serverCandidates : candidates.value);

// 每次打开出新一批候选并清空选中。
watch(
  () => props.open,
  (v) => {
    if (v) reroll();
  },
);

function reroll() {
  if (props.authoritative) {
    picked.value = "";
    emit("reroll");
    return;
  }
  candidates.value = generateNicknameCandidates();
  picked.value = "";
}

function confirm() {
  if (!picked.value) return;
  emit("pick", picked.value);
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
const hintStyle: CSSProperties = {
  marginTop: "4px",
  marginBottom: "12px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
function candidateStyle(c: string): CSSProperties {
  const on = picked.value === c;
  return {
    gap: "10px",
    minHeight: "48px",
    marginTop: "8px",
    padding: "0 14px",
    borderRadius: "12px",
    background: on ? "color-mix(in srgb, var(--v5-brand) 12%, transparent)" : "var(--v5-surface-2)",
  };
}
function candidateTextStyle(c: string): CSSProperties {
  const on = picked.value === c;
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: on ? 600 : 500,
    color: on ? "var(--v5-ink)" : "var(--v5-ink-2)",
  };
}
const rerollBtnStyle: CSSProperties = {
  flex: 1,
  minHeight: "44px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
};
const rerollTextStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-ink-2)",
};
const confirmBtnStyle = computed<CSSProperties>(() => ({
  flex: 1.6,
  minHeight: "44px",
  borderRadius: "12px",
  background: picked.value ? "var(--v5-brand)" : "var(--v5-surface-2)",
}));
const confirmTextStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: picked.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
}));
</script>
