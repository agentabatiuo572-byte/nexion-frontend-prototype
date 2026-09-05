<!--
  TopupCardForm — ported from me/wallet/topup/page.tsx CardPayForm.
  Stripe/Checkout.com-style hosted card page: amount input (USDT + card fee 另收
  → USD charged;费率/限额单源在 deposits-core,此处不复述数值) + card form
  (number / expiry / CVV / holder / country / ZIP,
  brand auto-detect) + "Pay $X" CTA + PCI/3DS trust footer. Submit → processing →
  3DS → deposits.submitCardPayment()：store 扮演收单方授权 + server 入账，成功落
  credited 入金单（走与链上/银行轨同一状态机，后台对账可见）+ 记账 + 写账单，
  失败展示拒付并可重试。费率/最低额单源在 deposits-core。All data is mock.
-->
<template>
  <!-- 🔴 vault 包住**全部阶段**,不能只包表单分支:拒付切到失败态会卸载表单分支,
       vault 若在里面就连同已输入的卡一起销毁,点重试得重输整张卡(改造前那些值住在
       本组件、不随分支卸载,是活的)。真实收单方拒付后也保留已输入卡号。
       状态在 vault、输入框无状态,所以字段可以随分支来去而值仍在 —— 这正是当初
       把状态放 vault 的原因。vault 渲染 <slot/> 零 DOM,space-y-3 的子元素间距不受影响。 -->
  <HostedCardVault ref="vaultRef" @change="onCardChange">
  <view class="mx-4 space-y-3">
    <FundsSandboxBadge />
    <!-- Header row -->
    <view class="flex items-center justify-between" style="padding: 0 4px">
      <text class="font-mono-tabular" style="font-size: 12px; font-weight: 500; letter-spacing: 0.06em; color: var(--v5-ink-3)">Visa / Mastercard</text>
      <!-- 授权进行中不可中断:此时切走会卸载本组件,但计时中的授权仍会落账 ——
           入口留着等于把「无取消出口」伪装成有,故只在可操作的两态显示。 -->
      <text v-if="phase === 'form' || phase === 'fail'" style="font-size: 12px; color: var(--v5-ink-3)" @click="emit('changeChannel')">{{ t.topupChrome.change }}</text>
    </view>
    <!-- Processing / 3DS -->
    <view v-if="phase === 'processing' || phase === '3ds'" class="rounded-2xl text-center" :style="centerCardStyle">
      <view :style="spinnerStyle" />
      <text class="block" :style="centerTitleStyle">{{ phase === 'processing' ? t.topupChrome.authorizingCard : t.topupChrome.secureVerification }}</text>
      <text class="block" :style="centerBodyStyle">{{ phase === 'processing' ? t.topupChrome.submittingToBank : t.topupChrome.bankMayText }}</text>
      <view class="inline-flex items-center font-mono-tabular" :style="pciChipStyle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
        <text style="margin-left: 6px">PCI DSS Level 1 · 3DS 2.2</text>
      </view>
    </view>

    <!-- Success -->
    <view v-else-if="phase === 'success'" class="rounded-2xl text-center" :style="centerCardStyle">
      <view :style="successIconStyle">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
      </view>
      <text class="block" :style="successTitleStyle">{{ t.topupChrome.paySuccess }}</text>
      <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ fmt(t.topupChrome.creditedToWallet, { amount: usdtAmount.toFixed(2) }) }}</text>
      <text class="block font-mono-tabular" style="margin-top: 12px; font-size: 12px; color: var(--v5-ink-4)">{{ receiptLine }}</text>
      <view class="inline-block w-full text-center active:opacity-90" :style="successBtnStyle" @click="goWallet"><text>{{ t.topupChrome.backToWallet }}</text></view>
    </view>

    <!-- Fail -->
    <view v-else-if="phase === 'fail'" class="rounded-2xl text-center" :style="centerCardStyle">
      <view :style="failIconStyle"><text style="font-size: 32px">⚠️</text></view>
      <text class="block" :style="failTitleStyle">{{ t.topupChrome.payDeclined }}</text>
      <text class="block font-mono-tabular break-all" style="margin-top: 8px; font-size: 12px; color: var(--v5-brand-2)">{{ t.topupChrome.payDeclinedReason }}</text>
      <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.625; max-width: 280px; margin-left: auto; margin-right: auto">{{ t.topupChrome.contactIssuer }}</text>
      <view class="w-full grid place-items-center active:opacity-70" :style="tryAgainBtnStyle" @click="retry"><text>{{ t.ui.retry }}</text></view>
    </view>

    <!-- Form -->
    <template v-else>
      <!-- Amount preview — keeps its surface (input zone), border dropped -->
      <view class="rounded-2xl" :style="amountCardStyle">
        <text class="block font-mono-tabular" style="font-size: 12px; font-weight: 500; color: var(--v5-ink-3); letter-spacing: 0.06em">{{ t.topupChrome.youReceive }}</text>
        <view class="flex items-baseline" style="margin-top: 4px; gap: 6px">
          <text style="font-family: var(--font-v5); font-size: 15px; color: var(--v5-ink-3)">$</text>
          <input class="flex-1 min-w-0 tabular-nums" :style="amountInputStyle" type="text" inputmode="decimal" :value="amount" placeholder="0.00" @input="onAmount" />
          <text class="font-mono-tabular" style="font-size: 15px; color: var(--v5-ink-3)">USDT</text>
        </view>
        <view class="grid grid-cols-2" :style="feeRowStyle">
          <text style="font-size: 12px; color: var(--v5-ink-3)">{{ fmt(t.topupChrome.cardFeeLabel, { rate: feeRateLabel }) }} · <text class="font-mono-tabular tabular-nums" style="color: var(--v5-ink-2); margin-left: 4px">${{ feeUSD.toFixed(2) }}</text></text>
          <text class="text-right" style="font-size: 12px"><text style="color: var(--v5-ink-3)">{{ t.topupChrome.cardCharged }}</text><text class="font-mono-tabular tabular-nums" style="font-weight: 600; color: var(--v5-ink); margin-left: 4px">${{ chargeUSD.toFixed(2) }}</text></text>
        </view>
        <!-- 限额常驻:事前告知 + 越界即禁用原因(不让用户填完一整张卡才吃「发卡行拒绝」)。 -->
        <view><text class="block" :style="limitHintStyle">{{ limitHint }}</text></view>
      </view>

      <!-- Card form — outer shell dropped; the surface-2 fields are the units.
           卡号/有效期/CVV 归 <HostedCardVault>(收单方托管,本组件拿不到明文);
           持卡人/国家/邮编是账单信息不是卡数据,照旧由本组件收(真实 SDK 亦然)。 -->
      <view class="space-y-3" :style="formCardStyle">
        <view :style="fieldStyle">
          <text class="block font-mono-tabular" :style="fieldLabelStyle">{{ t.wallet.ffCardNumber }}</text>
          <view class="flex items-center" style="margin-top: 2px; gap: 8px">
            <HostedCardField kind="pan" class="font-mono-tabular flex-1 min-w-0 tabular-nums" :input-style="fieldInputStyle" placeholder="1234 5678 9012 3456" :aria-label="t.wallet.ffCardNumber" />
            <CardBrandBadge :brand="badgeBrand" />
          </view>
        </view>

        <view class="grid grid-cols-2" style="gap: 8px">
          <view :style="fieldStyle">
            <text class="block font-mono-tabular" :style="fieldLabelStyle">{{ t.wallet.ffExpiry }}</text>
            <HostedCardField kind="expiry" class="font-mono-tabular w-full tabular-nums" :input-style="fieldInputStyle" placeholder="MM/YY" :aria-label="t.wallet.ffExpiry" />
          </view>
          <view :style="fieldStyle">
            <text class="block font-mono-tabular" :style="fieldLabelStyle">{{ t.wallet.ffCvv }}</text>
            <HostedCardField kind="cvv" class="font-mono-tabular w-full tabular-nums" :input-style="fieldInputStyle" placeholder="•••" :aria-label="t.wallet.ffCvv" />
          </view>
        </view>

        <view :style="fieldStyle">
          <text class="block font-mono-tabular" :style="fieldLabelStyle">{{ t.wallet.ffCardholder }}</text>
          <input class="w-full" :style="[fieldInputStyle, { letterSpacing: '0.04em' }]" type="text" :value="holder" :placeholder="t.wallet.cardNamePlaceholder" @input="onHolder" />
        </view>

        <view class="grid" style="grid-template-columns: 1fr 120px; gap: 8px">
          <view :style="fieldStyle">
            <text class="block font-mono-tabular" :style="fieldLabelStyle">{{ t.wallet.ffCountry }}</text>
            <picker mode="selector" :range="COUNTRY_LABELS" :value="countryIdx" @change="onCountry">
              <text class="block" :style="[fieldInputStyle, { marginTop: '2px' }]">{{ COUNTRY_LABELS[countryIdx] }}</text>
            </picker>
          </view>
          <view :style="fieldStyle">
            <text class="block font-mono-tabular" :style="fieldLabelStyle">{{ t.wallet.ffZip }}</text>
            <input class="font-mono-tabular w-full" :style="fieldInputStyle" type="text" :value="zip" placeholder="10001" @input="onZip" />
          </view>
        </view>
      </view>

      <!-- Submit -->
      <!-- 禁用态不给按压反馈:否则死按钮假装自己活着(点了没反应还闪一下)。 -->
      <view class="w-full flex items-center justify-center" :class="isValid ? 'active:opacity-90' : ''" :style="submitBtnStyle" @click="handleSubmit">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" :stroke="isValid ? 'var(--v5-on-brand)' : 'var(--v5-ink-4)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
        <text style="margin-left: 6px">{{ fmt(t.topupChrome.payCta, { amount: `$${chargeUSD.toFixed(2)}` }) }}</text>
      </view>

      <!-- Trust footer -->
      <view class="flex items-start" :style="trustFootStyle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px; flex-shrink: 0"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
        <text style="margin-left: 8px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.625">{{ t.topupChrome.trustFootnote }}</text>
      </view>
    </template>
  </view>
  </HostedCardVault>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from "vue";
import FundsSandboxBadge from "@/components/me/funds-sandbox-badge.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useDeposits } from "@/store/deposits";
import { mockFundsEnabled } from "@/api/runtime";
import {
  MAX_CARD_DEPOSIT_USDT,
  MIN_CARD_DEPOSIT_USDT,
  cardChargeUsd,
  cardFeeRateLabel,
  cardFeeUsd,
} from "@/store/deposits-core";
import CardBrandBadge from "@/components/me/card-brand-badge.vue";
import HostedCardVault from "@/components/me/hosted-card-vault.vue";
import HostedCardField from "@/components/me/hosted-card-field.vue";
import type { CardBrand } from "@/store/cards-core";
import { runRecoverableFundsOperation } from "@/lib/recoverable-funds-operation";

const emit = defineEmits<{ changeChannel: [] }>();

const t = useT();
const deposits = useDeposits();

const amount = ref("50");
// 🔴 卡号 / 有效期 / CVV 不在本组件 —— 归 <HostedCardVault>,本组件只收到
// ready(可否提交)与 brand(卡组织图标),提交时经 tokenize() 拿 token + 后四位。
const vaultRef = ref<InstanceType<typeof HostedCardVault> | null>(null);
const cardReady = ref(false);
const cardBrand = ref<CardBrand>("unknown");
function onCardChange(e: { ready: boolean; brand: CardBrand }) {
  cardReady.value = e.ready;
  cardBrand.value = e.brand;
}
// 徽章只认 visa/mc/amex;unionpay 落 unknown(本通道只收 Visa/Mastercard,
// 与改造前该组件的判断结果一致,不引入展示变化)。
const badgeBrand = computed<"visa" | "mc" | "amex" | "unknown">(() => {
  if (cardBrand.value === "mastercard") return "mc";
  if (cardBrand.value === "visa" || cardBrand.value === "amex") return cardBrand.value;
  return "unknown";
});
const holder = ref("");
const zip = ref("");
const COUNTRY_LABELS = [
  "🇺🇸 United States",
  "🇬🇧 United Kingdom",
  "🇨🇦 Canada",
  "🇦🇺 Australia",
  "🇩🇪 Germany",
  "🇯🇵 Japan",
  "🇸🇬 Singapore",
  "🇭🇰 Hong Kong",
  "🇦🇪 UAE",
];
const countryIdx = ref(0);
const phase = ref<"form" | "processing" | "3ds" | "success" | "fail">("form");
const failureReason = ref("");

const usdtAmount = computed(() => Math.max(0, parseFloat(amount.value) || 0));
// 费率/最低额单源在 deposits-core(真后台 = D1 通道配置下发),组件禁写死。
const feeUSD = computed(() => cardFeeUsd(usdtAmount.value));
const chargeUSD = computed(() => cardChargeUsd(usdtAmount.value));

// 费率标签由常量派生(此前文案里写死 "3.5%",后台调费率文案不跟);
// 派生公式住 deposits-core,四个消费方共用一份。
const feeRateLabel = computed(() => cardFeeRateLabel());
const limitHint = computed(() =>
  fmt(t.value.topupChrome.cardLimitHint, {
    min: `$${MIN_CARD_DEPOSIT_USDT}`,
    max: `$${MAX_CARD_DEPOSIT_USDT.toLocaleString("en-US")}`,
  }),
);
/** 越界(高于上限 / 低于下限但已填了金额)→ 提示转警示色,当禁用原因用。 */
const amountOutOfRange = computed(
  () => usdtAmount.value > 0 && (usdtAmount.value < MIN_CARD_DEPOSIT_USDT || usdtAmount.value > MAX_CARD_DEPOSIT_USDT),
);

// 卡通道限额(通道收窄裁决;链上 USDT 通道 min 更低,见 MIN_DEPOSIT_USDT)。
// 上限门与 store 的 submitCardPayment 同源:界面先拦,绕过界面也拦得住。
const isValid = computed(
  () =>
    usdtAmount.value >= MIN_CARD_DEPOSIT_USDT &&
    usdtAmount.value <= MAX_CARD_DEPOSIT_USDT &&
    cardReady.value &&
    holder.value.trim().length >= 2 &&
    zip.value.trim().length >= 3,
);

// 授权号 = 收据号 = 账单 ref,三处同源(此前收据号是 computed 内现摇的随机数,
// 任一响应式依赖变化就换一个号,且与账单 ref 对不上)。
const authCode = ref("");
// 后四位来自 tokenize() 的回执(本组件唯一能看到的卡片段),提交时定格。
const last4 = ref("");
const receiptLine = computed(() =>
  fmt(t.value.topupChrome.receiptLine, { no: authCode.value, amount: chargeUSD.value.toFixed(2), last4: last4.value }),
);

// ── input handlers (uni input event → e.detail.value) ──
function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onAmount(e: Event) {
  // 数字 + 单小数点 + 两位小数(与 deposit-bank-pane 同款):只剥非法字符的话
  // "50.5.5" 会原样回显,而 parseFloat 只取 50.5 —— 屏幕数字与实扣金额对不上。
  const raw = detailVal(e).replace(/[^\d.]/g, "");
  const m = raw.match(/^(\d*)(?:\.(\d{0,2}))?/);
  amount.value = m ? m[1] + (m[2] !== undefined ? `.${m[2]}` : "") : "";
}
function onHolder(e: Event) {
  holder.value = detailVal(e).toUpperCase();
}
function onZip(e: Event) {
  zip.value = detailVal(e).toUpperCase().slice(0, 10);
}
function onCountry(e: Event) {
  countryIdx.value = Number(detailVal(e)) || 0;
}

async function handleSubmit() {
  // 🔴 重入守卫(2026-08-04 对抗审计 P2-7):按钮只在 form 态渲染,但那是**渲染**层的拦截 ——
  // 同一 tick 内的双击(或触摸 + 点击双发)会在 `phase.value = "processing"` 生效前
  // 进来第二遍,于是两次授权、两条入金单、两次扣款。判据放在函数第一行,不依赖渲染时序。
  if (phase.value !== "form") return;
  if (!isValid.value) return;
  // 先向收单方取 token(真实现 = SDK createToken;未填全返 null,对齐其 incomplete
  // 错误)。明文不经本组件,后续全程只带 token 与后四位。
  const card = vaultRef.value?.tokenize();
  if (!card) return;
  last4.value = card.last4;
  // 授权前捕获账号:这段 3.8s 等待活在组件里,期间会话可能被踢/登出(App.vue 会把
  // 各 store 重绑到 default),回来若不校验就会把钱记进别人账上。store 侧比对后作废。
  const acct = deposits.currentAccountKey();
  failureReason.value = "";
  phase.value = "processing";
  await runRecoverableFundsOperation(async () => {
      await new Promise((r) => setTimeout(r, 1400));
      phase.value = "3ds";
      await new Promise((r) => setTimeout(r, 2400));
      // 授权 + 落入金单 + 记账 + 写账单全部由 deposits store 扮演的服务端完成;
      // 组件只提交并按结果切展示态,不写任何资金状态(status server-canonical)。
      const rec = mockFundsEnabled
        ? await deposits.createSandboxTopup("CARD", usdtAmount.value, acct)
        : deposits.submitCardPayment(usdtAmount.value, acct);
      if (!rec) throw new Error(t.value.topupChrome.payDeclinedReason);
      return rec;
    }, {
      success: (rec) => {
        authCode.value = rec.authCode ?? rec.depositId;
        phase.value = "success";
      },
      failure: (reason) => {
        failureReason.value = reason;
        phase.value = "fail";
      },
      settled: () => {},
    }, t.value.topupChrome.payDeclinedReason);
}

function retry() {
  failureReason.value = "";
  phase.value = "form";
}

function goWallet() {
  uni.reLaunch({ url: "/pages/me/wallet", fail: () => {} });
}

// ── styles ──
// Filled state card — bg only, no border (single visual difference).
const centerCardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  padding: "24px",
};
const spinnerStyle: CSSProperties = {
  width: "48px",
  height: "48px",
  margin: "0 auto",
  borderRadius: "50%",
  border: "2px solid color-mix(in srgb, var(--v5-brand-2) 30%, transparent)",
  borderTopColor: "var(--v5-tech-cyan)",
  animation: "spin 1s linear infinite",
};
const centerTitleStyle: CSSProperties = {
  marginTop: "14px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  letterSpacing: "-0.005em",
  color: "var(--v5-ink)",
};
const centerBodyStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.625,
  maxWidth: "280px",
  marginLeft: "auto",
  marginRight: "auto",
};
const pciChipStyle: CSSProperties = {
  marginTop: "16px",
  padding: "4px 10px",
  borderRadius: "6px",
  background: "color-mix(in srgb, var(--v5-surface-2) 50%, transparent)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const successIconStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  margin: "0 auto",
  borderRadius: "50%",
  background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)",
  display: "grid",
  placeItems: "center",
};
const successTitleStyle: CSSProperties = {
  marginTop: "14px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const successBtnStyle: CSSProperties = {
  marginTop: "20px",
  height: "44px",
  lineHeight: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
};
const failIconStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  margin: "0 auto",
  borderRadius: "50%",
  background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)",
  display: "grid",
  placeItems: "center",
};
const failTitleStyle: CSSProperties = {
  marginTop: "14px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const tryAgainBtnStyle: CSSProperties = {
  marginTop: "20px",
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink)",
  fontSize: "15px",
  fontWeight: 600,
};
const amountCardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  padding: "16px",
};
const amountInputStyle: CSSProperties = {
  background: "transparent",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "34px",
  letterSpacing: "-0.022em",
  color: "var(--v5-ink)",
};
const feeRowStyle: CSSProperties = {
  marginTop: "8px",
  paddingTop: "8px",
  gap: "8px",
  borderTop: "1px solid var(--v5-border)",
};
// 越界时转警示色 —— 提示行同时承担「为什么按钮点不动」。
const limitHintStyle = computed<CSSProperties>(() => ({
  marginTop: "6px",
  fontSize: "12px",
  color: amountOutOfRange.value ? "var(--v5-brand-2)" : "var(--v5-ink-4)",
}));
// De-carded — fields sit directly on the page floor.
const formCardStyle: CSSProperties = {
  padding: "2px 0 0",
};
const fieldStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "8px",
  background: "var(--v5-surface-2)",
};
const fieldLabelStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const fieldInputStyle: CSSProperties = {
  marginTop: "2px",
  background: "transparent",
  fontSize: "15px",
  color: "var(--v5-ink)",
};
// on-brand: near-black on the brand fill — ink (near-white in dark) fails AA.
const submitBtnStyle = computed<CSSProperties>(() => ({
  gap: "6px",
  height: "50px",
  borderRadius: "999px",
  background: isValid.value ? "var(--v5-brand)" : "var(--v5-surface-2)",
  color: isValid.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "15px",
  letterSpacing: "-0.005em",
}));
// Plain trust note on the page floor — the boxed chrome added nothing.
const trustFootStyle: CSSProperties = {
  padding: "2px 6px 0",
};
</script>
