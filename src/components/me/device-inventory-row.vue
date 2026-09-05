<!--
  DeviceInventoryRow — ported from me/devices/page.tsx DeviceRow.
  One device card (icon + name + "$rate/d · gpu" + pending-deactivate chip) with
  a full-width activate/deactivate action bar at the bottom. `active` switches
  icon tint + action label/colour; `disabled` (slots full, inventory rows only)
  greys the action. lucide Smartphone/Server/Power/PowerOff/Clock → inline svg.
-->
<template>
  <view class="overflow-hidden" :style="cardStyle">
    <view class="flex items-center" style="gap: 12px; padding: 12px 16px">
      <view class="grid place-items-center shrink-0" :style="iconBoxStyle">
        <!-- Smartphone -->
        <svg v-if="isPhone" width="18" height="18" viewBox="0 0 24 24" fill="none" :stroke="iconColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></svg>
        <!-- Server -->
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" :stroke="iconColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" /></svg>
      </view>
      <view class="flex-1 min-w-0">
        <text class="block truncate" :style="nameStyle">{{ deviceName(t, device) }}</text>
        <text class="block truncate" :style="specStyle">${{ device.baseRate.toFixed(2) }}/d · {{ deviceGpuLabel(t, device) }}</text>
        <view v-if="device.pendingDeactivate" class="inline-flex items-center" :style="pendingChipStyle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          <text>{{ pendingChipLabel }}</text>
        </view>
      </view>
    </view>
    <!-- FEAT-DEV02:升级置换条(可选)——左「可抵 $X」chip → 阶梯说明;右「升级置换」→ retire 流;
         无更高价目标时右侧置灰原因(业务链必有禁用原因)。点击绑在带 padding 的
         wrapper view 上,左右可点区实高 ≥44px(text 裸 padding 只有 ~29px,虚标教训)。 -->
    <view v-if="tradeinCreditText || tradeinDisabledText" class="w-full flex items-center justify-between" :style="tradeinStripStyle">
      <view v-if="tradeinCreditText" class="flex-1 active:opacity-70" :style="tradeinTapLeftStyle" @click.stop="emit('ladder')">
        <text :style="tradeinChipStyle">{{ tradeinCreditText }} ›</text>
      </view>
      <text v-else :style="tradeinMutedStyle">{{ tradeinDisabledText }}</text>
      <view v-if="tradeinCtaLabel" class="active:opacity-70" :style="tradeinTapRightStyle" @click.stop="emit('tradein')">
        <text :style="tradeinCtaStyle">{{ tradeinCtaLabel }}</text>
      </view>
    </view>
    <view class="w-full flex items-center justify-center transition" :class="{ 'active:bg-[var(--v5-surface-2)]': !actionDisabled }" :style="actionStyle" @click="onAction">
      <svg v-if="active" width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="actionColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64A9 9 0 0 1 20.77 15" /><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68" /><path d="M12 2v4" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="actionColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></svg>
      <text :style="actionLabelStyle">{{ actionLabel }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { Device } from "@/store/types";
import { useT } from "@/i18n/use-t";
import { deviceName, deviceGpuLabel } from "@/lib/device-copy";

const t = useT();

const props = withDefaults(
  defineProps<{
    device: Device;
    active: boolean;
    disabled?: boolean;
    actionDisabled?: boolean;
    activateLabel: string;
    deactivateLabel: string;
    slotsFullLabel: string;
    pendingChipLabel: string;
    /** FEAT-DEV02 升级置换条(全部可选;都不传=不渲染,免费设备零痕迹) */
    tradeinCreditText?: string;
    tradeinCtaLabel?: string;
    tradeinDisabledText?: string;
  }>(),
  { disabled: false, actionDisabled: false },
);

const emit = defineEmits<{ (e: "toggle"): void; (e: "tradein"): void; (e: "ladder"): void }>();

const isPhone = computed(() => props.device.kind === "phone");
const actionDisabled = computed(() => props.disabled || props.actionDisabled);
const iconColor = computed(() => (props.active ? "var(--v5-brand)" : "var(--v5-ink-3)"));
const actionColor = computed(() =>
  actionDisabled.value ? "var(--v5-ink-4)" : props.active ? "var(--v5-brand-2)" : "var(--v5-brand)",
);
const actionLabel = computed(() =>
  props.active ? props.deactivateLabel : props.disabled ? props.slotsFullLabel : props.activateLabel,
);

function onAction() {
  if (actionDisabled.value) return;
  emit("toggle");
}

// De-carded device card (form b): filled surface, no border (single visual diff).
const cardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "16px",
};
const iconBoxStyle = computed<CSSProperties>(() => ({
  width: "40px",
  height: "40px",
  borderRadius: "8px",
  background: props.active
    ? "color-mix(in srgb, var(--v5-brand) 15%, transparent)"
    : "var(--v5-surface-2)",
}));
const nameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const specStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const pendingChipStyle: CSSProperties = {
  marginTop: "4px",
  gap: "4px",
  padding: "2px 6px",
  borderRadius: "6px",
  background: "color-mix(in srgb, var(--v5-warning) 12%, transparent)",
  color: "var(--v5-warning)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
};
const actionStyle: CSSProperties = {
  gap: "6px",
  height: "44px",
  borderTop: "1px solid var(--v5-border)",
};
// FEAT-DEV02 置换条:soft tint 无描边(卡内嵌套禁 border 铁律);左右 wrapper
// 各 padding 14px 上下 → 可点区实高 ≈45px(14+17+14)。
const tradeinStripStyle: CSSProperties = {
  padding: "0 16px",
  borderTop: "1px solid var(--v5-border)",
  background: "color-mix(in srgb, var(--v5-brand) 5%, transparent)",
};
const tradeinTapLeftStyle: CSSProperties = {
  padding: "14px 12px 14px 0",
};
const tradeinTapRightStyle: CSSProperties = {
  padding: "14px 0 14px 16px",
};
const tradeinChipStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-success)",
};
const tradeinCtaStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-brand)",
};
const tradeinMutedStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  padding: "14px 0",
};
const actionLabelStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  color: actionColor.value,
}));
</script>
