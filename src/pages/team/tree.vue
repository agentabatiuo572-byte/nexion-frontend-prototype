<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.tree.pageTitle" />

      <view class="team-tree-content">
        <view v-if="remoteApiEnabled && network.remoteStatus === 'error'" class="nx-inline-recovery" :style="errorStateStyle">
          <view class="nx-inline-recovery__copy">
            <text class="block" style="font-weight: 600">{{ t.network.projectionErrorTitle }}</text>
            <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ t.network.projectionErrorDesc }}</text>
          </view>
          <view class="nx-inline-recovery__action nx-card-recovery-action nx-card-recovery-action--quiet nx-card-recovery-action--inline" role="button" tabindex="0" @click="network.refreshCanonicalNetwork()" @keydown.enter.prevent="network.refreshCanonicalNetwork()" @keydown.space.prevent="network.refreshCanonicalNetwork()"><text>{{ t.network.retry }}</text><text aria-hidden="true">→</text></view>
        </view>
        <!-- P-41: three stat tiles, then a member search above the two roster cards. -->
        <view class="tree-stats">
          <view class="tree-stat nx-viz-press"><view class="tree-total"><text class="nx-num-metric">{{ visibility.mask(!networkReadable ? '—' : members.length) }}</text></view><text class="tree-stat__label">{{ t.tree.totalNetwork }}</text></view>
          <view class="tree-stat tree-stat--brand nx-viz-press"><text class="nx-num-metric">{{ visibility.mask(!networkReadable ? '—' : direct.length) }}</text><text class="tree-stat__label">{{ t.tree.directTitle }}</text></view>
          <view class="tree-stat tree-stat--cyan nx-viz-press"><text class="tree-points nx-num-metric" :aria-label="visibility.mask(!networkReadable ? '—' : formatComputePoints(network.totalMonthComputePoints, locale.code))">{{ visibility.mask(!networkReadable ? '—' : formatComputePoints(network.totalMonthComputePoints, locale.code).split(' ')[0]) }}</text><text class="tree-stat__label">{{ t.tree.monthlyVolume }}</text></view>
        </view>
        <view v-if="networkReadable && members.length" class="tree-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input class="tree-search__input" :value="query" :placeholder="searchCopy" :aria-label="searchCopy" @input="onSearch" />
        </view>

        <view v-if="rosterMounted" v-show="networkReadable" class="tree-rosters">
          <!-- Direct section -->
          <TeamRosterSection
            class="tree-roster--direct"
            color="var(--v5-brand)"
            :title="t.tree.directTitle"
            :subtitle="visibility.mask(directSubtitle)"
            accent-bg="transparent"
            accent-text="var(--v5-brand)"
            :badge="t.tree.badgeDirect"
            :members="filteredDirect"
            :is-open="expanded.direct"
            :empty-label="t.tree.emptyDirect"
            kind="direct"
            :show-contribution="!remoteApiEnabled"
            @toggle="expanded.direct = !expanded.direct"
          >
            <template #root><view v-if="!visibility.hidden && filteredDirect.length" class="tree-self-root"><view class="tree-self-root__node"><text>{{ t.network.diagramYou }}</text></view></view></template>
          </TeamRosterSection>

          <!-- Extended section -->
          <TeamRosterSection
            color="var(--v5-ink-2)"
            :title="t.tree.extendedTitle"
            :subtitle="visibility.mask(extendedSubtitle)"
            accent-bg="transparent"
            accent-text="var(--v5-ink-2)"
            :badge="t.tree.badgeExtended"
            :members="filteredExtended"
            :is-open="expanded.extended"
            :empty-label="t.tree.emptyExtended"
            kind="extended"
            :show-contribution="!remoteApiEnabled"
            @toggle="expanded.extended = !expanded.extended"
          />
        </view>
        <view v-if="remoteApiEnabled && !networkReadable && (network.remoteStatus === 'idle' || network.remoteStatus === 'loading')" :style="readStateStyle" role="status" aria-busy="true">
          <text>{{ t.network.projectionLoadingTitle }}</text>
        </view>
        <view class="tree-network-link" role="button" tabindex="0" @click="navTo('/pages/team/network')" @keydown.enter.prevent="navTo('/pages/team/network')" @keydown.space.prevent="navTo('/pages/team/network')">
          <text>{{ t.network.pageTitle }}</text><text aria-hidden="true">→</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import { navTo } from "@/lib/route";
import { formatAmount } from "@/lib/amount-display";
import { computePointsCopy, formatComputePoints, sumComputePoints } from "@/i18n/compute-points";
import { useLocaleStore } from "@/store/locale";
import { computed, onMounted, reactive, ref, watch, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import TeamRosterSection from "@/components/team/team-roster-section.vue";
import { useAuth } from '@/store/auth';
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useNetwork, type NetworkMember } from "@/store/network";
import { UNILEVEL_USDT } from "@/store/commission";
import { apiRuntimeConfig, remoteApiEnabled } from "@/api/runtime";

const t = useT();
const visibility = useDataVisibility();
const auth = useAuth();
const environmentInvalidated = ref(false);
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => { environmentInvalidated.value = true; }, { flush: 'sync' });
const locale = useLocaleStore();
const network = useNetwork();
onMounted(() => { if (remoteApiEnabled) void network.ensureCanonicalNetwork(); });
onShow(() => { if (remoteApiEnabled) void network.ensureCanonicalNetwork(); });

const networkReadable = computed(() => !remoteApiEnabled || (auth.isAuthenticated && !environmentInvalidated.value && (network.remoteStatus === 'ready'
  || (network.remoteStatus === 'loading' && network.hasRemoteSnapshot))));
const members = computed(() => network.members);
// Keep an already opened member mounted during the same account's read refresh.
// Fresh loading/error states must not mount empty rosters before the first result.
const rosterMounted = ref(!remoteApiEnabled || network.remoteStatus === 'ready');
watch(() => network.remoteStatus, (status) => { if (status === 'ready') rosterMounted.value = true; });
const direct = computed(() => members.value.filter((m) => m.layer === 1));
const extended = computed(() => members.value.filter((m) => m.layer !== 1));
// Local name search over the loaded roster; the section subtitles keep the full totals.
const query = ref("");
const searchCopy = computed(() => locale.code === "zh" ? "搜索成员" : locale.code === "vi" ? "Tìm thành viên" : "Search members");
const matchesQuery = (m: { name: string }) => !query.value.trim() || m.name.toLowerCase().includes(query.value.trim().toLowerCase());
function onSearch(event: Event) {
  const detail = (event as unknown as { detail?: { value?: string } }).detail;
  query.value = detail?.value ?? (event.target as HTMLInputElement | null)?.value ?? "";
}
const filteredDirect = computed(() => direct.value.filter(matchesQuery));
const filteredExtended = computed(() => extended.value.filter(matchesQuery));

const directVol = computed(() => direct.value.reduce((s, m) => s + m.monthVolumeUSD, 0));
const extendedRoyalty = computed(() =>
  extended.value.reduce((sum, m: NetworkMember) => sum + m.monthVolumeUSD * (UNILEVEL_USDT[m.layer] ?? 0), 0),
);
const directRoyalty = computed(() => directVol.value * UNILEVEL_USDT[1]);

const directSubtitle = computed(() =>
  remoteApiEnabled
    ? computePointsCopy(locale.code).memberSummary.replace('{n}', String(direct.value.length)).replace('{points}', formatComputePoints(sumComputePoints(direct.value.map(m => m.monthComputePoints)), locale.code))
    : fmt(t.value.tree.directSubtitle, { n: direct.value.length, amount: formatAmount(directRoyalty.value) }),
);
const extendedSubtitle = computed(() =>
  remoteApiEnabled
    ? computePointsCopy(locale.code).memberSummary.replace('{n}', String(extended.value.length)).replace('{points}', formatComputePoints(sumComputePoints(extended.value.map(m => m.monthComputePoints)), locale.code))
    : fmt(t.value.tree.extendedSubtitle, { n: extended.value.length, amount: formatAmount(extendedRoyalty.value) }),
);

// expand toggle: reactive(Record) per P-027 (Vue Set/ref-toggle pitfall)
const expanded = reactive<Record<"direct" | "extended", boolean>>({ direct: true, extended: true });

const errorStateStyle: CSSProperties = { padding: "12px 0", borderBottom: "1px solid var(--v5-border)", color: "var(--v5-ink)" };
const readStateStyle: CSSProperties = { minHeight: "88px", display: "grid", placeItems: "center", color: "var(--v5-ink-3)", fontSize: "13px" };
const metricLabelStyle: CSSProperties = { fontSize: "var(--ui-type-list-subtitle)", color: "var(--v5-ink-3)", lineHeight: "var(--ui-type-list-subtitle-lh)" };
</script>

<style scoped>
.team-tree-content { display: flex; flex-direction: column; gap: var(--v5-space-6); padding: var(--v5-space-3) var(--v5-space-5) var(--v5-space-6); }
.tree-total { font-family: var(--font-metric); display: flex; align-items: baseline; gap: var(--v5-space-2); flex-wrap: wrap; font-size: var(--ui-type-wallet-amount); font-weight: 600; line-height: var(--ui-type-wallet-amount-lh); }
.tree-total-unit { font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); color: var(--v5-ink-3); font-weight: 400; }
.tree-rosters { display: flex; flex-direction: column; gap: var(--v5-space-8); }
.tree-rosters :deep(.roster-title) { font-size: var(--ui-type-section); line-height: var(--ui-type-section-lh); }
.tree-rosters :deep(.roster-heading) { padding-bottom: 14px; min-height: 44px; }
.tree-rosters :deep(.member-trigger) { min-height: 64px; gap: var(--ui-space-row-y); padding-block: 14px; }
.tree-rosters :deep(.member-name) { font-size: var(--ui-type-list-title); line-height: var(--ui-type-list-title-lh); font-weight: 500; }
.tree-rosters :deep(.member-points) { font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); }
.tree-rosters :deep(.member-points > .nx-num-metric) { font-weight: 600; }
.tree-rosters :deep(.member-meta), .tree-rosters :deep(.member-points-label), .tree-rosters :deep(.roster-count) { font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); }
.tree-rosters :deep(.member-details) { padding-block: var(--v5-space-2) 18px; }
.tree-network-link { display: flex; align-items: center; justify-content: space-between; gap: var(--v5-space-4); min-height: 48px; padding: var(--v5-space-3) 0; border-top: 1px solid var(--v5-border); color: var(--v5-ink-2); font-size: var(--ui-type-button); line-height: var(--ui-type-button-lh); }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (max-width: 374px) { .team-tree-content { padding-inline: var(--v5-space-4); } .tree-rosters :deep(.member-trigger) { min-height: 56px; gap: var(--v5-space-2); } .tree-rosters :deep(.member-trigger .team-rank-emblem) { flex-shrink: 0; } }
.tree-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--v5-space-2); }
.tree-stat { --accent: var(--v5-ink); display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: var(--ui-space-inline); border-radius: 20px; background: radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.tree-stat > text:first-child, .tree-stat .tree-total > text { overflow: hidden; font: 600 22px/28px var(--font-metric); color: var(--accent); white-space: nowrap; text-overflow: ellipsis; }
.tree-stat--brand { --accent: var(--v5-brand); }
.tree-stat > text.tree-points { max-width: 100%; overflow: visible; white-space: normal; text-overflow: clip; overflow-wrap: anywhere; }
.tree-stat--cyan { --accent: var(--ui-device-ink); }
.tree-stat__label { font: var(--ui-type-meta-weight) var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color: var(--v5-ink-3); overflow-wrap: anywhere; }
.tree-search { display: flex; align-items: center; gap: var(--v5-space-2); min-height: 44px; padding: 0 var(--ui-space-inset); border-radius: 999px; color: var(--v5-ink-3); background: linear-gradient(145deg, rgba(255,255,255,.07), transparent 40%, transparent 64%, rgba(255,255,255,.05)), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border), inset 0 3px 6px -2px rgba(255,255,255,.18); }
.tree-search__input { flex: 1; min-width: 0; font: 400 var(--ui-type-input)/var(--ui-type-input-lh) var(--font-v5); color: var(--v5-ink); background: transparent; }
/* Roster cards; direct invites hang from a connector line to show the one level we know. */
.tree-rosters :deep(.team-roster) { padding: var(--ui-space-inset); border-radius: var(--ui-radius-surface); background: var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.tree-self-root { position: relative; display: flex; align-items: center; min-height: 40px; margin-left: -2px; color: var(--v5-ink-3); font-size: var(--ui-type-meta); }
.tree-self-root__node { display: grid; place-items: center; box-sizing: border-box; width: 26px; height: 26px; flex: none; border: 1px solid var(--v5-brand); border-radius: 50%; color: var(--v5-brand); background: var(--v5-surface); }
.tree-self-root::after { content: ""; position: absolute; left: 12px; top: 33px; bottom: 0; width: 2px; background: color-mix(in srgb, var(--v5-brand) 35%, transparent); }
.tree-rosters :deep(.tree-roster--direct .member-row) { position: relative; padding-left: 28px; }
.tree-rosters :deep(.tree-roster--direct .member-row)::before { content: ""; position: absolute; left: 10px; top: 0; bottom: 0; width: 2px; background: color-mix(in srgb, var(--v5-brand) 35%, transparent); }
.tree-rosters :deep(.tree-roster--direct .member-row:last-child)::before { bottom: 50%; }
.tree-rosters :deep(.tree-roster--direct .member-row)::after { content: ""; position: absolute; left: 10px; top: 32px; width: 14px; height: 2px; background: color-mix(in srgb, var(--v5-brand) 35%, transparent); }
</style>
