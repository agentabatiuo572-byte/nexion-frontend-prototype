<!--
  Withdrawal tracking (ported from Nexion-prototype/app/(main)/me/wallet/withdraw/tracking/page.tsx).
  5-step status stepper. Reads app.latestWithdrawal; empty state when none.
  🔴 本页只展示、不推进状态(SPEC-7 + verify 哨兵守着)。到账推进由 App 层驱动
  (App.vue 的 onShow 补齐 + 定时轮询 → app.advanceWithdrawalArrival),
  判定单源在 withdrawal-arrival-core.advanceArrival;接真后端时改由服务端推送。
  四态(加载骨架 / 空 / 进行中 / 终态)见下方三个分支 + etaSub。
  Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 16px">
      <SubPageHeader :back="'/pages/me/wallet'" :title="wd ? wd.id : t.wallet.withdrawalStatusSubtitle" />
      <FundsSandboxBadge />

      <!-- Empty — no top gap; the sub-page header already provides the 24px inset. -->
      <view v-if="!wd" class="px-5 text-center">
        <text class="block" :style="emptyTextStyle">{{ deepLinkMiss ? t.wallet.withdrawalNotFound : t.wallet.noActiveWithdrawal }}</text>
        <!-- 《07》tap≥44:空状态的行动链接独占一行,不吃 WCAG 2.5.8 的 inline 豁免 → 撑热区(原 88×22) -->
        <!-- 日限用尽时置灰 + 给原因(与「再提一笔」同判据同文案)。深链 miss 让本空态在
             「有单据+额度已满」时也可达,不加这道就是外观可点、点了没反应的死链接(审计双镜头 P1)。 -->
        <view :class="againDisabled ? '' : 'active:opacity-70'" :style="againDisabled ? 'opacity:0.4' : ''" style="display: inline-flex; align-items: center; min-height: 44px; padding: 0 8px; margin-top: 4px" role="button" tabindex="0" :aria-disabled="againDisabled ? 'true' : 'false'" :aria-describedby="againDisabled ? 'wd-again-reason-empty' : undefined" :aria-label="t.wallet.submitNewWithdrawal" @click.stop="goWithdraw">
          <text :style="emptyLinkStyle">{{ t.wallet.submitNewWithdrawal }}</text>
        </view>
        <text v-if="againDisabled" id="wd-again-reason-empty" class="block text-center" :style="againReasonStyle">{{ againReasonText }}</text>
      </view>

      <template v-else>
        <!-- Single-theme continuous flow: page-floor blocks separated by 12px,
             hairlines open the stepper + ETA groups (de-carded). -->
        <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
          <!-- Amount hero — de-carded to the page floor (no surface/border; the
               floor glow + dot-grid are deleted, not re-tuned). -->
          <view :style="heroStyle">
            <text class="block" :style="amountLabelStyle">{{ t.wallet.trackAmountLabel }}</text>
            <text class="block" :style="amountStyle">${{ wd.amount.toFixed(2) }}</text>
            <text class="block" :style="viaStyle">{{ viaLine }}</text>
            <text class="block" :style="addrStyle">{{ wd.address }}</text>
          </view>

          <!-- Status stepper — outer card dropped, stepper structure kept;
               hairline opens the group. -->
          <!-- 失败终态不渲染步进条:五步全灰、连「已提交」都不打勾,而下方卡片说转账失败(对抗证伪坐实) -->
          <view v-if="!isFailedEnd" :style="stepperStyle">
            <text class="block" :style="progressLabelStyle">{{ t.wallet.trackProgressLabel }}</text>
            <view class="relative">
              <view v-for="(step, i) in steps" :key="step.key" class="flex relative" :style="stepLiStyle(i === steps.length - 1)">
                <!-- connector -->
                <view v-if="i < steps.length - 1" :style="connectorStyle(i < doneUpTo)" />
                <!-- icon -->
                <view class="grid place-items-center shrink-0" style="width: 24px; height: 24px">
                  <view v-if="i < doneUpTo" class="grid place-items-center" :style="doneIconStyle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </view>
                  <view v-else-if="i === currentIdx && showSpinner" class="grid place-items-center glow-green" :style="currentIconStyle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  </view>
                  <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2"><circle cx="12" cy="12" r="9" /></svg>
                </view>
                <!-- text -->
                <view style="flex: 1; padding-top: 2px">
                  <text class="block" :style="stepLabelStyle(i >= doneUpTo && i !== currentIdx)">{{ step.label }}</text>
                  <text class="block" :style="stepHintStyle">{{ step.hint }}</text>
                  <text v-if="stepTimeText(i)" class="block" :style="stepTimeStyle">{{ stepTimeText(i) }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- Estimated completion / SPEC-7 风控持有态(manual/delay=审核中,freeze=冻结)
               normal = floor note (hairline opens it); frozen = danger accent callout. -->
          <view class="flex items-start" :style="isFrozenHold || isFailedEnd ? etaFrozenCardStyle : etaCardStyle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" :stroke="isFrozenHold || isFailedEnd ? 'var(--v5-danger)' : 'var(--v5-brand)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
            <view style="flex: 1">
              <text class="block" :style="etaTitleStyle">{{ etaTitle }}</text>
              <text class="block" :style="etaSubStyle">{{ etaSub }}</text>
              <view v-if="reasonLines.length" style="margin-top: 6px">
                <text v-for="line in reasonLines" :key="line" class="block" :style="reasonLineStyle">· {{ line }}</text>
              </view>
              <!-- 人工审核 / 冻结态给客服出口:告诉用户「不会自动放款」却不给人问,
                   等于把人钉在原地(业务链必须有下一步)。 -->
              <view v-if="needsSupport" class="active:opacity-70" :style="supportLinkStyle" role="button" tabindex="0" :aria-label="t.wallet.trackContactSupport" @click.stop="goSupport">
                <text :style="supportLinkTextStyle">{{ t.wallet.trackContactSupport }} →</text>
              </view>
            </view>
          </view>

          <!-- ⑥ 再提一笔:今日额度用完时置灰 + 说明为什么,不做死按钮 -->
          <view class="flex flex-col items-center" style="gap: 6px">
            <view
              class="flex items-center justify-center"
              :class="againDisabled ? '' : 'active:opacity-80'"
              :style="againBtnStyle"
              role="button"
              tabindex="0"
              :aria-disabled="againDisabled ? 'true' : 'false'"
              :aria-describedby="againDisabled ? 'wd-again-reason' : undefined"
              :aria-label="t.wallet.trackSubmitAnother"
              @click.stop="goWithdraw"
            >
              <text>{{ t.wallet.trackSubmitAnother }}</text>
            </view>
            <text v-if="againDisabled" id="wd-again-reason" class="block text-center" :style="againReasonStyle">{{ againReasonText }}</text>
          </view>

          <!-- Back to wallet -->
          <view class="flex items-center justify-center active:opacity-80" :style="backBtnStyle" role="button" tabindex="0" :aria-label="t.wallet.trackBackToWallet" @click.stop="goWallet">
            <text>{{ t.wallet.trackBackToWallet }}</text>
          </view>
        </view>
      </template>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, type CSSProperties } from "vue";
import { onLoad, onShow, onHide } from "@dcloudio/uni-app";
import { withdrawalApi } from "@/api/runtime";
import type { WithdrawalPolicy } from "@/api/withdrawal-api";
import { mockServerNow } from "@/store/server-time";
import { platformDayIndex } from "@/store/withdrawal-eligibility-core";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import FundsSandboxBadge from "@/components/me/funds-sandbox-badge.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import type { WithdrawalStatus } from "@/store/types";
import { navTo } from "@/lib/route";
import { riskReasonLines, terminalReasonLine } from "@/lib/risk-reason-text";
import { dailyLimitStatus } from "@/store/withdrawal-eligibility";

const STEP_DELAY_MS = 3500;

const t = useT();
const app = useApp();
// 🔴 用**主单**(优先最早的在途单):只显示「最新一笔」时,在途的人工审核单
// 会被后提且已到账的那笔挤掉,用户查不到自己还在审核的钱(独立验收实测)。
// 深链(?id=)按单号精确定位;找不到走「查无此单」空态,**绝不回落主单** ——
// 回落等于把别的单渲染在这个单号名下(账单深链串数据 P0 同型,2026-08-02)。
const deepLinkId = ref<string | null>(null);
onLoad((options) => {
  deepLinkId.value = typeof options?.id === "string" && options.id ? options.id : null;
});
const wd = computed(() => {
  if (deepLinkId.value) return app.withdrawals.find((x) => x.id === deepLinkId.value) ?? null;
  return app.primaryWithdrawal;
});
const deepLinkMiss = computed(() => deepLinkId.value !== null && !wd.value);

const steps = computed<{ key: WithdrawalStatus; label: string; hint: string }[]>(() => [
  { key: "submitted", label: t.value.wallet.submitted, hint: t.value.wallet.trackSubmittedHint },
  { key: "review-passed", label: t.value.wallet.reviewPassed, hint: t.value.wallet.trackReviewHint },
  { key: "processing", label: t.value.wallet.processing, hint: t.value.wallet.trackProcessingHint },
  { key: "sent", label: t.value.wallet.sent, hint: t.value.wallet.trackSentHint },
  { key: "confirmed", label: t.value.wallet.confirmed, hint: t.value.wallet.trackConfirmedHint },
]);

// 🔴 失败终态。此前这四个态没有任何分支,全部掉进兜底渲染成「正在处理 · 预计 24 小时内完成」——
// 钱没打出去,页面却说一切正常,而且连客服入口都没有;同时钱包列表那行写的是「转账失败」,
// 列表与它自己的详情页互相打脸(审计 P0)。
const FAILED_STATUSES: WithdrawalStatus[] = ["review-rejected", "address-invalid", "tx-failed", "refunded"];
const isFailedEnd = computed(() => !!wd.value && FAILED_STATUSES.includes(wd.value.status));
const failedTitle = computed(() => {
  const s = wd.value?.status;
  const w = t.value.wallet;
  if (s === "review-rejected") return w.reviewRejected;
  if (s === "address-invalid") return w.statusAddressInvalid;
  if (s === "tx-failed") return w.statusTxFailed;
  if (s === "refunded") return w.statusRefunded;
  return "";
});
// 🔴 拦截/异常态一律要有客服出口。原判据只看 riskRoute,而 frozen 也可能由后台对一张
// pass 路由的在途单事后冻结(types.ts 明写「K3 route freeze 或 D2 处置」)——
// 那种单文案叫用户联系客服,页面上却没有客服入口。
const routeHeld = computed(() => !!wd.value?.riskRoute && wd.value.riskRoute !== "pass");
const needsSupport = computed(() => routeHeld.value || isFrozenHold.value || isFailedEnd.value);
// 终态:5 步全部走满,最后一步不能还转圈 —— 转圈代表「进行中」,
// 钱都到账了还转,用户会以为卡住了。
const isTerminalDone = computed(() => wd.value?.status === "confirmed");
const currentIdx = computed(() => {
  const idx = steps.value.findIndex((s) => s.key === wd.value?.status);
  // review-pending / frozen 不在主链 5 步里,findIndex 返回 -1 会让整条步进条全灰
  // (看不出走到哪了)。按规格停在第 1 步:已提交,等审核。
  if (idx === -1 && wd.value) return 0;
  return idx;
});
/** 打勾的步数。终态时 = 全部 5 步;否则 = 当前步之前的都打勾。 */
const doneUpTo = computed(() => (isTerminalDone.value ? steps.value.length : Math.max(0, currentIdx.value)));
/** 失败终态 / 冻结态不再转圈:转圈代表「还在推进」,而它已经不会再推进了。 */
const showSpinner = computed(() => !isTerminalDone.value && !isFailedEnd.value && !isFrozenHold.value);

// ⑥ 「再提一笔」的可用性。
// 🔴 两件事实必须与提现页**同源**,否则这页说能提、那页说不能提(历史上真出过):
//   限额只认服务端 policy(提交时真正执行的那把尺子),笔数由 core 从 app.withdrawals 现算。
//   本页原先只能拿到本地 config 的写死值,是分裂的一半。
// policy 取不到 → 0 → 既有规则「上限 ≤0 视为未配置」→ 不置灰(fail-open,
// 后端不可达时不把用户的下一步堵死;真拦不拦由提现页与服务端说了算)。
const withdrawalPolicy = ref<WithdrawalPolicy | null>(null);
/**
 * 🔴 policy 拉取要能重来。只拉一次且失败静默吞的话,这一页实例**终身** fail-open:
 * 「再提一笔」永不置灰,点进提现页却被日限拦死 —— 正是本文上面那句「同源」要消灭的分裂,
 * 只是换了触发条件(R1 四份独立审计各自点名)。onShow 补拉:从提现页返回、切回前台都会重取。
 */
const withdrawalPolicyLoading = ref(false);
async function loadWithdrawalPolicy(): Promise<void> {
  // 🔴 在途守卫:抄提现页那份 loader 时我漏抄了它。onShow 与 onMounted 首次进入会各触发一次,
  // App 端每次回前台再叠一次 —— 没有守卫就会重复发请求,且**后到的响应覆盖先到的**。
  if (withdrawalPolicyLoading.value) return;
  withdrawalPolicyLoading.value = true;
  try {
    withdrawalPolicy.value = await withdrawalApi.policy();
  } catch {
    // 🔴 失败时**什么都不做**——保留上一次拿到的好值。
    // 清空会让限额回落 0、判定按「不限制」放行:回前台那一刻网络抖一下,「再提一笔」就解灰,
    // 点进去却被提现页拦死。仓内同类钱路径配置的既有惯例是失败朝「关」(见 genesis-config 的
    // catch → marketOpenState:"closed")。设计上说的 fail-open 是「从没取到过」,
    // 不是「取到过又被抹掉」——这两件事被我上一版混成了一件。
  } finally {
    withdrawalPolicyLoading.value = false;
  }
}
/**
 * 🔴 平台日边界信号。判定里的「今天」走 mockServerNow(),它不是响应源 ——
 * 没有这个依赖,停在本页跨过平台日 0 点后按钮**不解灰**,理由行还念着一个已经过去的时刻,
 * 页面自己打自己脸(提现页为同一个失效专门建了 eligibilityClock,本页此前没跟上)。
 * 只取「日序」不取秒:值只在跨过边界那一刻变,不会每分钟触发重算。
 */
const nowTick = ref(mockServerNow());
let dayTimer: ReturnType<typeof setInterval> | undefined;
const stopDayTimer = () => { if (dayTimer) { clearInterval(dayTimer); dayTimer = undefined; } };
// 🔴 定时器起停挂 onShow/onHide **成对**,不能只挂 onUnmounted —— 仓内明文硬规则(P-063),
// 且隔壁 support/chat 就是这么写的。uni 页面栈会保活页面实例,前进离开时 onUnmounted 不触发:
// 每往返一次就多留一个常驻 60s tick。我抄追踪页这段时只抄了「加个定时器」,没抄那条约束。
onShow(() => {
  nowTick.value = mockServerNow();
  stopDayTimer();
  dayTimer = setInterval(() => (nowTick.value = mockServerNow()), 60_000);
  void loadWithdrawalPolicy();
});
onHide(stopDayTimer);
onUnmounted(stopDayTimer); // 兜底:onHide 不触发的场景(直接销毁)仍要清

// app.withdrawals 本身是响应源,提交完回到本页会自动重算 —— 不再需要 `void wd.value` 那种手动挂依赖。
const dailyLimit = computed(() => {
  void platformDayIndex(nowTick.value); // 建立对「平台日边界」的依赖,不参与计算
  return dailyLimitStatus({
    limitCount: withdrawalPolicy.value?.dailyLimitCount ?? 0,
    withdrawals: app.withdrawals,
  });
});
/**
 * 服务端对**这一笔**的结论:它还能不能被重新发起。
 *
 * 🔴 **不拿它去置灰「再提一笔」**(2026-08-11 独立审计 P1,我上一版就是这么写的,错了):
 * `retriable` 的作用域是**单据**,而「再提一笔」发起的是一笔**全新**提现 —— 作用域是账号。
 * 拿单据级结论去禁账号级动作有两处错:① 禁用理由与被禁的动作不是同一件事;
 * ② 失败单永久留在列表里、终态单又不再被回查,于是一张历史废单会把这个入口**永久**锁死,
 * 哪怕换个地址换个金额本来完全提得出来。真正该拦的地方是提现页自己的闸(限额/风控/地址),
 * 那里才拿得到账号级的当前结论。
 * 这里只做一件事:**如实把服务端的结论说给用户**,不替它扩大适用范围。
 * 缺省(服务端没给)不显示:没说过的话不替它说。
 */
const retryBlockedLine = computed(() =>
  (isFailedEnd.value && wd.value?.retriable === false ? t.value.wallet.trackRetryBlocked : null));
const againDisabled = computed(() => dailyLimit.value.reached);
const againReasonText = computed(() => {
  const at = new Date(dailyLimit.value.resetAt);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const stamp = `${p2(at.getMonth() + 1)}-${p2(at.getDate())} ${p2(at.getHours())}:${p2(at.getMinutes())}`;
  return fmt(t.value.walletV3.dailyLimitReached, { time: stamp });
});
// SPEC-7: freeze 路由/冻结状态用独立危险态文案;manual/delay 用审核中文案。
const isFrozenHold = computed(() => wd.value?.riskRoute === "freeze" || wd.value?.status === "frozen");
// 命中原因 → 业务话术(工程 reason code 不直出;R5: 展示存单快照的服务端结论)。
const heldReasonLines = computed(() => {
  if (!routeHeld.value) return [] as string[];
  // 码表单源 lib/risk-reason-text:含 PAY04 换绑扩展码(new-address-large-amount),
  // 各页散抄 dict 会静默吞新增码(filter(Boolean) 无痕丢行)。
  return riskReasonLines(t.value, wd.value?.riskReasons);
});
/**
 * 失败终态的原因行 —— 服务端 GET /api/withdrawals/:id 的 terminalReason 翻成业务话术。
 * 在此之前失败单只有一句「审核未通过」,为什么被拒**页面上一个字都没有**,
 * 用户与客服都只能猜。码不直出(工程枚举值禁上页面),翻译走 lib/risk-reason-text 单源。
 */
const failedReasonLine = computed(() =>
  (isFailedEnd.value ? terminalReasonLine(t.value, wd.value?.terminalReason) : null));
/**
 * 两类原因合流到同一个渲染槽:一张 manual 路由的单被拒时,既有「当初为什么被拦下来」
 * (riskReasons)也有「最后为什么没成」(terminalReason),两句都该给。
 * 去重是因为 v-for 用文案本身作 key —— 两边恰好给出同一句时会撞 key。
 */
const reasonLines = computed(() => [...new Set([
  ...heldReasonLines.value,
  ...(failedReasonLine.value ? [failedReasonLine.value] : []),
  // 「这笔不能再发起,请联系客服」和原因行同处一块 —— 那块下面就挂着客服入口
  // (needsSupport 对失败终态恒真),叫用户联系客服的那句话与入口在同一屏,不是死胡同文案。
  ...(retryBlockedLine.value ? [retryBlockedLine.value] : []),
])]);
// FEAT-WD02:fee 是结构化快照,展示只读 actualFeeUsd(旧单读盘时已归一,禁重算)。
const viaLine = computed(() =>
  wd.value ? fmt(t.value.wallet.trackViaLine, { network: wd.value.network, fee: wd.value.fee.actualFeeUsd.toFixed(2) }) : "",
);
const etaTitle = computed(() =>
  wd.value?.status === "confirmed"
    ? t.value.wallet.trackEtaDone
    : isFailedEnd.value
      ? failedTitle.value
      : isFrozenHold.value
      ? t.value.wallet.routeHeldFrozenTitle
      : routeHeld.value
        ? t.value.wallet.withdrawRouteHeldTitle
        // 🔴 标题必须用**不带插值**的 key。这里原来直接取 trackEtaPending,而那条
        // 文案在改成「预计 {n} 小时内完成」之后带了占位符 —— 没过 fmt 就直出,
        // 用户看到的是标题「预计 {n} 小时内完成」+ 副标题「预计 24 小时内完成」
        // (同一句两遍,其中一遍是坏的)。改一个 key 的插值形态必须扫全部消费者。
        : t.value.wallet.trackEtaTitlePending,
);
const etaSub = computed(() => {
  // 失败终态不给「预计到账」——钱没走成,给的是原因 + 客服出口(见 needsSupport)。
  if (isFailedEnd.value) return t.value.wallet.trackFailedBody;
  if (isFrozenHold.value) return t.value.wallet.routeHeldFrozenBody;
  if (routeHeld.value) return t.value.wallet.withdrawRouteHeldSub;
  if (wd.value?.sourceEnvironment === "SANDBOX" && !isTerminalDone.value) {
    // 工程话,故意不进 i18n 词典(同 :97 的理由:出路②)。
    return "source=mock · SANDBOX: awaiting server callback, no client-side ETA auto-complete";
  }
  // 终态给实际到账时刻；进行中只显示服务端订单快照中的预计时刻。
  if (isTerminalDone.value && wd.value) {
    const at = wd.value.confirmedAt ?? wd.value.estimatedCompletion;
    return Number.isFinite(at) ? fmt(t.value.wallet.trackArrivedAt, { time: absTime(at) }) : t.value.wallet.trackReviewNote;
  }
  const at = wd.value?.estimatedCompletion;
  return Number.isFinite(at) ? fmt(t.value.wallet.trackExpectedAt, { time: absTime(at as number) }) : t.value.wallet.trackReviewNote;
});

/** 「MM-DD HH:mm」本地时刻。到账是**确定发生过的事**,给绝对时间比「3 小时前」可核对。 */
function absTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 每步的时间行。最后一步在终态显示**实际到账时刻**(来自单据的 confirmedAt,
 * 不是这里现编的);其余步沿用 demo 的相对时间阶梯。
 */
function stepTimeText(i: number): string {
  const w = wd.value;
  if (!w) return "";
  if (isTerminalDone.value && i === steps.value.length - 1) {
    const at = w.confirmedAt ?? w.estimatedCompletion;
    return Number.isFinite(at) ? fmt(t.value.wallet.trackArrivedAt, { time: absTime(at) }) : "";
  }
  // 🔴 只给单据里**真有**的时刻:提交(第 1 步)与实际到账(末步)。
  // 中间三步没有任何时间戳,原先用 3.5 秒假阶梯现编 —— 跨整点时会渲染成
  // 「73h/73h/72h/72h」,等于对一件从未发生过的事(链上广播)做时间断言;
  // 而生产路径本来就是 submitted 直接跳 confirmed,中间三步从不被进入。
  if (i === 0) return relTime(w.submittedAt);
  return "";
}

function relTime(ts: number): string {
  if (ts > Date.now()) return t.value.wallet.timePending;
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t.value.wallet.timeJustNow;
  if (m < 60) return fmt(t.value.wallet.timeMinutesAgo, { n: m });
  return fmt(t.value.wallet.timeHoursAgo, { n: Math.floor(m / 60) });
}

function goWithdraw() {
  if (againDisabled.value) return; // 置灰按钮不能靠视觉拦,点击也得真的不走
  navTo("/pages/me/wallet-withdraw");
}
function goWallet() {
  navTo("/me/wallet");
}
function goSupport() {
  navTo("/pages/me/support");
}

/** ⑤ 骨架块。与真实结构同尺寸,加载完不跳版。 */
function skelStyle(w: string, h: string, mt = "0", radius = "6px"): CSSProperties {
  return { width: w, height: h, marginTop: mt, borderRadius: radius, background: "var(--v5-surface-2)", opacity: 0.6 };
}

const emptyTextStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)" };
const emptyLinkStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-brand)" };
// De-carded amount hero — left-aligned on the page floor (2px optical inset);
// no surface/border, and the floor glow + dot-grid element are deleted outright.
const heroStyle: CSSProperties = { padding: "0 2px" };
const amountLabelStyle: CSSProperties = { fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", fontWeight: 500, color: "var(--v5-ink-3)", letterSpacing: "0.06em" };
const amountStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "34px", fontWeight: 600, color: "var(--v5-ink)", marginTop: "4px", fontVariantNumeric: "tabular-nums" };
const viaStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "4px" };
const addrStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)", marginTop: "8px", fontFamily: "var(--font-jet-mono), ui-monospace, monospace", wordBreak: "break-all" };
// De-carded — the stepper structure is kept; a hairline opens the group and
// content sits at the 2px optical inset (no surface/border).
const stepperStyle: CSSProperties = { padding: "8px 2px 0", borderTop: "1px solid var(--v5-border)" };
const progressLabelStyle: CSSProperties = { marginBottom: "14px", fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", fontWeight: 500, color: "var(--v5-ink-3)", letterSpacing: "0.06em" };
function stepLiStyle(last: boolean): CSSProperties {
  return { gap: "12px", paddingBottom: last ? "0" : "20px" };
}
function connectorStyle(done: boolean): CSSProperties {
  return {
    position: "absolute",
    left: "11px",
    top: "28px",
    bottom: "4px",
    width: "1px",
    background: done ? "var(--v5-brand)" : "var(--v5-surface-2)",
  };
}
const doneIconStyle: CSSProperties = { width: "24px", height: "24px", borderRadius: "999px", background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)" };
const currentIconStyle: CSSProperties = { width: "24px", height: "24px", borderRadius: "999px", background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)" };
function stepLabelStyle(pending: boolean): CSSProperties {
  return { fontSize: "13px", fontWeight: 500, color: pending ? "var(--v5-ink-4)" : "var(--v5-ink)" };
}
const stepHintStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
const stepTimeStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "12px", color: "var(--v5-ink-4)", marginTop: "2px", fontVariantNumeric: "tabular-nums" };
// Normal ETA — floor note; a hairline opens it (no surface/border).
const etaCardStyle: CSSProperties = { gap: "12px", padding: "8px 2px 0", borderTop: "1px solid var(--v5-border)" };
// Frozen/held ETA — danger accent callout (tint + border: the whitelisted
// accent-callout exception, reserved for a genuine alert state).
const etaFrozenCardStyle: CSSProperties = {
  gap: "12px",
  padding: "16px",
  borderRadius: "16px",
  background: "color-mix(in srgb, var(--v5-danger) 8%, transparent)",
  border: "1px solid color-mix(in srgb, var(--v5-danger) 30%, transparent)",
};
const etaTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 500, color: "var(--v5-ink)" };
const etaSubStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
const reasonLineStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.5 };
// 客服出口 —— 独占一行的行动链接,撑到 44px 热区(《07》tap≥44,不吃 inline 豁免)。
const supportLinkStyle: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: "44px", marginTop: "2px" };
const supportLinkTextStyle: CSSProperties = { fontSize: "12px", fontWeight: 500, color: "var(--v5-brand)" };
// 「再提一笔」= 主行动,但在追踪页不抢主 CTA 的位置(用描边而非实心品牌色);
// 置灰态压低对比并去掉 active 反馈,视觉上就说明「现在按不了」。
const againBtnStyle = computed<CSSProperties>(() => ({
  width: "100%",
  height: "44px",
  borderRadius: "999px",
  background: againDisabled.value ? "var(--v5-surface-2)" : "var(--v5-brand)",
  color: againDisabled.value ? "var(--v5-ink-4)" : "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 600,
  opacity: againDisabled.value ? 0.6 : 1,
  transition: "opacity 150ms ease",
}));
const againReasonStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.5 };
const backBtnStyle: CSSProperties = {
  width: "100%",
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-ink)",
  transition: "opacity 150ms ease",
};
</script>
