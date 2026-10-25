<template>
  <AppChassis active="team">
    <view class="rank-page">
      <SubPageHeader back="/pages/team/team" :title="t.rank.pageTitle" plain design :action-label="copy.rankRules" :action="() => go('/pages/team/rank-how')" />
      <view class="rank-content">
        <view v-if="rankAvailable" class="rank-spotlight">
          <view class="rank-identity"><view class="rank-emblem" aria-hidden="true"><view class="rank-hex"><text>V{{ myRank }}</text></view></view><view class="rank-identity__copy"><text class="rank-caption">{{ t.rank.currentRank }}</text><text class="rank-current-name">{{ rankLabel(myRank,locale.code,rankDefs).replace(/^V\d+\s*/, '') }}</text></view></view>
          <view v-if="prog.next" class="rank-next-progress rank-next-progress--summary">
            <view class="rank-next-heading"><text class="rank-next-title">{{ fmt(copy.toRank,{rank:rankLabel(prog.next.v,locale.code,rankDefs)}) }}</text><text class="rank-caption">{{ fmt(copy.remainingConditions,{n:prog.missing.length}) }}</text></view>
            <view v-for="condition in nextConditions" :key="condition.key" class="rank-condition">
              <view class="rank-condition__heading"><text class="rank-condition__name">{{ condition.displayLabel }}</text><text class="rank-condition__value"><text class="rank-condition__current">{{ condition.values.split(' / ')[0] }}</text> / {{ condition.values.split(' / ')[1] }}</text></view>
              <view class="rank-progress-track" role="progressbar" :aria-label="condition.label" :aria-valuenow="condition.percent" :aria-valuemin="0" :aria-valuemax="100" :aria-valuetext="condition.values"><view :style="{width:condition.percent+'%'}" /></view><text class="rank-condition__gap">{{ condition.gap }}</text>
            </view>
            <view class="rank-upcoming"><text class="rank-caption">{{ copy.nextBenefits }}</text><view class="rank-perk-tags"><text v-for="perk in benefitItems(prog.next)" :key="perk.label">{{ perk.label }} {{ perk.value }}</text></view></view>
            <NxButton class="rank-invite" variant="primary" :label="t.team.inviteFriends" @click="go('/pages/team/team')" />
          </view>
        </view>
        <view v-if="rankAvailable" class="rank-ladder-section">
          <NxSection :title="copy.allRanks" :meta="rankDefs.length ? `V${rankDefs[0].v}–V${rankDefs[rankDefs.length-1].v} · ${copy.expandRank}` : ''" />
          <view class="rank-ladder">
            <view v-for="(r,idx) in rankDefs" :key="r.v" class="rank-ladder-row" :data-status="rowStatus(r.v)">
              <view class="rank-row-heading" role="button" tabindex="0" :aria-label="rankLabel(r.v,locale.code,rankDefs)" :aria-expanded="expandedRank === r.v" :aria-controls="`rank-details-${r.v}`" @click="toggleRank(r.v)" @keydown.enter.prevent="toggleRank(r.v)" @keydown.space.prevent="toggleRank(r.v)">
                <view class="rank-ladder-badge" aria-hidden="true"><text>{{ r.v }}</text></view><view class="rank-row-copy"><text class="rank-row-title">{{ rankLabel(r.v,locale.code,rankDefs) }}</text><text class="rank-row-sub" :class="{'rank-row-sub--active':rowStatus(r.v)!=='locked'}">{{ rowStatus(r.v)==='done' ? t.rank.done : rowStatus(r.v)==='current' ? t.rank.currentRank : formatConditions(r) }}</text></view><svg class="rank-row-chevron" :class="{'rank-row-chevron--open':expandedRank===r.v}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </view>
              <view v-if="expandedRank === r.v" :id="`rank-details-${r.v}`" class="rank-details">
                <text class="rank-detail-label">{{ t.rank.conditionsLabel }}</text><view v-for="condition in conditionItems(r)" :key="condition" class="rank-condition-copy"><view class="rank-condition-dot" aria-hidden="true" /><text>{{ condition }}</text></view><text v-if="r.v>1" class="rank-detail-hint">{{ t.rank.previousConditions }}</text>
                <text class="rank-detail-label rank-detail-label--spaced">{{ t.rank.benefitsLabel }}</text><view class="rank-perk-grid"><view v-for="perk in benefitItems(r)" :key="perk.label" class="rank-perk"><text class="rank-caption">{{ perk.label }}</text><text class="rank-perk-value">{{ perk.value }}</text></view></view>
                <text class="rank-detail-label rank-detail-label--spaced">{{ t.rank.rewardsLabel }}</text><view v-for="(reward,rewardIndex) in r.rewards" :key="rewardIndex"><text class="rank-reward">{{ rewardText(reward) }}</text><text v-if="cultivationReward(reward)" class="rank-reward-note">{{ t.rank.cultivationRecipient }}</text></view><text v-if="!r.rewards.length" class="rank-reward-note">{{ t.rank.noRewards }}</text>
              </view>
            </view>
          </view>
        </view>
        <view v-else-if="vState.remoteError" class="rank-state" role="button" tabindex="0" @click="retryRank" @keydown.enter.prevent="retryRank" @keydown.space.prevent="retryRank"><text>{{ t.rank.loadError }}</text><text>{{ t.rank.retry }}</text></view>
        <view v-else class="rank-state" role="status" aria-live="polite" aria-busy="true"><text>{{ t.rank.loading }}</text></view>
        <NxListGroup v-if="rankAvailable && rankActions.length" class="rank-actions"><NxListRow v-for="action in rankActions" :key="action.key" :title="action.title" :subtitle="action.label" @click="go(action.href)"><template #leading><view class="rank-action-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><template v-if="action.kind==='directRefs'"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/></template><template v-else-if="action.kind==='selfBuy'"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 11h8M8 15h3"/></template><path v-else d="M4 19V9m6 10V5m6 14v-7m6 7H2" /></svg></view></template></NxListRow></NxListGroup>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { navTo } from "@/lib/route";
import { platformDisplayText } from "@/lib/brand-copy";
import { isEntitlementVRankReward, rankEntitlementLabel } from "@/lib/rank-entitlement-label";
import { computed, onMounted, ref, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import NxSection from "@/components/ui/nx-section.vue";
import NxListGroup from "@/components/ui/nx-list-group.vue";
import NxListRow from "@/components/ui/nx-list-row.vue";
import { useAuditUiCopy } from '@/i18n/audit-ui';
import NxButton from "@/components/ui/nx-button.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useVRank, nextRankProgress, type VRank, type VRankDef, type VRankReward, type VRankConditions, type RankGap } from "@/store/v-rank";
import { rankGapText, rankConditionsText, rankLabel } from "@/lib/v-rank-copy";
import { formatHowNumber } from "@/lib/rank-how-content";
import { useLocaleStore } from "@/store/locale";
import { remoteApiEnabled } from "@/api/runtime";
import { onShow } from "@dcloudio/uni-app";

const t = useT();
const copy = useAuditUiCopy();
// 中文界面显示中文头衔(主人 2026-08-17 拍板:V3 = 舰长),拼法收在 lib/v-rank-copy
const locale = useLocaleStore();
const vState = useVRank();

const myRank = computed(() => vState.myRank);
const rankDefs = computed(() => vState.ladder);
const rankAvailable = computed(() => !remoteApiEnabled || vState.remoteReady);
// The API supplies exact L1 rank buckets; the engine counts members at or above
// each required rank. This projection is only for the observed progress display.
const previewData = computed(() => ({
  myRank: vState.myRank,
  selfBuyUSD: vState.selfBuyUSD,
  directRefs: vState.directRefs,
  teamVolumeUSD: vState.teamVolumeUSD,
  vDownlineCounts: Object.fromEntries(rankDefs.value.map(({ v }) => [v,
    Object.entries(vState.vDownlineCounts).reduce((sum, [level, count]) => sum + (Number(level) >= v ? count : 0), 0),
  ])) as Record<VRank, number>,
}));
const prog = computed(() => nextRankProgress(previewData.value, rankDefs.value));
const rankActions = computed(() => prog.value.missing.map((gap, index) => ({
  title: gap.kind === 'selfBuy' ? copy.value.catalogue : gap.kind === 'directRefs' ? t.value.team.inviteFriends : copy.value.teamComputeDetails,
  key: `${gap.kind}-${index}`, kind: gap.kind, label: rankGapText(t.value, gap, locale.code, rankDefs.value),
  href: gap.kind === 'selfBuy' ? '/pages/store/store' : gap.kind === 'directRefs' ? '/pages/team/team' : '/pages/team/tree',
})));
function toggleRank(v: VRank) { expandedRank.value = expandedRank.value === v ? null : v; }
const expandedRank = ref<VRank | null>(null);
watch(() => [rankAvailable.value, myRank.value, prog.value.next?.v] as const, ([ready]) => {
  if (ready) expandedRank.value = prog.value.next?.v ?? myRank.value;
}, { immediate: true });
const nextConditions = computed(() => {
  const next = prog.value.next;
  if (!next) return [];
  const rows: { key: string; label: string; displayLabel: string; values: string; gap: string; percent: number }[] = [];
  // The server evaluates every preceding tier, even when rank protection retains
  // the current rank after a refund. Keep each threshold tied to its source tier.
  for (const rank of rankDefs.value.filter((r) => r.v > 0 && r.v <= next.v)) {
    const c = rank.conditions;
    const preview = nextRankProgress({ ...previewData.value, myRank: (rank.v - 1) as VRank }, rankDefs.value);
    const add = (conditions: VRankConditions, current: number, required: number, kind: RankGap["kind"], vLevel?: number) => {
      const gap = preview.missing.find((item) => item.kind === kind
        && (item.kind !== "vDownlines" || item.vLevel === vLevel));
      if (rank.v < next.v && !gap) return;
      const unit = kind === "selfBuy" || kind === "teamVolume" ? "$" : "";
      rows.push({
        key: `${rank.v}-${kind}-${vLevel ?? ""}`,
        label: `V${rank.v} · ${rankConditionsText(t.value, conditions, locale.code)}`,
        displayLabel: (rank.v < next.v ? `V${rank.v} · ` : '') + (kind === 'selfBuy' ? copy.value.selfCompute : kind === 'teamVolume' ? copy.value.teamCompute : kind === 'directRefs' ? copy.value.directInvites : fmt(copy.value.teamRankMembers,{n:vLevel ?? 0})),
        values: `${unit}${unit ? formatAmount(current) : formatHowNumber(current, locale.code)} / ${unit}${unit ? formatAmount(required) : formatHowNumber(required, locale.code)}`,
        gap: gap ? rankGapText(t.value, gap, locale.code, rankDefs.value) : t.value.rank.done,
        percent: Math.min(100, Math.max(0, Math.round(current / required * 100))),
      });
    };
    if (c.selfBuyUSD) add({ selfBuyUSD: c.selfBuyUSD }, vState.selfBuyUSD, c.selfBuyUSD, "selfBuy");
    if (c.directRefs) add({ directRefs: c.directRefs }, vState.directRefs, c.directRefs, "directRefs");
    if (c.teamVolumeUSD) add({ teamVolumeUSD: c.teamVolumeUSD }, vState.teamVolumeUSD, c.teamVolumeUSD, "teamVolume");
    for (const [level, required] of Object.entries(c.vDownlines ?? {})) {
      if (required) add({ vDownlines: { [level]: required } }, previewData.value.vDownlineCounts[Number(level) as VRank] ?? 0, required, "vDownlines", Number(level));
    }
  }
  return rows;
});

onMounted(() => {
  // Local rank data is not used in remote mode; the ladder and member progress arrive together.
  if (remoteApiEnabled) void vState.refreshCanonicalVRank();
});
onShow(() => {
  if (remoteApiEnabled) void vState.refreshCanonicalVRank();
});

function retryRank() {
  if (remoteApiEnabled) void vState.refreshCanonicalVRank();
}

function rowStatus(v: VRank): "done" | "current" | "locked" {
  return v < vState.myRank ? "done" : v === vState.myRank ? "current" : "locked";
}

function cultivationReward(reward: VRankReward): boolean { return !isEntitlementVRankReward(reward) && reward.type === 'NEX' && !/self|direct/i.test(reward.customLabel ?? ''); }
function rewardText(reward: VRankReward): string {
  if (isEntitlementVRankReward(reward)) return platformDisplayText(rankEntitlementLabel(reward, t.value.rank.rewardUnavailable));
  const amount = `${formatAmount(reward.amount)} ${reward.type === "NEX" ? "UVT" : reward.type}`;
  return amount;
}

// 三语:词典里 rank.cond.* 五条早就有(此前是死键,这里原本拼英文)
const formatConditions = (r: VRankDef): string => rankConditionsText(t.value, r.conditions, locale.code);
function conditionItems(r: VRankDef): string[] {
  const c = r.conditions, items: VRankConditions[] = [];
  if (c.selfBuyUSD) items.push({selfBuyUSD:c.selfBuyUSD});
  if (c.directRefs) items.push({directRefs:c.directRefs});
  if (c.teamVolumeUSD) items.push({teamVolumeUSD:c.teamVolumeUSD});
  for (const [v,n] of Object.entries(c.vDownlines ?? {})) if(n) items.push({vDownlines:{[v]:n}});
  return (items.length ? items : [{}]).map(item=>rankConditionsText(t.value,item,locale.code));
}

function go(url: string) {
  navTo(url);
}

function benefitItems(r: VRankDef): {label:string;value:string}[] {
  const items=[{label:t.value.rank.chips.direct,value:formatHowNumber(r.directBonus*100,locale.code)+'%'}];
  if(r.unilevelDepth>0) items.push({label:copy.value.earningsDepth,value:`L1–L${r.unilevelDepth}`});
  if(r.peerBonus>0) items.push({label:t.value.rank.chips.peer,value:vState.capabilities.peer ? formatHowNumber(r.peerBonus*100,locale.code)+'%' : fmt(t.value.rank.chips.peerNotDispatched,{n:formatHowNumber(r.peerBonus*100,locale.code)})});
  if(r.leadershipVotes>0) items.push({label:t.value.rank.chips.pool,value:`${r.leadershipVotes} ${t.value.rank.chips.votes}`});
  return items;
}
</script>

<style scoped>
.rank-page { color:var(--v5-ink);padding-bottom:24px; }
.rank-content { padding:0 16px; }
.rank-spotlight { position:relative;overflow:hidden;padding:20px 18px 18px;border:1px solid var(--v5-border);border-radius:22px;background:radial-gradient(55% 45% at 18% 18%,color-mix(in srgb,var(--v5-brand) 22%,transparent),transparent 70%),radial-gradient(60% 50% at 100% 0%,rgba(255,255,255,.06),transparent 60%),linear-gradient(180deg,var(--ui-spotlight-top),var(--ui-ticket-bottom)); }
.rank-spotlight::before { content:'';position:absolute;inset:0;background-image:radial-gradient(var(--v5-border) 1px,transparent 1px);background-size:14px 14px;mask-image:radial-gradient(70% 60% at 85% 10%,black,transparent 75%);pointer-events:none; }
.rank-spotlight > view { position:relative; }
.rank-identity { display:flex;align-items:center;gap:16px; }
.rank-emblem { position:relative;width:76px;height:86px;flex:none; }
.rank-emblem::before { content:'';position:absolute;inset:-10px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--v5-brand) 40%,transparent),transparent);filter:blur(8px); }
.rank-hex { position:relative;width:76px;height:86px;display:grid;place-items:center;background:linear-gradient(160deg,#F0FFC2,#9EDC1D 42%,#3F6409);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%); }
.rank-hex::before { content:'';position:absolute;inset:3px;clip-path:inherit;background:linear-gradient(165deg,#292929,#111111); }
.rank-hex text { position:relative;font:600 26px/32px var(--font-v5);letter-spacing:-.02em;color:transparent;background:linear-gradient(180deg,#F0FFC2,#9EDC1D);background-clip:text;-webkit-background-clip:text; }
.rank-identity__copy { min-width:0; }
.rank-caption { display:block;font:400 12.5px/18px var(--font-v5);color:var(--v5-ink-3); }
.rank-current-name { display:block;margin-top:2px;font:600 26px/32px var(--font-v5);overflow-wrap:anywhere; }
.rank-next-progress { margin-top:18px;padding-top:16px;border-top:1px solid var(--v5-border); }
.rank-next-heading { display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap; }
.rank-next-title { font:600 15px/20px var(--font-v5); }
.rank-condition { margin-top:14px; }
.rank-condition__heading { display:flex;justify-content:space-between;align-items:baseline;gap:8px;font:400 13.5px/20px var(--font-v5);color:var(--v5-ink-2); }
.rank-condition__name { min-width:0; }
.rank-condition__value { font-variant-numeric:tabular-nums;color:var(--v5-ink-3);text-align:right; }
.rank-condition__current { color:var(--v5-ink);font-weight:600; }
.rank-progress-track { overflow:hidden;height:6px;border-radius:999px;background:var(--v5-surface-3);margin-top:8px; }
.rank-progress-track > view { height:100%;border-radius:inherit;background:linear-gradient(90deg,#7DB817,#C8F25A);box-shadow:0 0 10px color-mix(in srgb,var(--v5-brand) 45%,transparent); }
.rank-condition__gap { display:block;margin-top:6px;font:400 12.5px/18px var(--font-v5);color:var(--v5-ink-3); }
.rank-upcoming { margin-top:16px; }
.rank-perk-tags { display:flex;flex-wrap:wrap;gap:6px;margin-top:8px; }
.rank-perk-tags > text { display:inline-flex;align-items:center;min-height:26px;padding:3px 10px;border-radius:999px;border:1px solid var(--v5-border);background:var(--ui-perk);font:500 12px/18px var(--font-v5);color:var(--v5-ink-2); }
.rank-invite { font-size:15px;width:100%;min-height:46px;margin-top:18px;box-shadow:0 8px 22px color-mix(in srgb,var(--v5-brand) 28%,transparent),inset 0 1px 0 rgba(255,255,255,.45); }
.rank-ladder-section,.rank-actions { margin-top:22px; }
.rank-ladder { border-radius:22px;border:1px solid var(--v5-border);overflow:hidden;background:var(--v5-surface); }
.rank-ladder-row { position:relative; }
.rank-ladder-row::before { content:'';position:absolute;left:33px;top:0;bottom:0;width:2px;background:var(--v5-surface-3); }
.rank-ladder-row:first-child::before { top:32px; }.rank-ladder-row:last-child::before { bottom:calc(100% - 32px); }
.rank-ladder-row[data-status="done"]::before { background:color-mix(in srgb,var(--v5-brand) 55%,var(--v5-surface)); }
.rank-ladder-row[data-status="current"] { background:linear-gradient(90deg,color-mix(in srgb,var(--v5-brand) 10%,transparent),color-mix(in srgb,var(--v5-brand) 2%,transparent)); }
.rank-row-heading { position:relative;display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 16px;cursor:pointer; }
.rank-row-heading:focus-visible { outline:2px solid var(--v5-brand);outline-offset:-3px; }
.rank-ladder-badge { width:36px;height:36px;border-radius:12px;display:grid;place-items:center;flex:none;font:600 15px/20px var(--font-v5);background:var(--v5-surface-2);color:var(--v5-ink-3); }
.rank-ladder-row[data-status="current"] .rank-ladder-badge { background:linear-gradient(160deg,var(--ui-lime-pale),var(--v5-brand));color:var(--v5-on-brand);box-shadow:0 0 0 4px color-mix(in srgb,var(--v5-brand) 14%,transparent),0 6px 18px color-mix(in srgb,var(--v5-brand) 35%,transparent); }
.rank-ladder-row[data-status="done"] .rank-ladder-badge { color:var(--v5-brand);background:color-mix(in srgb,var(--v5-brand) 12%,var(--v5-surface)); }
.rank-row-copy { flex:1;min-width:0; }.rank-row-title { display:block;font:500 15px/20px var(--font-v5); }
.rank-row-sub { display:block;margin-top:2px;font:400 13px/18px var(--font-v5);color:var(--v5-ink-3); }.rank-row-sub--active { color:var(--v5-brand); }
.rank-row-chevron { flex:none;color:var(--v5-ink-4);transition:transform 180ms; }.rank-row-chevron--open { transform:rotate(180deg); }
.rank-details { position:relative;padding:2px 16px 18px 64px; }
.rank-detail-label { display:block;font:600 12.5px/18px var(--font-v5);color:var(--v5-ink-2);margin-bottom:6px; }.rank-detail-label--spaced { margin-top:14px; }
.rank-condition-copy { display:flex;gap:8px;align-items:baseline;font:400 13.5px/20px var(--font-v5);color:var(--v5-ink-2); }.rank-detail-hint { display:block;font:400 12px/18px var(--font-v5);color:var(--v5-ink-3); }
.rank-perk-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px; }.rank-perk { padding:8px 10px;border:1px solid var(--v5-border);border-radius:12px;background:var(--ui-perk); }.rank-perk-value { display:block;margin-top:2px;font:600 14px/20px var(--font-v5);overflow-wrap:anywhere; }
.rank-reward { display:block;font:600 15px/22px var(--font-v5);color:var(--v5-nex); }.rank-action-icon { width:36px;height:36px;display:grid;place-items:center;border-radius:12px;background:var(--v5-surface-2); }
.rank-condition-dot {width:5px;height:5px;border-radius:50%;background:var(--v5-ink-3);flex:none;transform:translateY(-2px);}.rank-reward-note {display:block;margin-top:2px;font:400 12.5px/18px var(--font-v5);color:var(--v5-ink-3);}
.rank-state { padding:24px 16px;color:var(--v5-ink-2); }.rank-state text { display:block; }
@media(max-width:350px) { .rank-condition__heading { gap:6px; }.rank-spotlight { padding-inline:14px; }.rank-perk { padding:8px; } }
@media(prefers-reduced-motion:reduce) { .rank-row-chevron { transition:none; } }
</style>
