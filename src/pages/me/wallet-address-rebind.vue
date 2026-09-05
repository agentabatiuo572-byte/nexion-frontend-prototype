<!--
  WalletAddressRebind — 提现地址管理。
  每网络一个当前地址,用户直填自管:
  · 未设置 → 添加流:地址输入 → 短信 OTP → 服务端落库 → 24h 安全冻结。
  · 已设置 → 展示当前地址(掩码中段 + 来源标记 + 生效时间)+ 冻结横幅(hh:mm:ss 真倒计时)
    + 频控绝对时刻 + 历史地址展开区;更换流 = 拦截判定(在途单 > 频控,store 单一判据)→
    表单 → OTP → 二次确认(明示旧址停用 + 24h 冻结 + 频控)→ 原子替换 → 成功态。
  状态 server-canonical:判定与事务在 payout-address store(PROD 由服务端 payout-addresses 接口族替换,TBD)。
  壳与 wallet 子页同款:<AppChassis active="me"> + <SubPageHeader>。
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/wallet-withdraw" :title="t.addrRebind.title" :subtitle="t.addrRebind.subtitle" />

      <view
        v-if="payoutAddressMockEnabled"
        data-testid="payout-address-mock-source"
        class="mx-4"
        style="margin-bottom: 12px; padding: 10px 12px; border-radius: 10px; background: rgba(245, 158, 11, 0.08)"
      >
        <text class="block" style="font-size: 12px; line-height: 1.5; color: var(--v5-warning)">{{ t.addrRebind.sandboxMockNotice }}</text>
      </view>

      <!-- ── 网络切换(与提现页同语汇)── -->
      <view class="mx-4" style="padding: 0 2px">
        <view><text class="font-mono-tabular" :style="metaLabelStyle">{{ t.addrRebind.networkLabel }}</text></view>
        <view class="flex" style="gap: 8px; margin-top: 8px">
          <view
            v-for="nw in NETWORKS"
            :key="nw.id"
            :class="['flex-1 flex flex-col items-center justify-center active:opacity-85', `nx-rebind-net-${nw.label.toLowerCase()}`]"
            :style="netChipStyle(nw.id)"
            role="button" tabindex="0"
            :aria-selected="network === nw.id"
            @click="switchNetwork(nw.id)"
          >
            <text :style="netChipLabelStyle(nw.id)">{{ nw.label }}</text>
            <text v-if="nw.id === 'usdt-trc20'" :style="netChipTagStyle">{{ t.topupChrome.netRecommended }}</text>
          </view>
        </view>
      </view>

      <!-- ── 成功态 ── -->
      <view v-if="step === 'success'" class="mx-4 nx-step-in" style="padding: 0 2px">
        <view class="flex flex-col items-center" style="padding: 32px 0 0">
          <view class="grid place-items-center" :style="successIconBoxStyle">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
          </view>
          <view><text class="block text-center" :style="stateTitleStyle">{{ successIsChange ? t.addrRebind.successTitle : t.addrRebind.addSuccessTitle }}</text></view>
          <view><text class="block text-center" :style="stateBodyStyle">{{ successIsChange ? t.addrRebind.successBody : t.addrRebind.addSuccessBody }}</text></view>
          <view style="margin-top: 14px" class="w-full">
            <view class="flex items-center justify-between" :style="successRowStyle">
              <text :style="successRowLabelStyle">{{ t.addrRebind.successNewAddr }}</text>
              <text class="font-mono tabular-nums" :style="successRowValStyle">{{ maskAddressMid(current?.address ?? '') }}</text>
            </view>
          </view>
          <!-- 首次添加也进入新地址安全冻结(时长取后台配置,不写死) -->
          <view v-if="!successIsChange" class="w-full flex" :style="warnlineStyle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 1px"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            <view class="flex-1 min-w-0"><text :style="warnTextStyle">{{ holdNoteText }}</text></view>
          </view>
        </view>
        <view class="nx-rebind-done-cta w-full grid place-items-center active:opacity-90" :style="primaryCtaStyle" role="button" tabindex="0" @click="finish">
          <text :style="ctaTextStyle">{{ t.addrRebind.successCta }}</text>
        </view>
      </view>

      <!-- ── OTP 确认(添加/更换共用;走既有发码冷却 / 次数上限 / 失效重取)── -->
      <view v-else-if="step === 'otp'" class="mx-4 nx-step-in" style="padding: 0 2px">
        <view style="margin-top: 18px"><text class="block" :style="stateTitleStyle">{{ t.addrRebind.otpTitle }}</text></view>
        <view><text class="block" style="margin-top: 6px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.5">{{ otpBodyText }}</text></view>
        <input
          class="nx-rebind-otp-input mt-3 w-full font-mono-tabular"
          :style="addressInputStyle"
          type="text"
          inputmode="numeric"
          maxlength="6"
          :value="otpCode"
          :placeholder="t.addrRebind.otpPlaceholder"
          @input="onOtpInput"
        />
        <view v-if="otpError"><text class="block" :style="errorTextStyle">{{ otpError }}</text></view>
        <view class="flex items-center" style="margin-top: 10px; gap: 12px">
          <view class="inline-flex items-center" :class="{ 'active:opacity-70': resendLeft <= 0 && !otpSending }" style="min-height: 44px" role="button" tabindex="0" :aria-disabled="resendLeft > 0 || otpSending ? 'true' : 'false'" @click="resendCode">
            <text style="font-size: 12px" :style="{ color: resendLeft > 0 || otpSending ? 'var(--v5-ink-4)' : 'var(--v5-brand)' }">
              {{ resendLeft > 0 ? fmt(t.addrRebind.otpResendIn, { s: resendLeft }) : t.addrRebind.otpResendCta }}
            </text>
          </view>
        </view>
        <view
          class="nx-rebind-otp-confirm w-full grid place-items-center"
          :class="{ 'active:opacity-90 transition-opacity': otpReady && !otpVerifying }"
          role="button" tabindex="0"
          :aria-disabled="otpReady && !otpVerifying ? 'false' : 'true'"
          :style="otpConfirmStyle"
          @click="confirmOtp"
        >
          <text :style="ctaTextStyle">{{ otpVerifying ? t.wallet.submitChecking : t.addrRebind.otpConfirmCta }}</text>
        </view>
        <view class="nx-rebind-otp-cancel w-full grid place-items-center active:opacity-70" :style="ghostBtnStyle" role="button" tabindex="0" @click="backToBase">
          <text :style="ghostTextStyle">{{ t.addrRebind.cancelCta }}</text>
        </view>
      </view>

      <!-- ── 表单(添加 / 更换共用:新地址输入 + 安全提示)── -->
      <view v-else-if="step === 'form'" class="mx-4" style="padding: 0 2px">
        <view v-if="mode === 'add'" style="margin-top: 16px">
          <text class="block" style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ t.addrRebind.emptyGuideTitle }}</text>
          <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px; line-height: 1.5">{{ t.addrRebind.emptyGuideBody }}</text>
        </view>
        <view style="margin-top: 16px"><text class="font-mono-tabular" :style="metaLabelStyle">{{ t.addrRebind.newAddressLabel }}</text></view>
        <input
          class="nx-rebind-address-input mt-2 w-full font-mono"
          :style="addressInputStyle"
          type="text"
          :value="newAddress"
          :placeholder="addressPlaceholder"
          @input="onAddressInput"
        />
        <view v-if="addrError"><text class="block" :style="errorTextStyle">{{ addrError }}</text></view>

        <!-- 安全提示:添加/更换均冻结 24h;每 7 天最多设置一次。 -->
        <view v-if="mode === 'change'" class="flex" :style="warnlineStyle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 1px"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
          <view class="flex-1 min-w-0"><text :style="warnTextStyle">{{ safetyNoteText }}</text></view>
        </view>
        <view v-else class="flex" :style="warnlineStyle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 1px"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          <view class="flex-1 min-w-0"><text :style="warnTextStyle">{{ holdNoteText }}</text></view>
        </view>

        <view
          class="nx-rebind-start-cta w-full grid place-items-center"
          :class="{ 'active:opacity-90 transition-opacity': canProceed && !otpSending }"
          role="button" tabindex="0"
          :aria-disabled="canProceed && !otpSending ? 'false' : 'true'"
          :style="startCtaStyle"
          @click="proceedToOtp"
        >
          <text :style="ctaTextStyle">{{ otpSending ? t.wallet.submitChecking : t.addrRebind.otpSendCta }}</text>
        </view>
        <view v-if="mode === 'change'" class="nx-rebind-cancel-link w-full grid place-items-center active:opacity-70" :style="ghostBtnStyle" role="button" tabindex="0" @click="backToBase">
          <text :style="ghostTextStyle">{{ t.addrRebind.cancelCta }}</text>
        </view>
        <view v-else class="nx-rebind-cancel-link w-full grid place-items-center active:opacity-70" :style="ghostBtnStyle" role="button" tabindex="0" @click="leave">
          <text :style="ghostTextStyle">{{ t.addrRebind.cancelCta }}</text>
        </view>
      </view>

      <!-- ── 默认态:当前地址 + 更换入口 + 历史(规格 ⑤)── -->
      <view v-else class="mx-4" style="padding: 0 2px">
        <!-- 冻结横幅(hh:mm:ss 真倒计时) -->
        <view v-if="frozenNow" class="nx-rebind-freeze-banner mt-3 flex items-start" :style="freezeBannerStyle">
          <view class="grid place-items-center shrink-0" :style="freezeIconStyle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
          </view>
          <view class="flex-1 min-w-0" style="margin-left: 10px">
            <text class="block" style="font-size: 12px; color: var(--v5-danger); font-weight: 500; line-height: 1.4">{{ freezeBannerText }}</text>
          </view>
        </view>

        <view style="margin-top: 16px"><text class="font-mono-tabular" :style="metaLabelStyle">{{ t.addrRebind.currentLabel }}</text></view>
        <view class="mt-2" :style="currentCardStyle">
          <view class="flex items-center" style="gap: 8px">
            <text class="font-mono flex-1 min-w-0" style="font-size: 13px; color: var(--v5-ink); white-space: nowrap">{{ maskAddressMid(current?.address ?? '') }}</text>
            <view v-if="current?.source === 'migrated'" class="shrink-0 grid place-items-center" :style="migratedBadgeStyle">
              <text style="font-size: 12px; font-weight: 500; color: var(--v5-ink-3)">{{ t.addrRebind.sourceMigrated }}</text>
            </view>
          </view>
          <text class="block" style="margin-top: 6px; font-size: 12px; color: var(--v5-ink-4)">{{ t.addrRebind.addedAtLabel }} · {{ fmtStamp(current?.addedAt ?? 0) }}</text>
          <!-- 新地址保护期标记(user 来源且未满 hold 时长;migrated 不产生保护期)。
               冻结期不叠挂:冻结横幅说「禁提」时再说「可能需复核」= 同屏两种结论
               (审计 P1;与 wallet-withdraw 的 !frozenNow 反冗余门同型)。 -->
          <text v-if="holdActive && !frozenNow" class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-warning); line-height: 1.4">{{ holdNoteText }}</text>
        </view>

        <!-- 更换入口 / 拦截态(在途单 > 频控,原因 + 下一步;规格 ② 异常2/3) -->
        <view v-if="changeBlock === 'withdrawal-in-flight'" class="mt-3 flex" :style="blockBoxStyle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 1px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
          <view class="flex-1 min-w-0">
            <text class="block" :style="warnTextStyle">{{ t.addrRebind.inFlightBlocked }}</text>
            <view class="nx-rebind-goto-tracking inline-flex items-center active:opacity-70" style="min-height: 44px" role="button" tabindex="0" @click="goTracking">
              <text style="font-size: 12px; font-weight: 500; color: var(--v5-brand)">{{ t.addrRebind.inFlightGoCta }} →</text>
            </view>
          </view>
        </view>
        <view v-else-if="changeBlock === 'cooldown'" class="mt-3 flex" :style="blockBoxStyle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 1px"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          <view class="flex-1 min-w-0"><text :style="warnTextStyle">{{ cooldownUntilText }}</text></view>
        </view>
        <view
          v-else
          class="nx-rebind-change-cta w-full grid place-items-center active:opacity-90"
          :style="primaryCtaStyle"
          role="button" tabindex="0"
          @click="startChange"
        >
          <text :style="ctaTextStyle">{{ t.addrRebind.changeCta }}</text>
        </view>

        <!-- 历史地址(只读,含来源与停用时间;规格 ⑥「查看历史地址」展开区) -->
        <view v-if="history.length > 0" style="margin-top: 20px">
          <view class="nx-rebind-history-toggle inline-flex items-center active:opacity-70" style="min-height: 44px" role="button" tabindex="0" :aria-expanded="historyOpen ? 'true' : 'false'" @click="historyOpen = !historyOpen">
            <text style="font-size: 12px; font-weight: 500; color: var(--v5-ink-3)">{{ historyOpen ? t.addrRebind.historyTitle : t.addrRebind.historyToggle }}</text>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ marginLeft: '4px', transform: historyOpen ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }"><path d="m6 9 6 6 6-6" /></svg>
          </view>
          <view v-if="historyOpen" class="space-y-2" style="margin-top: 4px">
            <view v-for="(h, i) in historyDesc" :key="i" :style="historyRowStyle">
              <view class="flex items-center" style="gap: 8px">
                <text class="font-mono flex-1 min-w-0" style="font-size: 12px; color: var(--v5-ink-2); white-space: nowrap">{{ maskAddressMid(h.address) }}</text>
                <text v-if="h.source === 'migrated'" class="shrink-0" style="font-size: 12px; color: var(--v5-ink-4)">{{ t.addrRebind.sourceMigrated }}</text>
              </view>
              <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-4)">{{ fmt(t.addrRebind.historyReplacedAt, { time: fmtStamp(h.replacedAt) }) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
    <CaptchaSlider v-if="showCaptcha" :phone="otpPhone" @success="onCaptchaOk" @close="showCaptcha = false" />
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type CSSProperties } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { asApiError } from "@/api/errors";
import { payoutAddressMockEnabled, payoutAddressServerEnabled } from "@/api/runtime";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import CaptchaSlider from "@/components/captcha-slider.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navBack, navTo } from "@/lib/route";
import { confirm as uiConfirm, toast } from "@/store/ui";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { usePayoutAddress } from "@/store/payout-address";
import { mockServerNow } from "@/store/server-time";
import { otpSend, otpVerify } from "@/store/auth-otp";
import {
  formatClock,
  freezeRemainingMs,
  isChainAddressValid,
  maskAddressMid,
} from "@/store/payout-address-core";
import type { ChainDepositChannel } from "@/store/types";

const t = useT();
const app = useApp();
const payout = usePayoutAddress();
const cfg = useConfig();

// ── 网络选择(标签为链名专有名词,非文案)──
const NETWORKS: { id: ChainDepositChannel; label: string }[] = [
  { id: "usdt-trc20", label: "TRC20" },
  { id: "usdt-bep20", label: "BEP20" },
  { id: "usdt-erc20", label: "ERC20" },
];
const network = ref<ChainDepositChannel>("usdt-trc20");

onLoad((options) => {
  const q = (options as Record<string, string> | undefined)?.network;
  if (q === "usdt-trc20" || q === "usdt-erc20" || q === "usdt-bep20") network.value = q;
});

// ── 视图状态机 ──
// base(无 current → form/add;有 current → view)+ 显式步骤(form/otp/success)。
type Step = "base" | "form" | "otp" | "success";
const explicitStep = ref<Step>("base");
const mode = ref<"add" | "change">("add");
const successIsChange = ref(false);
const current = computed(() => payout.currentFor(network.value));
const history = computed(() => payout.stateFor(network.value).history);
const historyDesc = computed(() => [...history.value].reverse());
const historyOpen = ref(false);
const step = computed<"view" | "form" | "otp" | "success">(() => {
  if (explicitStep.value === "otp") return "otp";
  if (explicitStep.value === "success") return "success";
  if (explicitStep.value === "form") return "form";
  return current.value ? "view" : "form"; // base:空槽直接落添加表单(内联引导语)
});
// base 态推导 mode:空槽 = add;显式进入更换 = change。
function switchNetwork(id: ChainDepositChannel) {
  if (network.value === id) return;
  network.value = id;
  explicitStep.value = "base";
  mode.value = "add";
  resetOtp();
  newAddress.value = "";
  addrError.value = "";
  historyOpen.value = false;
}

// ── 表单 ──
const newAddress = ref("");
const addrError = ref("");
const addressPlaceholder = computed(() => (network.value === "usdt-trc20" ? "TR7NHq..." : "0x..."));
const canProceed = computed(() => newAddress.value.trim().length > 0);
function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onAddressInput(e: Event) {
  newAddress.value = detailVal(e);
  addrError.value = "";
}
const effectiveMode = computed<"add" | "change">(() => (current.value ? mode.value : "add"));

// ── 拦截判定(store 单一判据:在途单 > 频控;页面不自算)──
const changeBlock = computed(() => {
  void nowTick.value; // 频控是时间函数,跨过 nextChangeAt 边界要重算
  return payout.changeBlockReason(network.value);
});
function startChange() {
  // 双门:入口判一次,store.changeAddress 落库前再判一次(与提交同款纪律)。
  if (changeBlock.value) return;
  mode.value = "change";
  explicitStep.value = "form";
}
function goTracking() {
  navTo("/pages/me/wallet-withdraw-tracking");
}

// ── OTP(走既有生命周期:冷却 / 24h 限频滑块 / TTL / 次数上限)──
const otpPhone = computed(() => app.accountKey);
// 🔴 只有账号键长得像手机号才显示掩码;种子/邮箱形态一律用通用句 ——
// 否则内部账号键(如 "default")会被当成手机号直接亮给用户(实景走查抓到)。
const otpPhoneMasked = computed(() => {
  const p = otpPhone.value;
  const digits = p.replace(/[^0-9]/g, "");
  if (digits.length < 7 || /[@a-zA-Z]/.test(p)) return "";
  return `${p.slice(0, 3)}****${p.slice(-2)}`;
});
const otpBodyText = computed(() =>
  otpPhoneMasked.value
    ? fmt(t.value.addrRebind.otpBody, { phone: otpPhoneMasked.value })
    : t.value.addrRebind.otpBodyGeneric,
);
const otpRequestId = ref<string | null>(null);
const otpCode = ref("");
const otpError = ref("");
const otpSending = ref(false);
const otpVerifying = ref(false);
// 码已核验但事务未落(用户取消了二次确认弹窗)→ 再次点确认不重复消费验证码。
const otpVerifiedOnce = ref(false);
const otpCommandKey = ref<string | null>(null);
const resendLeft = ref(0);
const showCaptcha = ref(false);
let resendTimer: ReturnType<typeof setInterval> | undefined;
const otpReady = computed(() => otpCode.value.trim().length === 6 && !!otpRequestId.value);
function onOtpInput(e: Event) {
  otpCode.value = detailVal(e).replace(/[^0-9]/g, "").slice(0, 6);
  otpError.value = "";
}
function startResendCountdown(sec: number) {
  resendLeft.value = sec;
  if (resendTimer) clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    resendLeft.value -= 1;
    if (resendLeft.value <= 0 && resendTimer) clearInterval(resendTimer);
  }, 1000);
}
function resetOtp() {
  otpRequestId.value = null;
  otpCode.value = "";
  otpError.value = "";
  otpVerifiedOnce.value = false;
  otpCommandKey.value = null;
  resendLeft.value = 0;
  if (resendTimer) clearInterval(resendTimer);
}
async function sendCode(captchaTicket?: string) {
  if (otpSending.value) return;
  otpSending.value = true;
  try {
    if (payoutAddressServerEnabled) {
      try {
        const challenge = await payout.sendRemoteOtp();
        otpRequestId.value = challenge.challengeNo;
        otpCommandKey.value = `payout-address:${globalThis.crypto?.randomUUID?.()
          ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
        startResendCountdown(60);
        explicitStep.value = "otp";
      } catch (cause) {
        const error = asApiError(cause);
        if (error.message === "PAYOUT_ADDRESS_OTP_COOLDOWN" || error.message === "PAYOUT_ADDRESS_OTP_DAILY_LIMIT") {
          addrError.value = fmt(t.value.addrRebind.otpRateLimited, { s: 60 });
        } else {
          toast.error(t.value.addrRebind.otpSendFailed);
        }
      }
      return;
    }
    const res = await otpSend(otpPhone.value, "payout-address", captchaTicket);
    if (res.ok) {
      otpRequestId.value = res.requestId;
      startResendCountdown(res.resendAfterSec);
      explicitStep.value = "otp";
      return;
    }
    if (res.error === "captcha_required") {
      showCaptcha.value = true;
      return;
    }
    if (res.error === "rate_limited") {
      // 冷却期不重发也不失效现有码:已有 requestId 时直接进码输入,倒计时接管
      if (otpRequestId.value) {
        startResendCountdown(res.retryAfterSec);
        explicitStep.value = "otp";
      } else {
        // 新页面实例撞上账号级发码冷却(如添加后立刻更换):toast 转瞬即逝,
        // 表单区再落一条常驻提示,按钮才不像失灵(审计 P2)。
        addrError.value = fmt(t.value.addrRebind.otpRateLimited, { s: res.retryAfterSec });
        toast.error(fmt(t.value.addrRebind.otpRateLimited, { s: res.retryAfterSec }));
      }
      return;
    }
    toast.error(t.value.addrRebind.otpSendFailed);
  } finally {
    otpSending.value = false;
  }
}
function onCaptchaOk(ticket: string) {
  showCaptcha.value = false;
  void sendCode(ticket);
}
function resendCode() {
  if (resendLeft.value > 0 || otpSending.value) return;
  void sendCode();
}
function proceedToOtp() {
  if (!canProceed.value || otpSending.value) return;
  const addr = newAddress.value;
  if (!isChainAddressValid(network.value, addr)) {
    addrError.value = t.value.addrRebind.invalidAddress; // 字段级红字,永不静默截断/自动纠正
    return;
  }
  if (effectiveMode.value === "change" && payout.currentFor(network.value)?.address === addr.trim()) {
    addrError.value = t.value.addrRebind.sameAddress;
    return;
  }
  void sendCode();
}
async function confirmOtp() {
  if (!otpReady.value || otpVerifying.value) return;
  otpVerifying.value = true;
  try {
    if (payoutAddressServerEnabled) {
      await applyAfterOtp();
      return;
    }
    if (!otpVerifiedOnce.value) {
      const res = await otpVerify(otpPhone.value, "payout-address", otpRequestId.value!, otpCode.value.trim());
      if (!res.ok) {
        if (res.error === "otp_invalid") otpError.value = fmt(t.value.addrRebind.otpInvalid, { n: res.attemptsLeft });
        else if (res.error === "otp_expired") otpError.value = t.value.addrRebind.otpExpired;
        else if (res.error === "otp_attempts_exceeded") otpError.value = t.value.addrRebind.otpExhausted;
        else otpError.value = t.value.addrRebind.startFailed;
        return;
      }
      otpVerifiedOnce.value = true;
    }
    await applyAfterOtp();
  } finally {
    otpVerifying.value = false;
  }
}
async function applyAfterOtp() {
  const isChange = effectiveMode.value === "change";
  if (isChange) {
    // 二次确认发生在远端 OTP 被消费之前;取消不会制造半完成事务。
    const ok = await uiConfirm({
      title: t.value.addrRebind.changeConfirmTitle,
      message: fmt(t.value.addrRebind.changeConfirmBody, { days: cooldownDays.value }),
      icon: "warn",
      confirmLabel: t.value.addrRebind.changeConfirmYes,
    });
    if (!ok) return;
  }

  if (payoutAddressServerEnabled) {
    try {
      await payout.saveRemoteAddress({
        network: network.value,
        address: newAddress.value,
        challengeNo: otpRequestId.value!,
        code: otpCode.value.trim(),
        idempotencyKey: otpCommandKey.value!,
      });
      successIsChange.value = isChange;
      explicitStep.value = "success";
      resetOtp();
    } catch (cause) {
      const error = asApiError(cause);
      if (error.message === "PAYOUT_ADDRESS_OTP_INVALID") otpError.value = t.value.addrRebind.startFailed;
      else if (error.message === "PAYOUT_ADDRESS_CHANGE_BLOCKED_BY_WITHDRAWAL") toast.error(t.value.addrRebind.inFlightBlocked);
      else if (error.message === "PAYOUT_ADDRESS_CHANGE_COOLDOWN") toast.error(cooldownUntilText.value);
      else if (error.message === "PAYOUT_ADDRESS_FORMAT_INVALID") addrError.value = t.value.addrRebind.invalidAddress;
      else toast.error(t.value.addrRebind.startFailed);
    }
    return;
  }

  if (effectiveMode.value === "add") {
    const res = payout.addAddress(network.value, newAddress.value);
    if (!res.ok) {
      // already-set = 并发竞态(另一端刚添加),回落展示态;其余给通用失败(不静默)。
      if (res.reason === "invalid-address") addrError.value = t.value.addrRebind.invalidAddress;
      else toast.error(t.value.addrRebind.startFailed);
      explicitStep.value = "base";
      resetOtp();
      return;
    }
    successIsChange.value = false;
    explicitStep.value = "success";
    resetOtp();
    return;
  }
  // Mock-only 更换:本地 OTP 已消费;取消确认后可再次使用本次已验证状态。
  const res = payout.changeAddress(network.value, newAddress.value);
  if (!res.ok) {
    if (res.reason === "withdrawal-in-flight") toast.error(t.value.addrRebind.inFlightBlocked);
    else if (res.reason === "cooldown") toast.error(cooldownUntilText.value);
    else if (res.reason === "invalid-address") addrError.value = t.value.addrRebind.invalidAddress;
    else if (res.reason === "same-address") addrError.value = t.value.addrRebind.sameAddress;
    else toast.error(t.value.addrRebind.startFailed);
    explicitStep.value = res.reason === "invalid-address" || res.reason === "same-address" ? "form" : "base";
    resetOtp();
    return;
  }
  successIsChange.value = true;
  explicitStep.value = "success";
  resetOtp();
}
function backToBase() {
  explicitStep.value = "base";
  mode.value = "add";
  resetOtp();
  addrError.value = "";
}

// ── 冻结 / 频控展示(server 时钟 1s tick)──
const nowTick = ref(mockServerNow());
let tickTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  // refreshRemote 自吞不 reject(resilience 门);失败信号走返回值。
  if (payoutAddressServerEnabled) void payout.refreshRemote().then((ok) => { if (!ok) toast.error(t.value.addrRebind.startFailed); });
  tickTimer = setInterval(() => (nowTick.value = mockServerNow()), 1000);
});
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
  if (resendTimer) clearInterval(resendTimer);
});
const freezeLeftMs = computed(() => freezeRemainingMs(payout.stateFor(network.value).freezeUntil, nowTick.value));
const frozenNow = computed(() => freezeLeftMs.value > 0);
const freezeBannerText = computed(() =>
  fmt(t.value.addrRebind.freezeBanner, { t: formatClock(freezeLeftMs.value, { hours: true }) }),
);
const cooldownDays = computed(() => payout.changeCooldownDays ?? cfg.config.withdrawRules.rebindCooldownDays);
function fmtStamp(ts: number): string {
  const d = new Date(ts);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
// 频控拦截给绝对时刻(平台口径,不说「明天」;规格 ② 异常3)
const cooldownUntilText = computed(() => {
  const at = payout.stateFor(network.value).nextChangeAt;
  return fmt(t.value.addrRebind.cooldownUntil, { time: at ? fmtStamp(at) : "" });
});
const safetyNoteText = computed(() => fmt(t.value.addrRebind.safetyNote, { days: cooldownDays.value }));
// 新地址保护期标记:时长取后台配置(newAddressHoldHours),判定输入与风控信号同源
const holdHours = computed(() => payout.effectiveDelayHours ?? cfg.config.withdrawRules.newAddressHoldHours);
const holdNoteText = computed(() => fmt(t.value.addrRebind.holdNote, { h: holdHours.value }));
const holdActive = computed(() => {
  const c = current.value;
  if (!c || c.source !== "user") return false;
  return nowTick.value - c.addedAt < holdHours.value * 3600 * 1000;
});

// ── 动作 ──
function leave() {
  navBack("/pages/me/wallet-withdraw");
}
function finish() {
  navBack("/pages/me/wallet-withdraw"); // 完成后返回提现页,地址由响应式 store 即时回填
}

// ── styles ──
const metaLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
// 输入框零描边,贴页面底(容器无底色 → surface L1,与既有子页同型)。
const addressInputStyle: CSSProperties = {
  width: "100%",
  minHeight: "48px",
  background: "var(--v5-surface)",
  borderRadius: "12px",
  padding: "12px",
  boxSizing: "border-box",
  fontSize: "13px",
  color: "var(--v5-ink)",
};
const errorTextStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "12px",
  color: "var(--v5-danger)",
  lineHeight: 1.4,
};
function netChipStyle(id: ChainDepositChannel): CSSProperties {
  const on = network.value === id;
  return {
    minHeight: "56px",
    borderRadius: "16px",
    gap: "2px",
    padding: "8px 6px",
    background: on ? "var(--v5-brand-soft)" : "var(--v5-surface)",
  };
}
function netChipLabelStyle(id: ChainDepositChannel): CSSProperties {
  return {
    fontSize: "13px",
    fontWeight: 600,
    color: network.value === id ? "var(--v5-brand)" : "var(--v5-ink-2)",
  };
}
const netChipTagStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-brand)",
  textAlign: "center",
  lineHeight: 1.3,
};
const warnlineStyle: CSSProperties = {
  marginTop: "16px",
  padding: "12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
  gap: "8px",
};
const warnTextStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.5,
};
const blockBoxStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
  gap: "8px",
};
const currentCardStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  background: "var(--v5-surface)",
};
const migratedBadgeStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
};
const historyRowStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "12px",
  background: "var(--v5-surface)",
};
const startCtaStyle = computed<CSSProperties>(() => ({
  marginTop: "20px",
  height: "48px",
  borderRadius: "999px",
  background: canProceed.value && !otpSending.value ? "var(--v5-brand)" : "var(--v5-surface-2)",
  color: canProceed.value && !otpSending.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
}));
const otpConfirmStyle = computed<CSSProperties>(() => ({
  marginTop: "20px",
  height: "48px",
  borderRadius: "999px",
  background: otpReady.value && !otpVerifying.value ? "var(--v5-brand)" : "var(--v5-surface-2)",
  color: otpReady.value && !otpVerifying.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
}));
const ctaTextStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
};
const primaryCtaStyle: CSSProperties = {
  marginTop: "16px",
  height: "48px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
};
const ghostBtnStyle: CSSProperties = {
  marginTop: "10px",
  minHeight: "44px",
  borderRadius: "999px",
};
const ghostTextStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
};
const freezeBannerStyle: CSSProperties = {
  background: "color-mix(in srgb, var(--v5-danger) 8%, transparent)",
  borderRadius: "12px",
  padding: "10px 12px",
};
const freezeIconStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--v5-danger) 16%, transparent)",
};
const successIconBoxStyle: CSSProperties = {
  width: "52px",
  height: "52px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-success) 14%, transparent)",
};
const stateTitleStyle: CSSProperties = {
  marginTop: "14px",
  fontSize: "20px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const stateBodyStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.55,
  maxWidth: "300px",
};
const successRowStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  background: "var(--v5-surface)",
  gap: "8px",
};
const successRowLabelStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const successRowValStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--v5-ink)",
};
</script>

<style scoped>
:deep(.nx-rebind-address-input .uni-input-input),
:deep(.nx-rebind-otp-input .uni-input-input) {
  min-height: 22px;
  height: 22px;
  line-height: 22px;
}
</style>
