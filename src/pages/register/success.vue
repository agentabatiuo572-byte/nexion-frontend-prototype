<!--
  [FEAT-SHARE5] 注册成功页 — 礼包确认 + H5 官网下载引导。
  规格: PRD/specs/FEAT-SHARE01-invite-chain.md [FEAT-SHARE5]。
  仅 H5 注册链路到达(register.vue finish 的 #ifdef H5 分支);APP 壳内注册直进
  onboarding。bare 全屏页(无 chassis)→ 自带 GlobalUi 宿主(PORT-PITFALLS P-062)。
  H5 官网地址 = platform config share.appDownload.officialUrl(运营可配);空值
  显示不可用占位,不制造死链接。App 编译不渲染下载提醒。返回键视同
  「继续」进 onboarding(禁回注册流)。
-->
<template>
  <StandalonePageShell class="rs-root" :reserve-bottom="false">
    <view class="rs-wrap" :class="{ 'rs-wrap--gift': giftState !== 'none' }">
      <view class="rs-main">
        <view class="rs-content">
          <view class="rs-badge">
            <view class="rs-badge__in">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5" /></svg>
            </view>
          </view>
          <text class="rs-title" role="heading" aria-level="1" tabindex="-1">{{ t.register.doneTitle }}</text>
          <text class="rs-sub">{{ subLine }}</text>

          <!-- 礼包确认(giftRoute 两态;无礼包注册则整块省略) -->
          <view v-if="giftState !== 'none'" class="rs-gift">
            <text class="rs-gift__cap">{{ t.share.posterGiftCap }}</text>
            <view class="rs-gift__amt">
              <text class="rs-gift__usd">${{ giftUsdt }}</text>
              <text class="rs-gift__nex">+ {{ giftNex }} NEX</text>
            </view>
            <view v-if="giftState === 'posted'" class="rs-chip rs-chip--ok">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5" /></svg>
              <text class="rs-chip__t rs-chip__t--ok">{{ t.register.doneGiftPosted }}</text>
            </view>
            <view v-else class="rs-chip rs-chip--pd">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              <text class="rs-chip__t rs-chip__t--pd">{{ t.register.doneGiftPending }}</text>
            </view>
            <text v-if="giftState === 'pending'" class="rs-gift__note">{{ t.register.doneGiftPendingNote }}</text>
          </view>

          <!-- #ifdef H5 -->
          <!-- H5 才解释安装 APP 的收益;App 壳内不重复提醒。 -->
          <view class="rs-why">
            <view class="rs-why__r">
              <view class="rs-why__ic" style="background: color-mix(in srgb, var(--v5-brand) 14%, transparent)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
              </view>
              <text class="rs-why__t">{{ t.register.doneWhyApp1 }}</text>
            </view>
            <view class="rs-why__r">
              <view class="rs-why__ic" style="background: color-mix(in srgb, var(--v5-tech-cyan) 14%, transparent)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
              </view>
              <text class="rs-why__t">{{ t.register.doneWhyApp2 }}</text>
            </view>
            <view class="rs-why__r">
              <view class="rs-why__ic" style="background: color-mix(in srgb, var(--v5-warning) 14%, transparent)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" /></svg>
              </view>
              <text class="rs-why__t">{{ t.register.doneWhyApp3 }}</text>
            </view>
          </view>
          <!-- #endif -->
        </view>
      </view>

      <!-- #ifdef H5 -->
      <view class="rs-h5-download">
        <text class="rs-h5-download__hint">{{ t.register.doneOfficialDownloadHint }}</text>
        <view
          v-if="officialDownloadUrl"
          class="rs-h5-download__action active-press"
          role="link"
          tabindex="0"
          @click="openOfficialDownload"
          @keydown.enter.prevent="openOfficialDownload"
          @keydown.space.prevent="openOfficialDownload"
        >
          <text class="rs-h5-download__action-text">{{ t.register.doneOfficialDownloadLink }}</text>
          <text class="rs-h5-download__arrow">↗</text>
        </view>
        <view v-else class="rs-h5-download__action rs-h5-download__action--disabled" role="status" aria-disabled="true">
          <text class="rs-h5-download__pending">{{ t.register.doneOfficialDownloadPending }}</text>
        </view>
      </view>
      <!-- #endif -->

      <view class="rs-footer">
        <view
          class="rs-cta rs-continue active-press"
          data-system-chrome-primary
          role="button"
          tabindex="0"
          @click="continueWeb"
          @keydown.enter.prevent="continueWeb"
          @keydown.space.prevent="continueWeb"
        >
          <text class="rs-cta__t">{{ t.register.doneContinue }}</text>
        </view>
      </view>
    </view>
    <GlobalUi />
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { onBackPress } from "@dcloudio/uni-app";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import GlobalUi from "@/components/global-ui.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useConfig } from "@/store/config";
import { pickSponsor } from "@/mock/sponsors";
import { useAuth } from "@/store/auth";
import { resolveAuthAccountById } from "@/store/auth-account";
import { remoteApiEnabled } from "@/api/runtime";
import { consumeRemoteRegistrationReceipt } from "@/auth/remote-registration-receipt";
import type { RegistrationReceipt } from "@/api/contracts";

type GiftState = "posted" | "pending" | "none";

const t = useT();
const cfg = useConfig();
const auth = useAuth();
const remoteReceipt = ref<RegistrationReceipt | null>(consumeRemoteRegistrationReceipt(auth.accountId));

// ⚠️ MOCK-ONLY: 成功页只读 active 账号目录中冻结的注册回执，绝不信任 URL。
// 无回执时 giftState 为 none、礼包卡不渲染；live config 仅保留给旧页降级的
// 非可见 fallback。PROD 注册 endpoint/回执契约 TBD，由服务端回执提供业务事实。
const registration = computed(() => {
  if (remoteApiEnabled) return null;
  const resolved = resolveAuthAccountById(auth.accountId);
  return resolved.ok && resolved.account?.status === "active" ? resolved.account.registration : null;
});
const giftState = computed<GiftState>(() => {
  if (remoteApiEnabled) {
    const status = remoteReceipt.value?.giftStatus;
    if (!remoteReceipt.value || status === "UNAVAILABLE"
        || typeof remoteReceipt.value.giftUsdt !== "number"
        || typeof remoteReceipt.value.giftNex !== "number") return "none";
    return status === "POSTED" ? "posted" : "pending";
  }
  const receipt = registration.value;
  if (!receipt?.sponsorCode) return "none";
  return receipt.giftRoute === "withdrawable" ? "posted" : "pending";
});

// active 注册回执的金额是本次业务事实；无回执时仅为旧页降级保留 live config。
const giftUsdt = computed(() => remoteApiEnabled
  ? remoteReceipt.value?.giftUsdt ?? 0
  : registration.value?.giftUsdt ?? cfg.config.rewards.welcomeGift.usdtAmount);
const giftNex = computed(() => remoteApiEnabled
  ? remoteReceipt.value?.giftNex ?? 0
  : registration.value?.giftNex ?? cfg.config.rewards.welcomeGift.nexAmount);
const sponsor = computed(() => {
  if (remoteApiEnabled) return remoteReceipt.value?.sponsorDisplayName
    ? { name: remoteReceipt.value.sponsorDisplayName }
    : null;
  return registration.value?.sponsorCode ? pickSponsor(registration.value.sponsorCode) : null;
});
const subLine = computed(() =>
  sponsor.value ? fmt(t.value.register.doneSubTeam, { name: sponsor.value.name }) : t.value.register.doneSubSolo,
);

onMounted(() => {
  // #ifdef H5
  void nextTick(() => document.querySelector<HTMLElement>(".rs-title")?.focus());
  // #endif
});

// #ifdef H5
const officialDownloadUrl = computed(() => {
  const raw = cfg.config.share.appDownload.officialUrl?.trim() ?? "";
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
});

function openOfficialDownload() {
  const url = officialDownloadUrl.value;
  if (!url) return;
  const popup = window.open(url, "_blank");
  if (popup) popup.opener = null;
  else window.location.assign(url);
}
// #endif

function continueWeb() {
  uni.reLaunch({ url: "/pages/onboarding/estimator", fail: () => {} });
}
// 禁回注册流:返回键视同「继续」(App 端;H5 hash 回退由浏览器承担)。
onBackPress(() => {
  continueWeb();
  return true;
});
</script>

<style scoped>
.rs-root { position: fixed; inset: 0; background: var(--v5-bg); overflow-y: auto; }
.rs-wrap { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 100%; padding: 0 24px; box-sizing: border-box; text-align: center; }
.rs-main { position: absolute; inset: 0 24px; display: flex; align-items: center; justify-content: center; padding: 24px 0; box-sizing: border-box; }
.rs-content { width: 100%; }
.rs-badge { width: 74px; height: 74px; border-radius: 9999px; margin: 0 auto; background: color-mix(in srgb, var(--v5-brand) 16%, transparent); display: flex; align-items: center; justify-content: center; }
.rs-badge__in { width: 52px; height: 52px; border-radius: 9999px; background: var(--v5-brand); display: flex; align-items: center; justify-content: center; }
.rs-title { display: block; margin-top: 16px; font-family: var(--font-v5); font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: var(--v5-ink); }
.rs-title:focus { outline: none; }
.rs-sub { display: block; margin-top: 6px; font-size: 12px; color: var(--v5-ink-2); line-height: 1.5; text-wrap: pretty; }
.rs-gift { margin-top: 18px; border-radius: 16px; background: var(--v5-surface); border: 1px solid var(--v5-surface-2); padding: 16px 14px; }
.rs-gift__cap { display: block; font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; letter-spacing: 0.16em; color: var(--v5-brand); }
.rs-gift__amt { display: flex; align-items: baseline; justify-content: center; gap: 6px; margin-top: 8px; }
.rs-gift__usd { font-family: var(--font-v5); font-size: 34px; font-weight: 600; line-height: 1; color: var(--v5-ink); }
.rs-gift__nex { font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-nex); }
.rs-chip { display: inline-flex; align-items: center; gap: 5px; margin-top: 10px; border-radius: 9999px; padding: 4px 10px; }
.rs-chip--ok { background: color-mix(in srgb, var(--v5-success) 12%, transparent); }
.rs-chip--pd { background: color-mix(in srgb, var(--v5-warning) 12%, transparent); }
.rs-chip__t { font-size: 12px; }
.rs-chip__t--ok, .rs-chip__t--pd { color: var(--v5-ink); }
.rs-gift__note { display: block; margin-top: 8px; font-size: 12px; color: var(--v5-ink-2); line-height: 1.6; text-wrap: pretty; }
.rs-why { margin-top: 12px; border-radius: 16px; background: var(--v5-surface); overflow: hidden; text-align: left; }
.rs-why__r { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid color-mix(in srgb, var(--v5-surface-2) 70%, transparent); }
.rs-why__r:last-child { border-bottom: none; }
.rs-why__ic { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.rs-why__t { flex: 1; font-size: 12px; color: var(--v5-ink-2); line-height: 1.5; text-wrap: pretty; }
.rs-h5-download { position: absolute; right: 24px; bottom: calc(env(safe-area-inset-bottom, 0px) + 102px); left: 24px; }
.rs-h5-download__hint { display: block; font-size: 12px; color: var(--v5-ink-2); line-height: 1.5; text-wrap: pretty; }
.rs-h5-download__action { min-height: 44px; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 5px; border-radius: 9999px; color: var(--v5-brand); background: color-mix(in srgb, var(--v5-brand) 10%, transparent); }
.rs-h5-download__action--disabled { color: var(--v5-ink-3); background: var(--v5-surface); }
.rs-h5-download__action-text, .rs-h5-download__pending { font-size: 12px; font-weight: 500; }
.rs-h5-download__arrow { font-size: 13px; line-height: 1; }
.rs-footer { position: fixed; z-index: 3; right: 24px; bottom: 0; left: 24px; padding-top: 12px; padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 38px); background: linear-gradient(to bottom, transparent, var(--v5-bg) 12px); }
.rs-cta { min-height: 52px; border-radius: 9999px; background: var(--v5-brand); display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 0 24px color-mix(in srgb, var(--v5-brand) 30%, transparent); }
.rs-cta__t { font-size: 15px; font-weight: 500; color: var(--v5-on-brand); }
.active-press:active { transform: scale(0.985); opacity: 0.9; }

@media (max-height: 720px) {
  .rs-badge { width: 56px; height: 56px; }
  .rs-badge__in { width: 40px; height: 40px; }
  .rs-title { margin-top: 8px; }
  .rs-sub { margin-top: 3px; }
  .rs-gift { margin-top: 10px; padding: 10px 12px; }
  .rs-gift__amt { margin-top: 6px; }
  .rs-gift__usd { font-size: 26px; }
  .rs-chip { margin-top: 6px; }
  .rs-gift__note { margin-top: 5px; }
  .rs-why { margin-top: 6px; }
  .rs-why__r { padding: 4px 12px; }
  .rs-h5-download__hint { display: none; }
  .rs-wrap--gift { height: auto; min-height: 100%; padding-top: 18px; padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 114px); }
  .rs-wrap--gift .rs-main { position: static; flex: 1; min-height: 0; padding: 0 0 12px; }
  .rs-wrap--gift .rs-h5-download { position: sticky; bottom: calc(env(safe-area-inset-bottom, 0px) + 102px); z-index: 2; margin-bottom: 12px; background: var(--v5-bg); }
}
</style>
