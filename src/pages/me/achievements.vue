<!--
  Achievements (ported from Nexion-prototype/app/(main)/me/achievements/page.tsx).
  Progress hero + categorized list with unlock state, reward + claim button.
  Unlock conditions auto-evaluate on mount against live app store. Cross-store
  claim orchestration 走 postMoneyBills 收口点(资金与账单同生共死),仍在 handler 里。
  Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" />

      <!-- Progress hero -->
      <view class="mx-4" :style="heroStyle">
        <view class="flex items-center" style="gap: 12px">
          <view class="grid place-items-center" :style="heroIconBoxStyle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" /><circle cx="12" cy="8" r="6" /></svg>
          </view>
          <view style="flex: 1">
            <text class="block" :style="heroLabelStyle">{{ w.progress }}</text>
            <view class="flex items-baseline" style="gap: 4px">
              <text :style="heroCountStyle">{{ unlocked }}</text>
              <text :style="heroTotalStyle">/ {{ total }}</text>
            </view>
          </view>
          <text :style="heroPctStyle">{{ percent }}%</text>
        </view>
        <view :style="barTrackStyle">
          <view :style="barFillStyle" />
        </view>
      </view>

      <!-- Real-backend milestones. Remote mode never derives rewards from mock stores. -->
      <view v-if="remoteApiEnabled" style="margin-top: 20px; display: flex; flex-direction: column; gap: 24px">
        <view v-if="remoteLoading && !remoteSnapshot" class="mx-4" :style="listStyle">
          <text class="block" style="padding: 18px; font-size: 13px; color: var(--v5-ink-3)">{{ w.remoteLoading }}</text>
        </view>
        <view v-else-if="remoteError && !remoteSnapshot" class="mx-4" :style="listStyle">
          <text class="block" style="padding: 18px 18px 6px; font-size: 13px; color: var(--v5-ink-3)">{{ w.remoteUnavailable }}</text>
          <view class="active:opacity-80" :style="retryBtnStyle" role="button" tabindex="0" :aria-label="w.retry" @click="refreshRemote">
            <text>{{ w.retry }}</text>
          </view>
        </view>
        <template v-else>
          <view v-for="grp in remoteGroups" :key="grp.key" class="mx-4">
            <text class="block" :style="catHeadStyle">{{ grp.label }}</text>
            <view :style="listStyle">
              <view
                v-for="(row, i) in grp.rows"
                :key="row.key"
                class="flex items-center"
                :style="rowStyle(i !== 0)"
              >
                <view class="grid place-items-center shrink-0" :style="remoteIconBoxStyle(row.status)">
                  <view v-html="iconSvg(row.iconId, row.status === 'LOCKED' ? 'var(--v5-ink-4)' : 'var(--v5-brand)')" />
                </view>
                <view class="min-w-0" style="flex: 1">
                  <text class="block" :style="aLabelStyle(row.status !== 'LOCKED')">{{ row.label }}</text>
                  <text class="block" :style="aDescStyle(row.status !== 'LOCKED')">{{ row.description }}</text>
                </view>
                <view class="text-right shrink-0">
                  <text class="block" :style="rewardStyle(row.status !== 'LOCKED')">{{ row.reward }}</text>
                  <view
                    v-if="row.status === 'CLAIMABLE'"
                    class="active:opacity-80"
                    :style="claimBtnStyle(false)"
                    role="button"
                    tabindex="0"
                    :aria-disabled="remoteBusy ? 'true' : 'false'"
                    :aria-label="w.claim"
                    @click="claimRemote(row)"
                  >
                    <text>{{ remoteBusy === row.key ? w.claiming : w.claim }}</text>
                  </view>
                  <text v-else class="block" style="margin-top: 6px; font-size: 12px; color: var(--v5-ink-4)">
                    {{ row.status === 'LOCKED' ? w.lockedStatus : w.claimed }}
                  </text>
                </view>
              </view>
            </view>
          </view>
        </template>
      </view>

      <!-- Local prototype achievements stay available only in mock mode. -->
      <view v-else style="margin-top: 20px; display: flex; flex-direction: column; gap: 24px">
        <view v-for="grp in groups" :key="grp.cat" class="mx-4">
          <text class="block" :style="catHeadStyle">{{ catLabel(grp.cat) }}</text>
          <view :style="listStyle">
            <view
              v-for="(a, i) in grp.list"
              :key="a.id"
              class="flex items-center"
              :style="rowStyle(i !== 0)"
            >
              <view class="grid place-items-center shrink-0" :style="iconBoxStyle(a, grp.cat)">
                <view v-html="iconSvg(a.id, isUnlocked(a.id) ? catColor(grp.cat) : 'var(--v5-ink-4)')" />
              </view>
              <view class="min-w-0" style="flex: 1">
                <view class="flex items-center" style="gap: 6px">
                  <text :style="aLabelStyle(isUnlocked(a.id))">{{ label(a) }}</text>
                  <svg v-if="!isUnlocked(a.id)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </view>
                <text class="block" :style="aDescStyle(isUnlocked(a.id))">{{ desc(a) }}</text>
                <text v-if="isUnlocked(a.id)" class="block" :style="aWhenStyle">{{ w.unlockedAt }} · {{ relativeWhen(recOf(a.id)!.unlockedAt) }}</text>
              </view>
              <view class="text-right shrink-0">
                <text class="block" :style="rewardStyle(isUnlocked(a.id))">{{ rewardLabel(a) }}</text>
                <view
                  v-if="isUnlocked(a.id)"
                  class="active:opacity-80 transition-opacity"
                  :style="claimBtnStyle(isClaimed(a.id))"
                  @click="handleClaim(a.id)"
                >
                  <view v-if="isClaimed(a.id)" class="flex items-center" style="gap: 4px">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    <text>{{ w.claimed }}</text>
                  </view>
                  <text v-else>{{ w.claim }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { toast } from "@/store/ui";
import { useApp } from "@/store/app";
import { postMoneyBillsOnce, type ReceiptDraft } from "@/lib/money-receipt";
import { useAchievements } from "@/store/achievements";
import { isPurchasedHardwareKind } from "@/store/device-types";
import { ACHIEVEMENTS, type AchievementCategory, type AchievementDef } from "@/mock/achievements";
import { pointsApi, remoteApiEnabled } from "@/api/runtime";
import type { DailySnapshot, DailyMilestoneStatus, EarningMilestoneStatus } from "@/api/points-api";

const t = useT();
const w = computed(() => t.value.achievements);
const app = useApp();
const ach = useAchievements();
const remoteSnapshot = ref<DailySnapshot | null>(null);
const remoteLoading = ref(false);
const remoteError = ref(false);
const remoteBusy = ref("");

type RemoteStatus = DailyMilestoneStatus | EarningMilestoneStatus;
interface RemoteMilestoneRow {
  key: string;
  kind: "daily" | "earning";
  id: number | string;
  label: string;
  description: string;
  reward: string;
  status: RemoteStatus;
  iconId: string;
}

const CAT_COLOR: Record<AchievementCategory, string> = {
  firsts: "var(--v5-brand)",
  earnings: "var(--v5-warning)",
  social: "var(--v5-tech-cyan)",
  loyalty: "var(--v5-success)",
  hardware: "var(--v5-brand-2)",
};

const ICON_SVG: Record<string, string> = {
  first_contribution: `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />`,
  first_dollar: `<line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />`,
  power_user: `<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />`,
  social_star: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
  hardware_owner: `<path d="M3.5 8 12 12l8.5-4M12 12v9.5" /><path d="m7.5 4.27 9 5.15" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />`,
  diamond_miner: `<path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" />`,
};
function iconSvg(id: string, color: string): string {
  const inner = ICON_SVG[id] ?? `<circle cx="12" cy="12" r="9" />`;
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// Auto-evaluate unlock conditions (mirrors source useMemo on mount).
function evaluate() {
  const onlineDevices = app.visibleDevices.filter((d) => isPurchasedHardwareKind(d.kind)).length;
  const earningsTotal = app.earnings.total;
  if (onlineDevices > 0) ach.unlock("hardware_owner");
  if (earningsTotal >= 1) ach.unlock("first_dollar");
  if (earningsTotal >= 1000) ach.unlock("diamond_miner");
  if (earningsTotal > 0) ach.unlock("first_contribution");
}
async function refreshRemote() {
  if (!remoteApiEnabled || remoteLoading.value) return;
  remoteLoading.value = true;
  remoteError.value = false;
  try {
    remoteSnapshot.value = await pointsApi.state();
  } catch {
    remoteError.value = true;
    if (remoteSnapshot.value) toast.warn(w.value.remoteUnavailable);
  } finally {
    remoteLoading.value = false;
  }
}

onShow(() => {
  if (remoteApiEnabled) void refreshRemote();
  else evaluate();
});

const remoteGroups = computed(() => {
  const snapshot = remoteSnapshot.value;
  if (!snapshot) return [];
  const daily: RemoteMilestoneRow[] = snapshot.dailyMilestones.map((row) => ({
    key: `daily:${row.milestoneId}`,
    kind: "daily",
    id: row.milestoneId,
    label: `${w.value.dailyMilestone} ${row.milestoneDay}`,
    description: `${w.value.streakProgress}: ${snapshot.streak.currentStreak}/${row.milestoneDay}`,
    reward: `+${row.rewardAmount} ${row.rewardType}`,
    status: row.status,
    iconId: "power_user",
  }));
  const earnings: RemoteMilestoneRow[] = snapshot.earningMilestones.map((row) => ({
    key: `earning:${row.milestoneId}`,
    kind: "earning",
    id: row.milestoneId,
    label: `${w.value.earningMilestone} $${row.thresholdUsdt.toLocaleString()}`,
    description: `${w.value.lifetimeEarnings}: $${row.lifetimeEarningsUsdt.toLocaleString()}`,
    reward: `+${row.rewardNex} NEX`,
    status: row.status,
    iconId: "first_dollar",
  }));
  return [
    { key: "daily", label: w.value.serverDailyMilestones, rows: daily },
    { key: "earning", label: w.value.serverEarningMilestones, rows: earnings },
  ].filter((group) => group.rows.length > 0);
});

const groups = computed(() => {
  const cats: AchievementCategory[] = ["firsts", "earnings", "social", "loyalty", "hardware"];
  return cats
    .map((cat) => ({ cat, list: ACHIEVEMENTS.filter((a) => a.category === cat) }))
    .filter((g) => g.list.length > 0);
});

const unlocked = computed(() => remoteApiEnabled
  ? remoteGroups.value.flatMap((group) => group.rows).filter((row) => row.status === "CLAIMED" || row.status === "FIRED").length
  : ach.records.length);
const total = computed(() => remoteApiEnabled
  ? remoteGroups.value.reduce((sum, group) => sum + group.rows.length, 0)
  : ACHIEVEMENTS.length);
const percent = computed(() => total.value > 0 ? Math.round((unlocked.value / total.value) * 100) : 0);

async function claimRemote(row: RemoteMilestoneRow) {
  if (!remoteApiEnabled || row.status !== "CLAIMABLE" || remoteBusy.value) return;
  remoteBusy.value = row.key;
  try {
    if (row.kind === "daily") {
      await pointsApi.claimMilestone(Number(row.id), `h5-achievement-daily:${row.id}`);
    } else {
      await pointsApi.evaluateEarningMilestones(`h5-achievement-earning:${row.id}`);
    }
    remoteSnapshot.value = await pointsApi.state();
    toast.success(w.value.claimToast);
  } catch {
    toast.error(w.value.remoteUnavailable);
  } finally {
    remoteBusy.value = "";
  }
}

function recOf(id: string) {
  return ach.records.find((r) => r.id === id) ?? null;
}
function isUnlocked(id: string): boolean {
  return !!recOf(id);
}
function isClaimed(id: string): boolean {
  return !!recOf(id)?.claimed;
}
function catColor(c: AchievementCategory): string {
  return CAT_COLOR[c];
}
function catLabel(c: AchievementCategory): string {
  switch (c) {
    case "firsts":
      return w.value.catFirsts;
    case "earnings":
      return w.value.catEarnings;
    case "social":
      return w.value.catSocial;
    case "loyalty":
      return w.value.catLoyalty;
    case "hardware":
      return w.value.catHardware;
  }
}
function label(a: AchievementDef): string {
  return (w.value as unknown as Record<string, string>)[`a_${a.i18nKey}`] ?? a.id;
}
function desc(a: AchievementDef): string {
  return (w.value as unknown as Record<string, string>)[`a_${a.i18nKey}_d`] ?? "";
}
function rewardLabel(a: AchievementDef): string {
  if (a.rewardNex) return `+${a.rewardNex} NEX`;
  if (a.rewardUsdt) return `+$${a.rewardUsdt}`;
  return "VIP badge";
}
function relativeWhen(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return w.value.unlockedJustNow;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function handleClaim(id: string) {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return;
  // 🔴 前置门必须与消费门 `claim()` **等强**:后者的守卫是「记录存在(=已解锁)**且**未领」,
  // 只查 `isClaimed` 会漏掉前一半 —— 先发钱后消费的顺序下,未解锁的成就会**先把奖发出去**
  // 再被 claim() 拒。当前不可达(按钮只在 isUnlocked 时渲染),但「前置门弱于消费门」
  // 正是这类事故的定义:渲染层的拦截不是判定层的拦截(卡轨双击那条同一形状)。
  if (!ach.isUnlocked(id) || ach.isClaimed(id)) return;
  const name = label(def);
  // 同一次领取的两腿一次落盘 —— 发了 NEX 没发 $ 是半边账,收据即指令(不再单独 credit*)。
  // 🔴 顺序 = 先发钱(幂等)→ 后消费资格(2026-08-04 对抗审计 B-P1-3):原来是先 ach.claim(id)
  // 消费掉,发钱失败就 return —— 成就标记已置、奖归零且**再也领不了**(成就是一次性的)。
  // ref 本来就是成就 id(天然稳定),换成幂等出口后重放不会重复发。
  const drafts: ReceiptDraft[] = [];
  if (def.rewardNex) drafts.push({ type: "achievement", symbol: "NEX", amount: def.rewardNex, status: "posted", memo: `Achievement · ${name}`, ref: id });
  if (def.rewardUsdt) drafts.push({ type: "achievement", symbol: "USDT", amount: def.rewardUsdt, status: "posted", memo: `Achievement · ${name}`, ref: id });
  if (drafts.length && postMoneyBillsOnce(drafts) !== "ok") return;
  if (!ach.claim(id)) return; // 消费失败:钱已幂等落定,下次重试命中同一 ref 不会再发
  toast.success(w.value.claimToast);
}

// De-carded: progress stat + bar sit on the page floor (surface/border/padding
// dropped). Warning icon tint box + progress bar kept. 2px inset aligns with the
// category labels + badge lists below.
const heroStyle: CSSProperties = { padding: "0 2px" };
const heroIconBoxStyle: CSSProperties = { width: "56px", height: "56px", borderRadius: "16px", background: "color-mix(in srgb, var(--v5-warning) 15%, transparent)" };
const heroLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const heroCountStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "26px", fontWeight: 600, color: "var(--v5-ink)" };
const heroTotalStyle: CSSProperties = { fontSize: "15px", color: "var(--v5-ink-4)" };
const heroPctStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "20px", fontWeight: 600, color: "var(--v5-brand)" };
const barTrackStyle: CSSProperties = { marginTop: "12px", height: "8px", borderRadius: "999px", background: "var(--v5-surface-2)", overflow: "hidden" };
const barFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${percent.value}%`,
  background: "linear-gradient(90deg, var(--v5-warning), var(--v5-brand))",
  transition: "width 700ms ease",
}));
const catHeadStyle: CSSProperties = {
  padding: "0 2px",
  marginBottom: "12px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
};
const retryBtnStyle: CSSProperties = {
  display: "inline-flex",
  minHeight: "44px",
  alignItems: "center",
  margin: "4px 18px 14px",
  color: "var(--v5-brand)",
  fontSize: "13px",
  fontWeight: 600,
};
function remoteIconBoxStyle(status: RemoteStatus): CSSProperties {
  return {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    background: status === "LOCKED" ? "var(--v5-surface-3)" : "color-mix(in srgb, var(--v5-brand) 10%, transparent)",
    opacity: status === "LOCKED" ? 0.5 : 1,
  };
}
// Badge list keeps a filled tile identity (achievement/badge semantic, de-card
// white-list) — the single visual difference is the fill; outer border dropped.
const listStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "16px",
  overflow: "hidden",
};
function rowStyle(divider: boolean): CSSProperties {
  return {
    gap: "12px",
    padding: "12px 16px",
    borderTop: divider ? "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)" : "none",
  };
}
function iconBoxStyle(a: AchievementDef, cat: AchievementCategory): CSSProperties {
  const ul = isUnlocked(a.id);
  return {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    // 未解锁态原用 --v5-surface,与所在卡片同色 → 图标框整个隐形(双主题)。
    // 改 surface-3(同 security.vue 关闭态图标框的既有惯例);叠加下面的 opacity .5 后
    // 对卡片仍有 ΔE≈4.5,弱而可见 —— 未解锁本就该弱,但不该没有。
    background: ul ? `color-mix(in srgb, ${CAT_COLOR[cat]} 10%, transparent)` : "var(--v5-surface-3)",
    opacity: ul ? 1 : 0.5,
  };
}
function aLabelStyle(ul: boolean): CSSProperties {
  return { fontSize: "13px", fontWeight: 600, color: ul ? "color-mix(in srgb, var(--v5-ink) 95%, transparent)" : "var(--v5-ink-4)" };
}
function aDescStyle(ul: boolean): CSSProperties {
  return { fontSize: "12px", marginTop: "2px", lineHeight: 1.375, color: ul ? "var(--v5-ink-3)" : "var(--v5-ink-4)" };
}
const aWhenStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)", marginTop: "2px" };
function rewardStyle(ul: boolean): CSSProperties {
  return { fontSize: "12px", fontWeight: 500, color: ul ? "var(--v5-brand)" : "var(--v5-ink-4)" };
}
function claimBtnStyle(claimed: boolean): CSSProperties {
  return {
    marginTop: "4px",
    // mobile-first tap target — matches source h-11 (44px) px-2.5
    height: "44px",
    padding: "0 10px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    background: claimed ? "var(--v5-surface-2)" : "var(--v5-brand)",
    color: claimed ? "var(--v5-ink-4)" : "var(--v5-on-brand)",
  };
}
</script>
