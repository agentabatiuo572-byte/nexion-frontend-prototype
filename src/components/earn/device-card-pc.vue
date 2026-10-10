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
  pointer events). Movement, touchcancel and unmount cancel the pending hold.
-->
<template>
  <view class="nx-device-card select-none" :style="rowStyle" :data-device-id="device.id" :data-online="deviceOnline ? 'true' : 'false'" @touchstart="onPressStart" @touchmove="onPressEnd" @touchend="onPressEnd" @touchcancel="onPressEnd">
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
      <view class="nx-glass-sheet w-full p-3" style="border-radius: var(--nx-glass-radius) var(--nx-glass-radius) 0 0" @click.stop>
        <view class="mx-auto mb-2" style="width: 40px; height: 4px; border-radius: 3px; background: var(--v5-border-strong)" />
        <text class="block px-2 py-1.5 truncate font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">{{ displayName }}</text>
        <view class="space-y-1">
          <view v-if="phoneLocalReady" class="nx-device-quick-stats flex items-center gap-2.5 px-3 py-2.5 rounded-lg active:opacity-70" role="button" tabindex="0" @click="goStatsMenu"  @keydown.enter.stop.prevent="goStatsMenu" @keydown.space.stop.prevent="goStatsMenu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
            <text style="font-size: 13px; color: var(--v5-ink)">{{ t.earn.quickMenu.stats }}</text>
          </view>
          <view v-if="degradable" class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg active:opacity-70" role="button" tabindex="0" @click="goTradeinMenu"  @keydown.enter.stop.prevent="goTradeinMenu" @keydown.space.stop.prevent="goTradeinMenu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            <text style="font-size: 13px; color: var(--v5-ink)">{{ t.earn.quickMenu.tradein }}</text>
          </view>
        </view>
        <view class="mt-2 w-full grid place-items-center" style="height: 40px; border-radius: 999px; background: var(--v5-surface-2)" role="button" tabindex="0" @click="closeMenu"  @keydown="onMenuKeydown">
          <text style="font-size: 13px; color: var(--v5-ink-2)">{{ t.earn.quickMenu.cancel }}</text>
        </view>
      </view>
    </view>

    <!-- Collapsed row header (always visible; tap toggles detail) -->
    <view
      class="nx-device-card__header active:opacity-70 transition-opacity"
      role="button"
      tabindex="0"
      :aria-expanded="expanded"
      aria-haspopup="dialog"
      @click="onRowTap"

      @keydown.enter.prevent="onRowTap" @keydown.space.prevent="onRowTap" @keydown.shift.f10.stop.prevent="openMenu"
      @contextmenu.stop.prevent="openMenu"
    >
      <view class="nx-device-card__main">
        <view class="earn-device-art" aria-hidden="true">
          <DeviceSlot :device="device" :online="false" />
        </view>
        <view class="earn-device-meta">
          <text class="earn-device-name">{{ displayName }}</text>
          <view class="earn-device-status">
            <text class="nx-device-status-label" style="font-size: 12px" :style="{ color: statusColor }">{{ statusLabel }}</text>
          </view>
        </view>
      </view>
      <view class="nx-device-card__numbers">
        <view class="earn-device-amount">
          <!-- Compact rows use neutral realized earnings; detailed pending/warning states retain their semantics. -->
          <text class="earn-device-amount-label">{{ t.earn.todayEarnings }}</text>
          <text class="earn-device-value tabular-nums">{{ phoneLocalReady ? `$${device.todayEarnings.toFixed(2)}` : '—' }}</text>
        </view>
        <view class="grid place-items-center shrink-0 active:opacity-60" :style="chevronBtnStyle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease' }"><path d="m6 9 6 6 6-6" /></svg>
        </view>
      </view>
    </view>

    <!-- Detail body (expanded; accordion) -->
    <view v-if="expanded" class="nx-device-card__details">
      <view v-if="!phoneLocalReady" class="mx-5 mb-4 rounded-xl" style="padding: 12px; background: var(--v5-brand-soft)" role="status">
        <text class="block" style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ phoneActivationGuidance.title }}</text>
        <text class="block" style="margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--v5-ink-2)">{{ phoneActivationGuidance.body }}</text>
        <view v-if="nativePhoneAvailable" class="inline-flex items-center active:opacity-70" style="min-height: 44px; margin-top: 4px; color: var(--v5-brand); font-size: 12px; font-weight: 600" role="button" tabindex="0" @click.stop="goPhoneBinding"  @keydown.enter.stop.prevent="goPhoneBinding" @keydown.space.stop.prevent="goPhoneBinding"><text>{{ t.myDevices.phoneActivationCta }} →</text></view>
      </view>
      <!-- device identity: gpu · location + lifecycle chip -->
      <view class="flex items-center justify-between gap-2" style="padding: 0 20px 12px">
        <text class="min-w-0 truncate" style="font-size: 12px; color: var(--v5-ink-3)">{{ displayGpu }}<text v-if="displayLocation"><text style="color: var(--v5-ink-4); margin: 0 6px">·</text>{{ displayLocation }}</text></text>
        <view v-if="phoneLocalReady && degradable && inSubsidy" class="nx-device-explainer inline-flex items-center gap-1 shrink-0 active:opacity-70" :style="subsidyChipStyle" role="button" tabindex="0" @click.stop="openExplainer"  @keydown.enter.stop.prevent="openExplainer" @keydown.space.stop.prevent="openExplainer">
          <text>{{ subsidyText }}</text>
        </view>
        <view v-else-if="phoneLocalReady && degradable && lifecycle" class="nx-device-explainer inline-flex items-center gap-1 shrink-0 active:opacity-70" :style="chipStyle" role="button" tabindex="0" @click.stop="openExplainer"  @keydown.enter.stop.prevent="openExplainer" @keydown.space.stop.prevent="openExplainer">
          <text style="opacity: 0.9">{{ t.earn.capacityChipLabel }}</text>
          <text>{{ (lifecycle.efficiency * 100).toFixed(0) }}%</text>
          <text style="opacity: 0.65">·</text>
          <text style="opacity: 0.9">{{ monthsLabel }}</text>
        </view>
      </view>

      <view v-if="phoneLocalReady && !task && taskLockRemainingMinutes > 0" class="flex items-center justify-between"
        style="margin: 0 20px 12px; padding: 9px 11px; border-radius: 9px; background: color-mix(in srgb, var(--v5-warning) 10%, transparent)"
        :data-task-lock-until="device.taskLockUntil">
        <text style="font-size: 12px; color: var(--v5-warning-ink)">{{ t.earn.taskLockTitle }}</text>
        <text class="tabular-nums" style="font-size: 12px; color: var(--v5-ink-2)">{{ fmt(t.earn.taskLockRemaining, { n: taskLockRemainingMinutes }) }}</text>
      </view>

      <!-- FEAT-DEV01: task-capacity readout(补贴期内隐藏百分比只显 badge;tap → W-CAP1 说明弹层) -->
      <view v-if="phoneLocalReady && degradable && !inSubsidy && lifecycle" class="nx-device-explainer flex items-center justify-between gap-2 active:opacity-70" style="padding: 0 20px 12px" role="button" tabindex="0" @click.stop="openExplainer"  @keydown.enter.stop.prevent="openExplainer" @keydown.space.stop.prevent="openExplainer">
        <text class="min-w-0 truncate" :style="capacityRowStyle">{{ capacityRowText }}</text>
        <svg class="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
      </view>

      <!-- FEAT-DEV01 异常1:产能触底 → 独立升级主 CTA(直达商城,权重提升;规格 ⑥ 矩阵第 6 行)。
           触底且有锁定任务清单时由下方 loss-ad 承载主 CTA(其样式随 floored 升权),此处不重复渲染 -->
      <view v-if="phoneLocalReady && capacityFloored && !hwTeasers.length" style="padding: 0 20px 12px">
        <view class="w-full grid place-items-center active:scale-[0.98]" :style="flooredCtaStyle" role="button" tabindex="0" @click.stop="goUnlockHw"  @keydown.enter.stop.prevent="goUnlockHw" @keydown.space.stop.prevent="goUnlockHw">
          <text :style="flooredCtaLabelStyle">{{ t.earn.capExplainCta }}</text>
        </view>
      </view>

    <!-- Server phones expose calibrated capacity; local factors are not measured live TOPS. -->
    <view v-if="phoneLocalReady && device.kind === 'phone' && device.capacitySource === 'server'" style="padding: 0 20px 12px">
      <view class="flex items-center justify-between gap-2">
        <text :style="sectionLabelStyle">{{ t.earn.hashCapability }}</text>
        <view class="flex items-center gap-1.5">
          <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink-2)">{{ baselineTops == null ? '-' : `${baselineTops} ${t.onboarding.phoneComputeUnit}` }}</text>
          <text v-if="capTier != null" style="font-size: 12px; color: var(--v5-ink-3)">{{ fmt(t.earn.hashTier, { n: capTier }) }}</text>
        </view>
      </view>
    </view>

    <!-- Mock phone: live hashpower (effective vs calibrated capability ceiling) -->
    <view v-if="phoneRunning && live" style="padding: 0 20px 12px">
      <view class="flex items-center justify-between" style="margin-bottom: 8px">
        <text :style="sectionLabelStyle">{{ t.earn.hashLabel }}</text>
        <view class="flex items-center gap-1" :style="capChipStyle">
          <text style="color: var(--v5-ink-3)">{{ t.earn.hashCapability }}</text>
          <text class="tabular-nums" style="font-family: var(--font-v5); color: var(--v5-ink-2); font-weight: 600">{{ baselineTops?.toFixed(1) }} {{ t.onboarding.phoneComputeUnit }}</text>
          <text style="color: var(--v5-ink-4)">·</text>
          <text style="color: var(--v5-brand)">{{ capTier == null ? '—' : fmt(t.earn.hashTier, { n: capTier }) }}</text>
        </view>
      </view>
      <view class="flex items-end justify-between">
        <view class="flex items-baseline" style="gap: 4px">
          <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 34px; line-height: 1; font-weight: 600; color: var(--v5-brand); letter-spacing: -0.014em">{{ live.effectiveTops.toFixed(1) }}</text>
          <text style="font-size: 12px; font-weight: 600; color: var(--v5-ink-3)">{{ t.onboarding.phoneComputeUnit }}</text>
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

    <view v-else-if="phoneRunning" style="padding: 0 20px 12px">
      <text :style="sectionLabelStyle">{{ t.earn.hashLabel }}</text>
      <text class="block" style="color: var(--v5-ink-3)">{{ t.earn.hashCapability }} · — {{ t.onboarding.phoneComputeUnit }}</text>
      <text class="block" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.earn.hashCapabilityUnknown }}</text>
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
    <view v-else-if="phoneLocalReady && !task && device.kind === 'phone' && device.pausedReason" style="padding: 0 20px 16px">
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
    <view v-else-if="phoneLocalReady && !task && device.kind === 'phone' && !device.pausedReason" style="padding: 0 20px 16px">
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
      <text v-if="task.status === 'PAUSED'" class="block" style="margin-top: 10px; font-size: 12px; color: var(--v5-warning-ink)">{{ t.earn.phoneTaskPaused }}</text>
      <text v-if="task.status === 'PAUSED'" class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ t.earn.phoneTaskPausedHint }}</text>
      <view v-if="task.status !== 'PAUSED'" class="mt-3 flex items-center gap-3">
        <view class="flex-1 h-1 rounded-full overflow-hidden" style="background: var(--v5-surface-2)">
          <view class="h-full" :style="progressBarStyle" />
        </view>
        <text class="tabular-nums text-right" style="font-family: var(--font-v5); font-size: 12px; color: color-mix(in srgb, var(--v5-ink) 80%, transparent); width: 48px">{{ progressPct }}%</text>
      </view>
      <view v-if="task.status !== 'PAUSED'" class="mt-1.5 flex items-center justify-between" style="font-size: 12px; color: var(--v5-ink-3)">
        <text v-if="awaitingExecutionResultConfirmation">{{ t.earn.taskAwaitingExecutionResultConfirmation }}</text>
        <text v-else>~{{ elapsedRemaining }} {{ t.earn.remaining }}</text>
        <text style="color: var(--v5-warning-ink)">{{ t.earn.reward }} +${{ task.reward.toFixed(3) }}</text>
      </view>
    </view>

    <!-- Every device has its own canonical task stream. Keep the active task above;
         this list only mirrors settled task previews returned for this device. -->
    <view v-if="phoneLocalReady" class="nx-device-today-completed" data-device-today-completed="true" style="padding: 0 20px 16px">
      <view class="flex items-center justify-between" style="margin-bottom: 8px">
        <text :style="sectionLabelStyle">{{ t.earn.todayRecentCompleted }}<template v-if="taskHistoryReady"> ({{ deviceTodayCompleted.length }})</template></text>
        <view
          class="active:opacity-60"
          style="min-height: 44px; padding-left: 16px; display: flex; align-items: center"
          role="button"
          tabindex="0"
          @click.stop="goTaskHistory"

          @keydown.enter.stop.prevent="goTaskHistory" @keydown.space.stop.prevent="goTaskHistory"
        >
          <text style="font-size: 12px; font-weight: 500; color: var(--v5-brand)">{{ t.taskHistory.viewAllAccountReceipts }}</text>
        </view>
      </view>
      <view v-if="remoteApiEnabled && app.remoteAssignmentStatus === 'error'" role="status" aria-live="polite">
        <text class="block" style="font-size: 12px; color: var(--v5-danger)">{{ t.wallet.assignmentsUnavailableTitle }}</text>
        <text class="block" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.wallet.assignmentsUnavailableBody }}</text>
      </view>
      <text v-else-if="!taskHistoryReady" class="block" role="status" aria-live="polite" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.taskHistory.loading }}</text>
      <view v-else-if="deviceTodayCompleted.length" class="space-y-1.5">
        <view
          v-for="task in deviceTodayCompleted"
          :key="task.receiptNo ?? task.id"
          class="flex items-center justify-between gap-2"
          data-phone-today-task="true"
          style="min-height: 28px; font-size: 12px"
        >
          <text class="flex-1 truncate min-w-0" style="color: var(--v5-ink-2)">{{ task.model }}<text style="color: var(--v5-ink-4); margin: 0 4px">·</text><text style="color: var(--v5-ink-3)">{{ workloadLabel(task.category) }}</text></text>
          <text class="tabular-nums shrink-0" style="font-family: var(--font-v5); color: var(--v5-success-ink)">+${{ task.reward.toFixed(3) }}</text>
          <text class="tabular-nums text-right shrink-0" style="font-family: var(--font-v5); font-size: 12px; color: var(--v5-ink-4); width: 38px">{{ localClockTime(task.completedAt) }}</text>
        </view>
      </view>
      <text v-else class="block" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.taskHistory.historyEmpty }}</text>
    </view>

    <!-- Phone: background mode toggles -->
    <view v-if="device.kind === 'phone' && !remoteApiEnabled" style="padding: 0 20px 12px">
      <view class="flex items-center gap-1.5 mb-2">
        <text style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-ink-3)">{{ t.earn.phoneSettingsTitle }}</text>
        <view class="nx-device-help grid place-items-center rounded-full active:opacity-60" style="width: 20px; height: 20px" role="button" tabindex="0" :aria-label="t.earn.phoneRequirementsHelpAria" :aria-expanded="showHelp" @click="showHelp = !showHelp"  @keydown.enter.stop.prevent="showHelp = !showHelp" @keydown.space.stop.prevent="showHelp = !showHelp">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
        </view>
      </view>
      <view v-if="showHelp" class="mb-2.5 rounded-lg px-3 py-2" style="background: var(--v5-surface-2)"><text style="font-size: 12px; color: var(--v5-ink-2); line-height: 1.35">{{ t.earn.phoneRequirementsHint }}</text></view>
      <view class="flex items-center gap-1.5 mb-2.5">
        <view class="nx-device-charger-toggle flex items-center gap-1 active:opacity-80" :style="togglePillStyle(isCharging)" role="switch" tabindex="0" :aria-checked="isCharging" :aria-label="isCharging ? t.earn.phoneCharging : t.earn.phoneOnBattery" @click="toggleCharger"  @keydown.enter.stop.prevent="toggleCharger" @keydown.space.stop.prevent="toggleCharger">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" :stroke="isCharging ? 'var(--v5-brand)' : 'var(--v5-ink-3)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-if="isCharging" d="m11 7-3 5h4l-3 5" /><rect x="1" y="6" width="16" height="12" rx="2" /><path d="M22 11v2" /></svg>
          <text class="font-mono-tabular tabular-nums" :style="{ color: isCharging ? 'var(--v5-brand)' : 'var(--v5-ink-3)' }">{{ device.batteryLevel ?? 0 }}%</text>
        </view>
        <view class="nx-device-network-toggle flex items-center gap-1 active:opacity-80" :style="togglePillStyle(isOnline)" role="switch" tabindex="0" :aria-checked="isOnline" :aria-label="isOnline ? t.earn.phoneNetOnline : t.earn.phoneNetOffline" @click="toggleNetwork"  @keydown.enter.stop.prevent="toggleNetwork" @keydown.space.stop.prevent="toggleNetwork">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" :stroke="isOnline ? 'var(--v5-brand)' : 'var(--v5-ink-3)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-if="isOnline" d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0M12 20h.01" /><path v-else d="M12 20h.01M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M1.42 1.42l21.16 21.16" /></svg>
          <text :style="{ color: isOnline ? 'var(--v5-brand)' : 'var(--v5-ink-3)' }">{{ isOnline ? t.earn.phoneNetOnline : t.earn.phoneNetOffline }}</text>
        </view>
      </view>
    </view>

    <!-- Phone: VRAM-gated task examples (no personal earnings projection). -->
    <view v-if="phoneLocalReady && device.kind === 'phone' && phoneLockedVisible && phoneTeasers.length" style="padding: 12px 20px 4px">
      <view class="flex items-center gap-1.5 mb-1.5" style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-ink-4)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        <text>{{ t.earn.lockedTasksTitle }}</text>
      </view>
      <text class="block" style="font-size: 12px; color: var(--v5-ink-4); margin-bottom: 8px; line-height: 1.35">{{ t.earn.lockedPotentialDisclaimer }}</text>
      <view class="space-y-1.5">
        <view v-for="(it, i) in phoneTeasers" :key="i" class="flex items-center justify-between" style="font-size: 12px; color: var(--v5-ink-2)">
          <view class="flex items-center gap-1.5 min-w-0 flex-1">
            <svg class="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <view class="min-w-0"><text class="block truncate">{{ it.model }} · {{ workloadLabel(it.category) }}</text><text class="block truncate" style="color: var(--v5-ink-4)">{{ it.unlockTier }}</text></view>
          </view>
          <view class="flex items-center gap-2 shrink-0 ml-2">
            <!-- spec-sentinel-ok: workload VRAM requirement from lockedTeasers, not a catalog Product field -->
            <text class="tabular-nums text-right" style="font-size: 12px; color: var(--v5-ink-4); font-family: var(--font-v5)">{{ it.minVRAM }} GB</text>
          </view>
        </view>
      </view>
      <view class="mt-3 w-full grid place-items-center active:scale-[0.98]" :style="unlockCtaStyle" role="button" tabindex="0" @click="goUnlock"  @keydown.enter.stop.prevent="goUnlock" @keydown.space.stop.prevent="goUnlock">
        <text :style="unlockCtaLabelStyle">{{ unlockText }}</text>
      </view>
    </view>

    <view v-else-if="phoneLocalReady && device.kind === 'phone' && phoneLockedVisible" style="padding: 12px 20px 4px">
      <text class="block" :style="sectionLabelStyle">{{ t.earn.deviceCapabilityTitle }}</text>
      <text class="block" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.earn.deviceCapabilityBody }}</text>
      <view class="mt-3 w-full grid place-items-center active:scale-[0.98]" :style="unlockCtaStyle" role="button" tabindex="0"
        @click="goUnlockHw"  @keydown.enter.stop.prevent="goUnlockHw" @keydown.space.stop.prevent="goUnlockHw">
        <text :style="unlockCtaLabelStyle">{{ t.earn.capExplainCta }}</text>
      </view>
    </view>

    <!-- FEAT-DEV01: hardware VRAM-gated task examples. -->
    <view v-if="phoneLocalReady && hwTeasers.length" style="padding: 12px 20px 4px">
      <view class="flex items-center gap-1.5 mb-1.5" style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-ink-4)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        <text>{{ t.earn.lockedTasksTitle }}</text>
      </view>
      <text class="block" style="font-size: 12px; color: var(--v5-ink-4); margin-bottom: 8px; line-height: 1.35">{{ t.earn.lockedPotentialDisclaimer }}</text>
      <view class="space-y-1.5">
        <view v-for="(it, i) in hwTeasers" :key="i" class="flex items-center justify-between" style="font-size: 12px; color: var(--v5-ink-2)">
          <view class="flex items-center gap-1.5 min-w-0 flex-1">
            <svg class="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <view class="min-w-0"><text class="block truncate">{{ it.model }} · {{ workloadLabel(it.category) }}</text><text class="block truncate" style="color: var(--v5-ink-4)">{{ it.unlockTier }}</text></view>
          </view>
          <view class="flex items-center gap-2 shrink-0 ml-2">
            <text class="tabular-nums text-right" style="font-size: 12px; color: var(--v5-ink-4); font-family: var(--font-v5)">{{ it.minVRAM }} GB</text>
          </view>
        </view>
      </view>
      <view class="mt-3 w-full grid place-items-center active:scale-[0.98]" :style="capacityFloored ? flooredCtaStyle : unlockCtaStyle" role="button" tabindex="0" @click.stop="goUnlockHw"  @keydown.enter.stop.prevent="goUnlockHw" @keydown.space.stop.prevent="goUnlockHw">
        <text :style="capacityFloored ? flooredCtaLabelStyle : unlockCtaLabelStyle">{{ t.earn.capExplainCta }}</text>
      </view>
    </view>

    <!-- Earnings — today only (est-this-hour removed per accordion redesign) -->
    <view v-if="phoneLocalReady" style="padding: 16px 20px 20px; border-top: 1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)">
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
import { advanceMonotonicHighWater, deadlineRemainingDays, deadlineRemainingMs, projectServerNow, readMonotonicNowMs } from "@/lib/server-deadline-clock";
import { useApp } from "@/store/app";
import { useSession } from "@/store/session";
import { hasNativeAndroidPhoneRuntime } from "@/lib/native-phone-runtime";
import { resolvePhoneActivationGuidance } from "@/lib/phone-activation-guidance";
import { useConfig } from "@/store/config";
import { derivePromoUpgrade } from "@/store/device-types";
import type { Device, DeviceKind, TaskCategory } from "@/store/types";
import { workloadLabel as resolveWorkloadLabel } from "@/lib/workload-label";
import { awaitsExecutionResultConfirmation } from "@/lib/task-result-confirmation";
import { deviceName, deviceGpuLabel, deviceLocation } from "@/lib/device-copy";
import { getLifecycleSummary, hasServerLifecycleProjection, isDegradable, SUBSIDY_DAYS, CAPACITY_FLOOR } from "@/store/device-lifecycle";
import type { LockedTeaser } from "@/mock/tasks";
import { prepareEarnConfig, useEarnConfig } from "@/store/earn-config";
import { useCapacityExplainer } from "@/composables/use-capacity-explainer";
import { navTo } from "@/lib/route";
import { interruptInfo, INTERRUPT_MAX_RETRIES } from "@/store/interrupt";
import { canShowLivePhoneHashpower, computeLiveHashpower, isDeviceOnline } from "@/lib/hashpower";
import { fallbackCapability } from "@/lib/device-capability";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { remoteApiEnabled } from "@/api/runtime";
import { localClockTime, todayCompletedTasks } from "@/lib/today-completed-tasks";

const props = defineProps<{ device: Device; expanded?: boolean; divider?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
const app = useApp();
const session = useSession();
const nativePhoneAvailable = hasNativeAndroidPhoneRuntime();
const t = useT();
const phoneActivationGuidance = computed(() => resolvePhoneActivationGuidance(nativePhoneAvailable, t.value.myDevices));
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
const phoneLocalReady = computed(() => !remoteApiEnabled || props.device.kind !== "phone"
  || (nativePhoneAvailable && session.isCurrentDeviceCalibrated(app.accountKey) && !app.remotePhoneBindingInvalid));
const displayGpu = computed(() => phoneLocalReady.value
  ? deviceGpuLabel(t.value, props.device) : "-");
const displayLocation = computed(() => deviceLocation(t.value, props.device));
function goPhoneBinding() { if (nativePhoneAvailable) navTo("/pages/onboarding/connect?mode=recalibrate"); }

// 1s re-render so progress + countdown tick.
const now = ref(Date.now());
const monotonicNow = ref(readMonotonicNowMs());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
    monotonicNow.value = advanceMonotonicHighWater(monotonicNow.value, readMonotonicNowMs());
  }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  onPressEnd();
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

const task = computed(() => phoneLocalReady.value ? props.device.currentTask : null);
// Task progress advances from the server snapshot plus a monotonic receive clock.
// Browser wall-clock changes therefore cannot fast-forward or rewind task earnings.
const liveTaskNow = computed(() => {
  const serverNow = props.device.taskServerNow;
  const receivedAt = props.device.taskServerNowReceivedAt;
  if (serverNow == null || receivedAt == null) return now.value;
  return projectServerNow(serverNow, receivedAt, monotonicNow.value);
});
const deviceTodayCompleted = computed(() => todayCompletedTasks(
  props.device.recentTasks,
  liveTaskNow.value,
));
const taskHistoryReady = computed(() => !remoteApiEnabled || app.remoteAssignmentStatus === "ready"
  || (app.remoteAssignmentStatus === "loading" && app.remoteAssignmentHasSnapshot));
const taskLockRemainingMinutes = computed(() => {
  const lockUntil = props.device.taskLockUntil ?? 0;
  return lockUntil > liveTaskNow.value ? Math.max(1, Math.ceil((lockUntil - liveTaskNow.value) / 60000)) : 0;
});
const reconnecting = computed(() => phoneLocalReady.value && props.device.kind === "phone" && props.device.interruptedAt != null);
const elapsedRatio = computed(() => {
  const tk = task.value;
  if (!tk) return 0;
  return Math.min(1, Math.max(0, (liveTaskNow.value - tk.startedAt) / 1000 / tk.totalSec));
});
const progressPct = computed(() => Math.round(elapsedRatio.value * 100));
const awaitingExecutionResultConfirmation = computed(() => {
  const tk = task.value;
  return tk !== null && awaitsExecutionResultConfirmation(tk, liveTaskNow.value);
});

const idleGated = computed(
  () => props.device.kind === "phone" && !!props.device.pausedReason && !reconnecting.value && !task.value,
);

const statusLabel = computed(() => {
  if (!phoneLocalReady.value) return phoneActivationGuidance.value.title;
  if (props.device.pendingDeactivate) return t.value.myDevices.inventoryPendingDeactivateChip;
  if (reconnecting.value) return t.value.earn.reconnecting;
  if (task.value?.status === "PAUSED") return t.value.earn.phoneTaskPaused;
  if (idleGated.value) return t.value.earn.idle;
  if (props.device.capacitySource === "server" && props.device.kind === "phone") {
    if (props.device.runtimeStatus === "ONLINE") return t.value.earn.online;
    if (props.device.runtimeStatus === "OFFLINE") return t.value.earn.offline;
    return t.value.earn.runtimeUnknown;
  }
  if (props.device.kind !== "phone" && props.device.capacitySource === "server"
      && (props.device.runtimeStatus == null || props.device.runtimeStatus === "UNKNOWN")) {
    return t.value.earn.runtimeUnknown;
  }
  if (!deviceOnline.value) {
    return props.device.kind === "phone" ? t.value.earn.hashCarrierH5Mode : t.value.earn.offline;
  }
  return t.value.earn.online;
});
const statusColor = computed(() => {
  if (!phoneLocalReady.value) return "var(--v5-warning-ink)";
  if (props.device.pendingDeactivate) return "var(--v5-warning)";
  if (reconnecting.value) return "var(--v5-warning)";
  if (task.value?.status === "PAUSED") return "var(--v5-warning-ink)";
  if (props.device.capacitySource === "server" && props.device.kind === "phone") {
    return props.device.runtimeStatus === "ONLINE" ? "var(--v5-brand)" : "var(--v5-ink-3)";
  }
  if (idleGated.value || !deviceOnline.value) return "var(--v5-ink-3)";
  return "var(--v5-brand)";
});
const statusGlow = computed(() => phoneLocalReady.value && !props.device.pendingDeactivate && !reconnecting.value && !idleGated.value && deviceOnline.value);

const elapsedRemaining = computed(() => {
  const tk = task.value;
  if (!tk) return "0m 00s";
  const elapsed = Math.floor((liveTaskNow.value - tk.startedAt) / 1000);
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
function goTaskHistory() {
  navTo("/pages/me/receipts");
}

// ── Mock phone live hashpower (effective = capability × local demo factors) ──
// Server phones show their calibrated capacity above without a fabricated live value.
const phoneRunning = computed(
  () => phoneLocalReady.value && canShowLivePhoneHashpower(props.device),
);
// Local demo phones carry a seeded capability. Remote phones only use a
// server-calibrated value; an older fleet response may not provide one.
const FALLBACK_CAP = fallbackCapability();
const baselineTops = computed(() => props.device.capabilityTops ?? (remoteApiEnabled ? null : FALLBACK_CAP.tops));
const cfg = useConfig();
const capTier = computed(() => props.device.capabilityTier ?? (remoteApiEnabled ? null : FALLBACK_CAP.tier));
const deviceOnline = computed(() => phoneLocalReady.value && isDeviceOnline(props.device, now.value));
const live = computed(() => {
  const baseline = baselineTops.value;
  return baseline == null ? null : computeLiveHashpower({
    baselineTops: baseline,
    online: deviceOnline.value,
    isCharging: isCharging.value,
    isOnline: isOnline.value,
    thermalState: props.device.thermalState,
    continuityMs: props.device.miningSince ? Math.max(0, now.value - props.device.miningSince) : 0,
    nowSeed: now.value,
    onlineBonus: cfg.config.onlineBonus,
  });
});
const factorLabel = computed(() => {
  if (!live.value) return "";
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
    if (!phoneRunning.value || !live.value) return;
    const next = [...sparkBuf.value, live.value.effectiveTops];
    sparkBuf.value = next.length > SPARK_LEN ? next.slice(-SPARK_LEN) : next;
  },
  { immediate: true },
);
const sparkPoints = computed(() => {
  const buf = sparkBuf.value;
  if (buf.length < 2 || baselineTops.value == null) return "";
  const W = 110;
  const H = 28;
  const base = baselineTops.value;
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

// Locked task examples use the server VRAM gate, not category throughput as income.
const promo = computed(() => derivePromoUpgrade(app.visibleDevices));
const phoneLockedVisible = computed(() => promo.value.baseKind === "phone");
const phoneTeasers = computed<LockedTeaser[]>(() => earnConfig.lockedTeasers(props.device.vramTotal, 3));
const unlockText = computed(() => t.value.earn.unlockNMoreTasks.replace("{n}", String(phoneTeasers.value.length)));
function goUnlock() {
  navTo(`/pages/store/detail?id=${promo.value.targetKind}`);
}

// Lifecycle chip
const degradable = computed(() => isDegradable(props.device.kind));
const lifecycle = computed(() => {
  if (!degradable.value) return null;
  if (props.device.capacitySource === "server" && !hasServerLifecycleProjection(props.device)) return null;
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
// Remote anchors elapsed time to the signed server snapshot and a monotonic
// receive instant. The high-water clock cannot move backward, so changing the
// browser wall clock cannot reopen an already expired subsidy window.
const liveServerNow = computed(() => {
  const serverNow = props.device.serverNow;
  const receivedAt = props.device.capacitySnapshotReceivedAt;
  if (serverNow == null || receivedAt == null) return now.value;
  return projectServerNow(serverNow, receivedAt, monotonicNow.value);
});
const subsidyRemainMs = computed(() =>
  !lifecycle.value
    ? 0
    : props.device.capacitySource === "server"
      ? props.device.capacitySubsidized === true
        && (props.device.capacitySubsidyRemainingDays ?? 0) > 0
        && props.device.capacitySubsidyEndsAt != null
        ? deadlineRemainingMs(props.device.capacitySubsidyEndsAt, liveServerNow.value)
        : 0
      : Math.min(SUBSIDY_DAYS * DAY_MS, Math.max(0, props.device.purchasedAt + SUBSIDY_DAYS * DAY_MS - now.value)),
);
const inSubsidy = computed(() => degradable.value && subsidyRemainMs.value > 0);
const subsidyText = computed(() => {
  if (props.device.capacitySource === "server" && lifecycle.value) {
    const remainingDays = deadlineRemainingDays(subsidyRemainMs.value);
    return remainingDays <= 1
      ? t.value.earn.subsidyBadgeLastDay
      : fmt(t.value.earn.subsidyBadge, { n: remainingDays });
  }
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
// 硬件版高阶任务示例:VRAM 门控,补贴期内不渲染。
const hwTeasers = computed<LockedTeaser[]>(() =>
  degradable.value && !inSubsidy.value ? earnConfig.lockedTeasers(props.device.vramTotal, 3) : [],
);
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
    longPress = null;
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
  navTo("/pages/me/devices");
}
function goDevices() {
  navTo("/pages/me/devices");
}

// ── styles ──
const rowStyle = computed<CSSProperties>(() => ({
  position: "relative",
  borderTop: props.divider ? "1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)" : "none",
}));
const chevronBtnStyle: CSSProperties = {
  width: "28px",
  height: "28px",
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

import DeviceSlot from "@/components/home/device-slot.vue";
</script>

<style scoped>
.nx-device-card__header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 88px; padding: 14px; }
.nx-device-card__main { display: flex; align-items: center; gap: 10px; min-width: 0; }
.earn-device-art { flex: none; width: 52px; height: 56px; overflow: hidden; }
.earn-device-art :deep(.nx-device-slot) { width: 52px; height: 56px; }
.earn-device-art :deep(.hf-computer) { width: 52px; height: 56px; }
.earn-device-art :deep(.hf-computer svg) { width: 38px; height: 38px; }
.earn-device-meta { flex: 1; min-width: 0; }
.earn-device-name { display: block; font: 600 15px/1.4 var(--font-v5); color: var(--v5-ink); overflow-wrap: anywhere; }
.earn-device-status { margin-top: 4px; line-height: 1.45; overflow-wrap: anywhere; }
.nx-device-card__numbers { display: flex; align-items: center; gap: 8px; min-width: 0; max-width: 152px; }
.earn-device-amount { text-align: right; min-width: 0; }
.earn-device-amount-label { display: block; font: 400 12px/1.4 var(--font-v5); color: var(--v5-ink-3); }
.earn-device-value { display: block; margin-top: 4px; font: 600 15px/1.3 var(--font-v5); color: var(--v5-ink); overflow-wrap: anywhere; }
.nx-device-card__details { animation: earn-detail-in .2s ease-out; }
@keyframes earn-detail-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .nx-device-card__details { animation: none; } }
.nx-device-card__spec { flex: 1 1 160px; min-width: min(100%, 160px); line-height: 1.35; }
.nx-device-card__hash-label { flex: 1 1 150px; min-width: min(100%, 150px); }
.nx-device-card__cap-chip { flex: none; white-space: nowrap; }
.nx-device-card__hash-heading { row-gap: 6px; }
@media (max-width: 350px) {
  .nx-device-card__header { padding: 12px; gap: 6px; }
  .nx-device-card__main { gap: 6px; }
  .nx-device-card__numbers { gap: 4px; max-width: 112px; }
  .earn-device-art, .earn-device-art :deep(.nx-device-slot) { width: 44px; }
}
.nx-spin {
  animation: spin 1s linear infinite;
}
</style>
