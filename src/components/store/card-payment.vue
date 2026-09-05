<!--
  CardPaymentForm — 已存卡选择 + 每笔 CVV 复验 + 费用合计。

  卡列表读 useCards()(此前是写死的单张假卡 + 一条「cards.ts 落地后再换」的待办,
  cards.ts 早已落地,用户绑的卡在结账时看不见);无卡时出空态 + 去绑卡入口,
  不留死路。CVV 走 <HostedCardVault mode="cvv-only">:明文不进本组件,复验
  只拿 cvvToken。费率单源 deposits-core 的 CARD_FEE_RATE,组件与文案都不写死。
-->
<template>
  <view class="rounded-2xl border overflow-hidden" :style="cardStyle">
    <FundsSandboxBadge />
    <!-- Header -->
    <view class="flex items-center border-b" :style="headerStyle">
      <view class="grid place-items-center shrink-0" :style="iconBoxStyle">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></svg>
      </view>
      <view class="flex-1 min-w-0">
        <text class="block" :style="headerTitleStyle">{{ t.store.coCardSelect }}</text>
        <view class="flex items-center" style="gap: 6px; margin-top: 2px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.store.coCardSecurity }}</text>
        </view>
      </view>
    </view>

    <!-- Card list · 无卡不留死路:空态 + 去绑卡 -->
    <view v-if="!cards.length" style="padding: 20px 20px 16px" class="text-center">
      <view class="grid place-items-center" :style="emptyIconStyle">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></svg>
      </view>
      <text class="block" :style="emptyTextStyle">{{ t.store.coNoSavedCard }}</text>
      <view class="w-full grid place-items-center active:opacity-80" :style="addCardBtnStyle" role="button" tabindex="0" :aria-label="t.store.coAddCardCta" @click.stop="goAddCard">
        <text role="button" tabindex="0" @click.stop="goAddCard">{{ t.store.coAddCardCta }}</text>
      </view>
    </view>

    <view v-else style="padding: 12px">
      <view
        v-for="card in cards"
        :key="card.tokenId"
        class="w-full flex items-center rounded-xl active:opacity-90"
        :style="cardRowStyle(card.tokenId === effectiveTokenId)"
        role="button"
        tabindex="0"
        @click.stop="selectCard(card.tokenId)"
      >
        <view class="grid place-items-center shrink-0" :style="cardRowIconStyle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></svg>
        </view>
        <view class="flex-1 min-w-0">
          <text class="block font-mono-tabular" :style="cardBrandStyle">{{ brandLabel(card.brand) }} •••• {{ card.last4 }}</text>
          <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 2px">{{ expiryLabel(card) }}</text>
        </view>
        <svg v-if="card.tokenId === effectiveTokenId" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M20 6 9 17l-5-5" /></svg>
      </view>
    </view>

    <!-- CVV 复验 —— 明文归 <HostedCardVault>,本组件只拿到位数与 ready -->
    <HostedCardVault v-if="selectedCard" ref="vaultRef" mode="cvv-only" @change="onCvvChange">
      <view style="padding: 8px 20px 16px">
        <view class="flex items-center justify-between" style="margin-bottom: 6px">
          <text class="block" :style="cvvLabelStyle">{{ t.store.coEnterCvv }}</text>
          <text class="font-mono-tabular tabular-nums" :style="cvvCountStyle">{{ cvvLength }}/4</text>
        </view>
        <HostedCardField
          kind="cvv"
          class="w-full font-mono-tabular tabular-nums"
          :input-style="cvvInputStyle"
          placeholder="123"
          placeholder-style="color: var(--v5-ink-4)"
          aria-label="CVV"
          @focus="cvvFocused = true"
          @blur="cvvFocused = false"
        />
        <text class="block" :style="cvvHelpStyle">{{ t.store.coCardSecurity }}</text>
      </view>
    </HostedCardVault>

    <!-- Fee + total -->
    <view class="border-t" :style="totalsBoxStyle">
      <view class="flex items-center justify-between" style="padding: 3px 0">
        <text style="font-size: 13px; color: var(--v5-ink-3)">{{ t.store.coSubtotalLabel }}</text>
        <text class="tabular-nums" style="font-size: 13px; font-weight: 500; color: var(--v5-ink)">${{ amountText }}</text>
      </view>
      <view class="flex items-center justify-between" style="padding: 3px 0">
        <text style="font-size: 13px; color: var(--v5-ink-3)">{{ fmt(t.store.coCardFeeLabel, { rate: feeRateLabel }) }}</text>
        <text class="tabular-nums" style="font-size: 13px; font-weight: 500; color: var(--v5-ink)">${{ feeText }}</text>
      </view>
      <view class="flex items-center justify-between" style="padding: 3px 0">
        <text style="font-size: 13px; color: var(--v5-ink-3)">{{ t.store.coPayTotalLabel }}</text>
        <text class="tabular-nums" style="font-size: 20px; font-weight: 600; color: var(--v5-ink)">${{ totalText }}</text>
      </view>
    </view>

    <!-- Pay + cancel -->
    <view style="padding: 8px 16px 16px">
      <view class="w-full grid place-items-center active:opacity-90" :style="payBtnStyle" role="button" tabindex="0" :aria-label="payLabel" @click.stop="onPay">
        <text role="button" tabindex="0" @click.stop="onPay">{{ payLabel }}</text>
      </view>
      <view class="w-full grid place-items-center active:opacity-80" :style="cancelBtnStyle" role="button" tabindex="0" :aria-label="t.store.coCancel" @click.stop="emitCancel">
        <text role="button" tabindex="0" @click.stop="emitCancel">{{ t.store.coCancel }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { useCards, brandLabel } from "@/store/cards";
import type { SavedCard } from "@/store/cards";
import { cardFeeRateLabel, cardFeeUsd } from "@/store/deposits-core";
import HostedCardVault from "@/components/me/hosted-card-vault.vue";
import HostedCardField from "@/components/me/hosted-card-field.vue";
import FundsSandboxBadge from "@/components/me/funds-sandbox-badge.vue";

const props = defineProps<{ amount: number }>();
const emit = defineEmits<{ complete: []; cancel: [] }>();

const t = useT();
const cardsStore = useCards();

// 用户真实绑定的卡(此前是写死的单张假卡,绑了卡也看不见)。
const cards = computed<SavedCard[]>(() => cardsStore.cards);
function expiryLabel(card: SavedCard): string {
  return fmt(t.value.store.coCardExpiry, { expiry: card.expiry, holder: card.holder });
}
/** 带 returnTo 回结账 —— 不传的话绑完卡会被 redirectTo 送去「我的卡」列表,
 *  用户得自己找路回来结账。取当前页真实路由(含 ?product=),不写死。 */
function goAddCard() {
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  // uni 的 PageInstance 类型没声明 options(各端都有,运行时可取),窄化成实际形状。
  const cur = pages[pages.length - 1] as unknown as { route?: string; options?: Record<string, string> } | undefined;
  const qs = cur?.options && Object.keys(cur.options).length ? `?${new URLSearchParams(cur.options).toString()}` : "";
  const here = cur?.route ? `/${cur.route}${qs}` : "";
  navTo(here ? `/pages/me/wallet-cards-new?returnTo=${encodeURIComponent(here)}` : "/pages/me/wallet-cards-new");
}

// 选中态是**派生**的不是快照:挂载时若无卡(走空态),用户点「去绑定银行卡」绑完
// 回来,快照式初始值会一直是 null → CVV 区永不出现。故只存「用户显式选了哪张」,
// 实际生效值退回默认卡 / 第一张。
const pickedTokenId = ref<string | null>(null);
const effectiveTokenId = computed(
  () => pickedTokenId.value ?? cardsStore.defaultTokenId ?? cards.value[0]?.tokenId ?? null,
);
// 🔴 CVV 明文不在本组件 —— 归 <HostedCardVault mode="cvv-only">。
const vaultRef = ref<InstanceType<typeof HostedCardVault> | null>(null);
const cvvLength = ref(0);
const cvvReady = ref(false);
const cvvFocused = ref(false);
function onCvvChange(e: { ready: boolean; cvvLength: number }) {
  cvvReady.value = e.ready;
  cvvLength.value = e.cvvLength;
}
const selectedCard = computed(() => cards.value.find((c) => c.tokenId === effectiveTokenId.value) ?? null);
const valid = computed(() => !!selectedCard.value && cvvReady.value);

// 费率单源 deposits-core(后台 D1 通道配置下发),组件禁写死。
// 费率与**算法**都单源 deposits-core:整数域运算,与入金口径一字不差。
const fee = computed(() => cardFeeUsd(props.amount));
const feeRateLabel = computed(() => cardFeeRateLabel());
const total = computed(() => +(props.amount + fee.value).toFixed(2));
const amountText = computed(() => props.amount.toLocaleString());
const feeText = computed(() => fee.value.toLocaleString());
const totalText = computed(() => total.value.toLocaleString());

const payLabel = computed(() => {
  if (valid.value) return fmt(t.value.store.coPayAmount, { total: total.value.toLocaleString() });
  return selectedCard.value ? t.value.store.coCvvNeedCvv : t.value.store.coCvvSelectCard;
});

function selectCard(tokenId: string) {
  pickedTokenId.value = tokenId;
}
function onPay() {
  if (!valid.value) return;
  // 复验 CVV 换 token(真实现 = SDK,明文不经本前端);拿不到就不放行。
  if (!vaultRef.value?.tokenizeCvv()) return;
  emit("complete");
}
function emitCancel() {
  emit("cancel");
}

// ─── styles ───
const cardStyle: CSSProperties = { background: "var(--v5-surface)", borderColor: "var(--v5-border)" };
const headerStyle: CSSProperties = { padding: "16px 20px", gap: "12px", borderColor: "color-mix(in srgb, var(--v5-border) 70%, transparent)" };
const iconBoxStyle: CSSProperties = { width: "36px", height: "36px", borderRadius: "8px", background: "var(--v5-brand-2-soft)" };
const headerTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
function cardRowStyle(selected: boolean): CSSProperties {
  return {
    padding: "12px",
    gap: "12px",
    borderRadius: "12px",
    background: selected ? "color-mix(in srgb, var(--v5-brand-2) 12%, transparent)" : "var(--v5-surface-2)",
  };
}
const cardRowIconStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "8px",
  background: "var(--v5-surface)",
};
const cardBrandStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const cvvLabelStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const cvvCountStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const cvvInputStyle = computed<CSSProperties>(() => ({
  boxSizing: "border-box",
  height: "48px",
  minHeight: "48px",
  background: cvvFocused.value ? "var(--v5-surface)" : "var(--v5-surface-2)",
  border: `1px solid ${cvvFocused.value ? "var(--v5-brand-2)" : "var(--v5-border)"}`,
  borderRadius: "12px",
  padding: "0 14px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  lineHeight: "48px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  outline: "none",
  caretColor: "var(--v5-brand-2)",
  boxShadow: cvvFocused.value ? "0 0 0 3px color-mix(in srgb, var(--v5-brand-2) 18%, transparent)" : "none",
  transition: "border-color 160ms ease, box-shadow 160ms ease, background 160ms ease",
}));
const cvvHelpStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "12px",
  lineHeight: 1.45,
  color: "var(--v5-ink-4)",
};
const totalsBoxStyle: CSSProperties = {
  padding: "12px 20px 16px",
  borderColor: "color-mix(in srgb, var(--v5-border) 70%, transparent)",
};
const payBtnStyle = computed<CSSProperties>(() => ({
  height: "44px",
  borderRadius: "999px",
  background: valid.value ? "var(--v5-brand-2)" : "var(--v5-surface-2)",
  color: valid.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
}));
const cancelBtnStyle: CSSProperties = {
  marginTop: "8px",
  height: "40px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink-2)",
  fontSize: "13px",
};
// 空态 —— 图标 + 一句话 + 出口,不留空容器。
const emptyIconStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  margin: "0 auto",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
};
const emptyTextStyle: CSSProperties = {
  marginTop: "10px",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.45,
};
const addCardBtnStyle: CSSProperties = {
  marginTop: "12px",
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
};
</script>
