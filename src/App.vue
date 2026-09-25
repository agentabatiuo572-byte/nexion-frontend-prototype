<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import { useApp } from "@/store/app";
import {
  useFreeTrial,
  liveShadowUSD,
  remainingMs,
  trialReservesSlotNow,
} from "@/store/free-trial";
import { useTrialConfig } from "@/store/trial-config";
import { useBills } from "@/store/bills";
import { postMoneyBill, postMoneyBillsOnce, postReceiptForAccount, type ReceiptDraft } from "@/lib/money-receipt";
import { withdrawalBillDrafts } from "@/lib/withdrawal-bill-drafts";
import { tickOrders } from "@/store/orders";
import { useMilestones, nextUnfired } from "@/store/milestones";
import { useQuest, type QuestTaskId } from "@/store/quest";
import { hasPersistedServerAuthenticatedAccountTrace, useAuth } from "@/store/auth";
import { useSession } from "@/store/session";
import { useProfile } from "@/store/profile";
import { useTheme } from "@/store/theme";
import { toast } from "@/store/ui";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import {
  canonicalH5RouteUrl,
  isStaticReviewRoute,
  normalizeRoute,
  routeFromH5Location,
} from "@/lib/static-review-routes";
import { resolveRetiredRoute } from "@/lib/retired-route-migrations";
import { rebindAccountScopedStores } from "@/lib/account-scope";
import { useConfig } from "@/store/config";
import { useGenesisConfig } from "@/store/genesis-config";
import { refreshEarningsReleaseStatus } from "@/store/earning-release";
import {
  configureBehaviorAnalyticsContext,
  pauseBehaviorAnalytics,
  startBehaviorAnalytics,
} from "@/services/behavior-analytics";
import { useDeposits } from "@/store/deposits";
import { mockFundsEnabled, remoteApiEnabled, sessionVault, setRemoteUnauthorizedHandler } from "@/api/runtime";
import { prepareProductCatalog } from "@/store/product-catalog";
import { installKeyboardActivation } from "@/lib/a11y-activate";
import { refreshEarnConfig } from "@/store/earn-config";
import { useMarket } from "@/store/market";
import { provisionMockPreviewAccount } from "@/api/mock-preview-account";

// Simulation tick driver (ports SimulationProvider). Runs the client-side
// earnings/device simulation while the app is visible; pauses in background.
let tickTimer: ReturnType<typeof setInterval> | undefined;
let lastTick = Date.now();
let accountSessionBootstrapped = false;
let businessLoopsRunning = false;
const businessTimeouts = new Set<ReturnType<typeof setTimeout>>();
let devBusinessTimeoutRuns = 0;
let pendingCanonicalRouteRepair = "";
let pendingCanonicalRouteRepairAt = 0;
let pendingServerSessionRecovery = false;
// Capture the non-secret trace before any startup request can reject and clear
// its persisted shell. It is consumed on the first recovery redirect.
let serverAuthenticatedAccountTraceAtBoot = remoteApiEnabled && readServerAuthenticatedAccountTrace();
const ROUTE_REPAIR_RETRY_MS = 750;
const INVALID_H5_ROUTE_FALLBACK = "/pages/onboarding/intro";

/**
 * 业务延迟任务的唯一登记口。新的延迟 poll 不得直接 setTimeout：否则进入
 * 静态评审页/onHide 时没有 handle 可取消，回调仍可在安全边界外执行。
 */
function scheduleBusinessTimeout(task: () => void, delayMs: number): ReturnType<typeof setTimeout> | undefined {
  if (!businessLoopsRunning) return undefined;
  let handle: ReturnType<typeof setTimeout>;
  handle = setTimeout(() => {
    businessTimeouts.delete(handle);
    if (!businessLoopsRunning || !ensureBusinessLoopsAllowed()) return;
    task();
  }, delayMs);
  businessTimeouts.add(handle);
  return handle;
}

function stopBusinessTimeouts(): void {
  for (const handle of businessTimeouts) clearTimeout(handle);
  businessTimeouts.clear();
}

function startTick() {
  stopTick();
  lastTick = Date.now();
  tickTimer = setInterval(() => {
    const now = Date.now();
    useApp().tick(now - lastTick);
    lastTick = now;
  }, 1000);
}
function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = undefined;
  }
}

// ── 提现到账推进轮询(FEAT-WD01b)──
// 追踪页只展示、不推进(SPEC-7),所以「用户点进追踪页发现已到账」这条路径要靠这个
// 定时器兜住 —— 5s 一次:一次调用就是一个纯函数判定 + 一次 null 判断,开销可忽略,
// 但用户不会盯着「处理中」干等半分钟。真正的离线缺口补齐发生在 onShow 那一下。
// PROD: 整块删掉,状态改由 SSE/webhook 推。
const ARRIVAL_TICK_MS = 5_000;
let arrivalTimer: ReturnType<typeof setInterval> | undefined;

/**
 * 到账推进 + 账单结算。两件事必须一起做:
 * 单据推到「已到账」而账单行还停在「处理中」的话,追踪页说到账了、账单页说处理中,
 * 同一笔钱两个说法;而且账单页的流水余额只累加已入账的行,这笔提现永远不进流水。
 * store 之间不互相 import(P-031),所以这个跨 store 编排放在 App 层。
 */
function advanceArrivalAndSettleBill() {
  if (mockFundsEnabled) return;
  const app = useApp();
  // 🔴 按**本次真正推进的那几笔**逐个结算,不能问「最新一笔是谁」——
  // 推进是全表扫,最新那笔未必是刚到账的那笔(独立验收实测:双向都会结算错单)。
  // 远端模式下 advanceWithdrawalArrival 恒返回空(闸在 advanceArrival 里),状态改由
  // refreshRemoteWithdrawals 从 GET /api/withdrawals/:id 镜像回来 —— 两条路产出同一种
  // 「本次变动了哪几笔」,后面的结算与对账逻辑一字不改。
  const advanced = app.advanceWithdrawalArrival();
  if (advanced.length) {
    const bills = useBills();
    for (const ref of advanced) bills.settleByRef(ref, "posted");
  }
  if (remoteApiEnabled) {
    // fire-and-forget:拉不到就保持原样,下一拍(5s)再问;reconcileBills 本身是
    // 「从数据推出该做什么」的自愈式对账,晚一拍拿到镜像也能自己收敛。
    void app.refreshRemoteWithdrawals()
      .then((mirrored) => {
        if (!mirrored.length) return;
        reconcileBills();
      })
      .catch(() => undefined);
  }
  // 结算失败的那几笔不靠「记在内存里下次重试」找回来 —— 见 reconcileBills 的注释。
  reconcileBills();
}

/**
 * 🔴 对账:把「已到账的单据」和「还停在处理中的账单行」拉齐。
 *
 * 这里原本是一个模块级的 `pendingBillSettle` Set:结算失败就记下来、下一轮重试。
 * 问题是它**只在内存里**——用户刷新一次页面 / 关掉 App 重开,这个 Set 就没了,
 * 而到账推进本身是幂等的(推过的单不会再出现在返回数组里),于是那笔单**永远不会再被结算**:
 * 追踪页说「已到账」、账单页说「处理中」,正是注释自称要防的永久裂脑,防御却只覆盖同一个页面生命周期。
 *
 * 根治不是把那个 Set 持久化,而是**别记**:该做什么完全可以从现有数据推出来 ——
 * 单据是终态、账单行还没跟上,就是待办。这样刷新、换设备、隔一周回来都能自愈,零额外存储。
 */
function reconcileBills() {
  if (mockFundsEnabled) return;
  const app = useApp();
  const bills = useBills();
  // ⓪ 🔴 单据在、账单缺 → **补写**(z4 R2,两路独立审计各自命中)。
  //    本段其余四格都是「存在性判据 + 没有才补」的自愈,唯独提现主行原来只在提交那一刻写一次:
  //    写失败(storage 抖动)只弹一条 toast 就再也不重试;而账单表是裸写整行、无 CAS
  //    (2026-08-05 主人拍板不在前端修),跨标签页并发写会把刚落盘的分录整行覆盖掉。
  //    于是这一族成了资金分录里唯一「丢了就永久没有」的一格 —— 用户回到的正是 z4 要修的原状态,
  //    而所有门仍全绿(门守的是「有没有生产者」,不是「那一行此刻在不在」)。
  //    判据同样从数据推出:单据齐全就该有分录,没有就补。分录形状与提交那一刻**共用同一个纯函数**
  //    (lib/withdrawal-bill-drafts),两处各拼一份必然漂移。
  //    账号用 app.accountKey:遍历的就是当前账号的单据,不存在跨账号补写。
  //    🔴 补记要盖**单据的提交时刻**,不是「现在」:补一笔三天前的提现时若盖当前时钟,
  //    那两行会落在账单页今天这一组的最上面 —— 账本给自己的历史标错日期(按 ts 分月分组)。
  //    ⚠️ 这里传的是**整批**的时刻,而这一族里的失败退还冲正行**不是提交时发生的事** ——
  //    它自带 `atMs`(退款时刻)覆盖整批,构造与回落规则都在 withdrawal-bill-drafts 那一处。
  //    别把下面这个 `wd.submittedAt` 读成「这组分录全都发生在提交时」(2026-08-12 修)。
  //    🔴 存在性判据必须与 store 的判重键**同一把**(含方向),否则同单号的 `+N NEX` 冲正行
  //    会被当成 `−N` 已存在 —— 少补的恰好是烧掉那一条(z4 R3 独立审计 P0)。
  //    🔴 逐单 try/catch:存量脏单(旧 schema 的 `fee` 缺失)会让 drafts 构造抛异常,
  //    而本函数跑在 5s 轮询里、外层无 catch —— 一条脏数据能把 ①②②b③ 全部打停
  //    (到账结算 / 失败结算 / 赠金入账集体停摆)。爆炸半径限制在这一单。
  for (const wd of app.withdrawals) {
    try {
      const drafts = withdrawalBillDrafts(wd);
      const has = (d: ReceiptDraft) => bills.bills.some(
        (b) => b.ref === wd.id && b.symbol === d.symbol && (b.amount < 0) === (d.amount < 0),
      );
      if (drafts.every(has)) continue;
      postReceiptForAccount(app.accountKey, drafts, wd.submittedAt);
    } catch { /* 这一单的数据不完整 —— 跳过它,别拖垮整个对账循环 */ }
  }
  // ⓪b —— 🔴 **这里曾加过「扣款没落地就补扣」的自愈格,2026-08-13 按 R1 独立审计整格回退。**
  //     别再照 ⓪ 的样子在这里无条件遍历 app.withdrawals 补扣。两条独立证据(都已回源坐实):
  //     ① 那一版的立论前提是错的 —— app.ts applyWithdrawalDebit 头注称「全仓没有余额端点、
  //        余额的唯一持有者就是本 store」,而 refreshRemoteFleet 在
  //        `remoteApiEnabled && !mockFundsEnabled` 时用服务端 `fleet.walletUsdt`
  //        **整体覆写** usdtBalance 与 earningBuckets(app.ts:700-723);
  //        按 api/runtime-config.ts,生产无 env→remote、开发无 env→sandbox 但非显式,
  //        这两档 mockFundsEnabled 都是 false —— 正是补扣会跑且真扣本地余额的档。
  //        ⇒ 服务端值已含这笔则**双扣**;不含则补扣的 −N 被下一拍重投影抹掉、而幂等键已置位
  //        ⇒ **永不重试**。两种都比不修更坏。
  //     ② docs/changes/2026-08-11-z5-out-of-scope-findings.md B 段早已明令:
  //        **不可**无条件遍历补扣(remote 对齐期存量单全都没有 `wd-debit:` 键,会让余额无解释地掉一截),
  //        范围必须用「提交时落一个本地待扣款标记」钉死,只对带标记的单重试。
  //     另两条同轮结论:补扣不看 status 时 confirmed/sent 被扣后没有任何退款腿对手方;
  //     「扣了又退净 0」只对 usdtBalance 成立 —— 扣款会 clamp 可提桶而退款腿明写不回补。
  //     完整 findings 与逐条回源裁决:docs/changes/2026-08-13-z6-audit-R1.md
  // ① 已到账 → 账单入账
  for (const wd of app.withdrawals) {
    if (wd.status !== "confirmed") continue;
    const row = bills.bills.find((b) => b.ref === wd.id && b.symbol === "USDT");
    if (row && row.status !== "posted") bills.settleByRef(wd.id, "posted");
  }
  // ② 失败终态 → **先退款再置账单失败**,两件事必须成对。
  //    提现在提交那一刻就扣了款,「单子废了但钱没还」是最伤的一种不一致。
  for (const id of app.refundFailedWithdrawals()) bills.settleByRef(id, "failed");
  //    退款幂等,但账单可能上一轮没落盘成功 → 这里补一次(与①同样的自愈思路)
  for (const wd of app.withdrawals) {
    if (!["review-rejected", "address-invalid", "tx-failed", "refunded"].includes(wd.status)) continue;
    const row = bills.bills.find((b) => b.ref === wd.id && b.symbol === "USDT");
    if (row && row.status !== "failed") bills.settleByRef(wd.id, "failed");
  }
  // ②b NEX 抵扣费退还的冲正分录**已迁进 ⓪ 的纯函数**(lib/withdrawal-bill-drafts,2026-08-11)。
  //    这里原本单独写一段,判据锚在本地幂等键 `refund-nex:<id>` 上 —— 而写那个键的函数
  //    在 remote 模式下第一行就 `if (remoteApiEnabled) return false`、mock 模式下压根建不出
  //    提现单,两头落空:这条冲正在**任何真实配置下都不可达**,用户烧掉的 NEX 有去无回。
  //    根治不是放宽判据(z4 R2 试过按失败终态写,R3 独立审计判为「凭空宣布一笔没有证据的退款」
  //    并回滚),而是**换证据源**:改锚服务端字段 `wd.nexRefunded`(契约见 FEAT-WD01 §4.6)。
  //    既然判据变成了「从单据本身推出该有什么」,它就与其余分录同构,理应住在同一个纯函数里 ——
  //    于是自愈、按方向判重、跨账号补记这三件事全部继承 ⓪,不必在这里各写一遍。
  // ③ 赠金:锁定 / 待审桶都空了 = 没有还锁着的赠金,那笔「处理中」的赠金账单该入账了。
  //    释放走 applyReleaseOutcome,它只动桶和余额、**不写账单**,
  //    于是账单里那行 +$5 会永远停在「处理中」。这里从数据推出它已经落地。
  const b = app.user.earningBuckets;
  if (b.pendingReviewUsdt <= 0 && b.bonusLockedUsdt <= 0) {
    for (const row of bills.bills) {
      if (row.type === "bonus" && row.status === "pending" && row.ref) bills.settleByRef(row.ref, "posted");
    }
  }
}

function startArrivalPoll() {
  if (mockFundsEnabled) return;
  stopArrivalPoll();
  arrivalTimer = setInterval(() => {
    if (!ensureBusinessLoopsAllowed()) return;
    advanceArrivalAndSettleBill();
  }, ARRIVAL_TICK_MS);
}
function stopArrivalPoll() {
  if (arrivalTimer) {
    clearInterval(arrivalTimer);
    arrivalTimer = undefined;
  }
}

// ── Trial state-machine poll (FEAT-TRIAL02 cardless machine) ──
// The 4s poll only advances the lifecycle (active→grace→ended) and surfaces
// toasts/urgency pushes. Spec ④ 禁止动作: NO auto-charge, NO auto-order — the
// grace→ended flip touches state only; conversion money + the order live in
// the checkout page (user-confirmed). Mirrors TRIAL_TICK_MS = 4000.
const TRIAL_TICK_MS = 4000;
const URGENCY_24H_MS = 24 * 3_600_000;
const URGENCY_1H_MS = 60 * 60_000;
// Session-scoped fire flags so urgency toasts don't spam every poll.
const urgencyFired = { active24h: false, grace24h: false, grace1h: false };
let trialTimer: ReturnType<typeof setInterval> | undefined;
let trialPollRunning = false;

async function pollTrial() {
  if (!ensureBusinessLoopsAllowed() || trialPollRunning) return;
  trialPollRunning = true;
  const freeTrial = useFreeTrial();
  const before = freeTrial.status;
  const nowMs = Date.now();
  try {
    await freeTrial.poll(nowMs);
  } finally {
    trialPollRunning = false;
  }
  const after = freeTrial.status;
  const t = useT().value;

  if (before !== after) {
    if (after === "grace") {
      // Production stopped; the credit stays usable until graceEndsAt — always
      // hand the user the exact time + next step (spec ④).
      const until = freeTrial.graceEndsAt !== null ? new Date(freeTrial.graceEndsAt).toLocaleString(dateLocale()) : "";
      toast.info(fmt(t.trial.graceStartToast, { time: until }));
      urgencyFired.grace24h = false;
      urgencyFired.grace1h = false;
    } else if (after === "ended") {
      toast.info(t.trial.endedToast);
    } else if (after === "active") {
      urgencyFired.active24h = false;
      urgencyFired.grace24h = false;
      urgencyFired.grace1h = false;
    }
  }

  // ── Urgency pushes — active: 24h left; grace: credit expiring in 24h / 1h ──
  const st = freeTrial;
  if (st.status === "active" && st.expiresAt !== null) {
    const left = remainingMs(nowMs);
    if (!urgencyFired.active24h && left > 0 && left <= URGENCY_24H_MS) {
      urgencyFired.active24h = true;
      toast.warn(fmt(t.trial.urgency24h, { amount: useTrialConfig().config.discountCapUSD }));
    }
  } else if (st.status === "grace" && st.graceEndsAt !== null) {
    const left = remainingMs(nowMs);
    const credit = liveShadowUSD(nowMs).toFixed(2);
    if (!urgencyFired.grace1h && left > 0 && left <= URGENCY_1H_MS) {
      urgencyFired.grace1h = true;
      urgencyFired.grace24h = true; // don't double-push inside the last hour
      toast.warn(fmt(t.trial.urgencyGrace1h, { amount: credit }));
    } else if (!urgencyFired.grace24h && left > 0 && left <= URGENCY_24H_MS) {
      urgencyFired.grace24h = true;
      toast.warn(fmt(t.trial.urgencyGrace24h, { amount: credit }));
    }
  } else {
    urgencyFired.active24h = false;
    urgencyFired.grace24h = false;
    urgencyFired.grace1h = false;
  }
}

function startTrialPoll() {
  stopTrialPoll();
  trialTimer = setInterval(() => { void pollTrial(); }, TRIAL_TICK_MS);
}
function stopTrialPoll() {
  if (trialTimer) {
    clearInterval(trialTimer);
    trialTimer = undefined;
  }
}

// ── ORDER_TICK 6s loop (ports SimulationProvider's ORDER_TICK loop) ──
// Single global driver that advances every in-flight order one stage on the
// 6s cadence from the prototype (simulation-provider.tsx:36-64):
//   order auto-advance: placed → paid → provisioning → activated (tickOrders).
// Orchestration lives at the App layer so stores never import each other
// (P-031/032). Mirrors ORDER_TICK_MS = 6000.
// Production: order status arrives via SSE (GET /api/orders/:id).
const ORDER_TICK_MS = 6000;
let orderTimer: ReturnType<typeof setInterval> | undefined;

function pollOrders() {
  if (!ensureBusinessLoopsAllowed()) return;
  // Advance every in-flight order one stage (gated internally per-order).
  tickOrders(trialReservesSlotNow() ? 1 : 0);
}

function startOrderPoll() {
  stopOrderPoll();
  orderTimer = setInterval(pollOrders, ORDER_TICK_MS);
}
function stopOrderPoll() {
  if (orderTimer) {
    clearInterval(orderTimer);
    orderTimer = undefined;
  }
}

// ── Earnings-milestone 4s poll (ports milestone-watcher.tsx) ──
// Reads life-to-date earnings each tick; when it crosses the next unfired
// threshold, fires exactly once: mark (idempotent guard) → credit NEX → write
// the bonus bill → queue the celebration (store.show() enqueues; the overlay
// host promotes via advance(), which suspends UI on money-flow routes —
// checkout / withdraw / trial — and replays each queued tier afterwards).
// 🔴 奖励/记账必须留在这里无条件执行,不许接路由门 / stopMilestonePoll:那会变成
// 「钱链路期间不发奖励」而非「不弹窗」。UI 挂起只住在 store.advance()。
// nextUnfired returns the lowest unfired step (one at a time, original
// "fire one per tick" semantics) so the next poll surfaces the next tier.
// Production: GET /api/config/milestones + atomic POST /api/me/milestones/:id/claim
// (PRD §9.11e). Cross-store composition stays here (stores import-free).
const MILESTONE_TICK_MS = 4000;
let milestoneTimer: ReturnType<typeof setInterval> | undefined;

function pollMilestones() {
  if (!ensureBusinessLoopsAllowed()) return;
  // 🔴 远端模式不发:判据 lifeToDate 来自 app.earnings,而计收路径(app.settle)已归服务端;
  // 这里再跑就是拿本地数字给自己发 NEX + 写一条账单行。真契约是
  // GET /api/config/milestones + POST /api/me/milestones/:id/claim(PRD §11.3a / §9.11e),
  // 由服务端裁决与发放,client 只展示。关掉不 latch:没人依赖里程碑触发才能解锁别的东西。
  if (remoteApiEnabled) return;
  const app = useApp();
  const m = useMilestones();
  // Life-to-date = banked total + the still-accruing today bucket (matches the
  // prototype's lifetime figure used by milestone-watcher).
  const lifeToDate = (app.earnings.total ?? 0) + (app.earnings.today ?? 0);
  const step = nextUnfired(lifeToDate, m.firedIds);
  if (!step) return;
  // 收据即指令:+NEX 由这一条落定,不再单独 creditNex(那样钱和账各走各的路)。
  // 🔴 markFired 从「先标记」挪到落盘成功之后。先标记原本是防同一级被下一 tick 重入,
  // 但发奖这条链自始至终同步,轮询之间插不进第二次;而「标了 + 没落盘」= 里程碑记成已发、
  // 钱和账单都没有,用户永久少一级奖励。失败就停在未标记态,下一 tick 自愈重试
  // (与 reconcileBills 同一套「该做什么从数据推出来」的思路)。
  if (postMoneyBill({
    type: "achievement",
    symbol: "NEX",
    amount: step.nexReward,
    status: "posted",
    memo: `Earnings milestone · $${step.thresholdUSD}`,
    memoKey: "earningsMilestone",
    memoParams: { threshold: step.thresholdUSD },
    ref: `MILESTONE-${step.id}`,
  }) !== "ok") return;
  m.markFired(step.id);
  // Drive the global celebration overlay (label lets it resolve i18n copy).
  m.show({
    id: step.id,
    threshold: step.thresholdUSD,
    nexReward: step.nexReward,
    label: step.label,
  });
}

function startMilestonePoll() {
  stopMilestonePoll();
  milestoneTimer = setInterval(pollMilestones, MILESTONE_TICK_MS);
}
function stopMilestonePoll() {
  if (milestoneTimer) {
    clearInterval(milestoneTimer);
    milestoneTimer = undefined;
  }
}

// ── Auth/onboarding route guard (ports auth-guard.tsx) ──
// Demo-friendly: auth defaults to authenticated+onboarded (store/auth.ts), so
// this guard is dormant in normal use and the app opens to home (5-page baseline
// unaffected). It only bites after an explicit signOut() — then any protected
// route reLaunches to the onboarding flow. No-shell pages (onboarding/login/
// register/ref/tx) are whitelisted so the flow itself never self-redirects
// (no loop). Runs every route tick + on app show. Never edits the 5 tab pages.
// Production: replace the local auth store with the real session (the guard
// logic is identical against GET /api/auth/session).
const AUTH_WHITELIST_PREFIXES = [
  "pages/onboarding/",
  "pages/login/",
  "pages/register/",
  "pages/ref/",
  "pages/tx/",
  "pages/session/", // kicked screen — never auth/session-redirect away from it
];
function isAuthWhitelisted(route: string): boolean {
  // 🔴 两个判据必须同形:normalizeRoute 吃得下 `pages/x` 与冷启动时的 `#/pages/x?q=1`。
  //    原来后半段直接 startsWith,喂 hash 形态时白名单判不中 —— 守卫会在 intro 页
  //    自己把自己踢回 intro(死循环),所以下面 checkAuthGuard 敢回退到 hash 的前提就是这里。
  const r = normalizeRoute(route);
  return isStaticReviewRoute(route) || AUTH_WHITELIST_PREFIXES.some((p) => r.startsWith(p));
}

/**
 * A server-authenticated user has an account projection that is distinct from
 * the prototype's default shell. It is only a routing hint after a reload:
 * access still requires the in-memory server session to be recreated by login.
 */
function hasServerAuthenticatedAccountTrace(auth: ReturnType<typeof useAuth>): boolean {
  return (auth.isAuthenticated && auth.accountId !== "default" && auth.accountId.startsWith("user:"))
    || serverAuthenticatedAccountTraceAtBoot
    || hasPersistedServerAuthenticatedAccountTrace();
}

/**
 * USER endpoints may be warmed only after the accepted login has installed the
 * matching in-memory session. In remote H5 the vault is intentionally empty
 * after a full reload; issuing a fleet read from Login would start an auth
 * refresh/unauthorized callback that can arrive after the next successful
 * login and evict that new session.
 */
function canRefreshRemoteAccount(auth: ReturnType<typeof useAuth>): boolean {
  if (!remoteApiEnabled || !auth.isAuthenticated || !auth.onboardingComplete) return false;
  const serverSession = sessionVault.read();
  return !!serverSession && auth.accountId === `user:${serverSession.user.userId}`;
}

function readServerAuthenticatedAccountTrace(): boolean {
  try {
    const record = uni.getStorageSync("nexgrid-auth-v1") as unknown;
    return !!record
      && typeof record === "object"
      && (record as { isAuthenticated?: unknown }).isAuthenticated === true
      && typeof (record as { accountId?: unknown }).accountId === "string"
      && (record as { accountId: string }).accountId.startsWith("user:");
  } catch {
    return false;
  }
}

// Returns true if it redirected (callers bail so they don't act on a route the
// user is being kicked off of).
function checkAuthGuard(): boolean {
  // 🔴 2026-08-07 这里连补两刀,缺一不可:
  //    ① 读取空窗:冷启动裸读页面栈返回空 → `!route` 直接放行(读取口统一兜底+归一后关闭);
  //    ② 跳转丢失:冷启动那一拍 reLaunch 会被进行中的首次导航吞掉(实景实测:守卫发了跳转、
  //       页面纹丝不动),本函数返回 true 又让 onShow 提前收工 → 无重试。
  //       所以守卫轮询在 onShow 里**无条件启动**(见 onShow),每秒重查直到跳转真正落地。
  //    只修 ① 的状态在实景里与不修同果 —— verify 绿 ≠ 渲染 OK 的活例。
  const route = readCurrentRoute();
  if (!route) return false; // no route yet
  if (isAuthWhitelisted(route)) {
    // Once login is visible, consume the recovery latch before any periodic
    // guard retry. Re-launching the same login route resets in-progress input.
    if (route.startsWith("pages/login/")) pendingServerSessionRecovery = false;
    return false;
  }
  const auth = useAuth();
  const serverSession = remoteApiEnabled ? sessionVault.read() : null;
  // An unauthorized callback can arrive before H5 exposes its first route.
  // Carry only the non-secret recovery decision across that short window, then
  // consume it exactly once once a route is available. A fast successful
  // re-login can leave Login before the one-second guard observes it; a
  // matching new vault is stronger evidence than the stale recovery latch and
  // must consume that latch instead of being evicted by the next tick.
  if (remoteApiEnabled && pendingServerSessionRecovery) {
    if (serverSession
        && auth.isAuthenticated
        && auth.accountId === `user:${serverSession.user.userId}`) {
      pendingServerSessionRecovery = false;
      serverAuthenticatedAccountTraceAtBoot = false;
    } else {
      uni.reLaunch({ url: "/pages/login/login?notice=server-session-reload" });
      return true;
    }
  }
  // Server modes cannot accept a historical localStorage sign-in as authority.
  // The runtime vault is deliberately in-memory, so refresh/restart means a
  // clean sign-in instead of a stale local identity issuing sandbox commands.
  if (remoteApiEnabled && (!serverSession || auth.accountId !== `user:${serverSession.user.userId}`)) {
    const requiresServerSessionRecovery = !serverSession && hasServerAuthenticatedAccountTrace(auth);
    serverAuthenticatedAccountTraceAtBoot = false;
    // Keep the intent until the next guard observes the login route. Several
    // startup requests can reject together; a later callback must not replace
    // this recovery redirect with first-time onboarding.
    pendingServerSessionRecovery = requiresServerSessionRecovery;
    sessionVault.clear();
    useSession().signOutSession();
    auth.signOut();
    uni.reLaunch({
      url: requiresServerSessionRecovery
        ? "/pages/login/login?notice=server-session-reload"
        : "/pages/onboarding/intro",
    });
    return true;
  }
  if (!auth.isAuthenticated) {
    uni.reLaunch({ url: "/pages/onboarding/intro" });
    return true;
  }
  if (!auth.onboardingComplete) {
    uni.reLaunch({ url: "/pages/onboarding/estimator" });
    return true;
  }
  return false;
}

// ── Account session guard + new-device recalibration redirect ──
// Mirrors GET /api/auth/session: each 1s tick (and instantly via the cross-tab
// storage event) checks THIS session record. SPEC-4 allows the same account to
// stay active across signed App / H5 / white-app carriers; only self sign-out,
// deleted session, or ops revoke (killedAt) evicts this carrier. If a new device
// needs recalibration (different deviceId from the account's calibrated device)
// → reLaunch to the calibration ritual in recalibrate mode.
// Returns true if it redirected (caller bails). Production: identical logic
// against the server session endpoint; the storage event becomes an SSE/push.
function checkSession(): boolean {
  const route = readCurrentRoute();
  if (!route || isAuthWhitelisted(route)) return false; // flow pages exempt
  const auth = useAuth();
  if (!auth.isAuthenticated) return false; // auth guard handles unauth
  const session = useSession();
  const st = session.validate();
  if (st === "kicked" || st === "logged-out") {
    const reason = st === "kicked" ? "kicked" : "logged-out";
    stopBusinessLoops();
    useApp().interruptAllTasks(reason);
    session.kick(reason);
    // 踢出兜底:清全部账号级数据内存残留(P2-8 纵深防御)。app + 28 store 归 default。
    useApp().bindAccount("default");
    rebindAccountScopedStores("default");
    uni.reLaunch({ url: "/pages/session/kicked" });
    return true;
  }
  // Active session → ensure mining is running (resumes after a fresh re-login
  // that follows an eviction).
  const app = useApp();
  if (app.miningPaused) app.resumeMining();
  if (session.requiresRecalibration && auth.onboardingComplete) {
    uni.reLaunch({ url: "/pages/onboarding/connect?mode=recalibrate" });
    return true;
  }
  return false;
}

// Cross-tab instant session refresh: registry writes from another tab/device
// trigger a storage event so revokes/logouts are picked up immediately. H5 only
// (uni storage = localStorage).
let storageHandler: ((e: StorageEvent) => void) | undefined;
function attachSessionWatch() {
  // #ifdef H5
  if (storageHandler) return;
  storageHandler = (e: StorageEvent) => {
    if (e.key && (e.key.indexOf("nexgrid-account-sessions") >= 0 || e.key.indexOf("nexgrid-active-session") >= 0)) {
      checkSession();
    }
  };
  window.addEventListener("storage", storageHandler);
  // #endif
}
function detachSessionWatch() {
  // #ifdef H5
  if (storageHandler) {
    window.removeEventListener("storage", storageHandler);
    storageHandler = undefined;
  }
  // #endif
}

// ── Quest route watcher (ports quest-route-watcher.tsx) ──
// Auto-completes route-based first-day quest tasks when the user lands on the
// matching page. The prototype watches logical routes (/earn, /store,
// /store/:id); uni's physical routes are page-stack form `pages/…` (no leading
// slash — readCurrentRoute() normalizes), so map physical → task id here. On a FIRST
// completion: credit the reward(s) + toast. Idempotent in the store (re-visits
// return firstTime:false), so polling the route is safe. day-one-quest-card.vue
// (protected home page) is NOT touched — only the data/reward side.
// Production: POST /api/quest/complete returns { firstTime, rewardNex, rewardUsdt }.
const QUEST_TICK_MS = 1000;
let questTimer: ReturnType<typeof setInterval> | undefined;
let lastQuestRoute = "";

// 🔴 本文件**唯一**的路由读取口 —— 不要加第二个(verify 哨兵 app-route-single-reader 盯着)。
//
// 2026-08-07 同形洞一天三处(守门 checkAuthGuard / 会话驱逐 checkSession / 任务播种)。
// 共同根因不是三处各自写错,是「读取函数有两个」这个结构:
//   · 一个只读页面栈:H5 冷启动(onShow 早于页面栈建立)返回**空** → 判据把空当无害放行;
//   · 一个带地址栏兜底:返回 `#/pages/x?q=1` 原文,与页面栈形态 `pages/x` 不同形
//     → 谁忘了归一化谁就前缀匹配不中(白名单判不中 = 越权放行)。
// 每个 call site 必须同时记住这两件事才不出错 —— 记不住是结构的错,所以合成一个:
// 永远带兜底、永远归一成页面栈形态 `pages/x/y`(无前导斜杠、无查询串)。
// 空只剩一种含义:真的还没有任何路由(App 端首帧)。
function readCurrentRoute(): string {
  let pageRoute = "";
  try {
    const ps = getCurrentPages();
    pageRoute = ps.length ? ((ps[ps.length - 1] as { route?: string }).route ?? "") : "";
  } catch { /* 页面栈不可用 → 走下方兜底 */ }
  let route = pageRoute;
  // #ifdef H5
  let hashRoute = "";
  try { hashRoute = window.location.hash || ""; } catch { hashRoute = ""; }
  route = routeFromH5Location(pageRoute, hashRoute);
  const rawUrl = hashRoute.trim().replace(/^#/, "");
  const rawPath = rawUrl.split(/[?#]/, 1)[0];
  if (rawPath && rawPath !== "/") {
    // Invalid encodings and above-root traversal have no canonical identity.
    // They must still leave an unmatched white page, so fail closed to the
    // onboarding shell instead of silently returning an empty route witness.
    const canonicalUrl = canonicalH5RouteUrl(hashRoute) || INVALID_H5_ROUTE_FALLBACK;
    const comparableRawUrl = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
    const repairRetryDue = pendingCanonicalRouteRepair !== canonicalUrl
      || Date.now() - pendingCanonicalRouteRepairAt >= ROUTE_REPAIR_RETRY_MS;
    if (canonicalUrl !== comparableRawUrl && repairRetryDue) {
      pendingCanonicalRouteRepair = canonicalUrl;
      pendingCanonicalRouteRepairAt = Date.now();
      uni.reLaunch({
        url: canonicalUrl,
        fail: () => {
          if (pendingCanonicalRouteRepair === canonicalUrl) {
            pendingCanonicalRouteRepair = "";
            pendingCanonicalRouteRepairAt = 0;
          }
        },
      });
    } else if (canonicalUrl === comparableRawUrl) {
      pendingCanonicalRouteRepair = "";
      pendingCanonicalRouteRepairAt = 0;
    }
  }
  // #endif
  return normalizeRoute(route);
}

function bootstrapAccountSession() {
  if (accountSessionBootstrapped) return;
  // Bind the account-cloud snapshot and claim this carrier's session for an
  // already-authenticated account. Multi-carrier sessions coexist; forced
  // revokes are resolved by checkSession() once routes are ready.
  const auth = useAuth();
  // 🔴 一次性资格只在**真的认领了**之后才消耗(独立审计 2026-08-07 P2-1):
  // 原先在函数首行就置位,于是未认证时路过一次也把资格烧掉 —— 守卫每拍补认领这条
  // 自愈路径对该标签的余生失效(登出态被踢到引导页那一拍正好烧掉它)。
  // 今天没有可达危害(两个认证入口各自 claim),但那是巧合,不是设计。
  if (auth.isAuthenticated) {
    const key = auth.email || auth.accountId || "default";
    const app = useApp();
    const session = useSession();
    const serverSession = remoteApiEnabled ? sessionVault.read() : null;
    // completeSignIn already binds every account-scoped store and claims this
    // carrier before it navigates away from Login. The periodic guard can reach
    // this one-shot bootstrap a moment later. Rebinding again would clear the
    // catalog/phase stores after Store has loaded them, leaving the page stuck
    // in "loading" with no later onShow to restart the request.
    const completedRemoteLoginAlreadyBound = remoteApiEnabled
      && !!serverSession
      && auth.accountId === `user:${serverSession.user.userId}`
      && app.accountKey === auth.accountId
      && session.accountKey === auth.accountId
      && session.status === "active";
    if (completedRemoteLoginAlreadyBound) {
      accountSessionBootstrapped = true;
      return;
    }
    accountSessionBootstrapped = true;
    app.bindAccount(key);
    rebindAccountScopedStores(key);
    // rebindAccountScopedStores clears profile state in server mode to prevent
    // one browser account leaking into another. On a post-login reLaunch this
    // bootstrap runs after completeSignIn, so restore only the in-memory,
    // authenticated server response — never localStorage or a seed profile.
    if (serverSession && auth.accountId === `user:${serverSession.user.userId}`) {
      app.projectServerIdentity(serverSession.user);
      useProfile().projectServerIdentity(serverSession.user);
    }
    const restored = session.resumeOrClaim(key);
    if (restored.status === "kicked" || restored.status === "logged-out") {
      const reason = restored.status === "kicked" ? "kicked" : "logged-out";
      stopBusinessLoops();
      app.interruptAllTasks(reason);
      session.kick(reason);
      // 踢出兜底:清全部账号级数据内存残留(P2-8 纵深防御)。app + 28 store 归 default。
      app.bindAccount("default");
      rebindAccountScopedStores("default");
      uni.reLaunch({ url: "/pages/session/kicked" });
    }
  }
}

function scheduleAccountSessionBootstrap(attempt = 0) {
  const route = readCurrentRoute();
  if (isStaticReviewRoute(route)) {
    stopBusinessLoops();
    return;
  }
  if (!route) {
    if (attempt < 10) setTimeout(() => scheduleAccountSessionBootstrap(attempt + 1), 50);
    return;
  }
  bootstrapAccountSession();
}

/** 路由任务的 memo 任务名 —— 显式映射不做动态 key 拼接:三个 id 是穷举的,
 *  动态拼 `t_${id}` 会在任务表增删时静默拿到 undefined,而 memo 是要落进账本的。 */
const QUEST_ROUTE_MEMO_TASK: Record<QuestTaskId, (t: ReturnType<typeof useT>["value"]) => string> = {
  bind_bank_card: (t) => t.quest.t_bind_bank_card,
  visit_earn: (t) => t.quest.t_visit_earn,
  visit_store: (t) => t.quest.t_visit_store,
  view_product_roi: (t) => t.quest.t_view_product_roi,
  setup_profile: (t) => t.quest.t_setup_profile,
  invite_friend: (t) => t.quest.t_invite_friend,
};

function questIdForRoute(route: string): QuestTaskId | null {
  if (route === "pages/earn/earn") return "visit_earn";
  if (route === "pages/store/store") return "visit_store";
  // Product detail page (store/detail). Excludes orders/checkout pages.
  if (route.startsWith("pages/store/detail")) return "view_product_roi";
  return null;
}

function checkQuestRoute() {
  const route = readCurrentRoute();
  const retiredRoute = resolveRetiredRoute(route);
  if (retiredRoute) {
    stopBusinessLoops();
    uni.reLaunch({ url: retiredRoute });
    return;
  }
  if (isStaticReviewRoute(route)) {
    lastQuestRoute = route;
    stopBusinessLoops();
    return;
  }
  if (checkAuthGuard()) return; // unauth → redirected; don't credit quests
  // 🔴 会话认领必须在这里补一枪 —— 同一根因的第二条腿(2026-08-07 实测,非推理):
  // scheduleAccountSessionBootstrap 在静态评审页落地时直接 return,而 bootstrapAccountSession
  // 是一次性的(accountSessionBootstrapped),于是这个标签**整个生命周期都没有 sessionId**;
  // session.validate() 首行「没有 sessionId 就算 active」→ 跨标签登出/运营吊销**永远踢不掉它**,
  // 哪怕守卫活着、哪怕早已走到业务页。落地页只是起点,不该决定本次加载的余生。
  // 认领本身幂等(内部 accountSessionBootstrapped 短路),补在这里每 tick 是零成本 no-op。
  // ⚠️ 事实更正(独立审计 2026-08-07 P2-1 实测):这一枪**不是只在业务页开**。
  // 上方只短路了静态评审页;checkAuthGuard 对**全部**白名单前缀(onboarding/login/
  // register/ref/tx/session)都返回 false,所以在这些页上同样会走到这里。这没问题
  // (认领是幂等的,未认证时不消耗一次性资格),但别照着旧注释的错误前提推理。
  bootstrapAccountSession();
  if (checkSession()) return; // evicted / needs recalibration → redirected
  // H5 站内路由不会重发 App.onShow。静态评审页会按安全边界停掉业务循环，
  // 所以离开评审页后必须由仍存活的守卫在这一拍重新校验并恢复；放在同路由短路前，
  // 才能覆盖「路由已经切回业务页、lastQuestRoute 也已更新」的时序。
  if (!ensureBusinessLoopsRunning()) return;
  if (route === lastQuestRoute) return; // only act on route change
  lastQuestRoute = route;
  const id = questIdForRoute(route);
  if (!id) return;
  if (remoteApiEnabled) {
    // Visiting a tracked screen is the H3 completion event. The server claim
    // decides eligibility and reward; the client never credits locally.
    if (!useQuest().isComplete(id)) void useQuest().claimRemote(id);
    return;
  }
  // 🔴 与领奖族同一套顺序:先发钱(幂等)→ 后消费资格(2026-08-04 独立验收指出 quest 族
  // 三处漏改)。原来先 markComplete 消费掉,发钱失败就 return —— 任务标记已置、奖归零,
  // 而 quest 是一次性的,再也拿不到。奖励从静态表查得到,顺序反得过来。
  const quest = useQuest();
  if (quest.isComplete(id)) return;
  const task = quest.QUEST_TASKS.find((tk) => tk.id === id);
  if (!task) return;
  const t = useT().value;
  // 🔴 路由任务奖励曾经是**裸 creditNex + 零账单**:钱每次都进、账单页永远查无此单
  // (不是失败路径才发作,是必然)。两道门都看不见它 —— 迁移棘轮只盯 bills.* 写入,
  // 接线门对 App.vue 只查文件里有没有收口点(里程碑那段已经提供了)。
  // 与 share.ts 的 invite_friend、wallet-cards-new 的 bind_bank_card 同族,现统一走收口点。
  const ref = `QST-${id}`; // 稳定 ref:任务一次性,带时间戳会让判重永不命中 = 假幂等
  const memo = fmt(t.quest.routeMemo, { task: QUEST_ROUTE_MEMO_TASK[id](t) });
  const drafts: ReceiptDraft[] = [];
  if (task.nexReward) drafts.push({ type: "bonus", symbol: "NEX", amount: task.nexReward, status: "posted", memo, ref });
  if (task.usdtReward) drafts.push({ type: "bonus", symbol: "USDT", amount: task.usdtReward, status: "posted", memo, ref });
  if (!drafts.length) return;
  if (postMoneyBillsOnce(drafts) !== "ok") return;
  if (!useQuest().markComplete(id).firstTime) return; // 消费失败:重试命中同 ref 不会再发
  toast.success(fmt(t.quest.routeToast, { n: task.nexReward }));
}

function startQuestWatch() {
  stopQuestWatch();
  // 播种置空,故意不预填当前页:quest 一次性 + 发钱/markComplete 幂等,重放无害;
  // 冷启深链落地页要记一次访问(112b9d0 以此作实证基线),预填会把这一次吞掉。
  lastQuestRoute = "";
  questTimer = setInterval(checkQuestRoute, QUEST_TICK_MS);
}
function stopQuestWatch() {
  if (questTimer) {
    clearInterval(questTimer);
    questTimer = undefined;
  }
}

function installBusinessLoopProbe(): void {
  if (!import.meta.env.DEV) return;
  const target = globalThis as unknown as {
    __nxBusinessLoopStatus?: () => Record<string, boolean | number>;
    __nxScheduleBusinessLoopTimeout?: (delayMs: number) => void;
    __nxBusinessLoopTimeoutRuns?: () => number;
  };
  target.__nxBusinessLoopStatus = () => {
    const app = useApp();
    const config = useConfig();
    return {
      running: businessLoopsRunning,
      earnings: tickTimer !== undefined,
      arrival: arrivalTimer !== undefined,
      trial: trialTimer !== undefined,
      order: orderTimer !== undefined,
      milestone: milestoneTimer !== undefined,
      pendingTimeouts: businessTimeouts.size,
      configSyncFailed: config.syncFailed,
      earningsToday: app.earnings.today,
      deviceEarningsToday: app.devices.reduce((sum, device) => sum + device.todayEarnings, 0),
      latestSettledAt: app.devices.reduce((latest, device) => Math.max(latest, device.lastSettledAt ?? 0), 0),
    };
  };
  target.__nxScheduleBusinessLoopTimeout = (delayMs) => {
    scheduleBusinessTimeout(() => { devBusinessTimeoutRuns += 1; }, delayMs);
  };
  target.__nxBusinessLoopTimeoutRuns = () => devBusinessTimeoutRuns;
}

// 🔴 守卫轮询(questTimer)**不属于**本函数 —— 它是安全装置,不是业务循环。
// 根因(2026-08-07 第三次同型):原先 stopQuestWatch() 在这里,于是「当前页不该跑业务」的
// 每一处判断(静态评审页 / 未认证 / 会话失效 / 冷启动引导)都会顺手把**全站唯一的**周期性
// 权限守卫一起关掉 —— 而恰恰是这些页面最需要它(它们正是未授权者能停留、并借以跳进业务页
// 的跳板)。叠加 H5 的 App 级 onShow 不随应用内跳转触发(只在整页加载 / 标签页重新可见时),
// 关掉就**没有任何重新武装的路径**,守卫在本次页面加载内永久死亡。
// 前两轮修的是「武装侧」(读取口归一 / onShow 无条件启动),没动「解除武装侧」,所以每次都只修好一半。
// 🔴 不变量:守卫只随前台/后台成对开关 —— onShow 起、onHide 停,其余任何时候都活着。
// 它在白名单页由自身前两行(checkAuthGuard/checkSession 的白名单短路)保持惰性,常开无业务副作用。
function stopBusinessLoops() {
  businessLoopsRunning = false;
  stopBusinessTimeouts();
  useDeposits().pauseMockEngine();
  pauseBehaviorAnalytics();
  stopTick();
  stopArrivalPoll();
  stopTrialPoll();
  stopOrderPoll();
  stopMilestonePoll();
}

function canRunBusinessLoops(): boolean {
  const route = readCurrentRoute();
  if (!route || isAuthWhitelisted(route)) return false;
  const auth = useAuth();
  if (!auth.isAuthenticated || !auth.onboardingComplete) return false;
  return useSession().validate() === "active";
}

function ensureBusinessLoopsAllowed(): boolean {
  if (checkAuthGuard()) {
    stopBusinessLoops();
    return false;
  }
  if (checkSession()) {
    stopBusinessLoops();
    return false;
  }
  if (!canRunBusinessLoops()) {
    stopBusinessLoops();
    return false;
  }
  return true;
}

/**
 * 业务循环的唯一启动出口。
 *
 * 守卫每秒都会调用本函数，因此必须先做授权/会话 fail-closed 判定，再用显式状态
 * 保证幂等；不能调用旧的 start* 族反复清空并重建定时器。恢复成功时先补一次
 * 离线结算与到账/账单对账，再启动周期任务，用户无需额外等 5 秒。
 */
function ensureBusinessLoopsRunning(): boolean {
  if (!ensureBusinessLoopsAllowed()) return false;
  if (businessLoopsRunning) return true;

  useApp().settle();
  advanceArrivalAndSettleBill();
  businessLoopsRunning = true;
  try {
    useDeposits().resumeMockEngine();
    startTick();
    startArrivalPoll();
    startTrialPoll();
    startOrderPoll();
    startMilestonePoll();
    startBehaviorAnalytics();
  } catch (error) {
    stopBusinessLoops();
    throw error;
  }
  return true;
}

onLaunch(() => {
  // 🔴 必须在下面任何 early return 之前挂:退役路由 / 静态评审页同样有自造按钮,
  // 晚一步挂 = 那些页面整页没有键盘可达性。
  // ⚠️ 2026-08-12 这行被一次并发合并冲掉过一次(平台层文件还在、门也在,唯独没人调用它,
  //    等于功能是死的)。门的 D 判据专门守这一行,别再删。
  installKeyboardActivation();
  // This checkout is the fixed 5174 local mock. Seed the reusable preview
  // identity before route guards run so cold-start paths never require sign-up.
  const previewAccount = provisionMockPreviewAccount();
  const auth = useAuth();
  if (!previewAccount.ok) {
    // Never fall back to auth.ts's demo-friendly default identity when the
    // named preview account cannot be made durable. Keep the app closed on the
    // login surface until browser storage is available again.
    auth.signOut();
    uni.reLaunch({ url: "/pages/login/login", fail: () => {} });
    return;
  }
  if (remoteApiEnabled) {
    setRemoteUnauthorizedHandler(() => {
      // Preserve only the non-secret trace long enough to choose the login explanation.
      const requiresServerSessionRecovery = pendingServerSessionRecovery
        || (!sessionVault.read() && hasServerAuthenticatedAccountTrace(auth));
      serverAuthenticatedAccountTraceAtBoot = false;
      pendingServerSessionRecovery = requiresServerSessionRecovery;
      sessionVault.clear();
      useSession().signOutSession();
      auth.signOut();
      stopBusinessLoops();
      const route = readCurrentRoute();
      if (route && !isAuthWhitelisted(route)) {
        uni.reLaunch({
          url: requiresServerSessionRecovery
            ? "/pages/login/login?notice=server-session-reload"
            : "/pages/onboarding/intro",
        });
      }
    });
  }
  configureBehaviorAnalyticsContext(() => ({
    enabled: remoteApiEnabled && auth.isAuthenticated && auth.onboardingComplete,
    subject: auth.accountId,
  }));
  installBusinessLoopProbe();
  void useConfig().load();
  void useGenesisConfig().refresh();
  if (remoteApiEnabled) {
    // Public server configuration is warmed at launch. Each store starts
    // empty/fail-closed, so a failed request cannot expose prototype values.
    void refreshEarnConfig().catch(() => undefined);
    void useMarket().syncRemote();
    // The server catalog is a USER-only resource. Clear any local compatibility
    // rows at startup, then let the authenticated Store entry fetch it; an
    // unauthenticated launch must not turn its expected 401 into a fake catalog
    // failure before the user has even signed in.
    prepareProductCatalog();
    if (canRefreshRemoteAccount(auth)) void useApp().refreshRemoteFleet();
  }
  // NexGrid defaults dark, but the persisted user choice drives H5 after launch.
  // `resolved` collapses the light/dark/system choice to the concrete theme
  // (system → OS scheme). Instantiating the store here also registers its live
  // OS-scheme listener for "system" mode.
  // #ifdef H5
  document.documentElement.setAttribute("data-theme", useTheme().resolved);
  // #endif
  const retiredRoute = resolveRetiredRoute(readCurrentRoute());
  if (retiredRoute) {
    stopBusinessLoops();
    uni.reLaunch({ url: retiredRoute, fail: () => {} });
    return;
  }
  if (isStaticReviewRoute(readCurrentRoute())) {
    stopBusinessLoops();
    return;
  }
  scheduleAccountSessionBootstrap();
});
onShow(() => {
  attachSessionWatch();
  // 🔴 守卫轮询必须无条件启动(2026-08-07 实景抓到的残留洞):冷启动那一拍守卫虽已看见
  // 未登录+业务页并发起 reLaunch,但首次导航还在进行中,那一枪会被吞掉;守卫返回「已跳转」
  // → onShow 提前收工 → 轮询没启动 → 再无第二枪,登出态照样停在业务页(与修复前同果)。
  // checkQuestRoute 每 tick 首两行就是 checkAuthGuard/checkSession —— 它本身就是自愈重试环;
  // 未登录/流程页上它短路在任何业务写入之前,常开无副作用。
  // 这里是守卫**唯一**的起点(停点唯一在 onHide),与 stopBusinessLoops 上方的不变量成对。
  startQuestWatch();
  if (canRefreshRemoteAccount(useAuth())) void useApp().refreshRemoteFleet();
  if (!ensureBusinessLoopsRunning()) return; // no business writes on auth/session flow pages
  void refreshEarningsReleaseStatus().catch(() => undefined);
});
onHide(() => {
  detachSessionWatch();
  stopBusinessLoops();
  // 守卫与前台成对:这里是它**唯一**的停点(见 stopBusinessLoops 上方的不变量)。
  // App 进后台没有页面可越权,onShow 回前台会重新武装。
  stopQuestWatch();
});
</script>

<style>
/* Global app surface — token-driven, dark by default. */
page {
  background-color: var(--v5-bg);
}
</style>
