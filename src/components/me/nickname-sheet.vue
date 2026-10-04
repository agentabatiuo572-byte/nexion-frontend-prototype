<!--
  NicknameSheet — centered modal for picking a display name from curated
  pool candidates (lib/nickname.ts). Free-text nickname input was removed
  (2026-07-15 content governance): this sheet is the only rename path.
  Centered-modal范式同 theme-picker-sheet(scrim 790 / panel 800,
  nx-sheet-fade-in,prop `open` / emit `close`,P-032 page-mounted)。
  emit pick(name) → 页面回填 edit buffer,持久化仍走页面 Save bar。
-->
<template>
  <view v-if="open" class="nx-nickname-sheet-root" role="dialog" aria-modal="true" :aria-label="t.profile.nicknameSheetTitle">
    <view class="nx-sheet-fade-in" :style="scrimStyle" @click="emit('close')">
      <view class="nx-glass-sheet nx-sheet-fade-in" :style="panelStyle" @click.stop>
        <!-- Title row -->
        <view class="flex items-start justify-between" style="gap: 12px">
          <text class="block" :style="titleStyle">{{ t.profile.nicknameSheetTitle }}</text>
          <view class="grid place-items-center shrink-0 active:opacity-60" :style="closeBtnStyle" role="button" tabindex="0" :aria-label="t.profile.nicknameSheetClose" @click="emit('close')"  @keydown.enter.prevent="emit('close')" @keydown.space.prevent="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
        </view>
        <text class="block" :style="hintStyle">{{ t.profile.nicknameSheetHint }}</text>

        <!-- Candidates (single-select) -->
        <view role="radiogroup" :aria-label="t.profile.nicknameSheetTitle">
          <view
            v-for="(c, i) in displayedCandidates"
            :key="c"
            class="flex items-center active:opacity-80"
            :style="candidateStyle(c)"
            role="radio"
            :tabindex="picked === c || (!picked && i === 0) ? 0 : -1"
            :aria-checked="picked === c ? 'true' : 'false'"
            :aria-label="c"
            @click="picked = c"





            @keydown.enter.prevent="picked = c" @keydown.space.prevent="picked = c" @keydown.up.prevent="moveCandidate(i, -1)" @keydown.down.prevent="moveCandidate(i, 1)" @keydown.left.prevent="moveCandidate(i, -1)" @keydown.right.prevent="moveCandidate(i, 1)"
          >
            <text class="flex-1 truncate" :style="candidateTextStyle(c)">{{ c }}</text>
            <svg v-if="picked === c" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </view>
        </view>

        <!-- Footer: reroll (secondary) + confirm (primary, disabled until picked) -->
        <view class="flex" style="gap: 10px; margin-top: 16px">
          <view class="grid place-items-center active:opacity-80" :style="rerollBtnStyle" role="button" tabindex="0" :aria-label="t.profile.nicknameReroll" @click="reroll"  @keydown.enter.prevent="reroll" @keydown.space.prevent="reroll">
            <text :style="rerollTextStyle">{{ t.profile.nicknameReroll }}</text>
          </view>
          <view class="grid place-items-center" :class="picked ? 'active:opacity-90' : ''" :style="confirmBtnStyle" role="button" :tabindex="picked ? 0 : -1" :aria-disabled="picked ? 'false' : 'true'" :aria-label="t.profile.nicknameConfirm" @click="confirm"  @keydown.enter.prevent="confirm" @keydown.space.prevent="confirm">
            <text :style="confirmTextStyle">{{ t.profile.nicknameConfirm }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type CSSProperties } from "vue";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { useT } from "@/i18n/use-t";
import { generateNicknameCandidates } from "@/lib/nickname";

const props = withDefaults(defineProps<{ open: boolean; serverCandidates?: string[]; authoritative?: boolean }>(), {
  serverCandidates: () => [],
  authoritative: false,
});
const emit = defineEmits<{ (e: "close"): void; (e: "pick", name: string): void; (e: "reroll"): void }>();

const t = useT();
useDialogA11y(computed(() => props.open), ".nx-nickname-sheet-root", () => emit("close"));
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

function moveCandidate(index: number, step: number) {
  const choices = displayedCandidates.value;
  const next = choices[(index + step + choices.length) % choices.length];
  if (!next) return;
  picked.value = next;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>(`.nx-nickname-sheet-root [role="radio"][aria-checked="true"]`)?.focus();
  });
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
