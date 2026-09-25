<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.quota.pageTitle" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px; padding-top: 18px">
        <view v-if="remoteApiEnabled && remoteError" class="rounded-2xl" :style="remoteErrorStyle">
          <view class="flex items-center justify-between" style="gap: 12px">
            <text :style="{ color: 'var(--v5-warning)', fontSize: '12px' }">{{ remoteError }}</text>
            <view class="shrink-0 active:opacity-70" :style="retryBtnStyle" :aria-disabled="remoteRefreshing ? 'true' : 'false'" role="button" tabindex="0" @click="refreshRemoteQuota">
              <text>{{ t.store.catalogRetry }}</text>
            </view>
          </view>
        </view>

        <text v-else-if="remoteApiEnabled && remoteRefreshing && !remoteSnapshot" style="color: var(--v5-ink-3); font-size: 13px">{{ t.store.catalogLoadingBody }}</text>
        <text v-else-if="remoteApiEnabled && remoteSnapshot && tiers.length === 0" style="color: var(--v5-ink-3); font-size: 13px">{{ t.store.catalogEmptyBody }}</text>

        <!-- Tier cards -->
        <QuotaTierCard v-for="tier in tiers" :key="tier.productId" :tier="tier" @navigate="go" />

      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import QuotaTierCard, { type QuotaTier, type QuotaCondition } from "@/components/team/quota-tier-card.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { remoteApiEnabled, teamQuotaApi } from "@/api/runtime";
import type { TeamQuotaSnapshot } from "@/api/team-quota-api";
import { getProduct as getMockProduct } from "@/mock/products";
import { specText } from "@/lib/product-copy";
import { useNetwork } from "@/store/network";
import { useVRank } from "@/store/v-rank";

const t = useT();
const network = useNetwork();
const vRank = useVRank();
const remoteSnapshot = ref<TeamQuotaSnapshot | null>(null);
const remoteError = ref<string | null>(null);
const remoteRefreshing = ref(false);
let remoteRequest = 0;
async function refreshRemoteQuota() {
  if (remoteRefreshing.value) return;
  const request = ++remoteRequest;
  remoteRefreshing.value = true;
  remoteError.value = null;
  try {
    const value = await teamQuotaApi.snapshot();
    if (request === remoteRequest) remoteSnapshot.value = value;
  } catch {
    if (request === remoteRequest) { remoteSnapshot.value = null; remoteError.value = t.value.authOtp.errorServiceUnavailable; }
  } finally {
    if (request === remoteRequest) remoteRefreshing.value = false;
  }
}
onShow(() => { if (remoteApiEnabled) void refreshRemoteQuota(); });

const members = computed(() => network.members);
const activeDirect = computed(() => remoteApiEnabled ? remoteSnapshot.value?.facts.activeDirect ?? 0 : members.value.filter((m) => m.layer === 1 && m.status === "active").length);

// Single source: tiers derive from the catalog products that carry a
// purchaseGate (name/price/锁额/解锁条件/perks all from getProduct + gate config,
// with live progress from network/v-rank). No hardcoded device economics here —
// the page mirrors §4 PurchaseGate + the store catalog (fixes stale $899/$3,499/
// "800-1,100 NEX/day" that drifted out of sync with the recalibrated catalog).
function buildTier(productId: string, tint: string): QuotaTier | null {
  const p = getMockProduct(productId);
  const g = p?.purchaseGate;
  if (!p || !g) return null;
  const conditions: QuotaCondition[] = [];
  if (g.rankMin != null)
    conditions.push({ label: fmt(t.value.quota.condRank, { v: g.rankMin }), current: vRank.myRank, required: g.rankMin, kind: "invites" });
  if (g.activeDirectMin != null)
    conditions.push({ label: t.value.quota.condActivatedDirect, current: activeDirect.value, required: g.activeDirectMin, kind: "invites" });
  if (g.teamVolumeMin != null)
    conditions.push({ label: t.value.quota.condTeamVol, current: vRank.teamVolumeUSD, required: g.teamVolumeMin, kind: "volume" });
  return {
    productId,
    name: p.name,
    price: p.price,
    monthlyStock: g.quotaCap ?? 0,
    soldThisMonth: g.quotaSold ?? 0,
    unlockKind: g.mode,
    conditions,
    perks: [
      fmt(t.value.quota.perkGen, { n: p.dailyEarnNEX }),
      `${specText(t.value, p.gpu)} · ${specText(t.value, p.vram)}`,
    ],
    tint,
  };
}

function visibleQuotaPerks(perks: readonly string[]): string[] {
  const annualReturn = /年化|每年|年(?:度)?(?:收益|回报|产出|产量)|\b(?:annual(?:i[sz]ed|ly)?|yearly|apy|apr|roi)\b|(?:\/|per\s+)(?:yr|year|annum)\b|(?:\/|mỗi\s+|hằng\s+|hàng\s+)năm/iu;
  const payback = /回本|回收(?:期|周期|成本|本金|投资)|收回(?:成本|本金|投资)|\b(?:pay[ -]?back|paid back|break[ -]?even|recoup)\b|pays? (?:for )?itself|(?:capital|cost|investment) recovery|hoàn vốn|h[òo][aà] vốn|thu hồi vốn/iu;
  return perks.filter((perk) => {
    const text = perk.normalize("NFC");
    return !annualReturn.test(text) && !payback.test(text);
  });
}

const tiers = computed<QuotaTier[]>(() =>
  remoteApiEnabled
    ? (remoteSnapshot.value?.tiers ?? []).map((tier, index) => ({
      productId: tier.productId, name: tier.name, price: tier.price,
      monthlyStock: tier.monthlyStock, soldThisMonth: tier.soldThisMonth,
      unlockKind: tier.unlockKind === "EITHER" ? "either" : "all",
      conditions: tier.conditions.map((condition) => ({
        label: condition.kind === "teamVolume" ? t.value.quota.condTeamVol
          : condition.kind === "rank" ? fmt(t.value.quota.condRank, { v: condition.required })
          : t.value.quota.condActivatedDirect,
        current: condition.current, required: condition.required,
        kind: condition.kind === "teamVolume" ? "volume" : "invites",
      })), perks: visibleQuotaPerks(tier.perks), tint: index % 2 ? "var(--v5-warning)" : "var(--v5-brand)",
    }))
    : [buildTier("stellarbox-pro", "var(--v5-brand)"), buildTier("stellarrack-p1", "var(--v5-warning)")].filter(
      (x): x is QuotaTier => x !== null,
    ),
);

function go(url: string) {
  uni.navigateTo({ url, fail: () => {} });
}
const remoteErrorStyle: CSSProperties = { padding: "10px 12px", background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)" };
const retryBtnStyle: CSSProperties = { minHeight: "32px", padding: "0 10px", borderRadius: "999px", background: "var(--v5-surface-2)", color: "var(--v5-ink)", fontSize: "12px" };
</script>
