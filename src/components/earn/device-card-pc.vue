<!--
  DeviceCardPC — ported from Nexion-prototype/app/components/device-card-pc.tsx.
  A single device card on /earn. Sections (conditional on kind + state):
    header (icon · name · gpu · status pill · lifecycle chip) →
    phone states (reconnecting / paused-no-charger / paused-no-network /
      waiting / current task with progress bar) →
    phone background-mode toggles (battery + network demo pills) →
    phone locked-tasks loss-ad →
    dual-currency earnings (today USDT + NEX, est this hour).
  Long-press (480ms) opens a quick menu (Stats / Trade-in). framer-motion
  progress bar → CSS width transition; sub-blocks inlined (each small).

  TickerNumber (source) → plain reactive values (interval re-render ramps them;
  uni has no tween component). Long-press uses touchstart/touchend (uni has no
  pointer events). onPressStart/End also clear on touchcancel.
-->
<template>
  <view class="nx-device-card select-none" :style="rowStyle" :data-device-id="device.id" :data-online="deviceOnline ? 'true' : 'false'" @touchstart="onPressStart" @touchend="onPressEnd" @touchcancel="onPressEnd">
    <!-- Long-press quick menu (full-viewport bottom sheet).
         🔴 z 790 = 业务半屏带(秩序表单源见 captcha-slider.vue)。原值 200 低于里程碑
         庆祝(780),菜单开着时庆祝盖在上面并吞掉「以旧换新 / 统计」的点击。 -->
    <view
      v-if="menuOpen"
      class="nx-device-quick-menu flex items-end"
      style="position: fixed; inset: 0; z-index: 790; background: var(--v5-bg-color-mask)"
      role="dialog"
      aria-modal="true"
      :aria-label="displayName"
      @click="closeMenu"
      @keydown="onMenuKeydown"
    >
      <view class="w-full rounded-t-2xl p-3" style="background: var(--v5-surface); border-top: 1px solid var(--v5-border)" @click.stop>
        <view class="mx-auto mb-2" style="width: 40px; height: 4px; border-radius: 3px; background: var(--v5-border-strong)" />
        <text class="block px-2 py-1.5 truncate font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">{{ displayName }}</text>
        <view class="space-y-1">
          <view class="nx-device-quick-stats flex items-center gap-2.5 px-3 py-2.5 rounded-lg active:opacity-70" role="button" tabindex="0" @click="goStatsMenu" @keydown.enter.stop.prevent="goStatsMenu" @keydown.space.stop.prevent="goStatsMenu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
            <text style="font-size: 13px; color: var(--v5-ink)">{{ t.earn.quickMenu.stats }}</text>
          </view>
          <view v-if="degradable" class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg active:opacity-70" role="button" tabindex="0" @click="goTradeinMenu" @keydown.enter.stop.prevent="goTradeinMenu" @keydown.space.stop.prevent="goTradeinMenu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            <text style="font-size: 13px; color: var(--v5-ink)">{{ t.earn.quickMenu.tradein }}</text>
          </view>
        </view>
        <view class="mt-2 w-full grid place-items-center" style="height: 40px; border-radius: 999px; background: var(--v5-surface-2)" role="button" tabindex="0" @click="closeMenu" @keydown.enter.stop.prevent="closeMenu" @keydown.space.stop.prevent="closeMenu">
          <text style="font-size: 13px; color: var(--v5-ink-2)">{{ t.earn.quickMenu.cancel }}</text>
        </view>
      </view>
    </view>

    <!-- Collapsed row header (always visible; tap toggles detail) -->
    <view
      class="nx-device-card__header flex items-center justify-between active:opacity-70 transition-opacity"
      style="padding: 14px 20px; min-height: 58px"
      role="button"
      tabindex="0"
      :aria-expanded="expanded"
      aria-haspopup="dialog"
      @click="onRowTap"
      @keydown.enter.prevent="onRowTap"
      @keydown.space.prevent="onRowTap"
      @keydown.shift.f10.stop.prevent="openMenu"
      @contextmenu.stop.prevent="openMenu"
    >
      <view class="flex items-center gap-2.5 min-w-0" style="flex: 1">
        <view class="rounded-lg grid place-items-center shrink-0" style="width: 36px; height: 36px; background: var(--v5-surface-2)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="kindIconPath" /></svg>
        </view>
        <view class="min-w-0" style="flex: 1">
          <text class="block truncate" style="font-size: 15px; font-weight: 600; color: var(--v5-ink)">{{ displayName }}</text>
          <view class="flex items-center gap-1.5" style="margin-top: 3px">
            <view :style="{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: statusColor, boxShadow: statusGlow ? `0 0 6px ${statusColor}` : 'none' }" />
            <text class="nx-device-status-label" style="font-size: 12px" :style="{ color: statusColor }">{{ statusLabel }}</text>
          </view>
        </view>
      </view>
      <view class="flex items-center gap-2.5 shrink-0">
        <view class="text-right">
          <!-- 《09》§3:正收益=success(warning 专属 Pending/Cooling)。本行是设备
               今日**已实现**收益,非待结算 → success;同卡的 −$锁定日产 / 未解锁潜在
               收益仍用 warning(语义正确,不批量改)。 -->
          <text class="block tabular-nums" style="font-family: var(--font-v5); font-size: 20px; line-height: 1; font-weight: 600; color: var(--v5-success-ink); letter-spacing: -0.012em">${{ device.todayEarnings.toFixed(2) }}</text>
          <text class="block" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 3px; letter-spacing: 0.04em">{{ t.earn.todayEarnings }}</text>
        </view>
        <view class="grid place-items-center shrink-0 active:opacity-60" :style="chevronBtnStyle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease' }"><path d="m6 9 6 6 6-6" /></svg>
        </view>
      </view>
    </view>

    <!-- Detail body (expanded; accordion) -->
    <view v-if="expanded" class="nx-device-card__details">
      <!-- device identity: gpu · location + lifecycle chip -->
      <view class="flex items-center justify-between gap-2" style="padding: 0 20px 12px">
        <text class="min-w-0 truncate" style="font-size: 12px; color: var(--v5-ink-3)">{{ displayGpu }}<text v-if="displayLocation"><text style="color: var(--v5-ink-4); margin: 0 6px">·</text>{{ displayLocation }}</text></text>
        <view v-if="degradable && inSubsidy" class="nx-device-explainer inline-flex items-center gap-1 shrink-0 active:opacity-70" :style="subsidyChipStyle" role="button" tabindex="0" @click.stop="openExplainer" @keydown.enter.stop.prevent="openExplainer" @keydown.space.stop.prevent="openExplainer">
          <text>{{ subsidyText }}</text>
        </view>
        <view v-else-if="degradable && lifecycle" class="nx-device-explainer inline-flex items-center gap-1 shrink-0 active:opacity-70" :style="chipStyle" role="button" tabindex="0" @click.stop="openExplainer" @keydown.enter.stop.prevent="openExplainer" @keydown.space.stop.prevent="openExplainer">
          <text style="opacity: 0.9">{{ t.earn.capacityChipLabel }}</text>
          <text>{{ (lifecycle.efficiency * 100).toFixed(0) }}%</text>
          <text style="opacity: 0.65">·</text>
          <text style="opacity: 0.9">{{ monthsLabel }}</text>
        </view>
      </view>

      <view v-if="!task && taskLockRemainingMinutes > 0" class="flex items-center justify-between"
        style="margin: 0 20px 12px; padding: 9px 11px; border-radius: 9px; background: color-mix(in srgb, var(--v5-warning) 10%, transparent)"
        :data-task-lock-until="device.taskLockUntil">
        <text style="font-size: 12px; color: var(--v5-warning-ink)">{{ t.earn.taskLockTitle }}</text>
        <text class="tabular-nums" style="font-size: 12px; color: var(--v5-ink-2)">{{ fmt(t.earn.taskLockRemaining, { n: taskLockRemainingMinutes }) }}</text>
      </view>

      <!-- FEAT-DEV01: task-capacity readout(补贴期内隐藏百分比只显 badge;tap → W-CAP1 说明弹层) -->
      <view v-if="degradable && !inSubsidy && lifecycle" class="nx-device-explainer flex items-center justify-between gap-2 active:opacity-70" style="padding: 0 20px 12px" role="button" tabindex="0" @click.stop="openExplainer" @keydown.enter.stop.prevent="openExplainer" @keydown.space.stop.prevent="openExplainer">
        <text class="min-w-0 truncate" :style="capacityRowStyle">{{ capacityRowText }}</text>
        <svg class="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
      </view>

      <!-- FEAT-DEV01 异常1:产能触底 → 独立升级主 CTA(直达商城,权重提升;规格 ⑥ 矩阵第 6 行)。
           触底且有锁定任务清单时由下方 loss-ad 承载主 CTA(其样式随 floored 升权),此处不重复渲染 -->
      <view v-if="capacityFloored && !hwTeasers.length" style="padding: 0 20px 12px">
        <view class="w-full grid place-items-center active:scale-[0.98]" :style="flooredCtaStyle" role="button" tabindex="0" @click.stop="goUnlockHw" @keydown.enter.stop.prevent="goUnlockHw" @keydown.space.stop.prevent="goUnlockHw">
          <text :style="flooredCtaLabelStyle">{{ t.earn.capExplainCta }}</text>
        </view>
      </view>

    <!-- Phone: live hashpower (effective vs calibrated capability ceiling) -->
    <view v-if="phoneRunning" style="padding: 0 20px 12px">
      <view class="flex items-center justify-between" style="margin-bottom: 8px">
        <text :style="sectionLabelStyle">{{ t.earn.hashLabel }}</text>
        <view class="flex items-center gap-1" :style="capChipStyle">
          <text style="color: var(--v5-ink-3)">{{ t.earn.hashCapability }}</text>
          <text class="tabular-nums" style="font-family: var(--font-v5); color: var(--v5-ink-2); font-weight: 600">{{ baselineTops.toFixed(1) }} TOPS</text>
          <text style="color: var(--v5-ink-4)">·</text>
          <text style="color: var(--v5-brand)">{{ fmt(t.earn.hashTier, { n: capTier }) }}</text>
        </view>
      </view>
      <view class="flex items-end justify-between">
        <view class="flex items-baseline" style="gap: 4px">
          <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 34px; line-height: 1; font-weight: 600; color: var(--v5-brand); letter-spacing: -0.014em">{{ live.effectiveTops.toFixed(1) }}</text>
          <text style="font-size: 12px; font-weight: 600; color: var(--v5-ink-3)">TOPS</text>
        </view>
        <svg width="110" height="28" viewBox="0 0 110 28" preserveAspectRatio="none" fill="none">
          <polyline :points="sparkPoints" fill="none" stroke="var(--v5-brand)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </view>
      <view class="flex items-center justify-between" style="margin-top: 6px">
        <view class="flex items-center gap-1.5">
          <view style="width: 6px; height: 6px; border-radius: 50%; background: var(--v5-brand); box-shadow: 0 0 6px var(--v5-brand)" />
          <text style="font-size: 12px; color: var(--v5-ink-2)">{{ factorLabel }}</text>
        </view>
        <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 12px; color: var(--v5-ink-3)">{{ fmt(t.earn.hashOutput, { n: live.effectivePct }) }}</text>
      </view>
      <!-- R7: no fresh device heartbeat → hosted baseline; the viewing shell is irrelevant. -->
      <view v-if="!deviceOnline" class="flex items-center" style="gap: 6px; margin-top: 8px; padding: 7px 10px; border-radius: 8px; background: color-mix(in srgb, var(--v5-tech-cyan) 10%, transparent)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
        <text style="font-size: 12px; line-height: 1.35; color: var(--v5-ink-2); text-wrap: pretty">{{ t.earn.hashCarrierH5Network }} · {{ t.earn.hashCarrierUpgradeHook }}</text>
      </view>
    </view>

    <!-- Phone: reconnecting -->
    <view v-if="reconnecting && device.kind === 'phone'" style="padding: 0 20px 16px">
      <text class="block mb-2" :style="sectionLabelStyle">{{ t.earn.currentTask }}</text>
      <view class="rounded-xl p-3" :style="warnBoxStyle">
        <view class="flex items-start gap-2.5">
          <view class="rounded-lg grid place-items-center shrink-0" :style="warnIconStyle">
            <svg class="nx-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <text class="block" style="font-size: 13px; font-weight: 600; color: var(--v5-ink); line-height: 1.2">{{ t.earn.reconnecting }}</text>
            <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px; line-height: 1.35">{{ reconnectHoldText }}</text>
          </view>
        </view>
        <text v-if="device.currentTask" class="block truncate tabular-nums" style="margin-top: 8px; padding-left: 42px; font-size: 12px; color: var(--v5-ink-4); font-family: var(--font-v5)">#{{ device.currentTask.id }} · {{ device.currentTask.model }}</text>
      </view>
    </view>

    <!-- Phone: paused (no task) -->
    <view v-else-if="!task && device.kind === 'phone' && device.pausedReason" style="padding: 0 20px 16px">
      <text class="block mb-2" :style="sectionLabelStyle">{{ t.earn.currentTask }}</text>
      <view class="rounded-xl p-3 flex items-start gap-2.5" :style="warnBoxStyle">
        <view class="rounded-lg grid place-items-center shrink-0" :style="warnIconStyle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="pausedIconPath" /></svg>
        </view>
        <view class="flex-1 min-w-0">
          <text class="block" style="font-size: 13px; font-weight: 600; color: var(--v5-ink); line-height: 1.2">{{ pausedTitle }}</text>
          <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px; line-height: 1.35">{{ pausedHint }}</text>
        </view>
      </view>
    </view>

    <!-- Phone: waiting placeholder -->
    <view v-else-if="!task && device.kind === 'phone' && !device.pausedReason" style="padding: 0 20px 16px">
      <text class="block mb-2" :style="sectionLabelStyle">{{ t.earn.currentTask }}</text>
      <view class="flex items-center gap-2" style="font-size: 13px; color: color-mix(in srgb, var(--v5-ink) 85%, transparent)">
        <svg class="nx-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
        <text>{{ t.earn.phoneWaitingTask }}</text>
      </view>
      <text class="block" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 4px">{{ t.earn.phoneWaitingHint }}</text>
    </view>

    <!-- Current task (non-reconnecting) -->
    <view v-if="task && !reconnecting" style="padding: 0 20px 16px">
      <text class="block mb-2" :style="sectionLabelStyle">{{ t.earn.currentTask }}</text>
      <text class="block" style="font-size: 13px; font-weight: 500; color: color-mix(in srgb, var(--v5-ink) 95%, transparent); line-height: 1.2">{{ task.model }}<text style="color: var(--v5-ink-4); margin: 0 6px">·</text>{{ workloadLabel(task.category) }}</text>
      <view class="mt-0.5 flex items-center gap-1.5 flex-wrap" style="font-size: 12px; color: var(--v5-ink-3)">
        <text class="tabular-nums" style="font-family: var(--font-v5); color: var(--v5-brand)">#{{ task.id }}</text>
        <text style="color: var(--v5-ink-4)">·</text>
        <text style="color: color-mix(in srgb, var(--v5-ink) 80%, transparent)">{{ task.client }}</text>
        <text style="color: var(--v5-ink-4)">·</text>
        <text>{{ task.location }}</text>
      </view>
      <view class="mt-3 flex items-center gap-3">
        <view class="flex-1 h-1 rounded-full overflow-hidden" style="background: var(--v5-surface-2)">
          <view class="h-full" :style="progressBarStyle" />
        </view>
        <text class="tabular-nums text-right" style="font-family: var(--font-v5); font-size: 12px; color: color-mix(in srgb, var(--v5-ink) 80%, transparent); width: 48px">{{ progressPct }}%</text>
      </view>
      <view class="mt-1.5 flex items-center justify-between" style="font-size: 12px; color: var(--v5-ink-3)">
        <text>~{{ elapsedRemaining }} {{ t.earn.remaining }}</text>
        <text style="color: var(--v5-warning-ink)">{{ t.earn.reward }} +${{ task.reward.toFixed(3) }}</text>
      </view>
    </view>

    <!-- Phone: background mode toggles -->
    <view v-if="device.kind === 'phone'" style="padding: 0 20px 12px">
      <view class="flex items-center gap-1.5 mb-2">
        <text style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-ink-3)">{{ t.earn.phoneSettingsTitle }}</text>
        <view class="nx-device-help grid place-items-center rounded-full active:opacity-60" style="width: 20px; height: 20px" role="button" tabindex="0" :aria-label="t.earn.phoneRequirementsHelpAria" :aria-expanded="showHelp" @click="showHelp = !showHelp" @keydown.enter.stop.prevent="showHelp = !showHelp" @keydown.space.stop.prevent="showHelp = !showHelp">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
        </view>
      </view>
      <view v-if="showHelp" class="mb-2.5 rounded-lg px-3 py-2" style="background: var(--v5-surface-2)"><text style="font-size: 12px; color: var(--v5-ink-2); line-height: 1.35">{{ t.earn.phoneRequirementsHint }}</text></view>
      <view class="flex items-center gap-1.5 mb-2.5">
        <view class="nx-device-charger-toggle flex items-center gap-1 active:opacity-80" :style="togglePillStyle(isCharging)" role="switch" tabindex="0" :aria-checked="isCharging" :aria-label="isCharging ? t.earn.phoneCharging : t.earn.phoneOnBattery" @click="toggleCharger" @keydown.enter.stop.prevent="toggleCharger" @keydown.space.stop.prevent="toggleCharger">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" :stroke="isCharging ? 'var(--v5-brand)' : 'var(--v5-ink-3)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-if="isCharging" d="m11 7-3 5h4l-3 5" /><rect x="1" y="6" width="16" height="12" rx="2" /><path d="M22 11v2" /></svg>
          <text class="font-mono-tabular tabular-nums" :style="{ color: isCharging ? 'var(--v5-brand)' : 'var(--v5-ink-3)' }">{{ device.batteryLevel ?? 0 }}%</text>
        </view>
        <view class="nx-device-network-toggle flex items-center gap-1 active:opacity-80" :style="togglePillStyle(isOnline)" role="switch" tabindex="0" :aria-checked="isOnline" :aria-label="isOnline ? t.earn.phoneNetOnline : t.earn.phoneNetOffline" @click="toggleNetwork" @keydown.enter.stop.prevent="toggleNetwork" @keydown.space.stop.prevent="toggleNetwork">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" :stroke="isOnline ? 'var(--v5-brand)' : 'var(--v5-ink-3)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-if="isOnline" d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0M12 20h.01" /><path v-else d="M12 20h.01M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M1.42 1.42l21.16 21.16" /></svg>
          <text :style="{ color: isOnline ? 'var(--v5-brand)' : 'var(--v5-ink-3)' }">{{ isOnline ? t.earn.phoneNetOnline : t.earn.phoneNetOffline }}</text>
        </view>
      </view>
    </view>

    <!-- Phone: locked-tasks loss-ad -->
    <view v-if="device.kind === 'phone' && phoneLockedVisible" style="padding: 12px 20px 4px">
      <view class="flex items-center gap-1.5 mb-1.5" style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-ink-4)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        <text>{{ t.earn.lockedTasksTitle }}</text>
      </view>
      <view class="flex items-baseline gap-1.5 mb-2.5">
        <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 20px; font-weight: 600; color: var(--v5-warning-ink); line-height: 1">−${{ lockedTotalDaily }}</text>
        <text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.earn.lockedMissedDaily }}</text>
      </view>
      <view class="space-y-1.5">
        <view v-for="(it, i) in LOCKED_ITEMS" :key="i" class="flex items-center justify-between" style="font-size: 12px; color: var(--v5-ink-2)">
          <view class="flex items-center gap-1.5 min-w-0">
            <svg class="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <text class="truncate">{{ it.model }}</text>
          </view>
          <view class="flex items-center gap-2 shrink-0 ml-2">
            <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 13px; color: var(--v5-warning-ink); font-weight: 600; line-height: 1">+${{ it.daily }}<text style="font-size: 12px; color: var(--v5-ink-3); font-weight: 400; margin-left: 2px">/d</text></text>
            <!-- spec-sentinel-ok: workload VRAM requirement from lockedTeasers, not a catalog Product field -->
            <text class="tabular-nums text-right" style="font-size: 12px; color: var(--v5-ink-4); font-family: var(--font-v5); width: 40px">{{ it.vram }}</text>
          </view>
        </view>
      </view>
      <view class="mt-3 w-full grid place-items-center active:scale-[0.98]" :style="unlockCtaStyle" role="button" tabindex="0" @click="goUnlock" @keydown.enter.stop.prevent="goUnlock" @keydown.space.stop.prevent="goUnlock">
        <text :style="unlockCtaLabelStyle">{{ unlockText }}</text>
      </view>
    </view>

    <!-- FEAT-DEV01: hardware locked-tasks loss-ad(从 VRAM 门控任务池真派生;顶配设备无锁定项自动隐藏) -->
    <view v-if="hwTeasers.length" style="padding: 12px 20px 4px">
      <view class="flex items-center gap-1.5 mb-1.5" style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-ink-4)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        <text>{{ t.earn.lockedTasksTitle }}</text>
      </view>
      <view class="flex items-baseline gap-1.5 mb-2.5">
        <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 20px; font-weight: 600; color: var(--v5-warning-ink); line-height: 1">−${{ hwLockedDaily }}</text>
        <text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.earn.lockedMissedDaily }}</text>
      </view>
      <view class="space-y-1.5">
        <view v-for="(it, i) in hwTeasers" :key="i" class="flex items-center justify-between" style="font-size: 12px; color: var(--v5-ink-2)">
          <view class="flex items-center gap-1.5 min-w-0">
            <svg class="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <text class="truncate">{{ it.model }}</text>
          </view>
          <view class="flex items-center gap-2 shrink-0 ml-2">
            <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 13px; color: var(--v5-warning-ink); font-weight: 600; line-height: 1">+${{ it.dailyPotentialUSD }}<text style="font-size: 12px; color: var(--v5-ink-3); font-weight: 400; margin-left: 2px">/d</text></text>
            <text class="tabular-nums text-right" style="font-size: 12px; color: var(--v5-ink-4); font-family: var(--font-v5); width: 44px">{{ it.minVRAM }} GB</text>
          </view>
        </view>
      </view>
      <view class="mt-3 w-full grid place-items-center active:scale-[0.98]" :style="capacityFloored ? flooredCtaStyle : unlockCtaStyle" role="button" tabindex="0" @click.stop="goUnlockHw" @keydown.enter.stop.prevent="goUnlockHw" @keydown.space.stop.prevent="goUnlockHw">
        <text :style="capacityFloored ? flooredCtaLabelStyle : unlockCtaLabelStyle">{{ t.earn.capExplainCta }}</text>
      </view>
    </view>

    <!-- Earnings — today only (est-this-hour removed per accordion redesign) -->
    <view style="padding: 16px 20px 20px; border-top: 1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)">
      <text class="block" :style="sectionLabelStyle">{{ t.earn.todayEarnings }}</text>
      <view class="flex items-baseline gap-2.5" style="margin-top: 4px">
        <!-- 《09》§3 正收益=success:本组是「今日已实现收益」(USDT 主数 + NEX 增量),
             与卡内 −$锁定日产 / 未解锁潜在收益(仍 warning=Pending)语义不同,不可混用。 -->
        <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 34px; line-height: 1; font-weight: 600; color: var(--v5-success-ink); letter-spacing: -0.014em">${{ device.todayEarnings.toFixed(3) }}</text>
        <view class="font-mono-tabular flex items-center gap-1 tabular-nums" style="font-size: 12px; color: var(--v5-success-ink); font-weight: 600">
          <text style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: color-mix(in srgb, var(--v5-success) 75%, transparent)">+</text>
          <text>{{ device.todayEarningsNEX.toFixed(1) }} NEX</text>
        </view>
      </view>
    </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onUnmounted, type CSSProperties } from "vue";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { derivePromoUpgrade } from "@/store/device-types";
import type { Device, DeviceKind, TaskCategory } from "@/store/types";
import { workloadLabel as resolveWorkloadLabel } from "@/lib/workload-label";
import { deviceName, deviceGpuLabel, deviceLocation } from "@/lib/device-copy";
import { getLifecycleSummary, isDegradable, SUBSIDY_DAYS, CAPACITY_FLOOR } from "@/store/device-lifecycle";
import type { LockedTeaser } from "@/mock/tasks";
import { prepareEarnConfig, useEarnConfig } from "@/store/earn-config";
import { useCapacityExplainer } from "@/composables/use-capacity-explainer";
import { navTo } from "@/lib/route";
import { interruptInfo, INTERRUPT_MAX_RETRIES } from "@/store/interrupt";
import { computeLiveHashpower, isDeviceOnline } from "@/lib/hashpower";
import { fallbackCapability } from "@/lib/device-capability";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { remoteApiEnabled } from "@/api/runtime";

const props = defineProps<{ device: Device; expanded?: boolean; divider?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
const app = useApp();
const t = useT();
prepareEarnConfig();
const earnConfig = useEarnConfig();

// Model names are proper nouns (untranslated); the workload half is copy.
// Resolved from `category` at render — the baked `task.type` string is English.
function workloadLabel(category: TaskCategory): string {
  return resolveWorkloadLabel(t.value, category);
}

// Device identity is resolved from `kind` too — the stored name/gpu/location
// are English and persist per account. See lib/device-copy.ts.
const displayName = computed(() => deviceName(t.value, props.device));
const displayGpu = computed(() => deviceGpuLabel(t.value, props.device));
const displayLocation = computed(() => deviceLocation(t.value, props.device));

// 1s re-render so progress + countdown tick.
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (typeof document !== "undefined") document.removeEventListener("keydown", onDocumentMenuKeydown, true);
});

const KIND_ICON_PATHS: Record<DeviceKind, string> = {
  phone: "M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM12 18h.01",
  "pc-gpu": "M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l1 3H9l1-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 21h8",
  "stellarbox-s1": "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
  "stellarbox-pro": "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
  "stellarbox-pro-v2": "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
  "stellarrack-p1": "M5 4h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 14h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z",
  "stellarrack-p2": "M5 4h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 14h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z",
  "cloud-share": "M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 15.3",
};
const kindIconPath = computed(() => KIND_ICON_PATHS[props.device.kind] ?? KIND_ICON_PATHS.phone);

const task = computed(() => props.device.currentTask);
const taskLockRemainingMinutes = computed(() => {
  const lockUntil = props.device.taskLockUntil ?? 0;
  return lockUntil > now.value ? Math.max(1, Math.ceil((lockUntil - now.value) / 60000)) : 0;
});
const reconnecting = computed(() => props.device.kind === "phone" && props.device.interruptedAt != null);
const elapsedRatio = computed(() => {
  const tk = task.value;
  if (!tk) return 0;
  return Math.min(1, (now.value - tk.startedAt) / 1000 / tk.totalSec);
});
const progressPct = computed(() => Math.round(elapsedRatio.value * 100));

const idleGated = computed(
  () => props.device.kind === "phone" && !!props.device.pausedReason && !reconnecting.value && !task.value,
);

const statusLabel = computed(() => {
  if (reconnecting.value) return t.value.earn.reconnecting;
  if (idleGated.value) return t.value.earn.idle;
  if (!deviceOnline.value) {
    return props.device.kind === "phone" ? t.value.earn.hashCarrierH5Mode : t.value.earn.offline;
  }
  return t.value.earn.online;
});
const statusColor = computed(() => {
  if (reconnecting.value) return "var(--v5-warning)";
  if (idleGated.value || !deviceOnline.value) return "var(--v5-ink-3)";
  return "var(--v5-brand)";
});
const statusGlow = computed(() => !reconnecting.value && !idleGated.value && deviceOnline.value);

const elapsedRemaining = computed(() => {
  const tk = task.value;
  if (!tk) return "0m 00s";
  const elapsed = Math.floor((now.value - tk.startedAt) / 1000);
  const remaining = Math.max(0, tk.totalSec - elapsed);
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  return `${min}m ${String(sec).padStart(2, "0")}s`;
});

// Reconnecting hold copy
const reconnectHoldText = computed(() => {
  const at = props.device.interruptedAt;
  if (at == null) return "";
  const info = interruptInfo(at, now.value);
  return fmt(t.value.earn.reconnectHold, { n: info.retries, max: INTERRUPT_MAX_RETRIES, s: info.remainingSec });
});

// Paused block
const pausedIconPath = computed(() =>
  props.device.pausedReason === "no-network"
    ? "M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M8.5 16.5a5 5 0 0 1 7 0M12 20h.01M1.42 1.42l21.16 21.16"
    : "M22 11v2M19 6V4a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2M12 18h.01M9 22h6",
);
const pausedTitle = computed(() =>
  props.device.pausedReason === "no-network" ? t.value.earn.phonePausedNoNetwork : t.value.earn.phonePausedNoCharger,
);
const pausedHint = computed(() =>
  props.device.pausedReason === "no-network" ? t.value.earn.phonePausedNoNetworkHint : t.value.earn.phonePausedNoChargerHint,
);

// Background-mode toggles
const showHelp = ref(false);
const isCharging = computed(() => props.device.isCharging !== false);
const isOnline = computed(() => props.device.isWifiConnected !== false);
function toggleCharger() {
  app.setPhoneRuntime(props.device.id, { isCharging: !isCharging.value });
}
function toggleNetwork() {
  app.setPhoneRuntime(props.device.id, { isWifiConnected: !isOnline.value });
}

// ── Phone live hashpower (effective = calibrated capability × condition factors) ──
// The stable capability (TOPS·Tier) is the comparable identity number; the live
// effective value oscillates beneath that ceiling with the phone's current
// condition (continuous-online stability bonus, thermal, jitter). Only shown
// while running (charging + online + no interrupt) — paused/reconnect states use
// their own blocks. Toggling charger/network visibly moves the number.
const phoneRunning = computed(
  () => props.device.kind === "phone" && !reconnecting.value && !props.device.pausedReason,
);
// Phones always carry capability fields (createDevice seeds them); fall back to
// the lib's single-source default rather than duplicating the literal here.
const FALLBACK_CAP = fallbackCapability();
const baselineTops = computed(() => props.device.capabilityTops ?? (remoteApiEnabled ? 0 : FALLBACK_CAP.tops));
const cfg = useConfig();
const capTier = computed(() => props.device.capabilityTier ?? (remoteApiEnabled ? "—" : FALLBACK_CAP.tier));
const deviceOnline = computed(() => isDeviceOnline(props.device, now.value));
const live = computed(() =>
  computeLiveHashpower({
    baselineTops: baselineTops.value,
    online: deviceOnline.value,
    isCharging: isCharging.value,
    isOnline: isOnline.value,
    thermalState: props.device.thermalState,
    continuityMs: props.device.miningSince ? Math.max(0, now.value - props.device.miningSince) : 0,
    nowSeed: now.value,
    onlineBonus: cfg.config.onlineBonus,
  }),
);
const factorLabel = computed(() => {
  if (!deviceOnline.value) return t.value.earn.hashCarrierH5Mode;
  switch (live.value.dominant) {
    case "continuity":
      return t.value.earn.hashFactorContinuity;
    case "thermal":
      return t.value.earn.hashFactorThermal;
    case "battery":
      return t.value.earn.hashFactorBattery;
    case "offline":
      return t.value.earn.hashFactorOffline;
    default:
      return t.value.earn.hashFactorPeak;
  }
});

// Rolling sparkline buffer — one sample per 1s `now` tick (≈28s window).
const SPARK_LEN = 28;
const sparkBuf = ref<number[]>([]);
watch(
  now,
  () => {
    if (!phoneRunning.value) return;
    const next = [...sparkBuf.value, live.value.effectiveTops];
    sparkBuf.value = next.length > SPARK_LEN ? next.slice(-SPARK_LEN) : next;
  },
  { immediate: true },
);
const sparkPoints = computed(() => {
  const buf = sparkBuf.value;
  if (buf.length < 2) return "";
  const W = 110;
  const H = 28;
  const base = baselineTops.value || 1;
  const n = buf.length;
  return buf
    .map((v, i) => {
      const x = (i / (n - 1)) * W;
      const ratio = Math.max(0, Math.min(1, v / base));
      const y = H - (0.12 + ratio * 0.82) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
});

// Phone locked-tasks loss-ad
const promo = computed(() => derivePromoUpgrade(app.visibleDevices));
const phoneLockedVisible = computed(() => promo.value.baseKind === "phone");
const LOCKED_ITEMS: { model: string; daily: number; vram: string }[] = [
  { model: "Llama 70B inference", daily: 110, vram: "16 GB" },
  { model: "Flux.1 [dev] HD", daily: 38, vram: "12 GB" },
  { model: "SDXL Turbo bulk", daily: 9, vram: "8 GB" },
];
const lockedTotalDaily = computed(() => LOCKED_ITEMS.reduce((s, it) => s + it.daily, 0));
const unlockText = computed(() => t.value.earn.unlockNMoreTasks.replace("{n}", "142"));
function goUnlock() {
  uni.navigateTo({ url: `/pages/store/detail?id=${promo.value.targetKind}`, fail: () => {} });
}

// Lifecycle chip
const degradable = computed(() => isDegradable(props.device.kind));
const lifecycle = computed(() => {
  if (!degradable.value) return null;
  const s = getLifecycleSummary(props.device, now.value);
  return s.isDegradable ? s : null;
});
const chipColor = computed(() => {
  const s = lifecycle.value;
  if (!s) return "var(--v5-tech-cyan)";
  return s.efficiency >= 0.85 ? "var(--v5-tech-cyan)" : s.efficiency >= 0.65 ? "var(--v5-warning)" : "var(--v5-brand-2)";
});
const monthsLabel = computed(() => {
  const s = lifecycle.value;
  if (!s) return "";
  return s.monthsOwned < 1 ? `${Math.floor(s.monthsOwned * 30)}d` : `${s.monthsOwned.toFixed(1)}mo`;
});

// ── FEAT-DEV01: 任务产能口径(补贴 badge / 产能行 / 硬件 loss-ad / W-CAP1 入口)──
const explainer = useCapacityExplainer();
function openExplainer() {
  explainer.open();
}
const DAY_MS = 86400000;
// 时钟回拨防护:剩余窗口 clamp 到 [0, SUBSIDY_DAYS](规格 DEV01B 异常3)。
const subsidyRemainMs = computed(() =>
  degradable.value ? Math.min(SUBSIDY_DAYS * DAY_MS, Math.max(0, props.device.purchasedAt + SUBSIDY_DAYS * DAY_MS - now.value)) : 0,
);
const inSubsidy = computed(() => degradable.value && subsidyRemainMs.value > 0);
const subsidyText = computed(() => {
  if (subsidyRemainMs.value <= DAY_MS) return t.value.earn.subsidyBadgeLastDay;
  return fmt(t.value.earn.subsidyBadge, { n: Math.ceil(subsidyRemainMs.value / DAY_MS) });
});
const subsidyChipStyle: CSSProperties = {
  padding: "3px 9px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 600,
  fontFamily: "var(--font-v5)",
  background: "var(--v5-brand-soft)",
  color: "var(--v5-brand-deep)",
};
const capacityPct = computed(() => (lifecycle.value ? Math.round(lifecycle.value.efficiency * 100) : 100));
const capacityFloored = computed(() => !!lifecycle.value && lifecycle.value.efficiency <= CAPACITY_FLOOR + 1e-9);
// 展示派生:今日接单 ≈ 当前日产 ÷ 可接任务均价(单源 tasks.ts,确定性、不落库)。
const tasksToday = computed(() => {
  const s = lifecycle.value;
  if (!s) return 0;
  return Math.max(1, Math.min(999, Math.round(s.dailyRateNow / Math.max(earnConfig.averageEligibleReward(props.device.vramTotal), 1e-6))));
});
const capacityRowText = computed(() =>
  capacityFloored.value
    ? fmt(t.value.earn.capacityRowFloored, { pct: capacityPct.value })
    : fmt(t.value.earn.capacityRow, { pct: capacityPct.value, n: tasksToday.value }),
);
const capacityRowStyle = computed<CSSProperties>(() => ({
  fontSize: "12px",
  color: capacityFloored.value ? "var(--v5-brand-2)" : "var(--v5-ink-3)",
  fontWeight: capacityFloored.value ? 600 : 400,
}));
// 硬件版高阶任务 loss-ad:真派生(VRAM 门控),补贴期内不渲染(满产叙事自洽)。
const hwTeasers = computed<LockedTeaser[]>(() =>
  degradable.value && !inSubsidy.value ? earnConfig.lockedTeasers(props.device.vramTotal, 3) : [],
);
const hwLockedDaily = computed(() => hwTeasers.value.reduce((s, x) => s + x.dailyPotentialUSD, 0));
function goUnlockHw() {
  navTo("/pages/store/store");
}
// 触底态主 CTA:brand-2 实底提权(规格 异常1「升级 CTA 权重提升(主按钮态)」)。
const flooredCtaStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand-2)",
};
const flooredCtaLabelStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-on-brand-2)",
};

// Long-press quick menu
const menuOpen = ref(false);
const pressFiredMenu = ref(false);
let longPress: ReturnType<typeof setTimeout> | null = null;
function cardRoot(): HTMLElement | undefined {
  if (typeof document === "undefined") return undefined;
  return Array.from(document.querySelectorAll<HTMLElement>(".nx-device-card"))
    .find((element) => element.dataset.deviceId === props.device.id);
}
function openMenu() {
  menuOpen.value = true;
}
function closeMenu() {
  menuOpen.value = false;
}
function onMenuKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    return;
  }
  trapMenuFocus(event);
}
function onDocumentMenuKeydown(event: KeyboardEvent) {
  if (menuOpen.value) onMenuKeydown(event);
}
function trapMenuFocus(event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const items = Array.from(cardRoot()?.querySelectorAll<HTMLElement>(".nx-device-quick-menu [tabindex='0']") ?? [])
    .filter((element) => element.offsetParent !== null);
  if (!items.length || typeof document === "undefined") return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  if (event.shiftKey && current <= 0) {
    event.preventDefault();
    event.stopPropagation();
    items[items.length - 1].focus();
  } else if (!event.shiftKey && (current < 0 || current === items.length - 1)) {
    event.preventDefault();
    event.stopPropagation();
    items[0].focus();
  }
}
watch(menuOpen, async (open) => {
  if (typeof document !== "undefined") {
    document.removeEventListener("keydown", onDocumentMenuKeydown, true);
    if (open) document.addEventListener("keydown", onDocumentMenuKeydown, true);
  }
  await nextTick();
  const root = cardRoot();
  if (!root) return;
  const target = open
    ? root.querySelector<HTMLElement>(".nx-device-quick-menu [tabindex='0']")
    : root.querySelector<HTMLElement>(".nx-device-card__header");
  target?.focus();
});
function onPressStart() {
  if (longPress) clearTimeout(longPress);
  pressFiredMenu.value = false;
  longPress = setTimeout(() => {
    openMenu();
    pressFiredMenu.value = true;
  }, 480);
}
function onPressEnd() {
  if (longPress) {
    clearTimeout(longPress);
    longPress = null;
  }
}
// Tap the row header → toggle detail (accordion). Skip if a long-press just
// fired the quick menu (touchend → click would otherwise also toggle).
function onRowTap() {
  if (pressFiredMenu.value) {
    pressFiredMenu.value = false;
    return;
  }
  emit("toggle");
}
function goStatsMenu() {
  closeMenu();
  // Source routes to /earn (a detailed-stats view); we're already on earn, so
  // close the menu (the dedicated stats page isn't a separate route in uni yet).
}
function goTradeinMenu() {
  closeMenu();
  uni.navigateTo({ url: "/pages/me/devices", fail: () => {} });
}
function goDevices() {
  uni.navigateTo({ url: "/pages/me/devices", fail: () => {} });
}

// ── styles ──
const rowStyle = computed<CSSProperties>(() => ({
  position: "relative",
  borderTop: props.divider ? "1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)" : "none",
}));
const chevronBtnStyle: CSSProperties = {
  width: "30px",
  height: "30px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
};
const sectionLabelStyle: CSSProperties = {
  fontSize: "12px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--v5-ink-3)",
};
const capChipStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: "9999px",
  fontSize: "12px",
  background: "var(--v5-surface-2)",
};
const warnBoxStyle: CSSProperties = {
  background: "color-mix(in oklab, var(--v5-warning) 8%, transparent)",
  border: "1px solid color-mix(in oklab, var(--v5-warning) 24%, transparent)",
};
const warnIconStyle: CSSProperties = {
  width: "32px",
  height: "32px",
  background: "color-mix(in oklab, var(--v5-warning) 18%, transparent)",
  color: "var(--v5-warning-ink)",
};
const chipStyle = computed<CSSProperties>(() => ({
  padding: "2px 6px",
  borderRadius: "4px",
  fontSize: "12px",
  fontFamily: "var(--font-v5)",
  background: `color-mix(in srgb, ${chipColor.value} 12%, transparent)`,
  color: chipColor.value,
}));
const progressBarStyle = computed<CSSProperties>(() => ({
  width: `${progressPct.value}%`,
  background: "color-mix(in srgb, var(--v5-brand) 40%, transparent)",
  transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
}));
function togglePillStyle(on: boolean): CSSProperties {
  return {
    height: "28px",
    padding: "0 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 500,
    background: on ? "color-mix(in oklab, var(--v5-brand) 14%, transparent)" : "var(--v5-surface-2)",
  };
}
const unlockCtaStyle: CSSProperties = {
  height: "48px",
  borderRadius: "999px",
  background: "linear-gradient(90deg, var(--v5-tech-cyan), var(--v5-brand))",
};
const unlockCtaLabelStyle: CSSProperties = {
  color: "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 600,
};
</script>

<style scoped>
.nx-spin {
  animation: spin 1s linear infinite;
}
</style>
