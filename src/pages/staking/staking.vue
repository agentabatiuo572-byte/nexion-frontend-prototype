<!--
  Staking Vault — 4-tier APY lock pool (ported from
  Nexion-prototype/app/(main)/staking/page.tsx).

  tech-money-card hero (aurora + grid + big $ + delta + 2-col) → vault picker
  (4 rows, sheet on tap) → CompoundCalculator → my positions → variable-APY
  notice. Wrapped in <AppChassis active="me"> (reached from /me/wallet). The
  source's chassis-level StakingSheetHost is folded into <StakeSheet
  v-model:open :term>. claim / early-withdraw compose staking + postMoneyBill
  (入账 ⊗ 记账,见 lib/money-receipt.ts) in the page handlers.
-->
<template>
  <AppChassis active="me">
    <CardStagger style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/wallet" />
      <!-- 开发诊断,不是产品文案:所以① 只在 DEV 构建渲染 ② 文案是裸英文字面量,不进三语词典 ——
           进了词典它就成了「工程名词写死在用户文案契约里」,而且词典对象摇不掉、会原样进生产包。
           ③ 与下面的 remoteError 分支解耦成独立 v-if:挂在同一条 v-else-if 链上时,这道闸一旦为假
           就会把 remoteError 分支放出来,是个只等某天 mock 下写了 remoteError 就会炸的暗雷。
           i18n-en-ok: 工程话诊断横幅,仅 DEV + mock 档渲染 -->
      <text v-if="isDevBuild && staking.isMockMode" class="block" style="margin: 0 16px; font-size: 12px; color: var(--v5-warning)">Dev build · mock data</text>
      <text v-if="staking.remoteError" class="block" style="margin: 0 16px; font-size: 12px; color: var(--v5-danger)">{{ t.staking.remoteUnavailableClosed }}</text>

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <!-- Hero — de-carded: total-locked sits on the page floor; aurora + grid
             floor decoration deleted outright (owner call 2026-07-08). Rules-intro
             pill rides the meta-row (owner 2026-07-09: kill the empty gap above). -->
        <view :style="heroStyle">
          <view>
            <!-- meta-row — rules-intro pill joins the earning chip on the right
                 (owner 2026-07-09: kill the empty gap above the hero). -->
            <view class="flex items-center justify-between" style="margin-bottom: 8px">
              <text :style="metaLabelStyle">{{ t.stakingV3.totalLocked }}</text>
              <view class="flex items-center" style="gap: 8px">
                <text v-if="activePositions.length > 0" :style="earningChipStyle">{{ t.stakingV3.earningChip }}</text>
                <view class="inline-flex items-center shrink-0 active:opacity-80" :style="howPillStyle" @click="goHowItWorks">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                  <text style="margin: 0 6px">{{ t.stakingV3.howItWorksEntry }}</text>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                </view>
              </view>
            </view>

            <!-- big -->
            <view class="flex items-baseline" style="gap: 8px">
              <text class="tabular-nums" :style="bigDollarStyle">$</text>
              <text class="tabular-nums" :style="bigNumStyle">{{ totalLockedText }}</text>
            </view>

            <!-- delta -->
            <view class="tabular-nums" :style="deltaStyle">
              <text>{{ fmt(t.stakingV3.todayAccrued, { amount: `+$${todayAccruedText}` }) }}</text>
              <text style="color: var(--v5-ink-4)"> · {{ fmt(t.stakingV3.activeCount, { n: activePositions.length }) }}</text>
              <text v-if="maturedCount > 0" style="color: var(--v5-ink-4)"> · </text>
              <text v-if="maturedCount > 0" style="color: var(--v5-brand-2); font-weight: 500">{{ fmt(t.stakingV3.maturedCount, { n: maturedCount }) }}</text>
            </view>

            <!-- 2-col -->
            <view class="grid grid-cols-2" :style="belowGridStyle">
              <view>
                <text class="block" :style="statKStyle">{{ t.stakingV3.accrued }}</text>
                <text class="block tabular-nums" :style="statVStyle('var(--v5-success)')">${{ totalAccruedText }}</text>
              </view>
              <view>
                <text class="block" :style="statKStyle">{{ t.stakingV3.avgApy }}</text>
                <text class="block tabular-nums" :style="statVStyle(totalLocked > 0 ? 'var(--v5-success)' : 'var(--v5-ink-3)')">{{ avgApyText }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Section: vault picker -->
        <view class="flex items-center" :style="secHeaderStyle">
          <text :style="secTitleStyle">{{ t.stakingV3.stakePlans }}</text>
        </view>
        <view :style="vaultCardStyle">
          <VaultRow
            v-for="(term, i) in TERMS"
            :key="term"
            :term="term"
            :apy="staking.pools.find((pool) => pool.termDays === term)?.apy ?? (staking.isMockMode ? STAKING_APY[term] : 0)"
            :penalty="staking.pools.find((pool) => pool.termDays === term)?.penalty ?? (staking.isMockMode ? STAKING_PENALTY[term] : 0)"
            :min="staking.pools.find((pool) => pool.termDays === term)?.minAmountUsdt ?? (staking.isMockMode ? STAKING_MIN[term] : 0)"
            :blurb="t.stakingV3.blurb[term]"
            :penalty-suffix="t.stakingV3.penaltySuffix"
            :ribbon="RIBBONS[term]"
            :is-last="i === TERMS.length - 1"
            @open="openSheet(term)"
          />
        </view>

        <!-- CompoundCalculator -->
        <CompoundCalculator />

        <!-- My positions -->
        <view class="flex items-center" :style="secHeaderStyle">
          <text :style="secTitleStyle">{{ t.stakingV3.positions }}<text :style="countStyle">{{ positions.length }}</text></text>
        </view>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <!-- 《06》no-owned-asset:无持仓是转化型空态。不给 CTA —— 方案列表就在这块的正上方,
               再放一个按钮等于让用户往回点,反而多余;文案直接指路。 -->
          <EmptyState v-if="positions.length === 0" kind="no-owned-asset" :title="t.empty.stakingTitle" :desc="t.empty.stakingDesc" compact />
          <StakePositionRow
            v-for="p in positions"
            v-else
            :key="p.id"
            :p="p"
            :now="nowTs"
            @claim="handleClaim(p)"
            @early-withdraw="handleEarlyWithdraw(p)"
          />
        </view>

        <!-- Variable-APY notice -->
        <text class="block" :style="noticeStyle">⚠️ {{ t.stakingV3.apyVariableNotice }}</text>
      </view>
    </CardStagger>

    <!-- Sheet (folds StakingSheetHost) -->
    <StakeSheet v-model:open="sheetOpen" :term="sheetTerm" />
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import CardStagger from "@/components/card-stagger.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VaultRow from "@/components/staking/vault-row.vue";
import StakePositionRow from "@/components/staking/position-row.vue";
import CompoundCalculator from "@/components/staking/compound-calculator.vue";
import StakeSheet from "@/components/staking/stake-sheet.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { postMoneyBill, reportStuckFunds } from "@/lib/money-receipt";
import { useApp } from "@/store/app";
import {
  useStaking,
  STAKING_APY,
  STAKING_PENALTY,
  STAKING_MIN,
  type StakingTerm,
  type StakingPosition,
} from "@/store/staking";
import { confirm as uiConfirm, toast } from "@/store/ui";

const ONE_DAY_MS = 86400 * 1000;
const TERMS: StakingTerm[] = [30, 90, 180, 365];
const t = useT();
// Vite 在生产构建里把 import.meta.env.DEV 直接换成 false,整个横幅连同它的文案一起被摇掉。
const isDevBuild = import.meta.env.DEV;
const RIBBONS = computed<Partial<Record<StakingTerm, { label: string; tone: "cyan" | "gold" }>>>(() => ({
  180: { label: t.value.stakingV3.ribbon.popular, tone: "cyan" },
  365: { label: t.value.stakingV3.ribbon.topYield, tone: "gold" },
}));
const staking = useStaking();
const app = useApp(); // 仅用于 reportStuckFunds 取当前资金快照(入待对账队列)

const sheetOpen = ref(false);
const sheetTerm = ref<StakingTerm | null>(null);
const pendingRemoteMutations = ref(new Set<string>());
const remoteMutationKeys = new Map<string, string>();

function intentKey(kind: "claim" | "early", positionNo: string) {
  const intent = `${kind}:${positionNo}`;
  const existing = remoteMutationKeys.get(intent);
  if (existing) return { intent, key: existing };
  const key = `G1-${kind.toUpperCase()}-${positionNo}-${Date.now().toString(36)}`;
  remoteMutationKeys.set(intent, key);
  return { intent, key };
}

async function runRemoteMutation(kind: "claim" | "early", positionNo: string) {
  const { intent, key } = intentKey(kind, positionNo);
  if (pendingRemoteMutations.value.has(intent)) return false;
  pendingRemoteMutations.value = new Set([...pendingRemoteMutations.value, intent]);
  try {
    if (kind === "claim") await staking.claimRemote(positionNo, key);
    else await staking.earlyWithdrawRemote(positionNo, key);
    remoteMutationKeys.delete(intent);
    return true;
  } catch {
    // The request may have reached the service even when its response is unknown.
    await staking.syncRemote();
    return false;
  } finally {
    const next = new Set(pendingRemoteMutations.value);
    next.delete(intent);
    pendingRemoteMutations.value = next;
  }
}

// Tick every 4s: re-mature positions + refresh accrual/progress.
const nowTs = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  if (!staking.isMockMode) {
    // syncRemote 自吞不 reject(resilience 门);失败信号走返回值。
    void staking.syncRemote().then((ok) => { if (!ok) toast.error(t.value.stakingV3.toast.staleTitle); });
    timer = setInterval(() => { void staking.syncRemote(); }, 4000);
    return;
  }
  staking.markMatured();
  timer = setInterval(() => {
    staking.markMatured();
    nowTs.value = Date.now();
  }, 4000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const positions = computed(() => staking.positions);
const activePositions = computed(() => positions.value.filter((p) => p.status === "active"));
const maturedCount = computed(() => positions.value.filter((p) => p.status === "matured").length);
const totalLocked = computed(() => activePositions.value.reduce((s, p) => s + p.amountUSDT, 0));

const totalAccrued = computed(() => {
  void nowTs.value;
  const now = Date.now();
  return positions.value
    .filter((p) => p.status === "active" || p.status === "matured")
    .reduce((s, p) => {
      const elapsed = Math.min(now, p.unlockTs) - p.startTs;
      const yrs = elapsed / (365 * ONE_DAY_MS);
      return s + p.amountUSDT * p.apy * yrs;
    }, 0);
});
const todayAccrued = computed(() => staking.todayAccruedUSDT());
const avgAPY = computed(() => {
  if (totalLocked.value === 0) return 0;
  const w = activePositions.value.reduce((s, p) => s + p.amountUSDT * p.apy, 0);
  return w / totalLocked.value;
});

const totalLockedText = computed(() => totalLocked.value.toFixed(2));
const todayAccruedText = computed(() => todayAccrued.value.toFixed(2));
const totalAccruedText = computed(() => totalAccrued.value.toFixed(2));
const avgApyText = computed(() => (totalLocked.value > 0 ? `${(avgAPY.value * 100).toFixed(1)}%` : "—"));

function openSheet(term: StakingTerm) {
  sheetTerm.value = term;
  sheetOpen.value = true;
}
function goHowItWorks() {
  uni.navigateTo({ url: "/pages/staking/how-it-works", fail: () => {} });
}

/**
 * 平仓 / 领取这一跳就是真后端的 `POST /api/staking/:id/{claim|early-withdraw}`
 * (**路径**出处 PRD §9.11e —— 先前这里把资源名写成复数形式,正是
 *  endpoint-citation-sentinel 当初为之而建的笔误族。⚠️ 说明笔误时也**不要**把错误路径
 *  原样写进注释:这道门扫的就是注释,写进来照样报红,而且它是对的)。
 *
 * ⚠️ 这两个 endpoint **是否受地区策略保护,PRD 没有明说**(2026-08-07 第四轮验收 F2 纠正):
 * §9.11e 讲的是跨 store 变更的事务边界,通篇不提 geo;§9.11d.1 定义地区机制时点名的是
 * 「Genesis marketplace 等」,既没点名包含也没点名排除本组路由。所以下面这道翻译是
 * **先放好的位**,不是「PRD 已确认要保护」。别把「路径有出处」读成「地区归属有出处」——
 * 上一轮我们正是用同一把尺子否掉了活动页那句无出处的「不受地区约束」。
 * 被地区策略拒时它是唯一失败的一步 —— 此刻仓位没动、钱也没动,所以第二行给「余额没变动」。
 *
 * 🔴 判**返回值**不判异常(2026-08-07 审计 P1-1 纠正):本仓 staking store 的
 * stake / earlyWithdraw / claim / commit **全部**用 `{ ok, conflict }` 报失败,
 * 一次 throw 都没有;同文件头注也把生产形态写成「一次服务端事务返回 canonical 值」。
 * 原先写成 try/catch 是押「后端会抛异常」—— 与仓内既定惯例相反,真接上大概率永远命中不到,
 * 而团队会误以为它和其余 12 个点一样接好了。
 * **返回 null = 不是地区拒绝**,调用方原样走既有失败分支。
 */
function geoRefusalText(reason: unknown): string | null {
  return geoPolicyUserMessage(reason, t.value.geoPolicy);
}

/**
 * 失败兜底:store 返回 `{ok:false, conflict:false}` 时(前置条件不满足 / 本地存储写不进去,
 * 地区拒绝将来也大概率落这一档)原先**什么都不显示** —— 违反「禁静默无反馈」。
 * 地区拒绝优先翻译,其余给通用失败提示。
 */
function reportStakingFailure(reason: unknown, fallbackTitle: string) {
  const geo = geoRefusalText(reason);
  if (geo) {
    toast.error(geo, t.value.geoPolicy.fundsSafeNote);
    return;
  }
  toast.error(fallbackTitle);
}

async function handleEarlyWithdraw(p: StakingPosition) {
  const penaltyRate = STAKING_PENALTY[p.termDays];
  const penalty = (p.amountUSDT * penaltyRate).toFixed(2);
  const refund = (p.amountUSDT * (1 - penaltyRate)).toFixed(2);
  const ok = await uiConfirm({
    title: t.value.stakingV3.toast.earlyConfirmTitle,
    message: fmt(t.value.stakingV3.toast.earlyConfirmMessage, {
      penaltyPct: (penaltyRate * 100).toFixed(0),
      penalty,
      refund,
    }),
    danger: true,
    confirmLabel: t.value.stakingV3.toast.earlyConfirmCta,
  });
  if (!ok) return;
  if (!staking.isMockMode) {
    if (await runRemoteMutation("early", p.id)) {
      toast.warn(t.value.stakingV3.toast.earlyDoneTitle);
    } else {
      reportStakingFailure(null, t.value.stakingV3.toast.staleTitle);
    }
    return;
  }
  // ⚠️ MOCK-ONLY CROSS-STORE MUTATION:平仓(CAS)→ 入账⊗记账(原子)。
  // 🔴 顺序不可换:先入账后平仓的话,平仓撞并发冲突就成了「钱拿到、仓还在」= 可重复领。
  //    代价是这条极窄的失败路径(仓已平、退款落盘失败)靠收口点的失败提示交底 ——
  //    store 侧没有反向 API 可冲正,真后端由同事务解决。
  const r = staking.earlyWithdraw(p.id);
  if (r.ok) {
    // 🔴 "failed" 与 "stuck" 要分开处置(2026-08-04 对抗审计 B-P1-6):
    // "stuck" 时收口点自己已经入队 + 给了交易号;"failed" 时资金被干净还原、账上无记录,
    // 收口点弹的是「余额没有变化」—— 可这条路径上**仓位确实已经没了**,那句话对用户是假的。
    // store 侧没有反向 API 能把仓位还回去(顺序理由见上),所以这里补一次入队:
    // 让这笔「仓已平、钱没到」拿到交易号进待对账,而不是只留一句自相矛盾的提示。
    const out = postMoneyBill({
      type: "unstake",
      symbol: "USDT",
      amount: r.refund,
      status: "posted",
      memo: `Stake early withdraw · ${p.id} (penalty $${r.penalty.toFixed(2)})`,
      ref: `STAKE-EW-${p.id}`,
    }, { silentFailure: true });
    if (out === "failed") reportStuckFunds(app.captureMoney(), `STAKE-EW-${p.id}`);
    if (out !== "ok") return;
    toast.warn(
      t.value.stakingV3.toast.earlyDoneTitle,
      fmt(t.value.stakingV3.toast.earlyDoneSubtitle, {
        refund: r.refund.toFixed(2),
        penalty: r.penalty.toFixed(2),
      }),
    );
  } else if (r.conflict) {
    // 这笔在别处(另一标签页 / 另一端)已经动过,store 已把最新状态刷回来 —— 说清楚,
    // 不能让用户点了没反应。
    toast.warn(t.value.stakingV3.toast.staleTitle, t.value.stakingV3.toast.staleSubtitle);
  } else {
    // 🔴 2026-08-07 审计 P1-1:原先没有这个 else —— conflict=false 时页面**完全静默**,
    // 不是显示错文案,是什么都不显示。地区拒绝将来也大概率落这一档。
    reportStakingFailure(r, t.value.stakingV3.toast.staleTitle);
  }
}

async function handleClaim(p: StakingPosition) {
  if (!staking.isMockMode) {
    if (await runRemoteMutation("claim", p.id)) {
      toast.success(t.value.stakingV3.toast.claimedTitle);
    } else {
      reportStakingFailure(null, t.value.stakingV3.toast.staleTitle);
    }
    return;
  }
  // ⚠️ MOCK-ONLY CROSS-STORE MUTATION:领取(CAS)→ 入账⊗记账(原子,顺序理由同上)。
  const r = staking.claim(p.id);
  if (r.ok) {
    // 🔴 "failed" 与 "stuck" 要分开处置(2026-08-04 对抗审计 B-P1-6):
    // "stuck" 时收口点自己已经入队 + 给了交易号;"failed" 时资金被干净还原、账上无记录,
    // 收口点弹的是「余额没有变化」—— 可这条路径上**仓位确实已经没了**,那句话对用户是假的。
    // store 侧没有反向 API 能把仓位还回去(顺序理由见上),所以这里补一次入队:
    // 让这笔「仓已领、钱没到」拿到交易号进待对账,而不是只留一句自相矛盾的提示。
    const out = postMoneyBill({
      type: "unstake",
      symbol: "USDT",
      amount: r.principal + r.interest,
      status: "posted",
      memo: `Stake claim · ${p.id} (interest $${r.interest.toFixed(2)})`,
      ref: `STAKE-CLAIM-${p.id}`,
    }, { silentFailure: true });
    if (out === "failed") reportStuckFunds(app.captureMoney(), `STAKE-CLAIM-${p.id}`);
    if (out !== "ok") return;
    toast.success(
      t.value.stakingV3.toast.claimedTitle,
      fmt(t.value.stakingV3.toast.claimedSubtitle, {
        total: (r.principal + r.interest).toFixed(2),
        interest: r.interest.toFixed(2),
      }),
    );
  } else if (r.conflict) {
    toast.warn(t.value.stakingV3.toast.staleTitle, t.value.stakingV3.toast.staleSubtitle);
  } else {
    // 🔴 2026-08-07 审计 P1-1:原先没有这个 else —— conflict=false 时页面**完全静默**,
    // 不是显示错文案,是什么都不显示。地区拒绝将来也大概率落这一档。
    reportStakingFailure(r, t.value.stakingV3.toast.staleTitle);
  }
}

// ── styles ──
const howPillStyle: CSSProperties = {
  height: "44px",  // 《07》tap≥44(原 34)
  padding: "0 12px",
  borderRadius: "999px",
  background: "var(--v5-brand-soft)",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand)",
  letterSpacing: "-0.005em",
  whiteSpace: "nowrap",
};
// De-carded hero — total-locked sits directly on the page floor (2px optical
// inset); surface/border/shadow + aurora/grid glows deleted, not re-tuned.
const heroStyle: CSSProperties = {
  padding: "0 2px",
};
const metaLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  letterSpacing: "0.02em",
};
const earningChipStyle: CSSProperties = {
  padding: "2px 8px",
  borderRadius: "999px",
  background: "var(--v5-tech-cyan-soft)",
  color: "var(--v5-tech-cyan)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
};
const bigDollarStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
};
const bigNumStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "56px",
  fontWeight: 600,
  letterSpacing: "-0.034em",
  lineHeight: 1,
  color: "var(--v5-ink)",
  whiteSpace: "nowrap",
};
const deltaStyle: CSSProperties = {
  marginTop: "6px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-success)",
};
const belowGridStyle: CSSProperties = {
  // 去线(主人 2026-08-17 全站令):总间距沿用有线时代的 10+14。
  marginTop: "24px",
  gap: "14px",
};
const statKStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
function statVStyle(tint: string): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontWeight: 500,
    fontSize: "20px",
    letterSpacing: "-0.014em",
    color: tint,
    marginTop: "3px",
  };
}
const secHeaderStyle: CSSProperties = { margin: "10px 2px 0" };
const secTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const countStyle: CSSProperties = {
  marginLeft: "6px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
};
// Form-b: single filled container, no border — VaultRow supplies internal hairlines.
const vaultCardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "16px",
  padding: "0 16px",
};
// Empty state — dashed outline, no fill (de-card empty-state idiom).
const emptyStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px dashed var(--v5-border-strong)",
  padding: "24px 16px",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
};
const noticeStyle: CSSProperties = {
  marginTop: "2px",
  padding: "12px",
  background: "var(--v5-warning-soft)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.45,
};
</script>
