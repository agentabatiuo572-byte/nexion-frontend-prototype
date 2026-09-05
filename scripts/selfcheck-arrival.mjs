#!/usr/bin/env node
// FEAT-WD01b 到账推进 · **行为**自检 — node 直跑:
//   node scripts/selfcheck-arrival.mjs
//
// 🔴 守的核心不变量:
//   1. **非 pass 路由永不自动到账**(人工审核 / 冻结的推进权在服务端与人工手上)
//   2. **补齐幂等**(关 App 三天再打开只推一次,不重复推进不重复记账)
//   3. **推进不碰钱**(金额 / 手续费一字不动 —— 钱在提交时已扣)
//   4. 坏配置的到账时效**回落到保守值**(不能算成 0 让单据一提交就显示已到账)
//
// 与 selfcheck-fastlane 同源方法论:测行为不测源码结构。词法哨兵追不上控制流。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { transformSync } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(path.join(root, "src", "store", "withdrawal-arrival-core.ts"), "utf8");
const { code } = transformSync(src, { loader: "ts", format: "esm" });
const core = await import("data:text/javascript;base64," + Buffer.from(code, "utf8").toString("base64"));
const {
  advanceArrival: advanceArrivalRaw,
  estimateArrivalAt, normalizeSlaHours, DEFAULT_PAYOUT_SLA_HOURS, occupiesWithdrawalSlot,
} = core;

/**
 * 2026-08-11:advanceArrival 多了第三个**必填**参数「谁是权威」——远端模式下
 * client 不许自推(单据是服务端签发的,判据却是设备墙钟,把手机时间往后拨就能
 * 让 App 宣布钱到了)。本文件下面几十条断言测的都是**本地权威**那一档的行为,
 * 故在这里统一补上默认值,原有断言一字不改;远端那档单独在第 0 节钉。
 */
const LOCAL_AUTHORITY = { serverAuthoritative: false };
const advanceArrival = (wd, now, ctx = LOCAL_AUTHORITY) => advanceArrivalRaw(wd, now, ctx);

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 一张正常的 pass 路由单:24h 后到账。 */
function ticket(over = {}) {
  return {
    id: "WD-20260731-1234",
    amount: 30,
    network: "USDT-TRC20",
    address: "TXaddr0000000000000000000000000000",
    fee: 1.3,
    status: "submitted",
    riskRoute: "pass",
    riskReasons: [],
    submittedAt: NOW - 25 * HOUR,
    estimatedCompletion: NOW - 1 * HOUR, // 已过点
    ...over,
  };
}

// ── 0. 🔴 远端权威时一步不推(2026-08-11)────────────────
// remote 是**默认档**(src/api/runtime-config.ts:没有 VITE_NEXGRID_API_MODE=mock 就是它),
// 所以这一节守的是产品实际跑的那一档。上面几十条「该推进」的断言反过来证明这道闸
// 不是把功能整个关掉 —— 只测这一节的话,删光函数体也能全绿。
for (const [label, over] of [
  ["到点的 pass 单", {}],
  ["离线三天的单", { estimatedCompletion: NOW - 3 * DAY }],
  ["主链中间态 processing", { status: "processing" }],
]) {
  check(`🔴 远端权威:「${label}」也不推进(状态归服务端,墙钟不是权威)`,
    advanceArrivalRaw(ticket(over), NOW, { serverAuthoritative: true }) === null);
}
check("🔴 漏传权威上下文 → 抛错,不静默按本地权威推进(必填参数的运行时那一面)", (() => {
  try { advanceArrivalRaw(ticket(), NOW); return false; } catch { return true; }
})());

// ── 1. 到点推进 ────────────────────────────────────────
{
  const r = advanceArrival(ticket(), NOW);
  check("到点的 pass 单被推进到 confirmed", r !== null && r.status === "confirmed", JSON.stringify(r?.status));
  check("记录实际到账时间 confirmedAt", r?.confirmedAt === NOW - 1 * HOUR, String(r?.confirmedAt));
  check("confirmedAt 取的是**到点时刻**不是打开 App 的时刻(补齐结果与打开时机无关)",
    r?.confirmedAt !== NOW && r?.confirmedAt === ticket().estimatedCompletion);
  check("🔴 推进不碰钱:金额与手续费一字不动", r?.amount === 30 && r?.fee === 1.3);
  check("推进返回**新对象**,不原地改(不可变)", (() => {
    const t = ticket();
    const out = advanceArrival(t, NOW);
    return t.status === "submitted" && out.status === "confirmed";
  })());
}

// ── 2. 未到点不推进 ────────────────────────────────────
{
  check("差 1 毫秒不推进", advanceArrival(ticket({ estimatedCompletion: NOW + 1 }), NOW) === null);
  check("正好到点就推进(边界含等于)",
    advanceArrival(ticket({ estimatedCompletion: NOW }), NOW)?.status === "confirmed");
  check("提交后 1 小时(时效 24h)不推进",
    advanceArrival(ticket({ submittedAt: NOW - HOUR, estimatedCompletion: NOW + 23 * HOUR }), NOW) === null);
}

// ── 3. 🔴 非 pass 路由永不自动推进 ─────────────────────
// 这是本自检的灵魂:任何让审核/冻结单自动到账的改法都会在这里变红。
for (const [label, route, status] of [
  ["人工审核", "manual", "review-pending"],
  ["延迟队列", "delay", "review-pending"],
  ["风控冻结", "freeze", "frozen"],
]) {
  // 三种攻击面各验一次:只改路由 / 只改状态 / 两者都是异常态
  check(`🔴 「${label}」路由过点也不自动推进`,
    advanceArrival(ticket({ riskRoute: route }), NOW) === null);
  check(`🔴 「${label}」状态(${status})过点也不自动推进`,
    advanceArrival(ticket({ riskRoute: route, status }), NOW) === null);
  check(`🔴 状态是 ${status} 但路由被写成 pass,仍不推进(状态是第二道闸)`,
    advanceArrival(ticket({ riskRoute: "pass", status }), NOW) === null);
}
for (const st of ["review-rejected", "address-invalid", "tx-failed", "refunded", "frozen"]) {
  check(`🔴 异常终态「${st}」不被推进成 confirmed`,
    advanceArrival(ticket({ status: st }), NOW) === null);
}

// ── 4. 🔴 幂等:补齐只发生一次 ─────────────────────────
{
  const t = ticket();
  const first = advanceArrival(t, NOW);
  check("🔴 已 confirmed 的单再推 → 返回 null(不写盘、不重复推进)",
    advanceArrival(first, NOW) === null);
  check("🔴 离线三天后打开,连推 5 次也只有第一次生效", (() => {
    let cur = ticket({ estimatedCompletion: NOW - 3 * DAY });
    let advanced = 0;
    for (let i = 0; i < 5; i++) {
      const next = advanceArrival(cur, NOW);
      if (next) { advanced++; cur = next; }
    }
    return advanced === 1 && cur.confirmedAt === NOW - 3 * DAY;
  })());
  check("🔴 补齐是一次到位,不按天数分次推进(离线 3 天与离线 1 小时结果同形)", (() => {
    const a = advanceArrival(ticket({ estimatedCompletion: NOW - 3 * DAY }), NOW);
    const b = advanceArrival(ticket({ estimatedCompletion: NOW - HOUR }), NOW);
    return a.status === "confirmed" && b.status === "confirmed";
  })());
}

// ── 5. 主链中间态也能补齐(demo 推到一半再关 App)──────
for (const st of ["review-passed", "processing", "sent"]) {
  check(`主链中间态「${st}」过点后补齐到 confirmed`,
    advanceArrival(ticket({ status: st }), NOW)?.status === "confirmed");
}

// ── 6. 空值与坏数据不炸 ────────────────────────────────
{
  check("null 单据返回 null", advanceArrival(null, NOW) === null);
  check("undefined 单据返回 null", advanceArrival(undefined, NOW) === null);
  check("estimatedCompletion 是 NaN → 不推进(坏数据不当成已到账)",
    advanceArrival(ticket({ estimatedCompletion: NaN }), NOW) === null);
  check("estimatedCompletion 缺失 → 不推进",
    advanceArrival(ticket({ estimatedCompletion: undefined }), NOW) === null);
  check("riskRoute 缺失(历史单)按 pass 处理 —— manual/delay 建单即 review-pending,"
    + "status 已挡住,这里放行才不会让老单卡死",
    advanceArrival(ticket({ riskRoute: undefined }), NOW)?.status === "confirmed");
}

// ── 7. 到账时效计算 ────────────────────────────────────
{
  const R = (over = {}) => ({ payoutSlaHours: 24, payoutReviewWindowDays: 0, largeAmountUsdt: 1000, ...over });
  check("正常单:到账 = 提交 + 24h", estimateArrivalAt(NOW, 30, R()) === NOW + 24 * HOUR);
  check("运营把时效调到 2h → 立刻反映", estimateArrivalAt(NOW, 30, R({ payoutSlaHours: 2 })) === NOW + 2 * HOUR);
  check("审查窗口 0 天 → 大额也只按时效", estimateArrivalAt(NOW, 5000, R()) === NOW + 24 * HOUR);
  check("🔴 大额 + 审查窗口 3 天 → 取更晚者(3 天 > 24h)",
    estimateArrivalAt(NOW, 5000, R({ payoutReviewWindowDays: 3 })) === NOW + 3 * DAY);
  check("小额不受审查窗口影响",
    estimateArrivalAt(NOW, 30, R({ payoutReviewWindowDays: 3 })) === NOW + 24 * HOUR);
  check("金额正好等于大额线 → 算命中(「≥」口径)",
    estimateArrivalAt(NOW, 1000, R({ payoutReviewWindowDays: 3 })) === NOW + 3 * DAY);
  check("🔴 取更晚者:时效 7 天 > 审查窗 3 天 时按时效",
    estimateArrivalAt(NOW, 5000, R({ payoutSlaHours: 168, payoutReviewWindowDays: 3 })) === NOW + 7 * DAY);
}

// ── 8. 🔴 坏配置回落方向保守 ───────────────────────────
// 回落到 0 会让所有单据「一提交就已到账」—— 把没付的钱说成已付,比多等一天危险得多。
{
  check("时效 0 → 回落 24h(不是 0)", normalizeSlaHours(0) === DEFAULT_PAYOUT_SLA_HOURS);
  check("时效负数 → 回落 24h", normalizeSlaHours(-5) === DEFAULT_PAYOUT_SLA_HOURS);
  check("时效 NaN → 回落 24h", normalizeSlaHours(NaN) === DEFAULT_PAYOUT_SLA_HOURS);
  check("时效 undefined → 回落 24h", normalizeSlaHours(undefined) === DEFAULT_PAYOUT_SLA_HOURS);
  // Infinity 不是「运营想设很大」而是坏值,按坏值回落 24h —— 夹到 168 等于替运营脑补意图。
  check("时效 Infinity → 当坏值回落 24h(不脑补成 7 天)", normalizeSlaHours(Infinity) === DEFAULT_PAYOUT_SLA_HOURS);
  check("时效 0.5h → 夹到下限 1h", normalizeSlaHours(0.5) === 1);
  check("时效 99999h → 夹到上限 168h", normalizeSlaHours(99999) === 168);
  check("🔴 坏配置下单据**不会**一提交就被判到账", (() => {
    const est = estimateArrivalAt(NOW, 30, { payoutSlaHours: 0, payoutReviewWindowDays: 0, largeAmountUsdt: 1000 });
    return advanceArrival(ticket({ submittedAt: NOW, estimatedCompletion: est }), NOW) === null;
  })());
  check("审查窗口是负数 → 忽略,不把到账时间提前",
    estimateArrivalAt(NOW, 5000, { payoutSlaHours: 24, payoutReviewWindowDays: -10, largeAmountUsdt: 1000 })
      === NOW + 24 * HOUR);
  check("大额线是 0/坏值 → 不把所有单当大额",
    estimateArrivalAt(NOW, 30, { payoutSlaHours: 24, payoutReviewWindowDays: 3, largeAmountUsdt: 0 })
      === NOW + 24 * HOUR);
}

// ── 9. 随机采样:不变量在连续值域上都成立 ──────────────
// 固定靶的教训(第 5 轮):写死的候选列表永远打不到列表之间与之外的值。
{
  let seed = 20260731;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const between = (lo, hi) => lo + rnd() * (hi - lo);
  const ROUTES = ["pass", "manual", "delay", "freeze"];
  const STATUSES = ["submitted", "review-pending", "review-passed", "processing", "sent", "confirmed", "frozen"];
  let vNonPass = 0, vIdem = 0, vMoney = 0, vEarly = 0, vSla = 0;
  for (let i = 0; i < 20000; i++) {
    const now = Math.floor(between(1.5e12, 2.1e12));
    const route = ROUTES[Math.floor(rnd() * ROUTES.length)];
    const status = STATUSES[Math.floor(rnd() * STATUSES.length)];
    const amount = between(0.01, 100000);
    const fee = between(0, 500);
    const est = Math.floor(now + between(-90 * DAY, 90 * DAY));
    const t = { ...ticket(), amount, fee, status, riskRoute: route, estimatedCompletion: est };
    const out = advanceArrival(t, now);
    if (route !== "pass" && out !== null) vNonPass++;
    if (est > now && out !== null) vEarly++;
    if (out) {
      if (out.amount !== amount || out.fee !== fee) vMoney++;
      if (advanceArrival(out, now) !== null) vIdem++;
    }
    // 到账时效:任意配置下,预计到账都不得早于提交时刻 + 1 小时下限
    const est2 = estimateArrivalAt(now, amount, {
      payoutSlaHours: between(-50, 300),
      payoutReviewWindowDays: between(-5, 30),
      largeAmountUsdt: between(0, 5000),
    });
    if (est2 < now + HOUR) vSla++;
  }
  check("🔴 [20000 随机样本] 非 pass 路由从未被推进", vNonPass === 0, `违例 ${vNonPass}`);
  check("🔴 [20000 随机样本] 未到点从未被推进", vEarly === 0, `违例 ${vEarly}`);
  check("🔴 [20000 随机样本] 推进从未改动金额或手续费", vMoney === 0, `违例 ${vMoney}`);
  check("🔴 [20000 随机样本] 推进结果再推一律 null(幂等)", vIdem === 0, `违例 ${vIdem}`);
  check("🔴 [20000 随机样本] 任意配置下预计到账都不早于提交 + 1h", vSla === 0, `违例 ${vSla}`);
}

// ── 10. 单槽占用判定(非终态即占用)────────────────────
// 🔴 由来:单槽闸原本复用「在途禁换绑」那份清单,那份**漏了 sent** ——
// sent 状态下再提一笔会把前一单整个顶掉,前一单的钱已扣、单据从此不可达、也永不推进。
// 判据改成「穷举终态再取反」:新增状态若忘记登记,自动按在途处理(失败方向保守)。
{
  for (const st of ["submitted", "review-pending", "review-passed", "processing", "sent", "frozen"]) {
    check(`🔴 「${st}」占着单据槽位,不许再提`, occupiesWithdrawalSlot(st) === true);
  }
  for (const st of ["confirmed", "review-rejected", "address-invalid", "tx-failed", "refunded"]) {
    check(`终态「${st}」不占槽位,可以再提`, occupiesWithdrawalSlot(st) === false);
  }
  check("没有单据时不占槽位", occupiesWithdrawalSlot(undefined) === false);
  check("🔴 未登记的新状态按在途处理(失败方向保守,不是放行)",
    occupiesWithdrawalSlot("some-future-status") === true);
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
