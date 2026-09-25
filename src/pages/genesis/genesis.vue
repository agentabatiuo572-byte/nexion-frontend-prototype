<!--
  Genesis Node — creator-node presale (1000 slots / $9,999 / sales ticker /
  dividend). Ported from Nexion-prototype/app/(main)/genesis/page.tsx.

  Wrapped in <AppChassis active="me"> (sub-page reached from /me). The source's
  chassis-level GenesisDockHost (sticky gold CTA) + GenesisSheetHost (confirm
  sheet) are folded into the page: the dock is a fixed bottom bar inside the
  chassis, the sheet is <GenesisPurchaseSheet v-model:open>.

  🏛 金-曜石 hero 与吸底 CTA 的**金色描边**是「创世域」域级例外,**主人 2026-07-23 正式拍板**
  (此前文件头自称「设计例外」写于 2026-07-09「原有条件例外一律收回」终裁之前,已失效;
  C2 独立验收指出该措辞过期,故改为正式登记)。理由:金-曜石是 $11,999 旗舰 SKU 的视觉身份,
  靠「暗底 + 金边」成立,删边后与普通暗卡不可区分。登记位置 `docs/ZERO-BORDER-ALLOWLIST.json`
  (route+cls+size 精确匹配,只覆盖这两个元素);金色本体已于 C2 收敛为
  `--v5-genesis-gold-on-dark` token,不再是散落 hex。**本页其它容器不享此例外**;shared
  gen-* keyframes live in tokens.css (P-023). Holder perks + live-market cards
  are faithful English data arrays (matching the source's inline PERKS), not i18n.
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink); padding-bottom: 120px">
      <SubPageHeader back="/pages/me/me" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <!-- ════ HERO — dark obsidian gold ════ -->
        <view class="relative overflow-hidden" :style="heroStyle">
          <!-- Gold dust particles -->
          <view aria-hidden class="absolute inset-0 overflow-hidden" style="pointer-events: none; z-index: 0">
            <view v-for="(d, i) in dust" :key="i" class="gen-anim" :style="d" />
          </view>
          <!-- Diagonal pinstripe -->
          <view aria-hidden class="gen-anim" :style="engraveStyle" />
          <!-- Top-right glow blob -->
          <view aria-hidden class="gen-anim" :style="glowStyle" />
          <!-- Sweeping light pass -->
          <view aria-hidden class="gen-anim" :style="sheenStyle" />

          <view class="relative" style="z-index: 2">
            <!-- Crown chip + rules-intro pill share the top row (gold-toned pill
                 so it reads on the obsidian-gold hero; owner 2026-07-09 kill gap). -->
            <view class="flex items-center justify-between" style="gap: 8px">
              <view class="inline-flex items-center" :style="crownChipStyle">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>
                <text>{{ t.genesis.heroCrown }}</text>
              </view>
              <view class="inline-flex items-center shrink-0 active:opacity-80" :style="howPillStyle" @click="goHowItWorks">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                <text style="margin: 0 6px">{{ t.genesis.howItWorksEntry }}</text>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
              </view>
            </view>

            <!-- Title — punchy, restrained (high-end OG seat, not a bark) -->
            <text class="block" :style="titleStyle">{{ t.genesis.heroTitle }}</text>

            <!-- Sub + disclaimer -->
            <text class="block" :style="heroSubStyle">{{ t.genesis.heroSub }}</text>
            <text class="block" :style="heroDiscStyle">{{ t.genesis.heroDisc }}</text>

            <!-- Sales bar -->
            <view style="margin-top: 18px">
              <view ref="salesBarRef" :style="barTrackStyle">
                <view class="relative overflow-hidden" :style="barFillStyle">
                  <view aria-hidden class="gen-anim" :style="barShimmerStyle" />
                </view>
              </view>
              <view class="flex items-center justify-between tabular-nums" :style="barMetaStyle">
                <text>
                  <text>{{ soldText }}</text>
                  <text style="color: var(--v5-genesis-gold-on-dark); font-weight: 500"> / {{ totalText }} {{ t.genesis.soldOf }}</text>
                </text>
                <!-- 🔴 关闭态 / 售罄态不展示剩余名额紧迫文案(规格 FEAT-GEN10 ④:
                     不对不可购买的东西制造紧迫感)。判据来自 showUrgency 单源,不在此处自判。 -->
                <text v-if="showUrgency" class="gen-anim" :style="urgentStyle">{{ remaining }} {{ t.genesis.leftSuffix }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- ════ Value / perks ════ -->
        <view class="flex items-center justify-between" :style="secHeaderStyle">
          <text :style="secTitleStyle">{{ t.genesis.value.title }}</text>
        </view>
        <view :style="perksCardStyle">
          <PerkRow v-for="(p, i) in PERKS" :key="p.name" :ico="p.ico" :name="p.name" :desc="p.desc" :is-last="i === PERKS.length - 1" />
        </view>

        <!-- ════ Live market ════ -->
        <view class="flex items-center justify-between active:opacity-80" :style="secHeaderStyle" role="button" tabindex="0" :aria-label="t.genesis.viewMarketplace" @click="goMarketplace">
          <text :style="secTitleStyle">{{ t.genesis.secLiveMarket }}</text>
          <text :style="secLinkStyle" style="pointer-events: none">{{ t.genesis.viewMarketplace }}</text>
        </view>
        <view class="grid grid-cols-2" style="gap: 10px">
          <NftCard v-for="n in liveMarket" :key="n.id" :id="n.id" :price="n.price" :ago="n.ago" />
        </view>

        <!-- ════ FAQ snippet — de-carded: floor hairline group ════ -->
        <view :style="faqWrapStyle">
          <view v-for="(k, i) in faqKeys" :key="k" :style="faqRowStyle(i)">
            <text class="block" :style="faqQStyle">
              <text style="color: var(--v5-ink); font-weight: 600">Q.</text>
              <text> {{ t.genesis.faq[k] }}</text>
            </text>
            <text class="block" :style="faqAStyle">{{ t.genesis.faq[answerKey(k)] }}</text>
          </view>
        </view>

      </view>
    </view>

    <!-- Sticky gold dock (folds source GenesisDockHost into the page) -->
    <view class="nx-genesis-dock" :style="dockWrapStyle">
      <view
        class="relative w-full overflow-hidden"
        :class="dockDisabled ? '' : 'active:scale-[0.98]'"
        :style="dockBtnStyle"
        role="button"
        tabindex="0"
        @click="openSheet"
        @keydown.enter.prevent="openSheet"
        @keydown.space.prevent="openSheet"
      >
        <!-- 装饰(高光 / 描边 / 流光)只在**可购买**时出现:置灰按钮不该还在发光。 -->
        <template v-if="dockActive">
          <view aria-hidden :style="dockSpecularStyle" />
          <view aria-hidden :style="dockRimStyle" />
          <view aria-hidden class="gen-anim" :style="dockSheenStyle" />
        </template>
        <!-- 🔴 这层的 color 供给 crown 图标与倒计时(它们用 currentColor / 继承),
             同样必须跟 dockActive 走 —— 只改 dockLabelStyle 会剩下图标和倒计时还是金色,
             在中性底上照样看不清(独立验收 P0 点名了「倒计时 1.95」这一处)。 -->
        <view class="relative inline-flex items-center" :style="dockInnerStyle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>
          <text :style="dockLabelStyle">{{ dockCtaText }}</text>
          <template v-if="preSale && showTime">
            <view :style="dockDividerStyle" />
            <text class="tabular-nums">{{ countdownDisplay }}</text>
          </template>
          <!-- 价格只在**真能买**时露出:阻断态显示价格等于对着买不到的东西报价。 -->
          <template v-else-if="dockActive && eligible">
            <view :style="dockDividerStyle" />
            <text class="tabular-nums">${{ priceText }}</text>
          </template>
          <!-- 右箭头 = 「点了会去某处」。可购买(开 sheet)与售罄(去二级市场)才有;
               其余阻断态点了只给说明,不该用箭头暗示能往下走。 -->
          <svg v-if="dockActive || block === 'soldOut'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </view>
      </view>
    </view>

    <!-- Confirm sheet -->
    <GenesisPurchaseSheet v-model:open="sheetOpen" />
    <!-- 当前服务端认购资格投影。 -->
    <GenesisEligibilitySheet v-model:open="eligSheetOpen" @subscribe="onEligSubscribe" />
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import PerkRow from "@/components/genesis/perk-row.vue";
import NftCard from "@/components/genesis/nft-card.vue";
import GenesisPurchaseSheet from "@/components/genesis/purchase-sheet.vue";
import GenesisEligibilitySheet from "@/components/genesis/eligibility-sheet.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { useGenesis, GENESIS_ELIGIBILITY_POLICY } from "@/store/genesis";
import { useGenesisConfig } from "@/store/genesis-config";
import { useLocaleStore } from "@/store/locale";
import { useGenesisEligibility } from "@/composables/use-genesis-eligibility";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
import { toast } from "@/store/ui";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";
import { remoteApiEnabled } from "@/api/runtime";

const t = useT();
const genesis = useGenesis();
const cfg = useGenesisConfig();
// 🔴 页面每次露出都重读配置(hydrate-once 修复):navigateBack 回到本页不触发
//   onMounted,只有 onShow 能接住「去了一趟别处、运营已切状态」的情形。
onShow(async () => {
  await cfg.refresh();
  await genesis.syncRemote();
});
const locale = useLocaleStore();
const { eligible, gate } = useGenesisEligibility();
const { block, marketClosed, showUrgency, blockText, preSale, showTime, countdownDays, countdownClock } =
  useGenesisSaleGate();

const sheetOpen = ref(false);
const eligSheetOpen = ref(false);

// Value props — 运营可配（admin G4 权益配置）覆盖优先，未配置回退现 i18n 文案。
// config.perks[i] 空字段 → 用 i18n 缺省；四项图标固定。
const PERKS = computed(() => {
  const isZh = locale.code === "zh";
  const cp = cfg.config.perks;
  const fb = t.value.genesis.value;
  const pick = (i: number, name: string, desc: string) => {
    const p = cp[i];
    const cName = p ? (isZh ? p.nameZh : p.nameEn) : "";
    const cDesc = p ? (isZh ? p.descZh : p.descEn) : "";
    return { name: cName || name, desc: cDesc || desc };
  };
  return [
    { ico: "🪙", ...pick(0, fb.emissionName, fb.emissionDesc) },
    { ico: "🌐", ...pick(1, fb.poolName, fb.poolDesc) },
    { ico: "🗳", ...pick(2, fb.daoName, fb.daoDesc) },
    { ico: "🎁", ...pick(3, fb.airdropName, fb.airdropDesc) },
  ];
});

// Secondary-market recent fills（价格随尾盘档溢价，非旧 $25K 地板叙事）。
const faqKeys = ["q1", "q2", "q3"] as const;
function answerKey(k: "q1" | "q2" | "q3"): "a1" | "a2" | "a3" {
  return k === "q1" ? "a1" : k === "q2" ? "a2" : "a3";
}

const sold = computed(() => genesis.soldSlots);
const total = computed(() => genesis.totalSlots);
const price = computed(() => genesis.unitPriceUSDT);
const remaining = computed(() => total.value - sold.value);
const soldPct = computed(() => (sold.value / total.value) * 100);
const liveMarket = computed(() => remoteApiEnabled
  ? genesis.remoteListings.slice(0, 2).map((listing) => ({
      id: listing.tokenId,
      price: listing.priceUSDT / 1000,
      ago: ageText(listing.listedAt),
    }))
  : []);
function ageText(ts: number): string {
  const mins = Math.max(1, Math.floor((Date.now() - ts) / 60_000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`;
}

// Dock 文案:**阻断原因来自唯一派生 `block`**(composable),本页不再自排优先级。
// 顺序由 genesisPurchaseBlock 定:配置未知 > 市场关闭 > 熔断 > 售罄 > 预售;
// 运营闸放行后再消费服务端当前资格投影。
const dockCtaText = computed(() => {
  // 三档阻断说明走 blockText 唯一出口(P1-3 收口:此前这段 switch 在 4 处各写一份)。
  // 售罄 / 预售是本页自己的 CTA 词汇,不属于「阻断说明」,留在本地。
  const blocked = blockText.value;
  if (blocked !== null) return blocked;
  if (block.value === "soldOut") return t.value.genesis.ctaSoldOut;
  if (block.value === "preSale") return t.value.genesisEligibility.comingSoon;
  if (!eligible.value) return t.value.genesisEligibility.dockLocked;
  return t.value.genesis.ctaReserve;
});
/** 主按钮是否处于「可购买」外观(金色高光)。任一阻断态都退到中性面 —— 复用原本
 *  只给售罄用的那套中性样式,不另造 disabled 皮。 */
const dockActive = computed(() => block.value === null);
/** 是否置灰不可点。售罄**可点**(引导去二级市场),其余阻断态点了只给说明不开 sheet。 */
const dockDisabled = computed(() => block.value !== null && block.value !== "soldOut");
/** 阻断态的副说明(toast 第二行)。配置未知给「可重试」,其余给「持仓不受影响」定心。 */
const blockHintSub = computed(() => {
  if (block.value === "configUnavailable") return t.value.genesis.marketClosed.retryHint;
  if (block.value === "preSale") return "";
  return t.value.genesis.marketClosed.holdingsSafe;
});
// 倒计时副文本(showTime 时):「开售倒计时 {d天} HH:MM:SS」/「Opens in {d}d HH:MM:SS」。
const countdownDisplay = computed(() => {
  if (!showTime.value) return "";
  const dayPart = countdownDays.value > 0 ? fmt(t.value.genesisEligibility.countdownDay, { n: countdownDays.value }) + " " : "";
  return `${t.value.genesisEligibility.countdownLabel} ${dayPart}${countdownClock.value}`;
});

const totalText = computed(() => total.value.toLocaleString());
const soldText = computed(() => sold.value.toLocaleString());
const priceText = computed(() => price.value.toLocaleString());

const { elRef: salesBarRef, inView: salesBarInView } = useScrollGrowProgress();

/**
 * 阻断态的统一提示口。认购是动钱入口,被拦住时先把「钱怎么样了」说清楚 ——
 * 与 `blockHintSub` 的 holdingsSafe 同一目的,只是地区拒绝有自己更准的那句。
 * 🔴 翻译不出来(`null`)就是普通阻断态,原样走既有的 dockCtaText + blockHintSub,
 *    绝不能把「市场关闭 / 熔断 / 配置未知」说成地区受限。
 */
function toastBlocked() {
  const geo = geoPolicyUserMessage(block.value, t.value.geoPolicy);
  if (geo) toast.error(geo, t.value.geoPolicy.fundsSafeNote);
  else toast.info(dockCtaText.value, blockHintSub.value);
}

async function openSheet() {
  // 🔴 阻断判定**只问 `block` 一处**(FEAT-GEN10 ④)。改造前这里与 dockCtaText 各写一套
  //   if 链,两处顺序一致纯属巧合 —— 任一处加条件而另一处忘改就会「按钮与行为对不上」。
  if (block.value === "soldOut") {
    // 售罄 → 二级市场承接(GEN01 异常4);二级市场自身在关闭态也会锁,由该页自判。
    goMarketplace();
    return;
  }
  if (block.value === "configUnavailable") {
    // 🔴 配置未知 → 点按即**重试**(规格异常3 的重试动作,此前全链路零实现):
    //   重读配置源,成功即当场解锁;仍失败则给「可重试」说明。
    //   结果判定问派生 `block`,不摸原料 `.loaded`(④b 门):refresh 写共享 store,
    //   computed 同步失效,下一行读到的已是重读后的判定。
    await cfg.refresh();
    if (block.value !== "configUnavailable") {
      toast.success(t.value.genesis.marketClosed.retryOk);
    } else {
      toastBlocked();
    }
    return;
  }
  if (block.value !== null) {
    // 其余阻断态(市场关闭 / 熔断 / 预售未到):不开任何 sheet。
    // 🔴 禁静默无反馈(规格 ⑥):给出与按钮同一句说明,让用户知道不是点坏了。
    toastBlocked();
    return;
  }
  // 服务端资格未通过 → 展示原因，不打开购买 sheet。
  if (!eligible.value) {
    eligSheetOpen.value = true;
    return;
  }
  // 单人限购:已达上限不进购买 sheet(sheet 内 L3 + store L4 仍兜底)。
  if (gate.value.capReached) {
    toast.error(
      t.value.genesisEligibility.toastCapReached,
      fmt(t.value.genesisEligibility.toastCapReachedSub, { n: remoteApiEnabled ? genesis.remoteEligibility?.maxPerUser ?? 0 : GENESIS_ELIGIBILITY_POLICY.maxPerUser }),
    );
    return;
  }
  sheetOpen.value = true;
}

/** 资格 sheet 达标态「立即认购」→ 关资格 sheet、错开转场后开购买 sheet。 */
function onEligSubscribe() {
  eligSheetOpen.value = false;
  setTimeout(() => {
    sheetOpen.value = true;
  }, 260);
}
function goHowItWorks() {
  uni.navigateTo({ url: "/pages/genesis/how-it-works", fail: () => {} });
}
function goMarketplace() {
  uni.navigateTo({ url: "/pages/genesis/marketplace", fail: () => {} });
}

// ── styles ──
// Gold-toned pill (matches the obsidian-gold hero's crown chip — a green
// brand-soft would clash on the gold). Hardcoded gold is the .genesis-hero
// design exception (see file header), not a v5 token slip.
const howPillStyle: CSSProperties = {
  height: "44px",  // 《07》tap≥44(原 34)
  padding: "0 12px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-genesis-gold-on-dark) 14.000000000000002%, transparent)",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-genesis-gold-on-dark)",
  letterSpacing: "-0.005em",
  whiteSpace: "nowrap",
};
const heroStyle: CSSProperties = {
  padding: "24px 22px 22px",
  borderRadius: "16px",
  background:
    "radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--v5-genesis-gold-on-dark) 20%, transparent) 0%, transparent 55%)," +
    "radial-gradient(circle at 0% 100%, rgba(132,90,42,0.30) 0%, transparent 60%)," +
    "linear-gradient(160deg, #1B140A 0%, #0E0A05 60%, #1A1208 100%)",
  border: "1px solid color-mix(in srgb, var(--v5-genesis-gold-on-dark) 35%, transparent)",
  boxShadow:
    "inset 0 1px 0 color-mix(in srgb, var(--v5-genesis-gold-on-dark) 22%, transparent)," +
    "inset 0 -1px 0 rgba(0,0,0,0.45)," +
    "0 12px 32px rgba(0,0,0,0.20)",
  color: "var(--v5-genesis-gold-pale-on-dark)",
};
const dustPos = ["12%", "32%", "54%", "72%", "86%"];
const dustDur = [7, 8, 6.5, 9, 7.5];
const dustDelay = [0, 1.4, 3.0, 4.6, 2.2];
const dust = computed<CSSProperties[]>(() =>
  [0, 1, 2, 3, 4].map((i) => ({
    position: "absolute",
    bottom: "0",
    left: dustPos[i],
    width: "2px",
    height: "2px",
    borderRadius: "50%",
    background: "#E2C97C",
    boxShadow: "0 0 4px rgba(226,201,124,0.7)",
    opacity: 0,
    animation: `gen-dust-rise ${dustDur[i]}s linear infinite`,
    animationDelay: `${dustDelay[i]}s`,
  })),
);
const engraveStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--v5-genesis-gold-on-dark) 5%, transparent) 0 1px, transparent 1px 14px)",
  mixBlendMode: "screen",
  opacity: 0.6,
  pointerEvents: "none",
  animation: "gen-engrave 30s linear infinite",
};
const glowStyle: CSSProperties = {
  position: "absolute",
  top: "-60px",
  right: "-60px",
  width: "200px",
  height: "200px",
  background: "radial-gradient(circle, color-mix(in srgb, var(--v5-genesis-gold-on-dark) 28.000000000000004%, transparent), transparent 70%)",
  filter: "blur(4px)",
  pointerEvents: "none",
  animation: "gen-glow-drift 9s ease-in-out infinite",
};
const sheenStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(110deg, transparent 30%, color-mix(in srgb, var(--v5-genesis-gold-on-dark) 18%, transparent) 50%, transparent 70%)",
  transform: "translateX(-100%)",
  animation: "gen-sheen 5.5s ease-in-out infinite",
  pointerEvents: "none",
  zIndex: 1,
};
const crownChipStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-genesis-gold-on-dark) 10%, transparent)",
  color: "var(--v5-genesis-gold-on-dark)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.14em",
};
const titleStyle: CSSProperties = {
  marginTop: "18px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "34px",
  letterSpacing: "-0.024em",
  lineHeight: 1.18,
  color: "var(--v5-genesis-gold-pale-on-dark)",
};
const heroSubStyle: CSSProperties = {
  marginTop: "12px",
  fontSize: "13px",
  color: "color-mix(in srgb, var(--v5-genesis-gold-pale-on-dark) 72%, transparent)",
  lineHeight: 1.55,
};
const heroDiscStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "12px",
  color: "color-mix(in srgb, var(--v5-genesis-gold-pale-on-dark) 50%, transparent)",
  lineHeight: 1.5,
};
const barTrackStyle: CSSProperties = {
  height: "4px",
  borderRadius: "2px",
  background: "color-mix(in srgb, var(--v5-genesis-gold-on-dark) 14.000000000000002%, transparent)",
  overflow: "hidden",
};
const barFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${salesBarInView.value ? soldPct.value : 0}%`,
  background: "linear-gradient(90deg, #B5894A 0%, #E2C97C 50%, var(--v5-genesis-gold-on-dark) 100%)",
  borderRadius: "2px",
  boxShadow: "0 0 8px color-mix(in srgb, var(--v5-genesis-gold-on-dark) 50%, transparent)",
  transition: salesBarInView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
}));
const barShimmerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
  transform: "translateX(-100%)",
  animation: "gen-bar-shimmer 2.4s ease-in-out infinite",
};
const barMetaStyle: CSSProperties = {
  marginTop: "8px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "color-mix(in srgb, var(--v5-genesis-gold-pale-on-dark) 55%, transparent)",
  letterSpacing: "0.04em",
};
const urgentStyle: CSSProperties = {
  color: "var(--v5-genesis-gold-on-dark)",
  fontWeight: 500,
  animation: "gen-urgent 1.8s ease-in-out infinite",
};
// Live social-proof bubble — filled surface, no border (chat-bubble idiom).
const socialStyle: CSSProperties = {
  padding: "8px 12px",
  gap: "8px",
  background: "var(--v5-surface)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
};
const socialDotStyle: CSSProperties = { width: "6px", height: "6px", borderRadius: "50%", background: "var(--v5-success)" };
const socialTimeStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
// 《07》tap≥44:整行可点的 section header 实测 354×21。上下 margin 让出 10px 给热区,
// 总占位 22+21+12=55 → 12+44+2=58,视觉节奏基本不变。
const secHeaderStyle: CSSProperties = { margin: "12px 2px 2px", minHeight: "44px" };
const secTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const secLinkStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-brand)",
  fontWeight: 500,
};
// De-carded: floor hairline group — PerkRow already carries its own dividers.
const perksCardStyle: CSSProperties = {
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
// De-carded: floor hairline group + typed Q/A layering (title ink, body ink-2).
const faqWrapStyle: CSSProperties = {
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function faqRowStyle(i: number): CSSProperties {
  return {
    padding: "12px 0",
    borderBottom: i < faqKeys.length - 1 ? "1px solid var(--v5-border)" : "none",
  };
}
const faqQStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  lineHeight: 1.4,
};
const faqAStyle: CSSProperties = {
  marginTop: "5px",
  fontSize: "13px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.62,
};

// Sticky dock styles (folds GenesisDockHost) — anchored to chassis bottom.
const dockWrapStyle: CSSProperties = {
  padding: "12px 16px 24px",
  background: "var(--v5-sticky-bar-bg)",
  backdropFilter: "blur(18px) saturate(180%)",
  borderTop: "1px solid var(--v5-sticky-bar-border)",
};
const dockBtnStyle = computed<CSSProperties>(() => ({
  height: "54px",
  borderRadius: "999px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    dockActive.value
      // 吸底条按设计是**暗色金属面**,但原 alpha 0.55/0.72 在亮主题下被奶油页底冲淡,
      // 合成底只到 rgb(83,78,71) → 金色价格实测 3.95 不达 AA(暗主题 8.95 正常)。
      // 提到 0.88/0.92 让它在两个主题下都真的是暗面:亮主题合成底 rgb(38,32,26) → 7.73;
      // 暗主题合成底 rgb(18,13,7)(原 22,18,13)→ 9.28,肉眼无差。(2026-07-23 C1)
      ? "linear-gradient(180deg, rgba(50,38,20,0.88) 0%, rgba(20,14,8,0.92) 100%)"
      : "var(--v5-surface-2)",
  border: dockActive.value ? "1px solid color-mix(in srgb, var(--v5-genesis-gold-on-dark) 55%, transparent)" : "none",
  color: dockActive.value ? "var(--v5-genesis-gold-pale-on-dark)" : "var(--v5-ink-4)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "15px",
  letterSpacing: "0.02em",
  boxShadow:
    dockActive.value
      ? [
          "inset 0 1px 0 rgba(255,255,255,0.40)",
          "inset 0 -1px 0 rgba(0,0,0,0.50)",
          "inset 0 0 0 1px color-mix(in srgb, var(--v5-genesis-gold-on-dark) 18%, transparent)",
          "0 0 24px color-mix(in srgb, var(--v5-genesis-gold-on-dark) 20%, transparent)",
          "0 14px 30px rgba(0,0,0,0.45)",
        ].join(", ")
      : "none",
}));
const dockSpecularStyle: CSSProperties = {
  position: "absolute",
  top: "1px",
  left: "1px",
  right: "1px",
  height: "55%",
  borderRadius: "999px 999px 200px 200px / 999px 999px 40px 40px",
  background: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 55%, transparent 100%)",
  pointerEvents: "none",
};
const dockRimStyle: CSSProperties = {
  position: "absolute",
  left: "14%",
  right: "14%",
  bottom: "1px",
  height: "1px",
  background: "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--v5-genesis-gold-on-dark) 55%, transparent) 50%, transparent 100%)",
  pointerEvents: "none",
};
const dockSheenStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
  transform: "translateX(-100%)",
  animation: "gen-sheen 4.5s ease-in-out infinite",
  pointerEvents: "none",
};
// 🔴 判据必须与 dockBtnStyle 用**同一个** `dockActive`,不能一个问 dockActive、
//   一个问 remaining —— 底色换成中性面而文字仍取金色,在亮主题下就是**白字白底**
//   (实测对比度 1.17)。2026-08-05 独立验收 P0:同一处样式共 5 个取色点,
//   我只改了块内 4 个,漏掉本行,连带把原本正常的「预售倒计时」态也一起打翻。
const dockLabelStyle = computed<CSSProperties>(() => ({
  color: dockActive.value ? "var(--v5-genesis-gold-pale-on-dark)" : "var(--v5-ink-4)",
  fontWeight: 600,
}));
/** dock 内层容器色 —— 图标(currentColor)与倒计时靠它继承。与 dockLabelStyle 同判据。 */
const dockInnerStyle = computed<CSSProperties>(() => ({
  zIndex: 1,
  gap: "6px",
  color: dockActive.value ? "var(--v5-genesis-gold-on-dark)" : "var(--v5-ink-4)",
}));
const dockDividerStyle: CSSProperties = {
  width: "1px",
  height: "14px",
  background: "color-mix(in srgb, var(--v5-genesis-gold-on-dark) 40%, transparent)",
  margin: "0 4px",
};
</script>

<style scoped>
.nx-genesis-dock [role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -4px; }
.nx-genesis-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 35;
}
</style>
