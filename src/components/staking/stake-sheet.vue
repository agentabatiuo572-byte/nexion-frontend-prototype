<!--
  StakeSheet — customize-and-lock staking sheet. uni has no chassis sheet host
  for sub-pages, so the sheet is embedded in staking.vue and toggled via
  `v-model:open` + a `term` prop. Slide-up is a CSS <transition>.

  Cross-store side-effect (架构铁律): submit 在这里组合「扣款⊗记账 + 建仓」(收口点
  postMoneyBill,见 lib/money-receipt.ts),不在 store 里;不裸调资金原语 / 账单写入。
-->
<template>
  <view v-if="open && term !== null">
    <transition name="nx-sheet-fade">
      <view v-if="open" class="nx-sheet-backdrop" role="dialog" aria-modal="true" @click="emitClose" />
    </transition>
    <transition name="nx-sheet-slide">
      <view v-if="open" class="nx-sheet-panel" :style="panelStyle" @click.stop>
        <!-- Title row -->
        <view class="flex items-start justify-between" style="margin-bottom: 16px">
          <view>
            <text class="block" :style="titleStyle">{{ titleText }}</text>
            <text class="block" :style="subtitleStyle">{{ subtitleText }}</text>
          </view>
          <view class="inline-flex items-center justify-center active:opacity-60" :style="closeBtnStyle" @click="emitClose">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
        </view>

        <!-- Amount input + presets -->
        <view :style="amountWrapStyle">
          <text class="block" :style="amountLabelStyle">{{ t.stakingV3.sheet.amount }}</text>
          <view class="flex items-baseline" style="margin-top: 8px; gap: 8px">
            <text class="shrink-0" :style="dollarStyle">$</text>
            <input class="nx-staking-sheet-amount-input flex-1 min-w-0 tabular-nums" :style="inputStyle" type="text" inputmode="decimal" :value="String(amount)" @input="onAmountInput" />
            <text class="shrink-0" :style="usdtStyle">USDT</text>
          </view>
          <!-- Presets -->
          <view class="grid grid-cols-4" style="margin-top: 16px; gap: 8px">
            <view v-for="p in PRESETS" :key="p" class="active:opacity-80" :style="presetStyle(p)" @click="amount = p">
              <text>${{ p.toLocaleString() }}</text>
            </view>
          </view>
          <!-- Balance / Max -->
          <view class="flex items-center justify-between" :style="balanceRowStyle">
            <text class="tabular-nums">
              <text>{{ t.stakingV3.sheet.balance }} </text>
              <text style="color: var(--v5-ink); font-weight: 500">${{ balanceText }}</text>
            </text>
            <text class="nx-staking-sheet-max-cta" :style="maxStyle" @click="setMax">{{ t.stakingV3.sheet.max }}</text>
          </view>
        </view>

        <!-- Projection -->
        <view :style="projectionStyle">
          <view class="flex items-center justify-between">
            <text :style="rowLabelStyle">{{ t.stakingV3.sheet.principal }}</text>
            <text class="tabular-nums" :style="rowValStyle">${{ principalText }}</text>
          </view>
          <view class="flex items-center justify-between">
            <text :style="rowLabelStyle">{{ interestLabel }}</text>
            <text class="tabular-nums" :style="rowValSuccessStyle">+${{ interestText }}</text>
          </view>
          <view class="flex items-center justify-between">
            <text :style="rowLabelStyle">{{ t.stakingV3.sheet.unlockDate }}</text>
            <text class="tabular-nums" :style="rowValStyle">{{ unlockDateText }}</text>
          </view>
          <view :style="dividerStyle" />
          <view class="flex items-center justify-between">
            <text :style="rowLabelStyle">{{ t.stakingV3.sheet.totalOnUnlock }}</text>
            <text class="tabular-nums" :style="rowValBoldStyle">${{ totalText }}</text>
          </view>
        </view>

        <!-- Submit -->
        <view class="nx-staking-sheet-submit-cta w-full inline-flex items-center justify-center active:opacity-85" :style="submitStyle" @click="submit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <text>{{ ctaText }}</text>
        </view>
        <text class="block text-center" :style="noticeStyle">{{ lockedNoticeText }}</text>
      </view>
    </transition>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { postMoneyBill } from "@/lib/money-receipt";
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { createRemoteIntentGate } from "@/lib/g-remote-intent";
import { useStaking, STAKING_APY, STAKING_PENALTY, STAKING_MIN, type StakingTerm } from "@/store/staking";
import { toast } from "@/store/ui";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { useRiskDisclosure } from "@/store/risk-disclosure";
import { ApiError } from "@/api/errors";

const PRESETS = [100, 500, 1000, 5000];
const ONE_DAY_MS = 86400 * 1000;

const props = defineProps<{ open: boolean; term: StakingTerm | null }>();
const emit = defineEmits<{ "update:open": [boolean] }>();

const t = useT();
const app = useApp();
const staking = useStaking();
const risk = useRiskDisclosure();

const amount = ref(0);
const remotePending = ref(false);
const remoteIntent = ref<{ fingerprint: string; key: string } | null>(null);
const remoteGate = createRemoteIntentGate("G1");
const selectedPool = computed(() => props.term === null ? undefined : staking.pools.find((pool) => pool.termDays === props.term));

function intentKey(tierKey: string, amountUsdt: number) {
  const fingerprint = `${tierKey}:${amountUsdt.toFixed(2)}`;
  if (remoteIntent.value?.fingerprint === fingerprint) return remoteIntent.value.key;
  const key = remoteGate.acquire("open", { tierKey, amountUsdt: amountUsdt.toFixed(2) }).key;
  remoteIntent.value = { fingerprint, key };
  return key;
}

// Seed the amount to the term's minimum each time the sheet opens.
watch(
  () => [props.open, props.term] as const,
  ([o, term]) => {
    if (o && term !== null) amount.value = selectedPool.value?.minAmountUsdt ?? STAKING_MIN[term];
  },
);

const titleText = computed(() => (props.term !== null ? fmt(t.value.stakingV3.sheet.title, { n: props.term }) : ""));
const subtitleText = computed(() =>
  props.term !== null
    ? fmt(t.value.stakingV3.sheet.subtitle, {
        apy: ((selectedPool.value?.apy ?? STAKING_APY[props.term]) * 100).toFixed(0),
        penalty: ((selectedPool.value?.penalty ?? STAKING_PENALTY[props.term]) * 100).toFixed(0),
      })
    : "",
);
const interestLabel = computed(() =>
  props.term !== null ? fmt(t.value.stakingV3.sheet.interest, { n: props.term }) : "",
);
const balanceText = computed(() => (staking.isMockMode ? app.user.usdtBalance : staking.walletBalanceUsdt).toFixed(2));
const principalText = computed(() => amount.value.toFixed(2));
const interestText = computed(() =>
  props.term !== null ? (amount.value * (selectedPool.value?.apy ?? STAKING_APY[props.term]) * (props.term / 365)).toFixed(2) : "0.00",
);
const unlockDateText = computed(() =>
  props.term !== null ? new Date(Date.now() + props.term * ONE_DAY_MS).toLocaleDateString(dateLocale()) : "",
);
const totalText = computed(() =>
  props.term !== null ? (amount.value * (1 + (selectedPool.value?.apy ?? STAKING_APY[props.term]) * (props.term / 365))).toFixed(2) : "0.00",
);
const ctaText = computed(() =>
  props.term !== null ? fmt(t.value.stakingV3.sheet.cta, { amount: amount.value.toFixed(2), n: props.term }) : "",
);
const lockedNoticeText = computed(() =>
  props.term !== null
    ? fmt(t.value.stakingV3.sheet.lockedNotice, { penalty: (STAKING_PENALTY[props.term] * 100).toFixed(0) })
    : "",
);

function onAmountInput(e: Event) {
  const raw = (e as unknown as { detail: { value: string } }).detail.value;
  amount.value = parseFloat(raw) || 0;
}
function setMax() {
  amount.value = Math.floor(staking.isMockMode ? app.user.usdtBalance : staking.walletBalanceUsdt);
}
function emitClose() {
  emit("update:open", false);
}

async function submit() {
  const term = props.term;
  if (term === null) return;
  const min = selectedPool.value?.minAmountUsdt ?? STAKING_MIN[term];
  if (amount.value < min) {
    toast.error(t.value.stakingV3.toast.minAmount, fmt(t.value.stakingV3.toast.minAmountTerm, { min, n: term }));
    return;
  }
  if (!staking.isMockMode) {
    if (remotePending.value) return;
    const pool = selectedPool.value;
    if (!pool || !pool.enabled || pool.killed) {
      toast.error(t.value.stakingV3.toast.openFailedTitle);
      return;
    }
    remotePending.value = true;
    try {
      const key = intentKey(pool.tierKey, amount.value);
      await risk.checkGate("staking", key);
      await staking.openRemote(pool.tierKey, amount.value, key);
      remoteIntent.value = null;
      remoteGate.complete(`${"open"}:${JSON.stringify({ tierKey: pool.tierKey, amountUsdt: amount.value.toFixed(2) })}`, true);
      toast.success(t.value.stakingV3.toast.stakeSuccess);
      emitClose();
    } catch (cause) {
      // Unknown timeout/result: read the authority before allowing a retry with the same key.
      await staking.syncRemote();
      if (cause instanceof ApiError && cause.message === "RISK_DISCLOSURE_ACK_REQUIRED") {
        uni.navigateTo({ url: "/pages/me/risk-disclosure?return=/pages/staking/staking", fail: () => {} });
        return;
      }
      toast.error(t.value.stakingV3.toast.openFailedTitle);
    } finally {
      remotePending.value = false;
    }
    return;
  }
  const billRef = `STAKE-OPEN-${Date.now().toString(36).toUpperCase()}`;
  // ⚠️ MOCK-ONLY CROSS-STORE MUTATION (NON-ATOMIC): PRODUCTION 是一次服务端事务。
  // 🔴 顺序 = 扣款⊗记账(原子)→ 建仓,与复投页同形。
  const before = app.captureMoney();
  const paid = postMoneyBill({
    type: "stake",
    symbol: "USDT",
    amount: -amount.value,
    status: "posted",
    memo: `Stake open · ${term}d @ ${(STAKING_APY[term] * 100).toFixed(0)}% APY`,
    ref: billRef,
  });
  // 同 purchase-sheet:拒绝在扣款落地之前,「资金没动」成立。
  const geo = geoPolicyUserMessage(paid, t.value.geoPolicy);
  if (geo) {
    toast.error(geo, t.value.geoPolicy.fundsSafeNote);
    return;
  }
  if (paid === "insufficient") {
    toast.error(
      t.value.stakingV3.toast.insufficient,
      fmt(t.value.stakingV3.toast.insufficientSubtitle, { amount: app.user.usdtBalance.toFixed(2) }),
    );
    return;
  }
  if (paid !== "ok") return; // 落盘失败:资金已还原、账上无记录、收口点已提示
  // 🔴 建仓会失败(3 次版本冲突耗尽 = 别处正在改这个账号的持仓),而钱在上面已经扣了。
  // 不接失败信号的话:余额少了、账单写了、仓位不存在 —— 刷新后就是纯丢钱。
  // 冲正走同一个收口点:restoreTo 精确还原扣款前的 withdrawableUsdt(裸 creditBalance 只加
  // 总余额、不还可提额度,退一次压低一次),并补一条反向分录 —— 不留「有扣款无凭证」。
  const opened = staking.stake(amount.value, term);
  if (!opened.ok) {
    // persist-verdict-ok: 冲正腿:收口点内部对退不回去已走 reportStuckFunds 响亮终态、退得回去弹 txNotSaved,调用方无需再动作
    postMoneyBill(
      {
        type: "stake",
        symbol: "USDT",
        amount: amount.value,
        status: "posted",
        memo: `Stake open reversed · ${term}d refunded`,
        memoKey: "stakeOpenReversed",
        // 🔴 冲正分录的幂等键要与原分录分开(addOnce 按 ref+type+symbol 判重,
        // 原本三项完全相同 → 将来任何幂等写都会误命中冲正行)。同 marketplace。
        ref: `${billRef}-REV`,
      },
      { restoreTo: before },
    );
    // 归因分两种(R5):conflict=true 是别处刚改过持仓(刷新重试有意义),
    // false 是本机存储写不进去(重试也白搭,得换个环境)—— 文案不许混用。
    toast.error(
      t.value.stakingV3.toast.openFailedTitle,
      opened.conflict ? t.value.stakingV3.toast.openFailedSubtitle : t.value.stakingV3.toast.openFailedStorageSubtitle,
    );
    return;
  }
  toast.success(
    t.value.stakingV3.toast.stakeSuccess,
    fmt(t.value.stakingV3.toast.stakeSubtitle, { amount: amount.value, apy: STAKING_APY[term] * 100, n: term }),
  );
  emitClose();
}

const panelStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderTop: "1px solid var(--v5-border)",
  padding: "18px 16px calc(env(safe-area-inset-bottom) + 38px)",
};
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 600,
  letterSpacing: "-0.018em",
  color: "var(--v5-ink)",
  lineHeight: 1.2,
};
const subtitleStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
};
const closeBtnStyle: CSSProperties = { width: "40px", height: "40px", borderRadius: "999px", color: "var(--v5-ink-3)" };
const amountWrapStyle: CSSProperties = { background: "var(--v5-surface-2)", borderRadius: "16px", padding: "16px" };
const amountLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  fontWeight: 500,
};
const dollarStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "26px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "-0.022em",
};
const inputStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "56px",
  fontWeight: 600,
  letterSpacing: "-0.034em",
  lineHeight: 1,
  color: "var(--v5-ink)",
  background: "transparent",
};
const usdtStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
};
function presetStyle(p: number): CSSProperties {
  const active = amount.value === p;
  return {
    height: "40px",
    borderRadius: "999px",
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: 500,
    background: active ? "var(--v5-brand)" : "var(--v5-surface)",
    color: active ? "var(--v5-ink)" : "var(--v5-ink-2)",
    border: active ? "1px solid var(--v5-brand)" : "1px solid var(--v5-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
const balanceRowStyle: CSSProperties = {
  marginTop: "12px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
};
const maxStyle: CSSProperties = { color: "var(--v5-brand)", fontWeight: 600, fontSize: "13px" };
const projectionStyle: CSSProperties = {
  marginTop: "12px",
  background: "var(--v5-surface-2)",
  borderRadius: "14px",
  padding: "16px",
  fontSize: "13px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};
const rowLabelStyle: CSSProperties = { color: "var(--v5-ink-3)" };
const rowValStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  letterSpacing: "-0.005em",
  color: "var(--v5-ink)",
};
const rowValSuccessStyle: CSSProperties = { ...rowValStyle, color: "var(--v5-success)" };
const rowValBoldStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const dividerStyle: CSSProperties = { height: "1px", background: "var(--v5-border)" };
const submitStyle: CSSProperties = {
  marginTop: "16px",
  height: "50px",
  padding: "0 28px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "15px",
  letterSpacing: "-0.005em",
};
const noticeStyle: CSSProperties = { marginTop: "12px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.45 };

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => props.open), ".nx-sheet-backdrop", emitClose);
</script>

<style scoped>
.nx-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 790;
  background: var(--v5-bg-color-mask);
  backdrop-filter: blur(8px);
}
.nx-sheet-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
}
.nx-sheet-fade-enter-active,
.nx-sheet-fade-leave-active {
  transition: opacity 0.24s cubic-bezier(0.32, 0.72, 0, 1);
}
.nx-sheet-fade-enter-from,
.nx-sheet-fade-leave-to {
  opacity: 0;
}
.nx-sheet-slide-enter-active {
  transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}
.nx-sheet-slide-leave-active {
  transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1);
}
.nx-sheet-slide-enter-from,
.nx-sheet-slide-leave-to {
  transform: translateY(100%);
}
</style>
