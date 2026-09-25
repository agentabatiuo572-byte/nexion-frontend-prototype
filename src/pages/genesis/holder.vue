<!-- A3 holder presentation. Listing, balances and purchase policy remain store-owned. -->
<template>
  <AppChassis active="me" class="gh-chassis" :class="{ 'gh-chassis--owned': hasNodes }">
    <view class="gh-page">
      <SubPageHeader back="/pages/genesis/genesis" :title="t.genesisHolder.pageTitle" />
      <view class="gh-content">
        <template v-if="!hasNodes">
          <view class="gh-empty gh-surface" role="button" tabindex="0" @click="goGenesis" @keydown.enter.prevent="goGenesis" @keydown.space.prevent="goGenesis">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14" /></svg>
            <text class="gh-title">{{ t.genesisHolder.notHolderTitle }}</text>
            <text class="gh-muted">{{ notHolderBodyText }}</text>
            <text class="gh-link">{{ t.genesisHolder.notHolderCta }} →</text>
          </view>
          <text v-if="!remoteApiEnabled" class="gh-note">{{ t.publicCopy.experienceMode }}</text>
        </template>

        <template v-else>
          <view class="gh-hero gh-surface">
            <view class="gh-identity"><BrandLockup /><HolderBadge /></view>
            <svg class="gh-network" viewBox="0 0 200 220" fill="none" aria-hidden="true">
              <path d="m185 4-48 34 40 47-68 36 44 49-70 43M137 38l-56 25 28 58-66 26 40 66M177 85l14 103-38-18M81 63l-38 84" />
              <g><circle cx="137" cy="38" r="3"/><circle cx="177" cy="85" r="3"/><circle cx="109" cy="121" r="3"/><circle cx="153" cy="170" r="3"/><circle cx="81" cy="63" r="3"/><circle cx="43" cy="147" r="3"/></g>
            </svg>
            <view class="gh-summary">
              <view>
                <text class="gh-label">{{ t.genesisHolder.heroLabel }}</text>
                <view class="gh-count"><text>{{ owned }}</text><text class="gh-unit">{{ t.genesisHolder.nodes }}</text></view>
              </view>
              <view v-if="!dividendsOpen" class="gh-allocation">
                <text class="gh-label">{{ t.genesisHolder.pre.allocLabel }}</text>
                <text class="gh-value gh-brand">{{ allocText }}</text>
              </view>
            </view>
            <view v-if="!dividendsOpen" class="gh-stats">
              <view><text class="gh-label">{{ t.genesisHolder.pre.priority }}</text><text class="gh-value gh-brand">{{ priorityText }}</text></view>
              <view><text class="gh-label">{{ t.genesisHolder.pre.multiplier }}</text><text class="gh-value">1.0×</text></view>
            </view>
            <view v-else class="gh-emissions">
              <text class="gh-label">{{ t.genesisHolder.post.emissionLabel }}</text>
              <view class="gh-emission-row">
                <view class="gh-ring" :style="{ background: 'conic-gradient(var(--v5-brand) ' + pctText + '%, var(--v5-surface-2) 0)' }">
                  <view class="gh-ring-inner"><text class="gh-value">{{ pctText }}%</text><text class="gh-label">{{ t.genesisHolder.post.released }}</text></view>
                </view>
                <view class="gh-emission-values">
                  <text class="gh-label">{{ t.genesisHolder.post.released }}</text><text class="gh-value gh-brand">{{ emittedText }} {{ emissionUnit }}</text>
                  <text v-if="!remoteApiEnabled" class="gh-note">≈ {{ refUsdText }}</text>
                  <text class="gh-label">{{ t.genesisHolder.post.locked }}</text><text class="gh-body">{{ lockedText }} {{ emissionUnit }}</text>
                </view>
              </view>
            </view>
          </view>

          <view class="gh-disclosure gh-surface" role="note">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg>
            <text>{{ dividendsOpen ? t.genesisHolder.post.disc : t.genesisHolder.pre.disc }}</text>
          </view>

          <template v-if="!dividendsOpen">
            <view class="gh-progress">
              <text class="gh-heading">{{ t.genesisHolder.pre.progressLabel }}</text>
              <view class="gh-track"><view :style="{ width: progressPct + '%' }" /></view>
              <view class="gh-progress-meta"><text>{{ progressStageText }}</text><text>{{ progressUnlockText }}</text></view>
              <view class="gh-link gh-how" role="button" tabindex="0" @click="goHowItWorks" @keydown.enter.prevent="goHowItWorks" @keydown.space.prevent="goHowItWorks">{{ t.genesisHolder.pre.howLink }}</view>
            </view>
            <view class="gh-points gh-surface">
              <view class="gh-section-row"><text class="gh-title">{{ t.genesisHolder.pre.pointsLabel }}</text><text v-if="!remoteApiEnabled" class="gh-chip">{{ poolText }}</text></view>
              <template v-if="!remoteApiEnabled || genesisPoints.status === 'ready'">
                <view v-for="r in displayedLeaderboard" :key="r.rank" class="gh-rank" :class="{ 'gh-rank--me': r.me }">
                  <text>{{ r.rank }}</text><text class="gh-rank-who">{{ r.who }}</text><text class="gh-brand">{{ r.pts }}</text>
                </view>
                <view v-if="remoteApiEnabled && remoteCurrentUserRow" class="gh-rank gh-rank--me">
                  <text>{{ remoteCurrentUserRow.rank }}</text><text class="gh-rank-who">{{ remoteCurrentUserRow.who }}</text><text class="gh-brand">{{ remoteCurrentUserRow.pts }}</text>
                </view>
                <text class="gh-note">{{ t.genesisHolder.pre.pointsNote }}</text>
              </template>
              <text v-else class="gh-note">{{ t.genesisHolder.pre.serverPointsUnavailable }}</text>
            </view>
          </template>
          <view v-else class="gh-feed gh-surface">
            <text class="gh-title">{{ t.genesisHolder.post.feedLabel }}</text>
            <view v-if="emissionFeed.length === 0" class="gh-ledger-row"><text>{{ t.genesisHolder.post.noEmissions }}</text><text>—</text></view>
            <view v-for="(f, i) in emissionFeed" :key="i" class="gh-ledger-row"><text>{{ f.label }}</text><text class="gh-brand">{{ f.amt }}</text></view>
          </view>

          <view class="gh-holdings">
            <text class="gh-heading">{{ t.genesisHolder.holdingsLabel }}</text>
            <view class="gh-surface gh-holding-list">
              <view v-for="h in holdings" :key="h.id" class="gh-holding">
                <view class="gh-holding-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"/></svg></view>
                <view class="gh-holding-body"><text class="gh-id">{{ h.id }}</text><text class="gh-note">{{ mintedText(h.mintedAt) }}</text><text class="gh-amount gh-brand">{{ holdingAmountLabel }} {{ h.allocText }}</text></view>
                <view class="gh-icon-button" role="button" tabindex="0" :aria-label="t.genesisHolder.actions.sell" @click="goMarketplace" @keydown.enter.prevent="goMarketplace" @keydown.space.prevent="goMarketplace"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></view>
              </view>
            </view>
          </view>

          <view class="gh-perks">
            <text class="gh-heading">{{ t.genesisHolder.perksLabel }}</text>
            <view class="gh-surface gh-perk-list">
              <view v-for="k in perkKeys" :key="k" class="gh-perk">
                <view class="gh-perk-icon" :style="{ background: 'color-mix(in srgb, ' + perkColors[k] + ' 14%, transparent)' }" aria-hidden="true">{{ t.genesisHolder.perks[k].icon }}</view>
                <view class="gh-perk-copy"><text class="gh-body">{{ t.genesisHolder.perks[k].label }}</text><text class="gh-note">{{ t.genesisHolder.perks[k].body }}</text></view>
              </view>
            </view>
          </view>

          <view class="gh-actions" :aria-label="t.genesisHolder.actionsLabel">
            <view class="gh-action" role="button" tabindex="0" @click="goGenesis" @keydown.enter.prevent="goGenesis" @keydown.space.prevent="goGenesis">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-genesis-gold)" stroke-width="1.8" aria-hidden="true"><path d="M2 3h3l3 12h11l3-9H6M9 21h.01M19 21h.01"/></svg><text>{{ t.genesisHolder.actions.buy }}</text>
            </view>
            <view class="gh-action" role="button" tabindex="0" @click="goMarketplace" @keydown.enter.prevent="goMarketplace" @keydown.space.prevent="goMarketplace">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" aria-hidden="true"><path d="M16 7h6v6m0-6-9 9-5-5-6 6"/></svg><text>{{ t.genesisHolder.actions.sell }}</text>
            </view>
          </view>
          <view class="gh-boost" role="button" tabindex="0" @click="goStaking" @keydown.enter.prevent="goStaking" @keydown.space.prevent="goStaking">{{ dividendsOpen ? t.genesisHolder.post.boostCta : t.genesisHolder.pre.boostCta }}</view>
        </template>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import BrandLockup from "@/components/brand-lockup.vue";
import HolderBadge from "@/components/genesis/holder-badge.vue";
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

const progressPct = computed(() => Math.max(0, Math.min(100, genesis.totalSlots > 0 ? genesis.soldSlots / genesis.totalSlots * 100 : 0)));
const displayedLeaderboard = computed(() => remoteApiEnabled ? remoteLeaderboard.value : leaderboard.value);
const perkColors = { a: "var(--v5-warning)", b: "var(--v5-tech-cyan)", c: "var(--v5-nex)", d: "var(--v5-brand)", e: "var(--v5-brand-2)", f: "var(--v5-tech-cyan)" };
</script>

<style scoped>
.gh-chassis--owned { background-image: url("/static/img/genesis/obsidian-light.webp") !important; background-size: cover !important; background-position: center !important; }
:global(html[data-theme="dark"] .gh-chassis--owned) { background-image: url("/static/img/genesis/obsidian-dark.webp") !important; }
.gh-chassis--owned :deep(.nx-top-chrome) { background: transparent; }
.gh-page { padding-bottom: 32px; color: var(--v5-ink); font-family: var(--font-v5); }
.gh-content { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
.gh-surface { background: color-mix(in srgb, var(--v5-surface) 96%, transparent); border-radius: var(--v5-radius-xl); padding: 16px; }
.gh-hero { position: relative; overflow: hidden; padding: 20px; isolation: isolate; }
.gh-hero::after { content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: inherit; box-shadow: inset 1px 1px 0 color-mix(in srgb, var(--v5-genesis-gold) 42%, transparent), inset -1px -1px 0 color-mix(in srgb, var(--v5-genesis-gold) 24%, transparent); }
.gh-identity { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.gh-identity :deep(.uvel-brand) { width: 112px; height: 39px; }
.gh-network { position: absolute; right: 0; top: 64px; width: 45%; height: 220px; z-index: -1; stroke: var(--v5-brand); stroke-width: 0.6; opacity: 0.15; }
.gh-network g { fill: var(--v5-brand); stroke: none; }
.gh-summary { display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); gap: 16px; align-items: center; }
.gh-label { display: block; font-size: var(--v5-type-body-s); line-height: 1.5; color: var(--v5-ink-3); overflow-wrap: anywhere; }
.gh-count { display: flex; align-items: baseline; gap: 8px; font-size: var(--v5-type-hero); line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 4px; }
.gh-unit { font-size: var(--v5-type-h3); }
.gh-value { display: block; font-size: var(--v5-type-h3); line-height: 1.4; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.gh-brand { color: var(--v5-brand); }
.gh-stats { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--v5-border); }
.gh-disclosure { display: flex; align-items: center; gap: 12px; color: var(--v5-ink-3); font-size: var(--v5-type-body-s); line-height: 1.5; }
.gh-disclosure svg { flex-shrink: 0; }
.gh-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; font-size: var(--v5-type-body-m); font-weight: 600; line-height: 1.5; }
.gh-heading::after { content: ""; width: 40px; height: 1px; flex-shrink: 0; background: linear-gradient(90deg, var(--v5-genesis-gold), transparent); }
.gh-title { display: block; font-size: var(--v5-type-body-m); font-weight: 600; line-height: 1.5; }
.gh-progress { padding: 4px 8px 0; }
.gh-track { height: 8px; border-radius: var(--v5-radius-full); overflow: hidden; background: var(--v5-surface-3); }
.gh-track > view { height: 100%; border-radius: inherit; background: var(--v5-brand); }
.gh-progress-meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 8px; color: var(--v5-ink-3); font-size: var(--v5-type-caption); line-height: 1.5; }
.gh-link { color: var(--v5-brand); font-size: var(--v5-type-body-s); }
.gh-how { display: inline-flex; align-items: center; min-height: 44px; }
.gh-section-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.gh-chip { padding: 4px 8px; border-radius: var(--v5-radius-full); color: var(--v5-brand); background: var(--v5-brand-soft); font-size: var(--v5-type-caption); }
.gh-rank { display: flex; gap: 12px; align-items: center; padding: 8px; font-size: var(--v5-type-body-s); }
.gh-rank--me { background: var(--v5-brand-soft); border-radius: var(--v5-radius-s); }
.gh-rank-who { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.gh-note { display: block; font-size: var(--v5-type-caption); line-height: 1.5; color: var(--v5-ink-3); margin-top: 4px; overflow-wrap: anywhere; }
.gh-holding-list, .gh-perk-list { padding-top: 4px; padding-bottom: 4px; }
.gh-holding { display: flex; align-items: center; gap: 12px; padding: 16px 0; }
.gh-holding + .gh-holding, .gh-perk + .gh-perk { border-top: 1px solid var(--v5-border); }
.gh-holding-icon { width: 40px; height: 40px; display: grid; place-items: center; flex-shrink: 0; border-radius: var(--v5-radius-s); color: var(--v5-genesis-gold); background: color-mix(in srgb, var(--v5-genesis-gold) 12%, transparent); }
.gh-holding-body, .gh-perk-copy { flex: 1; min-width: 0; }
.gh-id { font-family: var(--font-jet-mono); font-size: var(--v5-type-caption); font-weight: 500; overflow-wrap: anywhere; }
.gh-amount { display: block; margin-top: 4px; font-size: var(--v5-type-caption); line-height: 1.5; overflow-wrap: anywhere; }
.gh-icon-button { display: grid; place-items: center; width: 44px; min-height: 44px; border-radius: var(--v5-radius-full); flex-shrink: 0; color: var(--v5-ink-3); background: var(--v5-surface-2); }
.gh-perk { display: flex; align-items: center; gap: 12px; padding: 12px 0; }
.gh-perk-icon { display: grid; place-items: center; flex-shrink: 0; width: 36px; height: 36px; border-radius: var(--v5-radius-s); font-size: 20px; }
.gh-body { display: block; font-size: var(--v5-type-body-s); font-weight: 500; line-height: 1.5; }
.gh-actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
.gh-action { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; min-height: 52px; border-radius: var(--v5-radius-full); background: var(--v5-surface); font-size: var(--v5-type-body-s); font-weight: 500; text-align: center; }
.gh-action svg { flex-shrink: 0; }
.gh-boost { display: flex; align-items: center; justify-content: center; min-height: 48px; padding: 12px 20px; border-radius: var(--v5-radius-full); background: var(--v5-brand); color: var(--v5-on-brand); font-size: var(--v5-type-button); line-height: 1.5; font-weight: 600; text-align: center; }
.gh-content [role="button"] { cursor: pointer; }
.gh-content [role="button"]:active { opacity: 0.8; }
.gh-content [role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.gh-empty { display: flex; flex-direction: column; gap: 12px; color: var(--v5-ink); }
.gh-empty > svg { color: var(--v5-genesis-gold); }
.gh-muted { color: var(--v5-ink-3); font-size: var(--v5-type-body-s); line-height: 1.5; }
.gh-emissions { margin-top: 16px; }
.gh-emission-row { display: flex; align-items: center; gap: 16px; margin-top: 12px; }
.gh-emission-values { min-width: 0; flex: 1; }
.gh-emission-values > .gh-label:not(:first-child) { margin-top: 12px; }
.gh-ring { width: 96px; height: 96px; padding: 8px; border-radius: 50%; flex-shrink: 0; }
.gh-ring-inner { width: 100%; height: 100%; border-radius: 50%; background: var(--v5-surface); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.gh-ring-inner .gh-label { font-size: var(--v5-type-caption); }
.gh-ledger-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; font-size: var(--v5-type-caption); line-height: 1.5; overflow-wrap: anywhere; }
.gh-ledger-row > text { min-width: 0; }
</style>
