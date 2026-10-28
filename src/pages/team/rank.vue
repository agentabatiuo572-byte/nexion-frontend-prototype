<template>
  <AppChassis active="team">
    <view class="rank-page">
      <SubPageHeader back="/pages/team/team" :title="t.rank.pageTitle" plain design :action-label="copy.rankRules" :action="() => go('/pages/team/rank-how')" />
      <view class="rank-content">
        <view v-if="rankAvailable" class="rank-spotlight">
          <view class="rank-identity">
            <view class="rank-identity__emblem"><TeamRankEmblem :rank="myRank" :size="76" /><text class="rank-current-level">V{{ myRank }}</text></view>
            <view class="rank-identity__copy"><text class="rank-caption">{{ t.rank.currentRank }}</text><text class="rank-current-name">{{ rankLabel(myRank,locale.code,rankDefs) }}</text></view>
          </view>
          <view v-if="prog.next" class="rank-next-progress rank-next-progress--summary">
            <view class="rank-next-heading"><text class="rank-next-title">{{ fmt(copy.toRank,{rank:rankLabel(prog.next.v,locale.code,rankDefs)}) }}</text><text class="rank-caption">{{ rankGapSummary }}</text></view>
            <view v-for="condition in nextConditions" :key="condition.key" class="rank-condition">
              <view class="rank-condition__heading"><text class="rank-condition__name">{{ condition.displayLabel }}</text><view class="rank-condition__value"><text class="rank-condition__current">{{ condition.values.split(' / ')[0] }}</text><text class="rank-condition__target"> / {{ condition.values.split(' / ')[1] }}</text></view></view>
              <view class="rank-progress-track" role="progressbar" :aria-label="condition.label" :aria-valuenow="condition.percent" :aria-valuemin="0" :aria-valuemax="100" :aria-valuetext="condition.values"><view :style="{width:(condition.percent ?? 0)+'%'}" /></view><text class="rank-condition__gap">{{ condition.gap }}</text>
            </view>
            <view v-if="inheritedConditions.length" class="rank-inherited">
              <view class="rank-inherited__toggle" role="button" tabindex="0" :aria-expanded="inheritedExpanded" aria-controls="inherited-conditions" @click="inheritedExpanded=!inheritedExpanded" @keydown.enter.prevent="inheritedExpanded=!inheritedExpanded" @keydown.space.prevent="inheritedExpanded=!inheritedExpanded"><text>{{ rankReviewCopy.previous }} · {{ inheritedConditions.length }}</text><text aria-hidden="true">{{ inheritedExpanded ? '−' : '+' }}</text></view>
              <view v-if="inheritedExpanded" id="inherited-conditions">
            <view v-for="condition in inheritedConditions" :key="condition.key" class="rank-condition">
              <view class="rank-condition__heading"><text class="rank-condition__name">{{ condition.displayLabel }}</text><view class="rank-condition__value"><text class="rank-condition__current">{{ condition.values.split(' / ')[0] }}</text><text class="rank-condition__target"> / {{ condition.values.split(' / ')[1] }}</text></view></view>
              <view class="rank-progress-track" role="progressbar" :aria-label="condition.label" :aria-valuenow="condition.percent" :aria-valuemin="0" :aria-valuemax="100" :aria-valuetext="condition.values"><view :style="{width:(condition.percent ?? 0)+'%'}" /></view><text class="rank-condition__gap">{{ condition.gap }}</text>
            </view>
              </view>
            </view>
            <view class="rank-upcoming"><text class="rank-caption">{{ upcomingBenefitsTitle }}</text><view class="rank-perk-tags"><text v-for="perk in upcomingBenefits" :key="perk.key" class="rank-perk-tag">{{ perk.label }} {{ perk.value }}</text></view><text v-if="upcomingPeerNotice" class="rank-caption rank-upcoming__notice">{{ upcomingPeerNotice }}</text></view>
            <NxButton class="rank-invite" variant="secondary" :label="t.team.inviteFriends" @click="go('/pages/team/team?intent=share')"><text>{{ t.team.inviteFriends }}</text><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></NxButton>
          </view>
        </view>
        <view v-if="rankAvailable" class="rank-ladder-section">
          <NxSection :title="copy.allRanks" :meta="rankDefs.length ? `V${rankDefs[0].v}–V${rankDefs[rankDefs.length-1].v} · ${copy.expandRank}` : ''" />
          <view class="rank-ladder">
            <view v-for="r in rankDefs" :key="r.v" class="rank-ladder-row" :data-status="rowStatus(r.v)">
              <view class="rank-row-heading" role="button" tabindex="0" :aria-label="rankLabel(r.v,locale.code,rankDefs)" :aria-expanded="expandedRank === r.v" :aria-controls="`rank-details-${r.v}`" @click="toggleRank(r.v)" @keydown.enter.prevent="toggleRank(r.v)" @keydown.space.prevent="toggleRank(r.v)">
                <TeamRankEmblem :rank="r.v" :size="36" /><view class="rank-row-copy"><text class="rank-row-title">{{ rankLabel(r.v,locale.code,rankDefs) }}</text><text class="rank-row-sub" :class="{'rank-row-sub--active':rowStatus(r.v)!=='locked'}">{{ rowStatus(r.v)==='done' ? t.rank.done : rowStatus(r.v)==='current' ? t.rank.currentRank : formatConditions(r) }}</text></view><svg class="rank-row-chevron" :class="{'rank-row-chevron--open':expandedRank===r.v}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </view>
              <view v-if="expandedRank === r.v" :id="`rank-details-${r.v}`" class="rank-details">
                <text class="rank-detail-label">{{ t.rank.conditionsLabel }}</text><view v-for="condition in conditionItems(r)" :key="condition" class="rank-condition-copy"><view class="rank-condition-dot" aria-hidden="true" /><text>{{ condition }}</text></view><text v-if="r.v>1" class="rank-detail-hint">{{ t.rank.previousConditions }}</text>
                <text class="rank-detail-label rank-detail-label--spaced">{{ t.rank.benefitsLabel }}</text><view class="rank-perk-grid"><view v-for="perk in benefitItems(r)" :key="perk.label" class="rank-perk"><text class="rank-caption">{{ perk.label }}</text><text class="rank-perk-value">{{ perk.value }}</text></view></view>
                <text class="rank-detail-label rank-detail-label--spaced">{{ t.rank.rewardsLabel }}</text><view v-for="(reward,rewardIndex) in r.rewards" :key="rewardIndex" class="rank-reward-item"><template v-if="cultivationReward(reward)"><view class="rank-reward-summary"><text class="rank-reward-title">{{ cultivationCopy.title }}</text><text class="rank-reward-amount">{{ rewardText(reward) }}</text></view><text class="rank-reward-description">{{ fmt(cultivationCopy.trigger, { n: r.v, amount: rewardText(reward) }) }}</text><text class="rank-reward-note">{{ cultivationCopy.recipient }}</text></template><text v-else class="rank-reward">{{ rewardText(reward) }}</text></view><text v-if="!r.rewards.length" class="rank-reward-note">{{ t.rank.noRewards }}</text>
              </view>
            </view>
          </view>
        </view>
        <view v-else-if="vState.remoteError" class="rank-state" role="button" tabindex="0" @click="retryRank" @keydown.enter.prevent="retryRank" @keydown.space.prevent="retryRank"><text>{{ t.rank.loadError }}</text><text>{{ t.rank.retry }}</text></view>
        <view v-else class="rank-state" role="status" aria-live="polite" aria-busy="true"><text>{{ t.rank.loading }}</text></view>
        <view v-if="rankAvailable && rankActions.length" class="rank-actions"><NxListRow v-for="action in rankActions" :key="action.key" :title="action.title" :subtitle="action.label" @click="go(action.href)"><template #leading><view class="rank-action-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><template v-if="action.kind==='directRefs'"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/></template><template v-else-if="action.kind==='selfComputePoints'"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 11h8M8 15h3"/></template><path v-else d="M4 19V9m6 10V5m6 14v-7m6 7H2" /></svg></view></template></NxListRow></view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { increasedRankBenefitKeys, rankBenefitIncreaseHeading, type RankBenefitKey } from '@/lib/team-rank-benefits';
import { teamRankRequirements } from "@/lib/team-rank-progress";
import { teamLogicCopy } from "@/i18n/team-logic-copy";
import { formatAmount } from "@/lib/amount-display";
import { navTo } from "@/lib/route";
import { platformDisplayText } from "@/lib/brand-copy";
import { isEntitlementVRankReward, rankEntitlementLabel } from "@/lib/rank-entitlement-label";
import { computed, onMounted, ref, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import TeamRankEmblem from '@/components/team/team-rank-emblem.vue';
import NxSection from "@/components/ui/nx-section.vue";
import NxListRow from "@/components/ui/nx-list-row.vue";
import { useAuditUiCopy } from '@/i18n/audit-ui';
import NxButton from "@/components/ui/nx-button.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useVRank, type VRank, type VRankDef, type VRankReward, type VRankConditions } from "@/store/v-rank";
import { rankGapText, rankConditionsText, rankLabel, rankCultivationCopy } from "@/lib/v-rank-copy";
import { formatHowNumber } from "@/lib/rank-how-content";
import { computePointsCopy, formatComputePoints } from "@/i18n/compute-points";
import { useLocaleStore } from "@/store/locale";
import { useAuth } from "@/store/auth";
import { remoteApiEnabled } from "@/api/runtime";
import { onShow } from "@dcloudio/uni-app";

const t = useT();
const copy = useAuditUiCopy();
// 中文界面显示中文头衔(主人 2026-08-17 拍板:V3 = 舰长),拼法收在 lib/v-rank-copy
const locale = useLocaleStore();
const pointCopy = computed(() => computePointsCopy(locale.code));
const cultivationCopy = computed(() => rankCultivationCopy(locale.code));
const vState = useVRank();
const auth = useAuth();

const myRank = computed(() => vState.myRank);
const rankDefs = computed(() => vState.ladder);
const rankAvailable = computed(() => !remoteApiEnabled || vState.remoteReady);
// The API supplies exact L1 rank buckets; the engine counts members at or above
// each required rank. This projection is only for the observed progress display.
const previewData = computed(() => ({
  myRank: vState.myRank,
  selfComputePoints: vState.selfComputePoints,
  directRefs: vState.directRefs,
  teamComputePoints: vState.teamComputePoints,
  vDownlineCounts: Object.fromEntries(rankDefs.value.map(({ v }) => [v,
    Object.entries(vState.vDownlineCounts).reduce((sum, [level, count]) => sum + (Number(level) >= v ? count : 0), 0),
  ])) as Record<VRank, number>,
}));
const prog = computed(() => teamRankRequirements(previewData.value, rankDefs.value));
const logicCopy = computed(() => teamLogicCopy(locale.code));
const rankGapSummary = computed(() => [
  fmt(copy.value.remainingConditions, { n: prog.value.missing.length }),
  ...(prog.value.unknown.length ? [fmt(logicCopy.value.unknownConditions, { n: prog.value.unknown.length })] : []),
].join(' · '));
const rankActions = computed(() => prog.value.missing.map(row => {
  const gap = row.gap!;
  const self = gap.kind === 'selfComputePoints';
  return {
    title: self ? copy.value.catalogue : gap.kind === 'directRefs' ? t.value.team.inviteFriends : copy.value.teamComputeDetails,
    key: row.key, kind: gap.kind,
    label: `V${row.tier} · ${rankGapText(t.value, gap, locale.code, rankDefs.value)}`,
    href: self ? '/pages/store/store' : gap.kind === 'directRefs' ? '/pages/team/team?intent=share' : '/pages/team/tree',
  };
}));
function toggleRank(v: VRank) { expandedRank.value = expandedRank.value === v ? null : v; }
const expandedRank = ref<VRank | null>(null);
const inheritedExpanded = ref(false);
let expandedAccount = auth.accountId;
let expansionInitialized = false;
watch(() => [auth.accountId, rankAvailable.value, myRank.value, rankDefs.value.map(rank => rank.v).join(',')] as const, ([account, ready]) => {
  if (account !== expandedAccount) {
    expandedAccount = account;
    expansionInitialized = false;
    expandedRank.value = null;
    inheritedExpanded.value = false;
  }
  // onShow can hide or clear facts while rereading. Only a complete ladder can
  // invalidate the chosen tier; null after initialization is an intentional fold.
  if (!ready) return;
  if (!expansionInitialized || (expandedRank.value !== null && !rankDefs.value.some(rank => rank.v === expandedRank.value))) {
    const preferred = prog.value.next?.v ?? myRank.value;
    expandedRank.value = rankDefs.value.some(rank => rank.v === preferred) ? preferred : null;
    expansionInitialized = true;
  }
}, { immediate: true });
const allConditions = computed(() => prog.value.rows
  .filter(row => row.tier === prog.value.next?.v || row.status !== 'met')
  .map(row => {
    const { kind, current, required } = row;
    const points = kind === 'selfComputePoints' || kind === 'teamComputePoints';
    const known = row.status !== 'unknown';
    const valueText = (value: number | undefined) => points ? formatComputePoints(value, locale.code)
      : value === undefined ? '—' : formatHowNumber(value, locale.code);
    const name = kind === 'selfComputePoints' ? pointCopy.value.self : kind === 'teamComputePoints' ? pointCopy.value.team
      : kind === 'directRefs' ? copy.value.directInvites : fmt(copy.value.teamRankMembers, { n: row.vLevel ?? 0 });
    return {
      tier: row.tier, key: row.key,
      label: `V${row.tier} · ${rankConditionsText(t.value, row.conditions, locale.code)}`,
      displayLabel: (row.tier < prog.value.next!.v ? `V${row.tier} · ` : '') + name,
      values: `${valueText(current)} / ${valueText(required)}`,
      gap: !known ? logicCopy.value.unknownProgress : row.gap ? rankGapText(t.value, row.gap, locale.code, rankDefs.value) : t.value.rank.done,
      percent: !known ? undefined : required === 0 ? 100 : Math.min(100, Math.max(0, Math.round(current! / required * 100))),
    };
  }));

const nextConditions = computed(() => allConditions.value.filter(row => row.tier === prog.value.next?.v));
const inheritedConditions = computed(() => allConditions.value.filter(row => row.tier !== prog.value.next?.v));
const rankReviewCopy = computed(() => ({ previous: locale.code === "zh" ? "前序等级条件" : locale.code === "vi" ? "Điều kiện hạng trước" : "Earlier rank requirements" }));

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

// Mirrors VRankRewardDispatcher.dispatchNexReward/hasSelfMarker: only positive
// NEX without a self/direct marker follows the sponsor-with-self-fallback rule.
// cultivationBonus aggregates all NEX and cannot classify an individual reward.
function cultivationReward(reward: VRankReward): boolean {
  return !isEntitlementVRankReward(reward) && reward.type === 'UVT'
    && Number.isFinite(reward.amount) && reward.amount > 0
    && !/self|direct/i.test(reward.customLabel ?? '');
}
function rewardText(reward: VRankReward): string {
  if (isEntitlementVRankReward(reward)) return platformDisplayText(rankEntitlementLabel(reward, t.value.rank.rewardUnavailable));
  const amount = `${formatAmount(reward.amount)} ${reward.type === "UVT" ? "UVT" : reward.type}`;
  return amount;
}

// 三语:词典里 rank.cond.* 五条早就有(此前是死键,这里原本拼英文)
const formatConditions = (r: VRankDef): string => rankConditionsText(t.value, r.conditions, locale.code);
function conditionItems(r: VRankDef): string[] {
  const c = r.conditions, items: VRankConditions[] = [];
  if (c.selfComputePoints !== undefined) items.push({selfComputePoints:c.selfComputePoints});
  if (c.directRefs) items.push({directRefs:c.directRefs});
  if (c.teamComputePoints !== undefined) items.push({teamComputePoints:c.teamComputePoints});
  for (const [v,n] of Object.entries(c.vDownlines ?? {})) if(n) items.push({vDownlines:{[v]:n}});
  return (items.length ? items : [{}]).map(item=>rankConditionsText(t.value,item,locale.code));
}

function go(url: string) {
  navTo(url);
}

function benefitItems(r: VRankDef): {key:RankBenefitKey;label:string;value:string}[] {
  const items: {key:RankBenefitKey;label:string;value:string}[]=[{key:'directBonus',label:t.value.rank.chips.direct,value:formatHowNumber(r.directBonus*100,locale.code)+'%'}];
  if(r.unilevelDepth>0) items.push({key:'unilevelDepth',label:copy.value.earningsDepth,value:`L1–L${r.unilevelDepth}`});
  if(r.peerBonus>0) items.push({key:'peerBonus',label:t.value.rank.chips.peer,value:vState.capabilities.peer ? formatHowNumber(r.peerBonus*100,locale.code)+'%' : fmt(t.value.rank.chips.peerNotDispatched,{n:formatHowNumber(r.peerBonus*100,locale.code)})});
  if(r.leadershipVotes>0) items.push({key:'leadershipVotes',label:t.value.rank.chips.pool,value:`${r.leadershipVotes} ${t.value.rank.chips.votes}`});
  return items;
}
const upcomingBenefitKeys = computed(() => increasedRankBenefitKeys(rankDefs.value.find(rank => rank.v === myRank.value), prog.value.next));
const upcomingBenefitsTitle = computed(() => upcomingBenefitKeys.value ? rankBenefitIncreaseHeading(locale.code) : copy.value.nextBenefits);
const upcomingBenefits = computed(() => {
  if (!prog.value.next) return [];
  const items = benefitItems(prog.value.next);
  return upcomingBenefitKeys.value ? items.filter(item => upcomingBenefitKeys.value!.includes(item.key)) : items;
});
// Keep the dispatch restriction visible even when an unchanged peer rate is
// omitted from the increases. Full conditions, benefits and rewards stay below.
const upcomingPeerNotice = computed(() => prog.value.next && prog.value.next.peerBonus > 0 && !vState.capabilities.peer
  && upcomingBenefitKeys.value && !upcomingBenefitKeys.value.includes('peerBonus')
  ? `${t.value.rank.chips.peer} · ${fmt(t.value.rank.chips.peerNotDispatched, { n: formatHowNumber(prog.value.next.peerBonus * 100, locale.code) })}` : '');
</script>

<style scoped>
.rank-page { color:var(--v5-ink);padding-bottom:28px; }
.rank-content { padding:12px 16px 0; }
.rank-spotlight { position:relative;isolation:isolate;overflow:hidden;padding:20px 18px 18px;border:1px solid var(--v5-border);border-radius:22px;background:radial-gradient(55% 45% at 18% 18%,color-mix(in srgb,var(--v5-brand) 22%,transparent),transparent 70%),radial-gradient(60% 50% at 100% 0%,color-mix(in srgb,var(--v5-ink) 6%,transparent),transparent 60%),linear-gradient(180deg,var(--ui-spotlight-top),var(--ui-ticket-bottom));margin-bottom:22px; }
.rank-spotlight::before { content:'';position:absolute;inset:0;z-index:-1;background-image:radial-gradient(color-mix(in srgb,var(--v5-ink) 6%,transparent) 1px,transparent 1px);background-size:14px 14px;-webkit-mask-image:radial-gradient(70% 60% at 85% 10%,#000,transparent 75%);mask-image:radial-gradient(70% 60% at 85% 10%,#000,transparent 75%);pointer-events:none; }
.rank-identity { position:relative;display:flex;align-items:center;gap:16px;margin-bottom:18px; }
.rank-identity__emblem { position:relative;isolation:isolate;display:flex;flex:none;flex-direction:column;align-items:center;width:76px;gap:2px; }
.rank-identity__emblem::before { content:'';position:absolute;inset:-10px -10px 14px;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--v5-brand) 40%,transparent),transparent);filter:blur(8px);pointer-events:none; }
.rank-identity__copy { flex:1;min-width:0; }
.rank-current-level { display:block;padding:0 9px;border:1px solid var(--v5-brand-border);border-radius:999px;background:var(--v5-surface);color:var(--ui-lime-soft);font:600 12.5px/20px var(--font-v5);font-variant-numeric:tabular-nums; }
.rank-current-name { display:block;margin-top:2px;font:600 26px/32px var(--font-v5);overflow-wrap:anywhere; }
.rank-caption { display:block;font:400 12.5px/1.5 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.rank-rules-link { display:flex;align-items:center;justify-content:flex-end;gap:6px;min-height:44px;margin-top:4px;font:500 13px/1.5 var(--font-v5);color:var(--v5-ink-2);cursor:pointer; }
.rank-rules-link svg { flex:none; }
.rank-next-progress { padding-top:16px;border-top:1px solid var(--v5-border); }
.rank-next-heading { display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap; }
.rank-next-title { font:600 var(--ui-type-section)/20px var(--font-v5);overflow-wrap:anywhere; }
.rank-condition { margin-top:14px; }
.rank-condition__heading { display:flex;justify-content:space-between;align-items:baseline;gap:6px 12px;flex-wrap:wrap;font:400 13.5px/20px var(--font-v5);color:var(--v5-ink-2); }
.rank-condition__name { min-width:0;overflow-wrap:anywhere; }
.rank-condition__value { display:flex;flex-wrap:wrap;justify-content:flex-end;gap:0 4px;max-width:100%;margin-left:auto;font-variant-numeric:tabular-nums;color:var(--v5-ink-3);text-align:right; }
.rank-condition__current,.rank-condition__target { white-space:nowrap; }
.rank-condition__current { color:var(--v5-ink);font-weight:600; }
.rank-progress-track { overflow:hidden;height:6px;border-radius:999px;background:var(--v5-surface-3);margin-top:8px; }
.rank-progress-track > view { height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--v5-brand-deep),var(--ui-lime-soft));box-shadow:0 0 10px var(--v5-brand-border); }
.rank-condition__gap { display:block;margin-top:6px;font:400 12.5px/18px var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.rank-inherited { border-top:1px solid var(--v5-border);margin-top:18px;padding-top:4px; }
.rank-inherited__toggle { min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:var(--ui-space-inline);font-size:12px;color:var(--v5-ink-3);cursor:pointer; }
.rank-upcoming { margin-top:16px; }
.rank-perk-tags { display:flex;flex-wrap:wrap;gap:6px;margin-top:8px; }
.rank-perk-tag { display:inline-flex;align-items:center;box-sizing:border-box;min-height:26px;max-width:100%;padding:3px 10px;border:1px solid var(--v5-border);border-radius:999px;background:var(--ui-perk);font:500 12px/18px var(--font-v5);color:var(--v5-ink-2);overflow-wrap:anywhere; }
.rank-upcoming__notice { margin-top:8px; }
.rank-invite { width:100%;margin-top:18px;box-sizing:border-box;color:var(--v5-ink); }
.rank-ladder-section { margin-top:6px; }
.rank-ladder { overflow:hidden;border:1px solid var(--v5-border);border-radius:22px;background:var(--v5-surface); }
.rank-ladder-row { position:relative; }
.rank-ladder-row::before { content:'';position:absolute;left:33px;top:0;bottom:0;width:2px;background:var(--v5-border-strong);pointer-events:none; }
.rank-ladder-row:first-child::before { top:32px; }
.rank-ladder-row:last-child::before { bottom:calc(100% - 32px); }
.rank-ladder-row[data-status="done"]::before { background:color-mix(in srgb,var(--v5-brand) 55%,var(--v5-surface)); }
.rank-ladder-row[data-status="current"] { background:linear-gradient(90deg,color-mix(in srgb,var(--v5-brand) 10%,transparent),color-mix(in srgb,var(--v5-brand) 2%,transparent)); }
.rank-row-heading { position:relative;display:flex;align-items:center;gap:12px;min-height:64px;box-sizing:border-box;padding:10px 16px;cursor:pointer; }
.rank-row-heading :deep(.team-rank-emblem) { background:var(--v5-surface);border-radius:12px; }
.rank-ladder-row[data-status="current"] .rank-row-heading :deep(.team-rank-emblem) { box-shadow:0 0 0 4px color-mix(in srgb,var(--v5-brand) 14%,transparent),0 6px 18px color-mix(in srgb,var(--v5-brand) 25%,transparent); }
.rank-row-heading:focus-visible,.rank-rules-link:focus-visible,.rank-inherited__toggle:focus-visible { outline:2px solid var(--v5-brand);outline-offset:3px; }
.rank-row-heading:focus-visible { outline-offset:-3px; }
.rank-row-copy { flex:1;min-width:0; }
.rank-row-title { display:block;font:500 var(--ui-type-list-title)/20px var(--font-v5);overflow-wrap:anywhere; }
.rank-row-sub { display:block;margin-top:2px;font:400 var(--ui-type-list-subtitle)/18px var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.rank-row-sub--active { color:var(--v5-brand); }
.rank-row-chevron { flex:none;color:var(--v5-ink-3);transition:transform 180ms; }.rank-row-chevron--open { transform:rotate(180deg); }
.rank-details { position:relative;padding:2px 16px 18px 64px; }
.rank-detail-label { display:block;font:600 12.5px/18px var(--font-v5);color:var(--v5-ink-2);margin-bottom:6px; }
.rank-detail-label--spaced { margin-top:14px; }
.rank-condition-copy { display:flex;gap:8px;align-items:baseline;margin:0;font:400 13.5px/20px var(--font-v5);color:var(--v5-ink-2);overflow-wrap:anywhere; }
.rank-condition-dot { width:5px;height:5px;border-radius:50%;background:var(--v5-ink-3);flex:none;transform:translateY(-2px); }
.rank-detail-hint,.rank-reward-note { display:block;margin-top:8px;font:400 12px/1.6 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.rank-perk-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px; }
.rank-perk { display:flex;flex-direction:column;gap:2px;min-width:0;padding:8px 10px;border:1px solid var(--v5-border);border-radius:12px;background:var(--ui-perk); }
.rank-perk-value { font:600 14px/20px var(--font-v5);font-variant-numeric:tabular-nums;overflow-wrap:anywhere; }
.rank-reward-item + .rank-reward-item { margin-top:12px; }
.rank-reward-summary { display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px;color:var(--v5-nex); }
.rank-reward-title { display:block;font:600 var(--ui-type-section)/22px var(--font-v5); }
.rank-reward-amount { display:block;font:600 15px/22px var(--font-v5);font-variant-numeric:tabular-nums;overflow-wrap:anywhere; }
.rank-reward-description { display:block;margin-top:2px;font:400 12.5px/18px var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.rank-reward { display:block;margin-top:2px;font:600 15px/22px var(--font-v5);font-variant-numeric:tabular-nums;color:var(--v5-nex);overflow-wrap:anywhere; }
.rank-actions { margin-top:18px;border-top:1px solid var(--v5-border); }.rank-actions :deep(.nx-list-row) { padding-inline:0;border-bottom:1px solid var(--v5-border); }
.rank-action-icon { width:32px;height:32px;display:grid;place-items:center;color:var(--v5-ink-2); }
.rank-state { padding:32px 0;color:var(--v5-ink-2); }.rank-state text { display:block;margin-top:var(--ui-space-row-y); }
@media(max-width:350px) { .rank-identity { gap:12px; }.rank-condition__value { flex-wrap:wrap; }.rank-details { padding-left:48px; }.rank-perk { padding-inline:8px; } }
@media(prefers-reduced-motion:reduce) { .rank-row-chevron { transition:none; } }
</style>
