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
        <view class="tree-hero">
          <view class="tree-hero-copy">
            <text class="block" :style="metricLabelStyle">{{ t.tree.totalNetwork }}</text>
            <view class="tree-total">
              <text class="font-display tabular-nums">{{ !networkReadable ? '—' : members.length }}</text>
              <text class="tree-total-unit">{{ members.length === 1 ? t.tree.member : t.tree.membersPlural }}</text>
            </view>
            <text class="block" :style="metricLabelStyle">{{ t.tree.monthlyVolume }}</text>
            <text class="block tree-points tabular-nums">{{ !networkReadable ? '—' : formatComputePoints(network.totalMonthComputePoints, locale.code) }}</text>
          </view>
          <TeamArt kind="members" :size="112" />
        </view>

        <view v-if="rosterMounted" v-show="networkReadable">
          <!-- Direct section -->
          <TeamRosterSection
            color="var(--v5-brand)"
            :title="t.tree.directTitle"
            :subtitle="directSubtitle"
            accent-bg="transparent"
            accent-text="var(--v5-brand)"
            :badge="t.tree.badgeDirect"
            :members="direct"
            :is-open="expanded.direct"
            :empty-label="t.tree.emptyDirect"
            kind="direct"
            :show-contribution="!remoteApiEnabled"
            @toggle="expanded.direct = !expanded.direct"
          />

          <!-- Extended section -->
          <TeamRosterSection
            color="var(--v5-ink-2)"
            :title="t.tree.extendedTitle"
            :subtitle="extendedSubtitle"
            accent-bg="transparent"
            accent-text="var(--v5-ink-2)"
            :badge="t.tree.badgeExtended"
            :members="extended"
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
import TeamArt from "@/components/team/team-art.vue";
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
const metricLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.5 };
</script>

<style scoped>
.team-tree-content { display: flex; flex-direction: column; gap: 28px; padding: var(--ui-space-inset) 20px 24px; }
.tree-hero { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); padding: 4px 0 12px; }
.tree-hero-copy { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.tree-total { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 4px 0 18px; font-size: 36px; font-weight: 600; line-height: 1.15; }
.tree-total-unit { font-size: 12px; color: var(--v5-ink-3); font-weight: 400; }
.tree-points { margin-top: 4px; font-size: 19px; color: var(--v5-brand); }
.tree-network-link { display: flex; align-items: center; justify-content: center; gap: var(--ui-space-inline); min-height: 48px; padding: var(--ui-space-row-y) 20px; border: 1px solid var(--v5-border); border-radius: 999px; background: color-mix(in srgb, var(--v5-ink) 6%, transparent); font-size: 14px; }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (max-width: 360px) { .team-tree-content { padding-right: 16px; padding-left: 16px; } .tree-hero :deep(.team-art) { width: 88px !important; height: 88px !important; } }
</style>
