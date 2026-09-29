<template>
  <StandalonePageShell class="est-root" :top-inset="24">
    <!-- Progress -->
    <view class="est-bars">
      <view class="est-back active:opacity-60" role="button" tabindex="0" :aria-label="t.login.back" @click="leaveEstimator" @keydown.enter.prevent="leaveEstimator" @keydown.space.prevent="leaveEstimator">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>
      <view class="est-bar"><view class="est-bar__fill est-bar__fill--full" /></view>
      <view class="est-bar"><view class="est-bar__fill est-bar__fill--full" /></view>
      <view class="est-bar"><view class="est-bar__fill" /></view>
    </view>

    <view>
      <text class="est-step">{{ t.onboarding.step2of3 }}</text>
      <text class="est-title">{{ t.onboarding.estimatorTitleH }}</text>
      <text class="est-hint">{{ phoneEstimate ? t.onboarding.estimatorHint : t.onboarding.estimatorSubtitle }}</text>
    </view>

    <!-- Only completed calibration for this account and installation supplies phone figures. -->
    <view class="est-reveal">
      <view class="est-phone" :data-calibrated="!!phoneEstimate">
        <view class="est-phone__header">
          <view class="est-phone__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" />
            </svg>
          </view>
          <text class="est-phone__name">{{ t.onboarding.yourPhone }}</text>
          <view class="est-phone__pill" :class="{ 'est-phone__pill--ready': phoneEstimate }">
            <text>{{ phoneEstimate ? t.onboarding.calibrationDone : t.onboarding.calibrationPending }}</text>
          </view>
        </view>
        <view class="est-phone__metrics">
          <view>
            <text class="est-phone__label">{{ t.onboarding.estimatorScore }}</text>
            <text class="est-phone__score est-phone__value">{{ phoneEstimate ? phoneEstimate.score : '—' }}<text v-if="phoneEstimate" class="est-phone__unit"> /100</text></text>
          </view>
          <view>
            <text class="est-phone__label">{{ t.onboarding.estimatorYield }}</text>
            <template v-if="phoneEstimate">
              <text class="est-phone__yield est-phone__value">~${{ phoneEstimate.usdt.toFixed(2) }}<text class="est-phone__unit"> {{ t.onboarding.perDay }}</text></text>
              <text class="est-phone__nex">+{{ phoneEstimate.nex }} NEX {{ t.onboarding.perDay }}</text>
            </template>
            <text v-else class="est-phone__pending">{{ t.onboarding.estimatorPendingValue }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- Upgrade comparison -->
    <view v-if="s1 || pro" class="est-compare">
      <text class="est-compare__h">{{ t.onboarding.unlockMore }}</text>
      <view v-if="s1" class="cmp">
        <view class="cmp__icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
        </view>
        <view class="cmp__body">
          <text class="cmp__label">{{ s1.name }}</text>
          <text class="cmp__sub">+{{ s1.dailyEarnNEX }} NEX {{ t.onboarding.perDay }}</text>
        </view>
        <text class="cmp__val">~${{ s1.dailyEarn.toFixed(2) }}{{ t.onboarding.perDay }}</text>
      </view>
      <view v-if="pro" class="cmp">
        <view class="cmp__icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /></svg>
        </view>
        <view class="cmp__body">
          <text class="cmp__label">{{ pro.name }}</text>
          <text class="cmp__sub">+{{ pro.dailyEarnNEX }} NEX {{ t.onboarding.perDay }}</text>
        </view>
        <text class="cmp__val">~${{ pro.dailyEarn.toFixed(2) }}{{ t.onboarding.perDay }}</text>
      </view>
    </view>

    <!-- CTA -->
    <view class="est-cta">
      <view class="est-go est-go--on active:scale-[0.98]" role="button" tabindex="0" data-system-chrome-primary @click="goConnect" @keydown.enter.prevent="goConnect" @keydown.space.prevent="goConnect">
        <text class="est-go__t">{{ t.onboarding.calibrationStart }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import { useT } from "@/i18n/use-t";
import { onLoad } from "@dcloudio/uni-app";
import { getCarrier } from "@/lib/carrier";
import { getDeviceId } from "@/lib/device-id";
import { matchesPhoneBinding } from "@/lib/phone-policy";
import { useAuth } from "@/store/auth";
import { useApp } from "@/store/app";
import { readCalibratedInstallation } from "@/store/session";
import { getProduct } from "@/mock/products";
import { productCatalogState, refreshProductCatalog } from "@/store/product-catalog";

onLoad(() => {
  if (getCarrier() === "h5") {
    uni.reLaunch({ url: "/pages/register/success?download=1" });
    return;
  }
  void refreshProductCatalog();
});

const t = useT();
const auth = useAuth();
const app = useApp();
const phoneEstimate = computed(() => {
  const installationId = getDeviceId();
  const binding = app.phoneBinding;
  if (!auth.isAuthenticated || readCalibratedInstallation(auth.email || auth.accountId) !== installationId
    || binding?.installationId !== installationId) return null;
  const phone = app.devices.find(device => device.kind === "phone" && matchesPhoneBinding(device, binding));
  if (!phone || typeof phone.capabilityScore !== "number" || !Number.isFinite(phone.capabilityScore)
    || phone.capabilityScore < 0 || phone.capabilityScore > 100
    || !Number.isFinite(phone.baseRate) || phone.baseRate < 0
    || !Number.isFinite(phone.baseRateNEX) || phone.baseRateNEX < 0) return null;
  return { score: phone.capabilityScore, usdt: phone.baseRate, nex: phone.baseRateNEX };
});
const s1 = computed(() => productCatalogState.status === "ready" ? getProduct("stellarbox-s1") : undefined);
const pro = computed(() => productCatalogState.status === "ready" ? getProduct("stellarbox-pro") : undefined);

function goConnect() {
  uni.reLaunch({ url: "/pages/onboarding/connect", fail: () => {} });
}
function leaveEstimator() {
  uni.reLaunch({ url: "/pages/index/index", fail: () => {} });
}
</script>

<style scoped>
.est-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 24px 20px;
  background: var(--v5-bg);
  overflow-y: auto;
}
.est-bars {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
  min-height: 44px;
}
.est-back { width: 44px; height: 44px; margin-left: -12px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 9999px; }
.est-bar {
  flex: 1;
  height: 4px;
  border-radius: 9999px;
  background: var(--v5-surface);
  overflow: hidden;
}
.est-bar__fill {
  height: 100%;
  width: 0;
  background: var(--v5-brand);
  transition: width 0.5s;
}
.est-bar__fill--full {
  width: 100%;
}
.est-step {
  display: block;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--v5-brand);
}
.est-title {
  display: block;
  font-family: var(--font-v5);
  margin-top: 4px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--v5-ink);
}
.est-hint {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: var(--v5-ink-3);
}
.est-reveal {
  margin-top: 20px;
}
.est-phone {
  background: var(--v5-content-surface);
  border-radius: 12px;
  padding: 16px;
}
.est-phone__header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.est-phone__pill {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 9999px;
  background: var(--v5-surface-2);
  color: var(--v5-ink-3);
}
.est-phone__pill--ready {
  background: color-mix(in oklab, var(--v5-brand) 12%, transparent);
  color: var(--v5-brand);
}
.est-phone__icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: color-mix(in oklab, var(--v5-brand) 25%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.est-phone__name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
}
.est-phone__metrics {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin-top: 16px;
}
.est-phone__label {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-3);
}
.est-phone__value {
  display: block;
  margin-top: 6px;
  font-family: var(--font-v5);
  font-variant-numeric: tabular-nums;
  font-size: 20px;
  font-weight: 600;
  color: var(--v5-brand);
}
.est-phone__unit, .est-phone__nex {
  font-size: 12px;
  font-weight: 400;
  color: var(--v5-ink-3);
}
.est-phone__nex { display: block; margin-top: 4px; }
.est-phone__pending { display: block; margin-top: 8px; font-size: 13px; color: var(--v5-ink-2); }
.est-compare {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.est-compare__h {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--v5-ink-3);
  padding: 0 4px;
}
.cmp {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  padding: 12px 16px;
  background: var(--v5-surface);
}
.cmp__icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  /* 原 --v5-surface 与外层 .cmp 同色 → 图标框隐形(双主题)。surface-3 = 内凹 inset 语义。 */
  background: var(--v5-surface-3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cmp__body {
  flex: 1;
  min-width: 0;
}
.cmp__label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-ink);
}
.cmp__sub {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-3);
  margin-top: 2px;
}
.cmp__val {
  font-family: var(--font-v5);
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--v5-ink);
}
.est-cta {
  position: sticky;
  bottom: 0;
  z-index: 3;
  margin-top: auto;
  padding-top: 24px;
  margin-right: 4px;
  margin-left: 4px;
  background: linear-gradient(to bottom, transparent, var(--v5-bg) 24px);
}
.est-go {
  width: 100%;
  height: 48px;
  border-radius: 9999px;
  background: var(--v5-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.15s ease, background 0.3s ease;
}
.est-go--on {
  background: var(--v5-brand);
}
.est-go__t {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink-4);
}
.est-go--on .est-go__t {
  color: var(--v5-on-brand);
}

</style>
