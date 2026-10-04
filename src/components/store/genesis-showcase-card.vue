<!--
  GenesisShowcaseCard — 商城「尊享席位」创世节点入口卡（规格 FEAT-GEN07）。

  Design Read:给商城浏览用户的创世入口,处升级阶梯顶端压轴环,传达「稀缺高端
  OG 资产」克制质感 —— 对齐 genesis 页 obsidian-gold hero 的金色身份,
  不套 product-card 设备卡模板（转化卡模板疲劳规则）。

  ⚠️ Hardcoded gold (#D4AF5A / rgba(212,175,90,*)) is the genesis-domain design
  exception (same as pages/genesis/genesis.vue file header), not a v5 token slip.

  三态:🔒 锁定（资格未达 → 打开内嵌资格 sheet）/ ✓ 解锁（→ /pages/genesis/genesis）
  / 售罄（→ /pages/genesis/marketplace）。live 档价与余席接 useGenesis（不跑
  tickSales,persisted 值足够 — 预售页在跑）。文案高端克制线,零吆喝。
-->
<template>
  <view>
    <view class="nx-glass-card relative overflow-hidden active:scale-[0.98]" :style="cardStyle" role="button" tabindex="0" :aria-label="ctaText" :aria-busy="supplyRetrying ? 'true' : 'false'" @click="onCardTap">
      <!-- Gold aurora wash（装饰,卡内合法光晕:bg+overflow-hidden）-->
      <view aria-hidden :style="auroraStyle" />

      <view class="relative" style="z-index: 1">
        <GenesisArtwork style="border-radius: 12px; margin-bottom: 14px" />
        <!-- Eyebrow -->
        <view class="flex flex-wrap items-center justify-between" style="gap: 10px">
          <view class="inline-flex items-center" style="gap: 6px; min-width: 0; color: var(--v5-genesis-gold)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>
            <text class="font-mono-tabular" :style="eyebrowStyle">{{ eyebrowText }}</text>
          </view>
          <!-- 剩余席位是紧迫感元素:关闭态 / 售罄态不显(FEAT-GEN10 ④),判据同 showUrgency 单源。 -->
          <text v-if="showUrgency" class="font-mono-tabular tabular-nums nowrap" :style="leftChipStyle">{{ leftText }}</text>
        </view>

        <!-- Title + perks line -->
        <text class="block font-display" :style="titleStyle">{{ t.store.genesisCardTitle }}</text>
        <text class="block" :style="perksStyle">{{ t.store.genesisCardPerks }}</text>

        <!-- Live tier price row(预售态优先显倒计时/即将开售)-->
        <view class="flex items-end justify-between" style="margin-top: 14px; gap: 10px">
          <!-- 🔴 阻断态(市场关闭 / 熔断 / 配置未知)**不报价**(独立验收 P2-12):
               创世页同态已经把价格删了,这里还并列显示「当前档 $11,999」+「市场暂未开放」,
               两个入口对同一件事说两套话。判据走 block,与创世页同源。 -->
          <view v-if="hardBlocked" />
          <view v-else-if="preSale">
            <text class="block" :style="tierLabelStyle">{{ t.genesisEligibility.comingSoon }}</text>
            <text v-if="showTime" class="block font-display tabular-nums nowrap" :style="priceStyle">{{ countdownDisplay }}</text>
          </view>
          <view v-else-if="!soldOut">
            <text class="block" :style="tierLabelStyle">{{ t.store.genesisCardTierLabel }}</text>
            <text class="block font-display tabular-nums nowrap" :style="priceStyle">${{ priceText }}</text>
          </view>
          <text v-else :style="soldOutStyle">{{ t.store.genesisCardSoldOut }}</text>

          <!-- CTA pill。右箭头 = 「点了会去某处」;硬阻断态点了只给说明,不该用箭头暗示能往下走
               (与创世页 dock 同一条规矩)。 -->
          <view class="inline-flex items-center justify-center" :style="ctaStyle">
            <text :style="ctaTextStyle">{{ ctaText }}</text>
            <svg v-if="!hardBlocked" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </view>
        </view>

        <!-- Locked state line（资格未达:可见不藏,克制表述）-->
        <view class="nx-glass-inset" v-if="locked" :style="lockRowStyle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <text :style="lockTextStyle">{{ lockedLineText }}</text>
          <text v-if="lockedMetText" class="font-mono-tabular tabular-nums nowrap" :style="lockMetStyle">{{ lockedMetText }}</text>
        </view>
      </view>
    </view>

    <!-- 内嵌资格 sheet：锁定态点卡打开；资格只显示服务端新策略。 -->
    <GenesisEligibilitySheet v-model:open="eligSheetOpen" @subscribe="goGenesis" />
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { ref, computed, onUnmounted, type CSSProperties } from "vue";
import GenesisEligibilitySheet from "@/components/genesis/eligibility-sheet.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useGenesis } from "@/store/genesis";
import { useGenesisConfig } from "@/store/genesis-config";
import { useGenesisEligibility } from "@/composables/use-genesis-eligibility";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
import { toast } from "@/store/ui";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { resolveGenesisEligibilityCardCopy, resolveGenesisPrimaryCta } from "@/lib/genesis-primary-cta";

const t = useT();
const genesis = useGenesis();
const cfg = useGenesisConfig();
const { gate, eligible } = useGenesisEligibility();
const { block, blockText, showUrgency, preSale, showTime, countdownDays, countdownClock } = useGenesisSaleGate();

const eligSheetOpen = ref(false);
const supplyRetrying = ref(false);
let retryGeneration = 0;
onUnmounted(() => { retryGeneration += 1; });

// Remote bootstrap/failure intentionally uses the numeric 0/0 sentinel.  It is
// not a confirmed exhausted series, so the showcase must never turn it into a
// "sold out" market claim or a visible "Limited 0" count.
const supplyKnown = computed(() => genesis.remoteSupplyKnown);
const soldOut = computed(() => supplyKnown.value && genesis.totalSlots - genesis.soldSlots <= 0);
/** 「硬阻断」= 市场关闭 / 熔断 / 配置未知。**售罄与预售不算** —— 那两态本来就有各自的
 *  展示语言(售罄字样 / 倒计时),不该被这条规则连坐。与创世页 dock 的取舍一致。 */
const hardBlocked = computed(() => {
  const b = block.value;
  return b === "marketClosed" || b === "halted" || b === "configUnavailable";
});
// 🔴 资格锁行只在「可购买路径畅通、卡在资格」时出现 —— 判据问 `block` 单源,
//   不再自己重算 preSale/soldOut(独立验收 confirmed P1:上一版 `!preSale && !soldOut
//   && !eligible` 是**第二套判定**,漏了市场关闭三档 → 关闭态下锁行照样渲染
//   「已满足 N/M 条件」,与规格 ④「单一派生,禁多处各判一套」正面冲突)。
const locked = computed(() => block.value === null && !eligible.value);
const countdownDisplay = computed(() => {
  if (!showTime.value) return "";
  const dayPart = countdownDays.value > 0 ? fmt(t.value.genesisEligibility.countdownDay, { n: countdownDays.value }) + " " : "";
  return `${dayPart}${countdownClock.value}`;
});
const priceText = computed(() => genesis.unitPriceUSDT.toLocaleString());
const eyebrowText = computed(() =>
  supplyKnown.value ? fmt(t.value.store.genesisCardEyebrow, { n: genesis.totalSlots.toLocaleString() }) : "",
);
// 🔴 闸放在**值本身**,不是放在模板的 v-if 上:值到哪都安全,不必指望每个渲染点
//   都记得加条件。上一版闸在模板里、定义在这里,两处相隔几十行 —— 机器门看不出关联,
//   人也容易在新增渲染点时漏掉(这正是「还剩一处没收」的温床)。
const leftText = computed(() =>
  showUrgency.value ? fmt(t.value.store.genesisCardLeft, { n: genesis.totalSlots - genesis.soldSlots }) : "",
);
const lockedCopy = computed(() => resolveGenesisEligibilityCardCopy(gate.value.reasons, {
  policyRejected: t.value.genesisEligibility.cardLockedLine,
  policyManaged: t.value.genesisEligibility.cardPolicyManaged,
  serviceUnavailable: t.value.genesisEligibility.reasonServiceUnavailable,
  policyUnavailable: t.value.genesisEligibility.reasonPolicyUnavailable,
}));
const lockedLineText = computed(() => lockedCopy.value.line);
const lockedMetText = computed(() => lockedCopy.value.meta);
const ctaText = computed(() => {
  // 🔴 阻断态一律问 `block` 单源(FEAT-GEN10 ④),与创世页同一出口 —— 关闭市场 ≠ 下架,
  //   卡片照常展示(showcaseEnabled 另管),只是不能买。
  // 账号资格只决定点击后进资格 sheet 还是详情页，不再把主售 CTA 改回“查看认购资格”。
  return resolveGenesisPrimaryCta({
    block: block.value,
    // Unknown public supply offers an in-place recovery, so expose that action
    // on the card itself instead of hiding retry only in a later toast.
    blockedText: block.value === "configUnavailable" ? t.value.genesis.marketClosed.retryCta : blockText.value,
    soldOut: t.value.store.genesisCardCtaMarket,
    comingSoon: t.value.genesisEligibility.comingSoon,
    reserve: t.value.genesisEligibility.cardCta,
  });
});

function goGenesis() {
  eligSheetOpen.value = false;
  navTo("/pages/genesis/genesis");
}
async function retryGenesisState(): Promise<void> {
  if (supplyRetrying.value) return;
  supplyRetrying.value = true;
  const accountScope = captureAccountScope();
  const generation = retryGeneration;
  const current = () => generation === retryGeneration && isCurrentAccountScope(accountScope);
  try {
    // Configuration and supply have separate consumers of the public Genesis
    // projection.  Retry both, while the store's request generation keeps a
    // stale same-scope response from committing after a newer read.
    await cfg.refresh();
    // A config response can complete after route leave or account rebinding.
    // Do not turn that old user intent into a new public read or a toast.
    if (!current()) return;
    await genesis.syncRemote();
    if (!current()) return;
    if (block.value === "configUnavailable") {
      toast.info(ctaText.value, t.value.genesis.marketClosed.retryHint);
    } else {
      toast.success(t.value.genesis.marketClosed.retryOk);
    }
  } catch {
    if (current()) toast.info(ctaText.value, t.value.genesis.marketClosed.retryHint);
  } finally {
    supplyRetrying.value = false;
  }
}
async function onCardTap() {
  // 🔴 与 ctaText 同问 `block` 一处,顺序不在此重排(FEAT-GEN10 ④)。
  if (block.value === "soldOut") {
    navTo("/pages/genesis/marketplace");
    return;
  }
  if (block.value === "configUnavailable") {
    await retryGenesisState();
    return;
  }
  if (block.value !== null) {
    // 阻断态:不跳不开 sheet。禁静默无反馈 —— 给与卡面同一句说明。
    if (block.value !== "preSale") toast.info(ctaText.value, t.value.genesis.marketClosed.holdingsSafe);
    return;
  }
  if (locked.value) {
    eligSheetOpen.value = true;
    return;
  }
  goGenesis();
}

// ── styles（金色 = genesis 域例外,见文件头;其余走 --v5-* token,零 border 卡）──
const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
  padding: "18px 16px 16px",
};
const auroraStyle: CSSProperties = {
  position: "absolute",
  top: "-46px",
  right: "-36px",
  width: "220px",
  height: "170px",
  background: "radial-gradient(closest-side, color-mix(in srgb, var(--v5-genesis-gold) 16%, transparent), transparent 72%)",
  pointerEvents: "none",
};
const eyebrowStyle: CSSProperties = {
  fontSize: "12px",
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
};
const leftChipStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: "12px",
  color: "var(--v5-warning-ink)",
  padding: "3px 9px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-warning) 12%, transparent)",
};
const titleStyle: CSSProperties = {
  marginTop: "10px",
  fontFamily: "var(--font-v5)",
  fontSize: "26px",
  fontWeight: 600,
  letterSpacing: "-0.016em",
  color: "var(--v5-ink)",
  lineHeight: 1.2,
};
const perksStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.45,
  textWrap: "pretty" as CSSProperties["textWrap"],
};
const tierLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)", lineHeight: 1.2 };
const priceStyle: CSSProperties = {
  marginTop: "3px",
  fontSize: "26px",
  fontWeight: 600,
  letterSpacing: "-0.024em",
  color: "var(--v5-genesis-gold)",
  lineHeight: 1.05,
};
const soldOutStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.4,
  textWrap: "pretty" as CSSProperties["textWrap"],
};
const ctaStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: "44px",
  padding: "0 16px",
  borderRadius: "999px",
  gap: "5px",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--v5-genesis-gold) 22%, transparent), color-mix(in srgb, var(--v5-genesis-gold) 10%, transparent))",
  color: "var(--v5-genesis-gold)",
};
const ctaTextStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  letterSpacing: "-0.005em",
  whiteSpace: "nowrap",
};
const lockRowStyle: CSSProperties = {
  marginTop: "13px",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  borderRadius: "11px",
  padding: "9px 12px",
};
const lockTextStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.4,
  textWrap: "pretty" as CSSProperties["textWrap"],
};
const lockMetStyle: CSSProperties = { flexShrink: 0, fontSize: "12px", color: "var(--v5-genesis-gold)" };

import GenesisArtwork from "@/components/genesis/genesis-artwork.vue";
</script>
