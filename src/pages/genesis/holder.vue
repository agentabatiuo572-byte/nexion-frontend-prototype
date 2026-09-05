<!--
  Genesis Holder Dashboard — 分红延期改造后的两态看板。

  由 genesis.dividendsOpen（全平台上所信号，fail-closed）决定：
  - 上所前(!dividendsOpen)：排放优先额度 + 上所进度 + 积分榜，无 live 排放 / 无可领余额。
  - 上所后(dividendsOpen)：NEX 排放（vesting 曲线：已释放/锁定中）+ 排放明细，NEX 计价。
  myOwned === 0 → 空状态 CTA + preview（no fake holder numbers）。
  Wrapped in <AppChassis active="me">. 排放数据源 = store emissionSnapshot()（backend-replaceable）。
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 32px">
      <SubPageHeader back="/pages/genesis/genesis" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <!-- ══ Empty state (no seats) ══ -->
        <template v-if="!hasNodes">
          <view class="active:scale-[0.98]" :style="ctaCardStyle" @click="goGenesis">
            <view class="flex items-center" style="gap: 12px">
              <view class="grid place-items-center shrink-0" :style="ctaIconStyle">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="ctaTitleStyle">{{ t.genesisHolder.notHolderTitle }}</text>
                <text class="block" :style="ctaBodyStyle">{{ notHolderBodyText }}</text>
              </view>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>
          <view :style="previewStyle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px; flex-shrink: 0"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
            <text :style="previewTextStyle">{{ t.genesisHolder.previewModeBanner }}</text>
          </view>
        </template>

        <!-- ══ Holder · 上所前 ══ -->
        <template v-else-if="!dividendsOpen">
          <!-- Allocation hero -->
          <view :style="heroCardStyle">
            <view class="flex items-start" style="gap: 12px">
              <view class="grid place-items-center shrink-0" :style="avatarStyle">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="heroLabelStyle">{{ t.genesisHolder.heroLabel }}</text>
                <view class="flex items-baseline" style="gap: 6px; margin-top: 4px">
                  <text class="tabular-nums" :style="heroNumStyle">{{ owned }}</text>
                  <text :style="heroNodesStyle">{{ t.genesisHolder.nodes }}</text>
                </view>
              </view>
            </view>

            <view :style="allocLineStyle">
              <text>{{ t.genesisHolder.pre.allocLabel }} </text>
              <text class="tabular-nums" style="font-weight: 600; color: var(--v5-brand)">{{ allocText }}</text>
            </view>

            <view class="grid grid-cols-2" :style="heroStatGridStyle">
              <view>
                <text class="block truncate" :style="cellLabelStyle">{{ t.genesisHolder.pre.priority }}</text>
                <text class="block" :style="cellValStyle('var(--v5-brand)')">{{ priorityText }}</text>
              </view>
              <view>
                <text class="block truncate" :style="cellLabelStyle">{{ t.genesisHolder.pre.multiplier }}</text>
                <text class="block tabular-nums" :style="cellValStyle('var(--v5-ink)')">1.0×</text>
              </view>
            </view>
            <text class="block" :style="discStyle">{{ t.genesisHolder.pre.disc }}</text>
          </view>

          <!-- Listing progress -->
          <view :style="cardStyle">
            <text class="block" :style="cardTitleStyle">{{ t.genesisHolder.pre.progressLabel }}</text>
            <view :style="progTrackStyle"><view :style="progFillStyle" /></view>
            <view class="flex items-center justify-between" :style="progMetaStyle">
              <text>{{ progressStageText }}</text>
              <text>{{ progressUnlockText }}</text>
            </view>
            <text class="block active:opacity-70" :style="howLinkStyle" @click="goHowItWorks">{{ t.genesisHolder.pre.howLink }}</text>
          </view>

          <!-- Points leaderboard -->
          <view v-if="!remoteApiEnabled" :style="cardStyle">
            <view class="flex items-center justify-between" style="margin-bottom: 6px">
              <text :style="cardTitleStyle">{{ t.genesisHolder.pre.pointsLabel }}</text>
              <text :style="poolChipStyle">{{ poolText }}</text>
            </view>
            <view v-for="r in leaderboard" :key="r.rank" class="flex items-center" :style="rankRowStyle(r.me)">
              <text class="tabular-nums" :style="rankNumStyle">{{ r.rank }}</text>
              <text class="flex-1 min-w-0 truncate" :style="rankWhoStyle">{{ r.who }}</text>
              <text class="tabular-nums" :style="rankPtsStyle">{{ r.pts }}</text>
            </view>
            <text class="block" :style="pointsNoteStyle">{{ t.genesisHolder.pre.pointsNote }}</text>
          </view>
          <view v-else :style="cardStyle">
            <text class="block" :style="cardTitleStyle">{{ t.genesisHolder.pre.pointsLabel }}</text>
            <template v-if="genesisPoints.status === 'ready'">
              <view v-for="r in remoteLeaderboard" :key="r.rank" class="flex items-center" :style="rankRowStyle(r.me)">
                <text class="tabular-nums" :style="rankNumStyle">{{ r.rank }}</text>
                <text class="flex-1 min-w-0 truncate" :style="rankWhoStyle">{{ r.who }}</text>
                <text class="tabular-nums" :style="rankPtsStyle">{{ r.pts }}</text>
              </view>
              <view v-if="remoteCurrentUserRow" class="flex items-center" :style="rankRowStyle(true)">
                <text class="tabular-nums" :style="rankNumStyle">{{ remoteCurrentUserRow.rank }}</text>
                <text class="flex-1 min-w-0 truncate" :style="rankWhoStyle">{{ remoteCurrentUserRow.who }}</text>
                <text class="tabular-nums" :style="rankPtsStyle">{{ remoteCurrentUserRow.pts }}</text>
              </view>
              <text class="block" :style="pointsNoteStyle">{{ t.genesisHolder.pre.pointsNote }}</text>
            </template>
            <text v-else class="block" :style="pointsNoteStyle">{{ t.genesisHolder.pre.serverPointsUnavailable }}</text>
          </view>
        </template>

        <!-- ══ Holder · 上所后 ══ -->
        <template v-else>
          <!-- Emission hero -->
          <view :style="heroCardStyle">
            <text class="block" :style="heroLabelStyle">{{ t.genesisHolder.post.emissionLabel }}</text>
            <view class="flex items-center" style="gap: 16px; margin-top: 12px">
              <view class="shrink-0 grid place-items-center" :style="ringStyle">
                <view class="grid place-items-center" :style="ringInnerStyle">
                  <text class="tabular-nums" :style="ringPctStyle">{{ pctText }}%</text>
                  <text :style="ringLabelStyle">{{ t.genesisHolder.post.released }}</text>
                </view>
              </view>
              <view class="flex-1 min-w-0" style="display: flex; flex-direction: column; gap: 10px">
                <view>
                  <text class="block" :style="cellLabelStyle">{{ t.genesisHolder.post.released }}</text>
                  <text class="block tabular-nums" :style="emitValStyle">{{ emittedText }} {{ emissionUnit }}</text>
                  <text v-if="!remoteApiEnabled" class="block tabular-nums" :style="refStyle">≈ {{ refUsdText }}</text>
                </view>
                <view>
                  <text class="block" :style="cellLabelStyle">{{ t.genesisHolder.post.locked }}</text>
                  <text class="block tabular-nums" :style="lockValStyle">{{ lockedText }} {{ emissionUnit }}</text>
                </view>
              </view>
            </view>
            <text class="block" :style="discStyle">{{ t.genesisHolder.post.disc }}</text>
          </view>

          <!-- Emission log — de-carded: header + hairline row group on the floor -->
          <view>
            <view class="flex items-center" :style="feedHeadStyle">
              <view class="mc-pulse" :style="feedDotStyle" />
              <text :style="feedLabelStyle">{{ t.genesisHolder.post.feedLabel }}</text>
            </view>
            <view :style="feedListStyle">
              <view v-if="emissionFeed.length === 0" class="flex items-center" :style="feedRowStyle(true)">
                <text class="flex-1 min-w-0" style="color: var(--v5-ink-3); font-size: 12px">{{ t.genesisHolder.post.noEmissions }}</text>
                <text class="tabular-nums" :style="feedAmtStyle">—</text>
              </view>
              <view v-for="(f, i) in emissionFeed" :key="i" class="flex items-center" :style="feedRowStyle(i === emissionFeed.length - 1)">
                <text class="flex-1 min-w-0 truncate" style="color: var(--v5-ink); font-size: 12px">{{ f.label }}</text>
                <text class="tabular-nums" :style="feedAmtStyle">{{ f.amt }}</text>
              </view>
            </view>
          </view>
        </template>

        <!-- ══ Shared: holdings + perks + actions (hasNodes) ══ -->
        <template v-if="hasNodes">
          <!-- Holdings list — de-carded: floor hairline group -->
          <view style="padding: 0 2px">
            <text class="block" :style="sectionLabelStyle">{{ t.genesisHolder.holdingsLabel }}</text>
            <view :style="holdingListStyle">
              <view v-for="(h, i) in holdings" :key="h.id" class="flex items-center" :style="holdingRowStyle(i)">
                <view class="shrink-0 grid place-items-center" :style="holdingArtStyle">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>
                </view>
                <view class="flex-1 min-w-0">
                  <text class="block" :style="holdingIdStyle">{{ h.id }}</text>
                  <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 2px">{{ mintedText(h.mintedAt) }}</text>
                  <text class="block font-mono-tabular" style="margin-top: 6px; font-size: 12px; color: var(--v5-brand)">{{ holdingAmountLabel }} {{ h.allocText }}</text>
                </view>
                <view class="grid place-items-center active:opacity-70" :style="holdingLinkStyle" @click="goMarketplace">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                </view>
              </view>
            </view>
          </view>

          <!-- Perks — de-carded: floor hairline group -->
          <view :style="perksWrapStyle">
            <text class="block" :style="perksLabelStyle">{{ t.genesisHolder.perksLabel }}</text>
            <view :style="perkListStyle">
              <view v-for="(k, i) in perkKeys" :key="k" class="grid items-start" :style="perkRowStyle(i)">
                <view class="flex items-center justify-center" :style="perkIconStyle">
                  <text style="font-size: 20px; line-height: 1">{{ t.genesisHolder.perks[k].icon }}</text>
                </view>
                <view class="min-w-0">
                  <text class="block" :style="perkLabelStyle">{{ t.genesisHolder.perks[k].label }}</text>
                  <text class="block" :style="perkBodyStyle">{{ t.genesisHolder.perks[k].body }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- Quick actions -->
          <view>
            <text class="block" :style="sectionLabelStyle">{{ t.genesisHolder.actionsLabel }}</text>
            <view class="grid grid-cols-2" style="gap: 8px">
              <view :style="actionTileStyle" class="active:scale-[0.97]" @click="goGenesis">
                <view class="grid place-items-center" :style="actionIconStyle('var(--v5-brand-2)')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
                </view>
                <text :style="actionLabelStyle">{{ t.genesisHolder.actions.buy }}</text>
              </view>
              <view :style="actionTileStyle" class="active:scale-[0.97]" @click="goMarketplace">
                <view class="grid place-items-center" :style="actionIconStyle('var(--v5-brand)')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
                </view>
                <text :style="actionLabelStyle">{{ t.genesisHolder.actions.sell }}</text>
              </view>
            </view>
          </view>

          <!-- Boost CTA (state-specific label) -->
          <view class="active:scale-[0.98] text-center" :style="boostStyle" @click="goStaking">
            <text :style="boostLabelStyle">{{ dividendsOpen ? t.genesisHolder.post.boostCta : t.genesisHolder.pre.boostCta }}</text>
          </view>
        </template>

        <text class="block text-center" :style="noteStyle">{{ t.genesisHolder.note }}</text>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { useGenesis, GENESIS_EMISSION } from "@/store/genesis";
import { useGenesisConfig } from "@/store/genesis-config";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
import { remoteApiEnabled } from "@/api/runtime";
import { useGenesisPoints } from "@/store/genesis-points";

const DAY = 86400_000;
// mock 参考价：真后台提供平台 NEX 结算价（GET /api/market），此处仅用于「≈$」参考展示（非保证）。
const NEX_REF_USDT = 0.189;

const t = useT();
const genesis = useGenesis();
const genesisPoints = useGenesisPoints();

const perkKeys = ["a", "b", "c", "d", "e", "f"] as const;

const owned = computed(() => genesis.myOwned);
const hasNodes = computed(() => owned.value > 0);
const remaining = computed(() => genesis.totalSlots - genesis.soldSlots);
const dividendsOpen = computed(() => genesis.dividendsOpen);

// 🔴 「还剩 N 席」同属名额紧迫文案(独立验收 P2-14),阻断态改说状态,不催单。
// 🔴 阻断说明走 blockText 唯一出口(独立验收 P1-3):上一版写死 `.default`,
//   售罄时这里说「暂未开放」而创世页说「已售罄」,同刻自相矛盾。售罄档落 `ctaSoldOut`。
const { showUrgency, blockText } = useGenesisSaleGate();
// 页面每次露出重读配置(hydrate-once 修复;理由同 genesis.vue)。
onShow(() => {
  void useGenesisConfig().refresh();
  void genesis.syncRemote();
  void genesisPoints.refresh();
});
const notHolderBodyText = computed(() =>
  showUrgency.value
    ? fmt(t.value.genesisHolder.notHolderBody, { n: remaining.value })
    : (blockText.value ?? t.value.genesis.ctaSoldOut),
);

// ── 上所前：额度 + 优先级（mock，backend-replaceable）──
const allocText = computed(() => remoteApiEnabled
  ? t.value.genesisHolder.pre.serverVerified
  : `${genesis.reservedAllocationNEX().toLocaleString()} NEX`);
const priorityText = computed(() => remoteApiEnabled
  ? t.value.genesisHolder.pre.serverVerified
  : (owned.value >= 5 ? "Top 1%" : owned.value >= 2 ? "Top 3%" : "Top 5%"));
const poolText = computed(() => fmt(t.value.genesisHolder.pre.pointsPool, { amount: "$250K" }));
const leaderboard = computed(() => [
  { rank: 1, who: t.value.genesisHolder.pre.pointsYou, pts: String(Math.max(1, owned.value) * 1000), me: true },
]);
const remoteLeaderboard = computed(() => {
  const rows = genesisPoints.projection?.leaderboard ?? [];
  const currentRank = genesisPoints.projection?.currentUser.rank;
  return rows.map((row) => ({ rank: row.rank, who: row.handle, pts: row.points.toLocaleString(), me: row.rank === currentRank }));
});
const remoteCurrentUserRow = computed(() => {
  const projection = genesisPoints.projection;
  const rank = projection?.currentUser.rank;
  if (!projection || (rank !== null && rank !== undefined && remoteLeaderboard.value.some((row) => row.rank === rank))) return null;
  if (projection.currentUser.points <= 0 && projection.currentUser.holdings <= 0) return null;
  return { rank: rank ?? "—", who: t.value.genesisHolder.pre.pointsYou, pts: projection.currentUser.points.toLocaleString() };
});
const progressStageText = computed(() => remoteApiEnabled
  ? `${genesis.soldSlots.toLocaleString()} / ${genesis.totalSlots.toLocaleString()}`
  : t.value.genesisHolder.pre.progressStage);
const progressUnlockText = computed(() => remoteApiEnabled
  ? `${remaining.value.toLocaleString()} ${t.value.genesisHolder.pre.remainingUnit}`
  : t.value.genesisHolder.pre.progressUnlock);

// ── 上所后：排放快照（server-canonical mock）──
const snap = computed(() => genesis.emissionSnapshot());
const remotePaidUsdt = computed(() => genesis.remoteEmissions
  .filter((entry) => entry.status === "PAID")
  .reduce((sum, entry) => sum + entry.amountUsdt, 0));
const remotePendingUsdt = computed(() => genesis.remoteEmissions
  .filter((entry) => entry.status === "PENDING")
  .reduce((sum, entry) => sum + entry.amountUsdt, 0));
const pctText = computed(() => {
  if (!remoteApiEnabled) return Math.round(snap.value.pctReleased * 100);
  const total = remotePaidUsdt.value + remotePendingUsdt.value;
  return total > 0 ? Math.round((remotePaidUsdt.value / total) * 100) : 0;
});
const emittedText = computed(() => remoteApiEnabled
  ? remotePaidUsdt.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
  : Math.round(snap.value.emittedNEX).toLocaleString());
const lockedText = computed(() => remoteApiEnabled
  ? remotePendingUsdt.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
  : Math.round(snap.value.lockedNEX).toLocaleString());
const emissionUnit = computed(() => remoteApiEnabled ? "USDT" : "NEX");
const refUsdText = computed(() => `$${Math.round(snap.value.emittedNEX * NEX_REF_USDT).toLocaleString()}`);
const emissionFeed = computed(() => {
  if (remoteApiEnabled) {
    return genesis.remoteEmissions.map((entry) => ({
      label: entry.paidAt
        ? `${entry.batchNo} · ${new Date(entry.paidAt).toLocaleDateString(dateLocale())}`
        : `${entry.batchNo} · ${entry.status}`,
      amt: `+${entry.amountUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT`,
    }));
  }
  const daily = Math.max(1, Math.round((snap.value.emittedNEX * 0.008) || 142));
  return [
    { label: t.value.genesisHolder.post.feedToday, amt: `+${daily.toLocaleString()} NEX` },
    { label: t.value.genesisHolder.post.feedNext, amt: "T-18h" },
    { label: t.value.genesisHolder.post.feedPool, amt: `+${Math.round(daily * 0.27).toLocaleString()} NEX` },
  ];
});

// Holdings list — 席位 + 铸造日 + 预留额度（无排放数字）。
const holdings = computed(() => remoteApiEnabled ? genesis.remoteHoldings.slice(0, 6).map((holding) => ({
  id: holding.holdingNo,
  mintedAt: holding.acquiredAt,
  allocText: `$${holding.acquiredPriceUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT`,
})) : mockHoldings());

function mockHoldings(): Array<{ id: string; mintedAt: number; allocText: string }> {
  const list: Array<{ id: string; mintedAt: number; allocText: string }> = [];
  const count = Math.min(owned.value, 6);
  for (let i = 0; i < count; i++) {
    const serial = genesis.ownedTokenIds[i] ?? i + 1;
    list.push({
      id: `NEX-GEN-${serial.toString().padStart(4, "0")}`,
      mintedAt: Date.now() - (142 - i * 18) * DAY,
      allocText: `${GENESIS_EMISSION.nominalPerNodeNEX.toLocaleString()} NEX`,
    });
  }
  return list;
}
const holdingAmountLabel = computed(() => remoteApiEnabled
  ? t.value.genesisHolder.holdingCard.acquiredPrice
  : t.value.genesisHolder.holdingCard.allocation);

function mintedText(ms: number): string {
  return fmt(t.value.genesisHolder.holdingCard.mintedOn, { date: new Date(ms).toLocaleDateString(dateLocale()) });
}

function goGenesis() {
  uni.navigateTo({ url: "/pages/genesis/genesis", fail: () => {} });
}
function goMarketplace() {
  uni.navigateTo({ url: "/pages/genesis/marketplace", fail: () => {} });
}
function goHowItWorks() {
  uni.navigateTo({ url: "/pages/genesis/how-it-works", fail: () => {} });
}
function goStaking() {
  uni.navigateTo({ url: "/pages/staking/staking", fail: () => {} });
}

// ── styles ──
// De-carded hero (both pre- and post-listing): the big number sits on the page
// floor (2px optical inset); internal stat-grid divider stays as a hairline.
const heroCardStyle: CSSProperties = {
  padding: "0 2px",
};
const avatarStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "16px",
  background: "linear-gradient(135deg, var(--v5-genesis-gold-on-dark) 0%, #E2C97C 100%)",
  boxShadow: "0 4px 12px color-mix(in srgb, var(--v5-genesis-gold-on-dark) 25%, transparent)",
};
const heroLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  letterSpacing: "0.04em",
};
const heroNumStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "56px",
  letterSpacing: "-0.034em",
  color: "var(--v5-ink)",
  lineHeight: 1,
};
const heroNodesStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
};
const allocLineStyle: CSSProperties = {
  marginTop: "12px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const heroStatGridStyle: CSSProperties = {
  // 去线(主人 2026-08-17 全站令):总间距沿用有线时代的 10+14。
  marginTop: "24px",
  gap: "14px",
};
const cellLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  letterSpacing: "0.02em",
};
function cellValStyle(tint: string): CSSProperties {
  return {
    marginTop: "3px",
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: "20px",
    letterSpacing: "-0.014em",
    color: tint,
    lineHeight: 1.1,
  };
}
const discStyle: CSSProperties = {
  marginTop: "12px",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  lineHeight: 1.5,
};
// generic section — de-carded: label + content on the page floor (2px inset)
const cardStyle: CSSProperties = {
  padding: "0 2px",
};
const cardTitleStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
// listing progress
const progTrackStyle: CSSProperties = {
  marginTop: "12px",
  height: "8px",
  borderRadius: "99px",
  background: "color-mix(in srgb, var(--v5-surface-2) 70%, transparent)",
  overflow: "hidden",
};
const progFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${Math.max(0, Math.min(100, genesis.totalSlots > 0 ? (genesis.soldSlots / genesis.totalSlots) * 100 : 0))}%`,
  borderRadius: "99px",
  background: "linear-gradient(90deg, var(--v5-brand-2), var(--v5-brand))",
}));
const progMetaStyle: CSSProperties = {
  marginTop: "8px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const howLinkStyle: CSSProperties = {
  marginTop: "10px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand)",
};
// points leaderboard
const poolChipStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  padding: "2px 8px",
  borderRadius: "999px",
  background: "var(--v5-brand-soft)",
  color: "var(--v5-brand)",
};
function rankRowStyle(isMe: boolean): CSSProperties {
  return {
    gap: "10px",
    padding: "8px 8px",
    borderRadius: "8px",
    background: isMe ? "var(--v5-brand-soft)" : "transparent",
  };
}
const rankNumStyle: CSSProperties = {
  width: "22px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-brand)",
};
const rankWhoStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink)" };
const rankPtsStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const pointsNoteStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
// emission ring (post-listing)
const ringStyle = computed<CSSProperties>(() => ({
  width: "92px",
  height: "92px",
  borderRadius: "50%",
  background: `conic-gradient(var(--v5-brand) ${pctText.value}%, color-mix(in srgb, var(--v5-surface-2) 70%, transparent) 0)`,
}));
const ringInnerStyle: CSSProperties = {
  width: "70px",
  height: "70px",
  borderRadius: "50%",
  background: "var(--v5-surface)",
  textAlign: "center",
};
const ringPctStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  color: "var(--v5-ink)",
  lineHeight: 1,
};
const ringLabelStyle: CSSProperties = {
  fontSize: "9.5px",
  color: "var(--v5-ink-3)",
  marginTop: "2px",
};
const emitValStyle: CSSProperties = {
  marginTop: "3px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-brand)",
  lineHeight: 1.1,
};
const refStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const lockValStyle: CSSProperties = {
  marginTop: "3px",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "15px",
  color: "var(--v5-ink)",
  lineHeight: 1.1,
};
// feed — de-carded: header on the floor + hairline row group
const feedHeadStyle: CSSProperties = { padding: "0 2px 8px", gap: "6px" };
const feedListStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
const feedDotStyle: CSSProperties = { width: "6px", height: "6px", borderRadius: "999px", background: "var(--v5-brand)" };
const feedLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
function feedRowStyle(isLast: boolean): CSSProperties {
  return {
    paddingTop: "8px",
    paddingBottom: "8px",
    gap: "10px",
    fontSize: "12px",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
const feedAmtStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-brand)",
};
// cta / preview (empty state)
const ctaCardStyle: CSSProperties = { padding: "16px", borderRadius: "16px", background: "var(--v5-brand-2-soft)" };
const ctaIconStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  background: "var(--v5-brand-2)",
  boxShadow: "var(--v5-spotlight-brand-2)",
  color: "var(--v5-on-brand-2)",
};
const ctaTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const ctaBodyStyle: CSSProperties = { marginTop: "3px", fontSize: "13px", color: "var(--v5-ink-3)", lineHeight: 1.4 };
const previewStyle: CSSProperties = {
  borderRadius: "16px",
  background: "color-mix(in srgb, var(--v5-warning) 10%, transparent)",
  padding: "12px",
  display: "flex",
  alignItems: "flex-start",
  gap: "8px",
};
const previewTextStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-warning)", lineHeight: 1.625 };
// holdings
const sectionLabelStyle: CSSProperties = {
  marginBottom: "10px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
// De-carded: floor hairline group — each holding is a hairline-separated row.
const holdingListStyle: CSSProperties = { borderTop: "1px solid var(--v5-border)" };
function holdingRowStyle(i: number): CSSProperties {
  return {
    padding: "14px 0",
    gap: "12px",
    borderBottom: i < holdings.value.length - 1 ? "1px solid var(--v5-border)" : "none",
  };
}
const holdingArtStyle: CSSProperties = {
  width: "48px",
  height: "48px",
  borderRadius: "12px",
  background: "radial-gradient(60% 60% at 30% 30%, rgba(114,80,200,0.40), rgba(114,80,200,0.10) 80%)",
};
const holdingIdStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const holdingLinkStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-surface-2) 50%, transparent)",
  color: "var(--v5-ink-3)",
};
// perks — de-carded: label + hairline row group on the floor (2px inset)
const perksWrapStyle: CSSProperties = { padding: "0 2px" };
const perkListStyle: CSSProperties = { borderTop: "1px solid var(--v5-border)" };
const perksLabelStyle: CSSProperties = {
  marginBottom: "12px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
  letterSpacing: "0.06em",
};
function perkRowStyle(i: number): CSSProperties {
  return {
    gridTemplateColumns: "36px 1fr",
    gap: "12px",
    padding: "10px 0",
    borderBottom: i < perkKeys.length - 1 ? "1px solid var(--v5-border)" : "none",
  };
}
const perkIconStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "10px",
  background: "var(--v5-brand-soft)",
};
const perkLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const perkBodyStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px", lineHeight: 1.4 };
// actions
// Quick-action tiles — filled surface-2, no border (single visual difference).
const actionTileStyle: CSSProperties = {
  borderRadius: "16px",
  background: "var(--v5-surface-2)",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "6px",
};
function actionIconStyle(tint: string): CSSProperties {
  return {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    background: `color-mix(in srgb, ${tint} 15%, transparent)`,
    color: tint,
  };
}
const actionLabelStyle: CSSProperties = { fontSize: "12px", fontWeight: 600, color: "var(--v5-ink-2)" };
// boost cta
const boostStyle: CSSProperties = {
  marginTop: "2px",
  height: "48px",
  borderRadius: "999px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
};
const boostLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  color: "var(--v5-on-brand)",
  letterSpacing: "-0.008em",
};
const noteStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.625,
  paddingTop: "8px",
};
</script>
