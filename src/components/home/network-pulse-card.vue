<!--
  NetworkPulseCard — ZONE 2 global-grid metrics(规格 FEAT-HOME02)。
  三格:注册用户 / 在线设备 / 设备预估排名。
-->
<template>
  <NxSection v-if="compactView && compactAvailable" :title="copy.network" :action="copy.details" @action="navTo('/pages/globe/globe')" data-home-section="network">
    <view class="network-compact">
      <view v-for="(m,i) in metrics" :key="m.k" class="network-compact__cell" :role="m.tap ? 'button' : undefined" :tabindex="m.tap ? 0 : -1" @click="activate(m.tap)" @keydown.enter.prevent="activate(m.tap)" @keydown.space.prevent="activate(m.tap)">
        <text class="network-compact__label">{{ i === 0 && estimated ? copy.memberEstimateLabel : m.k }}</text>
        <text class="network-compact__value" :style="m.vSize ? {fontSize:m.vSize} : {}">{{ i === 0 && registeredDisplay != null ? registeredDisplay.toLocaleString() : m.v }}</text>
        <text v-if="m.subTap" class="network-compact__retry" role="button" tabindex="0" @click.stop="m.subTap()" @keydown.enter.stop.prevent="m.subTap()" @keydown.space.stop.prevent="m.subTap()">{{ m.sub }}</text>
        <text v-else-if="m.v === '-'" class="network-compact__retry">{{ m.sub }}</text>
      </view>
    </view>
  </NxSection>
  <view v-else-if="!compactView" data-home-section="network-pulse">
    <view class="flex items-center justify-between" style="margin: 8px 2px 10px">
      <text style="font-family: var(--font-v5); font-weight: 600; font-size: 15px; color: var(--v5-ink); letter-spacing: -0.012em">{{ t.home.networkPulseTitle }}</text>
    </view>

    <view class="nx-glass-card" style="background: var(--nx-glass-fill); box-shadow: var(--nx-glass-edge); border-radius: var(--nx-glass-radius); overflow: hidden">

      <view class="grid grid-cols-3">
        <view
          v-for="(m, i) in metrics"
          :key="m.k"
          class="grid items-center gap-2"
          :class="m.tap ? 'active:opacity-70' : ''"
          :role="m.tap ? 'button' : undefined"
          :tabindex="m.tap ? 0 : -1"
          :style="{ gridTemplateColumns: '1fr', padding: '12px', borderRight: i < metrics.length - 1 ? '1px solid var(--v5-border)' : 'none', minWidth: 0 }"
          v-on="m.tap ? { click: m.tap } : {}"

          @keydown.enter.stop.prevent="activate(m.tap)" @keydown.space.stop.prevent="activate(m.tap)"
        >
          <view class="min-w-0">
            <text class="block font-mono-tabular" style="font-size: 12px; line-height: 14px; min-height: 28px; color: var(--v5-ink-3)">{{ m.k }}</text>
            <!-- 骨架条:只属**占位格**(健康格有活数据,刷新期间保持旧值,不糊骨架 ——
                 R2 审计:下拉链 900ms 后 load 600ms,任何纯时长防抖都会被常量击穿,
                 「有值不换骨架」才是真防闪;300ms 防抖只管占位格自己的拉取显示)。 -->
            <view v-if="m.skeleton" class="mt-1.5" style="height: 18px; width: 72%; border-radius: 6px; background: var(--v5-surface-3)" />
            <text
              v-else
              class="block mt-0.5 tabular-nums"
              :style="{ fontFamily: 'var(--font-v5)', fontWeight: 600, fontSize: m.vSize ?? '20px', color: m.tone, letterSpacing: '-0.014em', lineHeight: 1.05, whiteSpace: 'nowrap' }"
            >{{ m.v }}</text>
            <!-- Retry has its own tap target; explanation uses the whole rank cell. -->
            <text
              v-if="m.subTap"
              class="block mt-1 font-mono-tabular truncate active:opacity-70"
              role="button"
              tabindex="0"
              :style="{ fontSize: '12px', color: m.subTone ?? 'var(--v5-ink-4)', padding: '14px 0', margin: '-14px 0' }"
              @click.stop="m.subTap()"

              @keydown.enter.stop.prevent="activate(m.subTap)" @keydown.space.stop.prevent="activate(m.subTap)"
            >{{ m.sub }}</text>
            <text
              v-else
              class="block mt-1 font-mono-tabular truncate"
              :style="{ fontSize: '12px', color: m.subTone ?? 'var(--v5-ink-4)' }"
            >{{ m.sub }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import NxSection from '@/components/ui/nx-section.vue';
import { useAuditUiCopy } from '@/i18n/audit-ui';
const props = defineProps<{compactView?:boolean;estimated?:boolean;registeredDisplay?:number|null}>();
const copy = useAuditUiCopy();
import { useT } from "@/i18n/use-t";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { useNetworkRank } from "@/store/network-rank";
import { remoteApiEnabled } from "@/api/runtime";
import { compactNumber as compact } from "@/lib/platform-stats";
import { confirm } from "@/store/ui";
import { navTo } from "@/lib/route";

const t = useT();
const app = useApp();
const cfg = useConfig();
const remoteRank = useNetworkRank();
function refreshRankMoment() {
  if (remoteApiEnabled) void remoteRank.refresh();
}
onMounted(refreshRankMoment);
watch(() => app.accountKey, (accountKey) => {
  if (!remoteApiEnabled) return;
  // Defensive rebind for direct session restore/account mutations; the central
  // account scope also binds this store, and the epoch makes duplicate binds safe.
  remoteRank.bindAccount(accountKey);
  refreshRankMoment();
});
watch(() => cfg.loading, (l, was) => {
  if (was && !l) refreshRankMoment();
});

// 🔴 骨架防闪的真机制(R2 审计后改):**有活数据的格永不切骨架**(stale-while-revalidate,
//   下拉链 await 900ms 后 load 600ms,600>300 恒成立,纯时长防抖必被击穿)。
//   本防抖只服务**占位格**自己的「拉取中」显示:>300ms 才亮,免得点重试闪一下(规格 ⑤)。
const showSkeleton = ref(false);
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => cfg.loading, (l) => {
  if (props.compactView) return;
  if (l) {
    skeletonTimer = setTimeout(() => { showSkeleton.value = true; }, 300);
  } else {
    if (skeletonTimer !== null) { clearTimeout(skeletonTimer); skeletonTimer = null; }
    showSkeleton.value = false;
  }
});
onUnmounted(() => { if (skeletonTimer !== null) clearTimeout(skeletonTimer); }); // R3 P2 卫生债

// Only the current bound phone participates; no account-total or local fallback.
const rank = computed(() => {
  if (!remoteApiEnabled) return { kind: "unavailable" } as const;
  if (remoteRank.snapshot === null) return { kind: "unavailable" } as const;
  const snapshot = remoteRank.snapshot;
  return snapshot.state === "ranked"
    ? { kind: "ranked", rank: snapshot.currentRank! } as const
    : { kind: snapshot.state };
});
// This optional home summary is shown only when all three cells are usable.
// The full card retains its existing explanations and retry controls.
const compactAvailable = computed(() => {
  const members = props.estimated ? props.registeredDisplay : cfg.config.networkPulse?.registeredUsers;
  const devices = cfg.config.networkPulse?.onlineDevices;
  const currentRank = rank.value;
  return !cfg.loading && !cfg.syncFailed && remoteRank.status !== 'error'
    && typeof members === 'number' && Number.isSafeInteger(members) && members >= 0
    && typeof devices === 'number' && Number.isSafeInteger(devices) && devices >= 0
    && (currentRank.kind === 'unranked'
      || (currentRank.kind === 'ranked' && Number.isSafeInteger(currentRank.rank) && currentRank.rank > 0));
});
function explainRank() {
  const state = rank.value.kind;
  const status = state === "unranked" ? t.value.home.networkRankTipUnranked
    : state === "disabled" ? t.value.home.networkRankDisabled
    : state === "unavailable" ? t.value.home.networkRankUnavailable : "";
  void confirm({ title: t.value.home.networkYourRank,
    message: [status, t.value.home.networkRankTipRanked].filter(Boolean).join("\n\n"),
    hideCancel: true, icon: "info" });
}

interface Cell {
  k: string;
  v: string;
  vSize?: string;
  tone: string;
  sub: string;
  subTone?: string;
  data?: number[] | null;
  color?: string;
  skeleton?: boolean; // 只属占位格:健康格有活数据,刷新期间保持旧值(stale-while-revalidate),不糊骨架
  tap?: () => void;
  subTap?: () => void;
}

function activate(action?: () => void) {
  action?.();
}

function placeholderCell(label: string, retry?: () => void, skeleton = showSkeleton.value): Cell {
  return {
    k: label,
    v: "-",
    vSize: "12.5px",
    tone: "var(--v5-ink-3)",
    sub: t.value.home.networkStatRetry,
    subTone: "var(--v5-tech-cyan-ink)",
    data: null,
    skeleton,
    tap: retry ?? (() => { void cfg.load(); }),
  };
}

const metrics = computed<Cell[]>(() => {
  const failed = cfg.syncFailed;
  const pulse = failed ? null : cfg.config.networkPulse;
  // H9 supplies the published counts and the server supplies the device estimate.
  const displayCell = (label: string, value: number | null | undefined, color: string): Cell =>
    value === null || value === undefined || !Number.isSafeInteger(value) || value < 0
      ? placeholderCell(label)
      : { k: label, v: compact(value), tone: "var(--v5-ink)", sub: "", data: null, color };
  const memberValue = props.compactView && props.estimated ? props.registeredDisplay : pulse?.registeredUsers;
  const members = displayCell(t.value.home.networkMembers, memberValue, "var(--v5-brand)");
  const devices = displayCell(t.value.home.networkDevices, pulse?.onlineDevices, "var(--v5-tech-cyan-ink)");

  const r = rank.value;
  const retainedRank = remoteRank.status === "error" && remoteRank.snapshot !== null;
  const rankCell: Cell = {
    k: t.value.home.networkYourRank,
    v: r.kind === "ranked" ? `#${compact(r.rank)}`
      : r.kind === "unranked" ? t.value.home.networkRankUnranked : "-",
    vSize: r.kind === "ranked" ? "20px" : "12px",
    tone: r.kind === "ranked" ? "var(--v5-brand)" : "var(--v5-ink-3)",
    sub: retainedRank ? t.value.home.networkStale
      : r.kind === "unavailable" ? t.value.home.networkStatRetry : t.value.home.networkRankExplanation,
    subTone: "var(--v5-tech-cyan-ink)",
    skeleton: remoteApiEnabled && remoteRank.status === "loading" && remoteRank.snapshot === null,
    tap: explainRank,
    subTap: r.kind === "unavailable" || retainedRank ? () => { void remoteRank.refresh(); } : undefined,
  };

  return [members, devices, rankCell];
});


</script>
<style scoped>
.network-compact {position:relative;overflow:hidden;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding:16px 0;border-radius:22px;border:1px solid var(--v5-border);background:var(--v5-surface);}
.network-compact::before {content:'';position:absolute;inset:0;background-image:radial-gradient(color-mix(in srgb,var(--v5-brand) 10%,transparent) 1px,transparent 1.2px);background-size:10px 10px;mask-image:radial-gradient(80% 120% at 70% 50%,#000,transparent 75%);pointer-events:none;}
.network-compact__cell {position:relative;min-width:0;padding:0 14px;border-left:1px solid var(--v5-border);}
.network-compact__cell:first-child {border:0;padding-left:16px;}
.network-compact__label,.network-compact__retry {display:block;font:400 12.5px/18px var(--font-v5);color:var(--v5-ink-3);}
.network-compact__label {min-height:36px;}
.network-compact__value {display:block;margin-top:4px;font:600 18px/24px var(--font-v5);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;}
.network-compact__retry {font-size:11px;}
</style>
