#!/usr/bin/env node
// FEAT-WD01a 小额免审快车道 · **行为**自检 — node 直跑:
//   node scripts/selfcheck-fastlane.mjs
//
// 🔴 守的核心不变量:**小额免审只免两道冷启动闸(首提必审 / 新地址 hold),
//    永不越过六道风控闸(换绑冻结 · 冻结簇 · 标记簇 · 风险分 · 共用地址 · 大额账龄)**。
//
// ⚠️ 本文件 2026-07-31 从「源码结构断言」整体改写为「行为断言」。原因值得留档:
// 结构版检查的是「代码长什么样」(fastLane 有没有和某个闸的关键词同行),
// 而不变量本身是「代码怎么执行」。独立验收连续攻破四种绕法,其中两种实测跑通真免闸:
//   · 别名洗白:const x = fastLane; 换个名字再去免风控闸
//   · 追加分支:阈值判定后加 `|| ...` 让快车道对任意金额生效
//   · 控制流搬迁:被 pin 的行一字不动,只把闸的**升级动作**挪进免审块 —— 最致命,
//     所有文本断言全绿而共用地址账户提 $30 从 manual 变成 pass
//   · 上游架空:把 rules 整个换成 {...rules, smallAmountThresholdUsd: 1e9}
// 词法检查永远追不上控制流。改测行为后,上述四种**全部会被抓到** ——
// 因为它们要成为漏洞就必须改变路由结果,而路由结果正是这里断言的东西。
// 反过来:不改变行为的改法本来就不是漏洞,不该报红。
// readdirSync 同属 2026-08-12 合并落下的一批:调用点在,导入没跟过来。
// 与 functionBody 同一个坏法 —— 运行到那一行才 ReferenceError,而**它后面的格子一格都不跑**。
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { transformSync } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/** Production .ts/.vue only; vitest.config.ts owns the .test.ts fixtures under src. */
const isProductionSource = (name) => /\.(ts|vue)$/.test(name) && !name.endsWith(".test.ts");
const walkSrc = (dir = path.join(root, "src")) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walkSrc(p) : (isProductionSource(e.name) ? [p] : []);
});
const src = readFileSync(path.join(root, "src", "store", "withdrawal-eligibility-core.ts"), "utf8");
const { code } = transformSync(src, { loader: "ts", format: "esm" });
const core = await import("data:text/javascript;base64," + Buffer.from(code, "utf8").toString("base64"));
// 🔴 测**端到端**入口 decideFromRawFacts(原始事实 → 路由),不是只测判定层。
// 第 3 轮复验教训:只测判定时,缝隙搬到了「取数/加工」那一层 ——
// 外壳对纯函数撒谎(恒传 false、只在小额时隐瞒共用地址)同样能真免闸而哨兵全绿。
// 现在加工也在 core 里,这里从原始事实喂进去,三层一起覆盖。
const { decideFromStores, decideFromRawFacts, isFastLane, platformDayIndex, nextDayResetAt, countWithdrawalsOnPlatformDay, isDailyLimitReached, isOverDailyCap, PLATFORM_UTC_OFFSET_HOURS } = core;

let pass = 0;
let fail = 0;
/** 各随机层的**实测**覆盖指标。汇总行打它,而不是打循环上界(族 B 的根治)。 */
const selfProof = {};
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

const NOW = 1_800_000_000_000;
check("production source scan excludes only Vitest test files, never test-named runtime consumers",
  !isProductionSource("withdrawal-eligibility.test.ts")
    && ["withdrawal-eligibility.ts", "new-consumer.vue", "test-wallet.ts", "wallet.spec.ts", "wallet.test.vue"].every(isProductionSource));
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** 干净新用户基线(原始事实形态):没提过现、地址是新绑的、风控全清。 */
function base(over = {}) {
  return {
    now: NOW,
    freezeUntil: undefined,
    clusterStatus: "clear",
    clusterScore: 0,
    freezeSuggestThreshold: 0.7,
    address: "TXaddr0000000000000000000000000000",
    addressSeenByOtherAccount: false,
    ownAddressFirstSeenAt: NOW - 1 * HOUR, // 刚绑 1 小时 → 仍在 24h hold 内
    newAddressHoldHours: 24,
    hasWithdrawn: false,
    bindingVerifiedAt: NOW - 30 * DAY,     // 绑定已满 7 天 → 大额闸不触发
    newAddressAgeDays: 7,
    largeAmountUsdt: 1000,
    requestedUsdt: 30,
    withdrawableUsdt: 100,
    smallAmountThresholdUsd: 50,
    minWithdrawableUsdt: 20,
    sameAddressRoute: "manual",
    firstWithdrawalManual: true,
    withdrawals: [],
    dailyWithdrawLimitCount: 0,
    ...over,
  };
}
// 🔴 入口必须与**生产同层**。第 5 轮复验的终极诊断:
// 「只要哨兵的入口比生产的入口低一层,那一层差额就永远是攻击面。」
// 生产走 decideFromStores,哨兵就必须也走它 —— 否则 toRawFacts 那层零覆盖。
function toSnapshot(f) {
  const hasAddr = f.address.trim().length > 0;
  const H = 'HASH-' + f.address.trim();
  return {
    now: f.now,
    binding: (f.freezeUntil === undefined && f.bindingVerifiedAt === undefined)
      ? undefined : { freezeUntil: f.freezeUntil, verifiedAt: f.bindingVerifiedAt },
    ownRecord: {
      hasWithdrawn: f.hasWithdrawn,
      withdrawAddresses: (hasAddr && f.ownAddressFirstSeenAt !== undefined)
        ? [{ hash: H, firstSeenAt: f.ownAddressFirstSeenAt }] : [],
    },
    allRecords: f.addressSeenByOtherAccount
      ? [{ accountKey: 'other', withdrawAddresses: [{ hash: H }] }] : [],
    accountKey: 'self',
    addressHash: hasAddr ? H : '',
    address: f.address,
    cluster: { status: f.clusterStatus, score: f.clusterScore },
    freezeSuggestThreshold: f.freezeSuggestThreshold,
    newAddressHoldHours: f.newAddressHoldHours,
    newAddressAgeDays: f.newAddressAgeDays,
    largeAmountUsdt: f.largeAmountUsdt,
    requestedUsdt: f.requestedUsdt,
    withdrawableUsdt: f.withdrawableUsdt,
    smallAmountThresholdUsd: f.smallAmountThresholdUsd,
    minWithdrawableUsdt: f.minWithdrawableUsdt,
    sameAddressRoute: f.sameAddressRoute,
    firstWithdrawalManual: f.firstWithdrawalManual,
    withdrawals: f.withdrawals,
    dailyWithdrawLimitCount: f.dailyWithdrawLimitCount,
  };
}
const run = (over) => decideFromStores(toSnapshot(base(over)));

// 🔴 多基线矩阵。第 3 轮复验教训:六道风控闸的固定靶原本全从**同一个**基线派生,
// 于是「把免权条件挂在该基线里恒定不变的维度上」就能全部穿过 ——
// 独立验收实测:挂在 hasWithdrawn 上(基线恒 false)可让冻结簇账户提现成功而 30/30 全绿。
// 现在每道闸都在多个基线变体上验一遍,恒定维度不再存在。
const BASELINES = [
  ["新用户", {}],
  ["老用户(提过现)", { hasWithdrawn: true }],
  ["余额充裕", { withdrawableUsdt: 5000 }],
  ["余额刚够", { withdrawableUsdt: 20 }],
  ["地址已过 hold", { ownAddressFirstSeenAt: NOW - 48 * HOUR }],
  ["同地址路由=delay", { sameAddressRoute: "delay" }],
  ["首提开关关闭", { firstWithdrawalManual: false }],
  ["小额线更高", { smallAmountThresholdUsd: 200, requestedUsdt: 150 }],
];

// ── 1. 快车道该生效时生效 ──────────────────────────────
{
  const r = run({});
  check("新用户提 $30(≤$50)→ 路由 pass(两道冷启动闸被免)", r.route === "pass", `实得 ${r.route}`);
  check("新用户提 $30 → 记下被免的两道闸",
    r.waivedGates.includes("new-address-hold") && r.waivedGates.includes("first-withdrawal-review"),
    JSON.stringify(r.waivedGates));
  check("新用户提 $30 → fastLaneApplied=true", r.fastLaneApplied === true);
  check("新用户提 $30 → canSubmit=true", r.canSubmit === true);
}

// ── 2. 快车道该失效时失效 ──────────────────────────────
{
  const r = run({ requestedUsdt: 80 });
  check("同一新用户提 $80(>$50)→ 路由 manual(不免审)", r.route === "manual", `实得 ${r.route}`);
  check("提 $80 → 理由含首提必审", r.riskReasons.includes("first-withdrawal-review"));
  check("提 $80 → waivedGates 为空", r.waivedGates.length === 0);
}
{
  // 🔴 fastLaneApplied 只表示「金额在小额线内」,和「有没有真免掉闸」是两回事。
  // 老用户(提过现)+ 地址已过 hold:两道冷启动闸本来就不会命中,免无可免。
  // 拿 fastLaneApplied 当「享受了免审」的判据渲染横幅,这里就会弹出一句空的「已免去:」。
  const r = run({ hasWithdrawn: true, ownAddressFirstSeenAt: NOW - 48 * HOUR });
  check("老用户 + 老地址提 $30 → fastLaneApplied=true 但 waivedGates 为空(判据不可混用)",
    r.fastLaneApplied === true && r.waivedGates.length === 0,
    `fastLane=${r.fastLaneApplied} waived=${JSON.stringify(r.waivedGates)}`);
}
{
  const r = run({ smallAmountThresholdUsd: 0 });
  check("小额线设 0(运营关闭)→ 快车道整体关闭,回落 manual", r.route === "manual" && !r.fastLaneApplied);
}
{
  check("金额未输入(undefined)不启用快车道 —— 防被当成 0 ≤ 阈值", isFastLane(undefined, 50) === false);
  check("金额 0 不启用", isFastLane(0, 50) === false);
  check("金额等于阈值算小额(「不超过此值」含等于)", isFastLane(50, 50) === true);
  check("金额略超阈值不算小额", isFastLane(50.01, 50) === false);
}

// ── 3. 🔴 六道风控闸:免审为真时**仍照常拦** ────────────
// 每条都把金额压在小额线内(fastLane 必为 true),再单独打开一道风控闸。
// 这是本自检的灵魂 —— 任何让免审越权的改法,都会在这里变红。
const RISK_CASES = [
  ["换绑冻结", { freezeUntil: NOW + 12 * HOUR }, "freeze", "rebind-freeze"],
  ["冻结簇", { clusterStatus: "frozen" }, "freeze", "frozen-cluster"],
  ["标记簇", { clusterStatus: "flagged" }, "manual", "flagged-cluster"],
  ["风险分 ≥0.7", { clusterScore: 0.7 }, "manual", "high-risk-score"],
  ["共用提现地址", { addressSeenByOtherAccount: true }, "manual", "shared-address"],
  // 大额闸:金额必须 ≥ 大额线,同时 ≤ 小额线才能让免审生效 → 抬高小额线制造重叠区
  ["大额账龄", { bindingVerifiedAt: NOW - 1 * DAY, requestedUsdt: 1500, smallAmountThresholdUsd: 2000 },
    "manual", "new-address-large-amount"],
];
for (const [label, over, wantRoute, wantReason] of RISK_CASES) {
  // 每道闸 × 每个基线都验一遍 —— 恒定维度不复存在,挂在任何维度上的免权都会被抓
  let allHeld = true;
  let allLogged = true;
  const misses = [];
  for (const [blLabel, blOver] of BASELINES) {
    const merged = { ...blOver, ...over };
    // 该基线本身若让免审失效(如金额超小额线),此组合无意义,跳过
    const probe = run(merged);
    if (!probe.fastLaneApplied) continue;
    // sameAddressRoute=delay 基线会把共用地址闸降级为 delay,期望值随之变
    const expectRoute =
      wantReason === "shared-address" && merged.sameAddressRoute === "delay" ? "delay" : wantRoute;
    if (probe.route !== expectRoute) { allHeld = false; misses.push(`${blLabel}:route=${probe.route}(期望${expectRoute})`); }
    if (!probe.riskReasons.includes(wantReason)) { allLogged = false; misses.push(`${blLabel}:理由缺失`); }
  }
  check(`🔴 风控闸「${label}」在小额免审生效时仍拦(跨 ${BASELINES.length} 个基线)`,
    allHeld, misses.join(" | "));
  check(`🔴 风控闸「${label}」的理由在所有基线下都被记录`, allLogged, misses.join(" | "));
}
{
  // 组合:多道风控闸同时命中,取最严
  const r = run({ clusterStatus: "frozen", addressSeenByOtherAccount: true });
  check("🔴 多闸同时命中取最严(冻结 > 人工)", r.route === "freeze", `实得 ${r.route}`);
}
{
  // 换绑冻结额外不变量:不建单不占资金
  const r = run({ freezeUntil: NOW + 12 * HOUR });
  check("🔴 换绑冻结时 canSubmit=false(不建单不占资金)", r.canSubmit === false);
}

// ── 4. 冷启动闸在非小额时正常工作(免审没把闸删掉)────────
{
  const r = run({ requestedUsdt: 80, hasWithdrawn: true, ownAddressFirstSeenAt: NOW - 1 * HOUR });
  check("老用户提 $80 + 新地址未过 hold → delay", r.route === "delay", `实得 ${r.route}`);
}
{
  const r = run({ requestedUsdt: 80, hasWithdrawn: true, ownAddressFirstSeenAt: NOW - 48 * HOUR });
  check("老用户提 $80 + 地址已过 hold + 风控干净 → pass", r.route === "pass", `实得 ${r.route}`);
}

// ── 5. 余额门 ────────────────────────────────────────
{
  const r = run({ withdrawableUsdt: 10 });
  check("可提余额低于最低提现额 → canSubmit=false", r.canSubmit === false);
}
{
  const r = run({ address: "   ", addressSeenByOtherAccount: true, ownAddressFirstSeenAt: undefined });
  check("地址未填时跳过地址相关两道闸(不误判)",
    !r.riskReasons.includes("shared-address") && !r.riskReasons.includes("new-address-hold"));
}

// ── 6. 🔴 随机取样(property-based):守「藏在任何维度上的隐藏条件」──────
//
// 第 4 轮复验教训:固定基线**再多也是有限的**,每个没被枚举到的维度都是一条缝。
// 独立验收实测 4 种全绿的真漏,全是「把免权挂在基线里恒定不变的维度上」:
//   N2 挂 newAddressHoldHours===24 · N3 挂 minWithdrawableUsdt===20
//   N4 挂 address.endsWith("0")   · N1 挂 getUTCHours()>=22  ← 时间炸弹,最狠
// N1 尤其说明问题:固定时钟的套件对 now 条件**天然失明**,加多少基线都没用。
//
// 改法:不再试图枚举维度,而是**每个维度都随机取样**。攻击者无法预知会抽到什么,
// 任何「在某组输入下才放行」的隐藏条件,只要被抽中一次就暴露。
// 不变量(与免审无关,恒成立):**任一风控闸命中 → 路由至少和该闸要求的一样严**。
/**
 * 🔴🔴 确定性随机源(2026-08-11 R2 结构性反思,族 B)。
 *
 * 原来用的是 `seed = (seed * 1103515245 + 12345) & 0x7fffffff` —— 这一句在 JS 里是**坏的**:
 * 乘积最大 2.37e18,远超双精度安全整数 9.01e15,低位在浮点乘法里被抹平。实测后果:
 * **序列周期只有约 10,466 次取样**(之后逐条精确重复),**低 8 位有 73.8% 恒为 0**。
 * 于是「20000 组随机取样」实际只有四百多组不同样本 —— PASS 行上的数字是**声明的循环次数**,
 * 不是**实际的覆盖**。R2 独立审计实测抓出,我复跑确认。
 *
 * 换成 mulberry32:全部运算走 `Math.imul` 与位运算,恒在 32 位内,不碰浮点精度;
 * 周期 2^32。同样是确定性的(同一种子同一序列),可复现性不变。
 */
function mulberry32(seedValue) {
  let a = seedValue | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED0 = 0x2f6e2b1;
const rnd = mulberry32(SEED0);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
// 🔴 连续取值。第 5 轮复验证明:pick([...]) 是**有限集合**,
// 「挂在清单之间的开区间」或「清单之外的值」上的免权,加到 2000 万组仍是 0 命中 ——
// 这是结构性盲区,不是概率问题。故数值维度一律用连续区间 + 少量边界值混采。
const between = (lo, hi) => lo + rnd() * (hi - lo);
const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1));
/** 一半连续、一半取边界值 —— 兼顾「区间内任意点」与「恰好等于某常量」两类条件 */
const mix = (lo, hi, edges) => (rnd() < 0.5 ? between(lo, hi) : pick(edges));
const mixInt = (lo, hi, edges) => (rnd() < 0.5 ? intBetween(lo, hi) : pick(edges));
const ROUTE_RANK = { pass: 0, delay: 1, manual: 2, freeze: 3, reject: 4 };
/** 理由的规范次序:六道风控闸在前(先说风险),两道冷启动闸垫后(再说保守拦截)。 */
const REASON_ORDER = [
  'rebind-freeze', 'frozen-cluster', 'flagged-cluster', 'high-risk-score',
  'shared-address', 'new-address-large-amount', 'new-address-hold', 'first-withdrawal-review',
];

let violations = [];
const sampleFingerprints = new Set();
const SAMPLES = 20000;
for (let i = 0; i < SAMPLES; i++) {
  const threshold = rnd() < 0.15 ? 0 : mix(1, 2000, [20, 50, 200, 1000]);
  // now 先算出来:下面的提现单时间戳要相对它取(同一组样本里时钟与单据必须同一个基准)
  const f0now = Math.floor(rnd() * 4_000_000_000_000) + 1_000_000_000_000;
  const f = {
    // now 随机跨全天 + 跨月,直接打掉时间炸弹这一类
    now: f0now,
    clusterStatus: pick(["clear", "watch", "flagged", "frozen", "released"]),
    clusterScore: mix(0, 1, [0, 0.5, 0.7, 0.9, 1]),
    freezeSuggestThreshold: mix(0.3, 1, [0.5, 0.7, 0.9]),
    address: pick(["TXabc123", "TXdef450", "0xFEED9", "   ", ""]),
    addressSeenByOtherAccount: rnd() < 0.5,
    newAddressHoldHours: mixInt(0, 96, [1, 12, 24, 48, 72]),
    hasWithdrawn: rnd() < 0.5,
    newAddressAgeDays: mixInt(0, 60, [1, 7, 30]),
    largeAmountUsdt: mix(1, 10000, [100, 1000, 5000]),
    requestedUsdt: rnd() < 0.1 ? undefined : mix(0, 6000, [0, 1, 30, 50, 80, 1000]),
    withdrawableUsdt: mix(0, 6000, [0, 20, 100, 5000]),
    smallAmountThresholdUsd: threshold,
    minWithdrawableUsdt: mix(0, 200, [10, 20, 75]),
    sameAddressRoute: pick(["delay", "manual", "freeze"]),
    firstWithdrawalManual: rnd() < 0.5,
    // 🔴 这两行一度是**死字段**:数据结构从「落盘计数器」换成「提现单列表」时我漏改了这里,
    //    `withdrawCounter` 早已没人读(toSnapshot 读的是 withdrawals),而 limit 恒 0 = 恒不限制。
    //    于是这两万组随机取样对日限**一格都没跑**,字段名却留着,读起来像已覆盖 ——
    //    「哨兵假绿」最难发现的那一种(R1 独立审计抓出)。现在两者都随机化,并入 must 列表。
    withdrawals: Array.from({ length: mixInt(0, 9, [0, 1, 2, 5]) }, () => ({
      submittedAt: rnd() < 0.5 ? f0now : f0now - mixInt(1, 5, [1, 2]) * DAY,
    })),
    // 上限域取到 12:服务端契约(parsePolicy)只要求 ≥1 的整数、**无上界**,
    // 域取太窄会让「上限大于某个数就失效」这类破坏天然测不到(R2 实测 1..4 时 `<6` 全绿)。
    // 列表深度这一面交给 §7⑤ 的 property 层(那边 0..300),这里保持小而快。
    dailyWithdrawLimitCount: rnd() < 0.2 ? 0 : mixInt(1, 12, [1, 2, 3, 10]),
  };
  f.freezeUntil = pick([undefined, f.now - 1000, f.now + 3600_000]);
  f.bindingVerifiedAt = pick([undefined, f.now - 1000, f.now - 40 * DAY]);
  f.ownAddressFirstSeenAt = pick([undefined, f.now - 1000, f.now - 100 * DAY]);

  const r = decideFromStores(toSnapshot(f));
  const hasAddr = f.address.trim().length > 0;
  const rank = ROUTE_RANK[r.route];

  // 逐条风控闸:命中则路由必须至少同等严格 —— 与是否免审**无关**
  const must = [];
  if (f.freezeUntil !== undefined && f.now < f.freezeUntil) must.push(["rebind-freeze", "freeze"]);
  if (f.clusterStatus === "frozen") must.push(["frozen-cluster", "freeze"]);
  if (f.clusterStatus === "flagged") must.push(["flagged-cluster", "manual"]);
  if (f.clusterScore >= f.freezeSuggestThreshold) must.push(["high-risk-score", "manual"]);
  if (hasAddr && f.addressSeenByOtherAccount) must.push(["shared-address", f.sameAddressRoute]);
  if (
    f.requestedUsdt !== undefined && f.bindingVerifiedAt !== undefined &&
    f.now - f.bindingVerifiedAt < f.newAddressAgeDays * DAY && f.requestedUsdt >= f.largeAmountUsdt
  ) must.push(["new-address-large-amount", "manual"]);

  for (const [reason, minRoute] of must) {
    if (rank < ROUTE_RANK[minRoute]) {
      violations.push(`#${i} 闸「${reason}」命中却只落 ${r.route}(至少应 ${minRoute}) fastLane=${r.fastLaneApplied}`);
    }
    if (!r.riskReasons.includes(reason)) {
      violations.push(`#${i} 闸「${reason}」命中却没记理由`);
    }
  }
  // 🔴 理由顺序:断言恒为规范序列的**子序列**(不是逐场景固定数组比对 ——
  // 那种每加一个新 reason 就崩一片,还诱使人直接改期望值)。
  // 它是用户可见文案 + 随单落盘,两次重构里已静默漂移过两回而四道机器门全绿。
  let ci = 0;
  for (const rr of r.riskReasons) {
    const at = REASON_ORDER.indexOf(rr, ci);
    if (at < 0) {
      violations.push(`#${i} 理由顺序偏离规范序列: ${JSON.stringify(r.riskReasons)}`);
      break;
    }
    ci = at + 1;
  }
  // 免审只许免这两道,不许出现第三个名字
  for (const g of r.waivedGates) {
    if (g !== "new-address-hold" && g !== "first-withdrawal-review") {
      violations.push(`#${i} 免掉了不该免的闸「${g}」`);
    }
  }
  // 没走快车道时不许有任何免闸记录
  if (!r.fastLaneApplied && r.waivedGates.length > 0) {
    violations.push(`#${i} 未走快车道却记了免闸 ${JSON.stringify(r.waivedGates)}`);
  }
  // 🔴 日限并入 must:上限 >0 且今日笔数够,就必须拦;不够就必须不拦。
  // 独立算一遍今日笔数(不调被测函数),这一层才真的在验日限而不是空转。
  const dayOf = (t) => Math.floor((t + PLATFORM_UTC_OFFSET_HOURS * 3600 * 1000) / DAY);
  const todayRows = f.withdrawals.filter((w) => dayOf(w.submittedAt) === dayOf(f.now)).length;
  const wantReached = f.dailyWithdrawLimitCount > 0 && todayRows >= f.dailyWithdrawLimitCount;
  if (r.dailyLimitReached !== wantReached) {
    violations.push(`#${i} 日限判定错:今日 ${todayRows} 笔 / 上限 ${f.dailyWithdrawLimitCount} → 实得 ${r.dailyLimitReached}`);
  }
  if (wantReached && r.canSubmit) {
    violations.push(`#${i} 日限已达却仍 canSubmit`);
  }
  // 指纹:量**实际覆盖**。旧发生器退化时,这个数会从两万塌到几百而循环次数纹丝不动。
  sampleFingerprints.add(`${r.route}|${r.fastLaneApplied ? 1 : 0}|${r.waivedGates.length}|${r.riskReasons.length}|${r.dailyLimitReached ? 1 : 0}|${todayRows}|${f.dailyWithdrawLimitCount}`);
  if (violations.length > 6) break;
}
selfProof.s6 = { rounds: SAMPLES, fingerprints: sampleFingerprints.size };
// 🔴🔴 判据里带上**实测指纹数**下限:光有「跑了 20000 轮」证明不了覆盖 ——
// R2 实测旧发生器周期只有 ~10,466 次取样,两万轮里只有四百多组不同样本,而 PASS 行照报两万。
check(`🔴 随机取样 ${SAMPLES} 组(实测 ${sampleFingerprints.size} 种不同结果指纹):任一风控闸命中必不被免审绕过`,
  violations.length === 0 && sampleFingerprints.size >= 400,
  violations.slice(0, 6).join(" | ") || `指纹只有 ${sampleFingerprints.size} 种,随机源可能已退化`);

// ── 7. FEAT-WD01b 每日提现笔数上限(计数源 = 提现单列表)──────────
// 不变量:今日笔数 = 提现单列表里 submittedAt 落在**平台日**(越南 UTC+7)内的行数;
// 达上限 → canSubmit=false(**不建单不扣款**,与换绑冻结同档);跨日自动归零;
// 上限 ≤0 / 非法 视为未配置 → 不限制(坏配置、后端不可达都不该把提现锁死)。
//
// 🔴 本节是 z1 审计 P0-1 的回归门。旧实现把笔数存在一个独立计数器里,由建单前的
//    claimWithdrawSlot 递增;c37e642 把建单让渡服务端事务后那个递增点随本地扣款链被删,
//    计数器从此无人写 → 读出恒空 → todayWithdrawCount 恒 0 → dailyLimitReached 恒 false,
//    而页面仍在渲染「每日最多 N 笔」并留着置灰分支(四处承诺全不可达)。
//    改成从单据现算后,「提交成功」与「计数 +1」是**同一件事**,没有第二份状态可以掉队。
{
  const RESET = nextDayResetAt(NOW);       // 下一个平台日 0 点(越南当地),即今日的右开边界
  const rows = (...ts) => ts.map((t) => ({ submittedAt: t }));
  const withRows = (list, limit) =>
    decideFromStores({ ...toSnapshot(base({})), withdrawals: list, dailyWithdrawLimitCount: limit });

  // ① 计数本身
  check("今日 1 笔 → 数出 1", countWithdrawalsOnPlatformDay(rows(NOW), NOW) === 1);
  check("今日 3 笔 → 数出 3", countWithdrawalsOnPlatformDay(rows(NOW, NOW, NOW), NOW) === 3);
  check("空列表 / 没有列表 → 0",
    countWithdrawalsOnPlatformDay([], NOW) === 0
      && countWithdrawalsOnPlatformDay(null, NOW) === 0
      && countWithdrawalsOnPlatformDay(undefined, NOW) === 0);
  // 🔴 异常在本条里接住,不许冒泡:红测实证,去掉被测的那道边界校验时 for...of 会真的抛,
  // 未捕获的话整个文件当场中止 —— 本条之后的几十条断言一条都不会跑,别的回归被顺带藏掉
  // (「fail-fast 把后续门静默停摆」那族坑)。接住 = 干净地报这一条红,其余照跑。
  check("🔴 列表不是数组(存储被写坏)→ 0,不抛异常把整页判定带崩",
    (() => {
      try {
        return countWithdrawalsOnPlatformDay("nope", NOW) === 0
          && countWithdrawalsOnPlatformDay({ length: 9 }, NOW) === 0;
      } catch { return false; }
    })());
  check("🔴 submittedAt 是坏值的行被跳过,不算进今日(算多的方向是把用户锁死)",
    countWithdrawalsOnPlatformDay([{ submittedAt: NaN }, { submittedAt: Infinity }, { submittedAt: undefined }, null], NOW) === 0);
  // ⚠️ 这条**记录现状,不是保护**(措辞要诚实,否则读的人会以为这一面被守着):
  // 时间戳若是字符串 / ISO / Date,当日单会被静默计 0 —— 日限于是再次失效,与本包修的
  // 缺陷同型同样无声。加 typeof/isFinite 消毒**救不了**(消毒的结果同样是 0,红测两次实证
  // 加与不加没有任何断言变化)。真正的解在契约层:HANDOFF U-7。
  // 留这条靶是为了:后端契约一旦改成字符串,谁来动这里时能一眼看见这个已知代价。
  check("⚠️ [现状记录·非保护] 时间戳为字符串 / ISO / Date 时静默计 0(契约风险见 HANDOFF U-7)",
    countWithdrawalsOnPlatformDay([{ submittedAt: String(NOW) }], NOW) === 0
      && countWithdrawalsOnPlatformDay([{ submittedAt: new Date(NOW).toISOString() }], NOW) === 0
      // 混排时真数字那行必须照常算到 —— 这一半是真判据
      && countWithdrawalsOnPlatformDay([{ submittedAt: String(NOW) }, { submittedAt: NOW }], NOW) === 1);
  check("坏行与好行混在一起:只数好行",
    countWithdrawalsOnPlatformDay([{ submittedAt: NaN }, { submittedAt: NOW }, null, { submittedAt: NOW }], NOW) === 2);

  // ② 平台日边界(UTC+7)—— 四个固定靶钉死今日的左闭右开区间
  check("🔴 边界:平台日最后 1 毫秒提交的单**算今天**",
    countWithdrawalsOnPlatformDay(rows(RESET - 1), NOW) === 1);
  check("🔴 边界:平台日 0 点整提交的单**算明天**(不占今日额度)",
    countWithdrawalsOnPlatformDay(rows(RESET), NOW) === 0);
  check("🔴 边界:今日第 1 毫秒提交的单算今天",
    countWithdrawalsOnPlatformDay(rows(RESET - DAY), NOW) === 1);
  check("🔴 边界:昨日最后 1 毫秒提交的单算昨天",
    countWithdrawalsOnPlatformDay(rows(RESET - DAY - 1), NOW) === 0);
  check("🔴 边界是**平台**日不是 UTC 日(把偏移当 0 会数错这一格)",
    (() => {
      // 越南当地 0 点的那一刻,UTC 还停在前一天 17:00 —— 若判定按 UTC 切日,
      // 这两个时刻会被判成同一天,本条即红。
      const utcMidnightToday = Math.floor(NOW / DAY) * DAY;
      return PLATFORM_UTC_OFFSET_HOURS !== 0
        && platformDayIndex(RESET - 1) !== platformDayIndex(RESET)
        && platformDayIndex(utcMidnightToday) === platformDayIndex(utcMidnightToday + PLATFORM_UTC_OFFSET_HOURS * HOUR - 1);
    })());
  check("下次重置时间 = 下一个平台日的起点",
    nextDayResetAt(NOW) === (platformDayIndex(NOW) + 1) * DAY - PLATFORM_UTC_OFFSET_HOURS * HOUR);
  check("平台时区偏移 = UTC+7(越南)", PLATFORM_UTC_OFFSET_HOURS === 7);
  check("🔴 [随机] 任意时刻:重置点属于次日、且落在未来 24h 内(不会算成过去或跳一天)",
    (() => {
      let seed = 777, bad = 0;
      for (let i = 0; i < 5000; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const ts = 1.5e12 + (seed / 0x7fffffff) * 6e11;
        const reset = nextDayResetAt(ts);
        if (platformDayIndex(reset) !== platformDayIndex(ts) + 1) bad++;
        if (reset <= ts || reset - ts > DAY) bad++;
      }
      return bad === 0;
    })());

  // ③ 端到端判定:恰好到达上限的固定靶
  check("🔴 上限 1 / 今日 0 笔 → 可提", withRows([], 1).canSubmit === true);
  check("🔴 上限 1 / 今日**恰好** 1 笔 → 不可提(不建单不扣款)",
    withRows(rows(NOW), 1).canSubmit === false && withRows(rows(NOW), 1).dailyLimitReached === true);
  check("🔴 上限 3 / 今日 2 笔 → 可提(差一格时不许提前拦)",
    withRows(rows(NOW, NOW), 3).canSubmit === true && withRows(rows(NOW, NOW), 3).dailyLimitReached === false);
  check("🔴 上限 3 / 今日**恰好** 3 笔 → 不可提",
    withRows(rows(NOW, NOW, NOW), 3).canSubmit === false);
  check("超出上限也判不可提(列表被塞多也拦得住)",
    withRows(rows(NOW, NOW, NOW, NOW), 3).canSubmit === false);
  check("🔴 运营把上限从 1 调到 3 → 今日已 1 笔仍可提(限额跟着服务端 policy 实时走)",
    withRows(rows(NOW), 3).canSubmit === true);
  check("🔴 昨天的单不占今天的额度",
    withRows(rows(RESET - DAY - 1, RESET - DAY - 2), 1).canSubmit === true);
  check("🔴 边界固定靶:上限 1 + 昨日最后 1 毫秒 1 笔 → 可提;换成今日最后 1 毫秒 → 不可提",
    withRows(rows(RESET - DAY - 1), 1).canSubmit === true
      && withRows(rows(RESET - 1), 1).canSubmit === false);
  check("🔴 上限 ≤0 / 非法(未配置、policy 取不到)→ 不限制,不把提现锁死",
    withRows(rows(NOW, NOW, NOW), 0).canSubmit === true
      && withRows(rows(NOW, NOW, NOW), -1).canSubmit === true
      && withRows(rows(NOW, NOW, NOW), NaN).canSubmit === true
      && withRows(rows(NOW, NOW, NOW), undefined).canSubmit === true);
  check("🔴 上限被下发成字符串 \"1\" 也不误判成已达上限(判据只认有限数)",
    withRows(rows(NOW), "1").canSubmit === true);
  check("🔴 达上限时不改路由(只挡提交)—— 路由仍反映真实风控裁决",
    withRows(rows(NOW), 1).route === withRows([], 1).route);

  // 🔴🔴 主人 2026-08-11 拍板的口径:**已驳回 / 已退款 / 上链失败的单照样占当天一笔**
  //     (「每日 N 笔」数的是发起次数,不是成功次数)。
  //     此前这条规则零机器覆盖:靶子只造 {submittedAt},任何 `status !== "refunded"` 式过滤
  //     对 undefined 恒真 → 加了过滤门也全绿,而「提一笔让它被驳回再提」正是绕限额最直接的
  //     动机(R1 独立审计点名)。所以靶子必须**带上 status 字段**,过滤器一加就红。
  {
    const withStatus = (...ss) => ss.map((st) => ({ submittedAt: NOW, status: st, id: `WD-${st}`, amount: 25 }));
    check("🔴🔴 已驳回 / 已退款 / 上链失败的单**照样占额度**(靶子带 status,加状态过滤即红)",
      countWithdrawalsOnPlatformDay(withStatus("review-rejected", "refunded", "tx-failed"), NOW) === 3
        && withRows(withStatus("review-rejected", "refunded", "tx-failed"), 3).dailyLimitReached === true
        && withRows(withStatus("refunded"), 1).dailyLimitReached === true);
    check("🔴 已到账 / 在途的单同样各占一笔(不看状态,只看是不是今天发起的)",
      countWithdrawalsOnPlatformDay(withStatus("confirmed", "submitted", "review-pending"), NOW) === 3);
  }

  // ④ 两个页面同一判据:追踪页走 isDailyLimitReached,提现页走 decideFromStores,
  //    两者必须永远同答。历史上它们各挂一份实现,配置被下发成字符串时结论相反 ——
  //    追踪页说能提、提现页说不能提。
  check("🔴 [随机] 追踪页判据与提现页判定恒等(两页不许各说各话)",
    (() => {
      let seed = 20260811, bad = 0;
      for (let i = 0; i < 2000; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const n = seed % 5;
        const limit = (seed >> 5) % 4;
        const list = Array.from({ length: n }, (_, k) => ({
          submittedAt: (seed >> 9) % 2 === 0 ? NOW : RESET - DAY - 1 - k,
        }));
        if (isDailyLimitReached(list, limit, NOW) !== withRows(list, limit).dailyLimitReached) bad++;
      }
      return bad === 0;
    })());
  // 🔴 上面这条只能证明「没有第二份实现」,证明不了「这一份是对的」——两边是同一个组合,
  //    实现里的任何缺陷两边同时错,恒等永远成立。真正的对错交给下面的 G1。
  check("🔴 判据只有一份:isDailyLimitReached 与 isOverDailyCap∘countWithdrawalsOnPlatformDay 同答",
    isDailyLimitReached(rows(NOW), 1, NOW) === isOverDailyCap(countWithdrawalsOnPlatformDay(rows(NOW), NOW), 1));

  // ⑤ 🔴🔴 G1:对照**独立参考实现**的 property 测试。
  //
  // 为什么必须有这一条(2026-08-11 R1 结构性反思,见 docs/changes/2026-08-11-z2-R1-*.md):
  // 上面那些固定靶的覆盖面 = **我的想象力**,而缺陷恰恰住在想象力之外。实测五组注入
  // 全部逃过上面 26 条断言:① 列表超 4 笔就返回 0 ② 只数前 4 笔(分页语义)
  // ③ 每天 22 点后返回 0(时间炸弹)—— 因为靶子列表最长 4 行、时间戳同质、时钟写死一个常量。
  //
  // 参考实现**独立重写**过滤与计数(只共用平台时区偏移这一个常量,不共用循环与判据),
  // 随机跑长列表 × 随机时钟 × 混排时间戳。被测实现只要在**任何**一组上与它不等就红,
  // 不需要我事先想到那种破坏形态。
  check("🔴🔴 [property] 随机长列表 × 随机时钟:计数恒等于独立参考实现(靶子覆盖面不再等于我的想象力)",
    (() => {
      const OFF = PLATFORM_UTC_OFFSET_HOURS * 3600 * 1000;
      const refDay = (t) => Math.floor((t + OFF) / DAY);
      const refCount = (list, now) => {
        let n = 0;
        for (let i = 0; i < list.length; i++) {
          const t = list[i] && list[i].submittedAt;
          if (typeof t === "number" && refDay(t) === refDay(now)) n++;
        }
        return n;
      };
      const nextRand = mulberry32(20260811);
      let bad = 0, maxLen = 0, sawToday = 0, reachedCases = 0, notReachedCases = 0;
      const fingerprints = new Set();
      for (let round = 0; round < 3000; round++) {
        // 随机时钟:跨全天各时段、跨月、跨年,平台日边界随机落在任意位置
        const now = 1.5e12 + nextRand() * 6e11;
        const reset = nextDayResetAt(now);
        // 🔴 长度域必须**超出实现里任何常量**。旧版上界恰好 50,于是
        // `if (rows.length > 50) return 0` 与 `rows.slice(0, 50)` 两种破坏全绿(R2 实测)——
        // 生成器的上界就是盲区的下界。这里 0..150,并在下面每 200 轮塞一次 300 笔的极值。
        const len = round % 200 === 7 ? 300 : Math.floor(nextRand() * 151);
        const list = [];
        for (let i = 0; i < len; i++) {
          const pick = Math.floor(nextRand() * 8);
          // 混排:今日/昨日/明日/边界前后/远古/未来/重复时刻,单条列表里同时出现
          const at = pick === 0 ? now
            : pick === 1 ? reset - 1                       // 今日最后 1ms
            : pick === 2 ? reset                           // 明日第 1ms
            : pick === 3 ? reset - DAY                     // 今日第 1ms
            : pick === 4 ? reset - DAY - 1                 // 昨日最后 1ms
            : pick === 5 ? now - Math.floor(nextRand() * 30) * DAY
            : pick === 6 ? now + Math.floor(nextRand() * 5) * DAY
            : now - Math.floor(nextRand() * 6e10);
          list.push({ submittedAt: at });
        }
        maxLen = Math.max(maxLen, len);
        const want = refCount(list, now);
        if (want > 0) sawToday++;
        // 指纹:同一组 (今日笔数, 列表长度, 平台日序) 算一种。用来量**实际覆盖**,
        // 而不是拿循环上界冒充覆盖 —— 旧发生器退化时正是这个数会塌下来。
        fingerprints.add(`${want}|${len}|${refDay(now) % 997}`);
        if (countWithdrawalsOnPlatformDay(list, now) !== want) { bad++; continue; }
        // 顺带把端到端判定也对上:上限 >0 时,拦不拦必须与「参考计数 ≥ 上限」一致。
        // 🔴 上限域必须超出服务端契约允许的范围:parsePolicy 只要求 ≥1 的整数、**无上界**,
        //    旧版只取 1..4,于是 `limitCount < 6` 这种破坏全绿(R2 实测)。这里 1..60。
        const limit = 1 + Math.floor(nextRand() * 60);
        const decided = decideFromStores({
          ...toSnapshot(base({ now })), now, withdrawals: list, dailyWithdrawLimitCount: limit,
        }).dailyLimitReached;
        if (decided !== (want >= limit)) bad++;
        if (want >= limit) reachedCases++; else notReachedCases++;
      }
      // 🔴🔴 样本自证:报出去的必须是**实测**的覆盖,不是循环上界。
      //    旧版三条阈值(maxLen>4 / sawToday>200)离实测值 12-14 倍,生成器退化 90% 仍绿;
      //    而当时生成器**确实**在退化(周期 ~10,466)。现在:
      //      · 指纹数下限贴实测(退化立刻击穿);
      //      · 长度必须真的超过实现里任何常量;
      //      · 「拦」与「不拦」两侧都必须真的各跑过几百次(只跑单侧等于半条门)。
      selfProof.g1 = { fingerprints: fingerprints.size, maxLen, sawToday, reachedCases, notReachedCases };
      return bad === 0 && fingerprints.size >= 1200 && maxLen >= 150
        && sawToday > 2000 && reachedCases > 300 && notReachedCases > 300;
    })(), JSON.stringify(selfProof.g1));
}

/**
 * 取 `const x = computed(` 起的完整函数体 —— **括号配对**,不用 indexOf 找 `);`。
 * 找字面 `);` 会被内层 `fmt(..., { ... })` 提前截断,判据落在半截代码上红绿都不可信
 * (2026-08-01 哨兵自审点名的「解析器脆性」族)。
 */
/** 剥掉注释再做**反向**断言 —— 历史说明里往往会提到被禁的那个名字,不剥就被自己的注释命中假红。 */
/**
 * 🔴 G2(2026-08-11 R1 结构性反思):剥到**行尾注释**与 `<!-- -->`,且**正反两侧都必须用它**。
 *
 * 旧版只剥整行 `//` 与块注释,于是两种哄绿实测都过:
 *  ① 把判据行整段注释掉、另写死一个值 —— 正向 includes 仍在注释里找到那串字面量;
 *  ② 判据串挪到**行尾注释**里(`limitCount: 0, // limitCount: policy...`)—— 同上。
 * 注释既能伪造存在、也能伪造违规,两个方向都得剥,而且要剥干净。
 *
 * ⚠️ 行尾 `//` 的剥法用了「行内不在引号里」的近似:先按引号切段,只在引号外找 `//`。
 * 判据文件里没有含 `//` 的字符串字面量(URL 都写在注释里),这个近似够用;
 * 若将来出现,这里会**多剥**(倾向假红),方向安全。
 */
function stripComments(s) {
  const block = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
  const html = new RegExp("<!--[\\s\\S]*?-->", "g");
  return s.replace(block, "").replace(html, "").split(/\r?\n/).map((line) => {
    let out = "", quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        out += c;
        if (c === "\\") { if (i + 1 < line.length) { out += line[++i]; } continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { quote = c; out += c; continue; }
      if (c === "/" && line[i + 1] === "/") break; // 引号外的 // 起,整行余下都是注释
      out += c;
    }
    return out;
  }).join("\n");
}
function balancedBody(src, from) {
  let depth = 0, started = false;
  for (let k = from; k < src.length; k++) {
    const c = src[k];
    if (c === "(" || c === "{") { depth++; started = true; }
    else if (c === ")" || c === "}") { depth--; if (started && depth === 0) return src.slice(from, k + 1); }
  }
  return null;
}

// 🔴 按**字面开头**定位一个函数并抠出它的平衡体。2026-08-12 补:三个调用点(858/881/886)
// 一直在调它,而本文件从来没有过这个定义 —— 合并时把调用带过来了、把 helper 落下了。
// 后果不是那三格判红,是 `ReferenceError` 让**整个脚本从第 890 行起一格都不跑**,
// 而 verify.sh 只报「selfcheck-fastlane 有断言失败」,把「脚本根本崩了」盖住。
//
// 与 selfcheck-business-loop-liveness.mjs 里的同名函数**不是同一个契约**:那个收函数名、
// 找不到就 assert.fail;这里收字面开头(调用点传的是 "async function submitWithdrawal("
// 这种整串),找不到返回 null —— 调用点清一色 `if (!body) return false`,即
// **定位不到目标 ⇒ 判红**,不静默放行。
function functionBody(src, opener) {
  const at = src.indexOf(opener);
  if (at === -1) return null;
  const brace = src.indexOf("{", at + opener.length);
  if (brace === -1) return null;
  return balancedBody(src, brace);
}
// ── 9. 🔴 接线门:判定守得再严,没接上也是零 ────────────────
// 独立验收 F3 实证:把计数写入摘掉,三个哨兵 + type-check 全绿而限额完全失效。
// 判定层是纯函数(上面已行为覆盖),「有没有被调用」只能在源码层守 —— 但守的是
// **精确表达式**,不是关键词,且每条都有红测(改坏必红)。
{
  const readSrc = (rel) => readFileSync(path.join(root, rel), "utf8");
  const appSrc = readSrc("src/store/app.ts");
  const elgSrc = readSrc("src/store/withdrawal-eligibility.ts");

  // 🗑🗑 【C·判据已废弃】submitWithdrawal 的**本地占额度 + 本地扣款重放链** 8 格
  //     (2026-08-13 判决;这 8 格自 c37e642「建单让渡服务端」起就已失效,只因本文件
  //      当时崩在 ReferenceError 上、一格都没跑,没人看见它们是红的)。
  //
  // 它们钉的实现整段不存在了,而**每一条不变量都另有落点**,逐条交底:
  //  ① claimWithdrawSlot / releaseWithdrawSlot:模块已删(全仓 0 处)。同族的
  //     selfcheck-money-cas.mjs 早在 2026-08-11 就显式退役了同名两节(见其 ①② 段注释),
  //     理由与这里一致:留着就是绿着守死代码。
  //     「并发提交不许重复吃掉同一份日额度」现在是**两层**:客户端这一层的义务是
  //     「不许再有第二份计数」—— 由本文件仍在跑的「今日笔数赋值点集合等式(全 src 恰 2 处)」
  //     强制,再加一个本地 claim 反而**会把那道门弄红**;真正的原子占用在服务端
  //     (POST /api/withdrawals 拒 DAILY_LIMIT,withdraw-idempotency-contract.test.mjs 建模,
  //     页面 isDailyLimitRejection + replay-triage「首次撞日限必须退役」接住)。
  //     残余窗口(本地预检通过 → 服务端应答之间)照 feedback_quota_claim_before_create 的
  //     口径由服务端兜底,客户端无法也不该再占一次。
  //  ② 本地扣款链(applyDebit / settledUser / committedUser / 3 次重放循环):
  //     整体搬到 `applyWithdrawalDebit(wd)`,由提现页在建单成功后调用。
  //     · 「不拿旧快照回写」:新签名**只收单据、不收 UserState**,结构上没有旧快照可回写,
  //       函数体内读 user.value(app.ts:1362)。签名由本文件仍在跑的三格
  //       `applyWithdrawalDebit / refundWithdrawalDebit` 门钉着。
  //     · 「差分推导不是绝对快照」:差分下沉到持久层 —— account-cloud 的
  //       ADDITIVE_NUMBER_KEYS 按 `disk + (next − base)` 合并 usdtBalance。
  //       接手方是 scripts/selfcheck-money-rollback.mjs 的 ⑤「两笔扣款都落盘,磁盘余额
  //       = 100 − 30 − 30 = 40(并发扣款各记各的)」—— **行为级**,两个 store 实例共享一份
  //       序列化 storage 跑真扣款,比原来那条字面判据强。实测:把 "usdtBalance" 从
  //       ADDITIVE_NUMBER_KEYS 里拿掉,该格立刻红(全 scripts 扫一遍只有它红)。
  //       ⚠️ 别指望 spec4-account-cloud-merge-check.mjs —— 它测的是基线复用,
  //       同一变异下**照绿**(本次判决时实跑证伪过,免得下一个人也按名字想当然)。
  //     · 「落盘失败回滚内存」:本文件仍在跑的
  //       `${fn} 落盘失败必须回滚内存并报假` 那格钉着 adoptAccountSnapshot(previousSnapshot)。
  //     · 「收敛判据是幂等键不是单槽」:幂等键判据留在 applyWithdrawalDebit(`wd-debit:` + 读盘判重),
  //       由 `${fn} 幂等要查**磁盘**快照` 那格守;单槽已删,由「单槽产品限制已删除」那格守。
  //  ③ 🔴 「落盘失败…不许返回成功单号」这一条被**刻意反转**,不是丢失:
  //     单据是服务端已经建好、已经扣过钱的既成事实,现在落盘失败要把它**放回内存**
  //     并照常交还调用方(app.ts submitWithdrawal 的 `if (!persistAccountSnapshot())` 段,
  //     理由与 R2/R3 独立审计复现记录都写在那里)。留着旧断言 = 用门反锁一个已推翻的修法。
  // 🔴 列表级问题不得读 latestWithdrawal —— 模型改成列表后,消费者若还用「只问最新一笔」
  //    的老问法去问列表级问题,在「一张在途 + 一张更新的已到账」组合下全部答错:
  //    账单结算结错单 / 钱包入口整行消失 / 换绑闸被静默架空(独立验收实测三条全中,
  //    且**全部逃过了 362 道机器门** —— 缺的正是这条守新不变量的门)。
  {
    const appVueSrc = readSrc("src/App.vue");
    const walletSrc = readSrc("src/pages/me/wallet.vue");
    const trackSrc = readSrc("src/pages/me/wallet-withdraw-tracking.vue");
    // 包 E(2026-08-05):换址闸从旧配对存储迁到 payout-address(地址直管)。
    // 判据**先于机制改写**指向新 store —— 新文件缺席时 readSrc 直接抛错 = 红,
    // 绝不允许「旧 store 删了、哨兵扫不到就当没违规」的静默假绿。
    const payoutSrc = readSrc("src/store/payout-address.ts");
    check("🔴 到账推进返回**推进了哪几笔**,账单按单号逐个结算(不问「最新一笔是谁」)",
      appSrc.includes("function advanceWithdrawalArrival(): string[] {")
        && appVueSrc.includes("const advanced = app.advanceWithdrawalArrival();")
        && /for \(const ref of advanced\)/.test(appVueSrc)
        && !/const ref = app\.latestWithdrawal\?\.id;/.test(appVueSrc));
    // 🔴 结算失败的补救必须能**跨刷新**。原实现是模块级内存 Set「记下来下次重试」——
    // 刷新一次就没了,而推进本身幂等(推过的单不再出现),那笔单永远不会再被结算:
    // 追踪页说已到账、账单页说处理中,永久裂脑。根治是**别记**:从现有数据推出待办
    // (单据已终态 + 账单行没跟上 = 待办),刷新 / 换设备 / 隔一周回来都能自愈。
    // 🔴 正反两侧都要剥注释:正向查「有没有真的调用」时,`// reconcileBills();` 也含这个子串,
    // 把调用整行注释掉照样绿(红测实证);反向查「有没有残留旧写法」时,历史说明里会提到那个名字。
    // 注释既能伪造存在、也能伪造违规 —— 两个方向都得剥。
    const appVueCode = stripComments(appVueSrc);
    check("🔴 账单对账从数据推导,不靠内存里的重试台账(内存 Set 刷新即丢 → 永久裂脑)",
      appVueCode.includes("function reconcileBills()")
        && appVueCode.includes("reconcileBills();")
        && !appVueCode.includes("pendingBillSettle"));
    // 远端提现的服务端事务同时负责余额预留、费用/NEX、订单和账本。
    // 旧门曾要求页面在成功后调用 applyWithdrawalDebit，并在 runtime 里验证本地账单；
    // 那套断言与 D5 真实边界相反：它会鼓励客户端二次扣款/伪造账单。这里钉真正的
    // 负向契约，并把服务端账单读回留给 withdraw-bill-runtime 的行为门。
    const appCode = stripComments(appSrc);
    check("🔴 提现失败终态:退款与置账单失败成对完成,且幂等",
      appCode.includes("function refundFailedWithdrawals(): string[] {")
        && appCode.includes("if (refundWithdrawalDebit(wd)) done.push(wd.id);")
        && appVueCode.includes('for (const id of app.refundFailedWithdrawals()) bills.settleByRef(id, "failed");'));
    // 🔴 下面两条单独列,不并进上面那个合取:它们是 runtime 门**覆盖不到**的那半边 ——
    // withdraw-bill-runtime.mjs 只在 mock 模式跑(verify [2.5] 强制),而 mock 下
    // creditRewardBucketOnce 照常工作,把腿改回去 runtime 门仍然全绿,红的是 remote 下真实用户的钱。
    // 扣款腿同理:给它加一句 `if (remoteApiEnabled) return false;`,mock 下的 runtime 门也照绿,
    // 而 remote(唯一建得出提现单的模式)下 z5 修的原缺陷原样复活。所以两条腿都要静态守。
    // 🔴 能力上界(独立复核实跑证伪出来的,写下来免得下一个人高估这三条):
    //   它们钉的是「字面量在不在」,不是「它的结果被消费」。仍能绕过的两种写法:
    //   ① 把 `remoteApiEnabled` 换成别名函数(如 `apiIsRemote()`)—— 正则扫不到;
    //   ② 把 `readAccountSnapshot(...)` 写成空转调用、判重仍只查内存;
    //      或把回滚两行留在死分支里。
    //   真正守「结果被消费」的是 runtime 门(withdraw-bill-runtime.mjs ⑥⑦,行为级),
    //   但它只在 mock 模式跑 —— 两道门是分工:静态守 remote-only 的形状,runtime 守 mock 下的行为。
    //   两边都不覆盖的那一格(remote 下的真实行为)本仓目前无门,已登记进
    //   docs/changes/2026-08-11-z5-out-of-scope-findings.md 的 H 项。
    // 🔴 2026-08-16 重锚 —— 结掉 withdraw-bill-runtime.mjs 头注点名的那笔悬账
    //    (「selfcheck-fastlane 另有三格…与 4c32a50 直接对立,那笔账在别处结」)。
    //    4c32a50 把提现的余额权威搬去了服务端:applyWithdrawalDebit 首行成了
    //    `if (remoteApiEnabled) return false;`,提现页也不再调它,改为建单成功后重拉服务端余额。
    //    旧判据「两条腿都不受 API 模式影响」守的是**已经不存在的客户端扣款架构** ——
    //    它红了三格,却一条真问题都没指出,而且每个看到红的人都要重跑一遍同样的调查。
    //    权威依据(逐条回源 + 运行时实证,remote 模式载真 store、服务端余额可控):
    //      · app.ts:760 `usdtBalance: fleet.walletUsdt` —— 余额由舰队端点投影,服务端持有;
    //      · wallet-withdraw.vue 建单成功后 `await app.refreshRemoteFleet()` 重读;
    //      · 实测服务端 1000 → 本地 1000;服务端扣到 700 → 重拉 → 本地 700;
    //        此间 applyWithdrawalDebit 不动本地余额并如实回 false。
    //    所以改成**按页面实际接的那条腿分流**,与 withdraw-bill-runtime.mjs ⑥⑦ 同一范式:
    //    判据从页面源码读、不写死方向 —— 哪条架构赢,门自动跟着走,不必回来改。
    // 🔴 剥注释再判:被删掉的调用会在页面的历史说明里被反复提到(本页就有两处),
    //    读原文会判成「还接着」。
    const withdrawPageCode = stripComments(readSrc("src/pages/me/wallet-withdraw.vue"));
    const PAGE_DEBITS_LOCALLY = withdrawPageCode.includes("app.applyWithdrawalDebit(wd)");
    // 🔴 远端档标志的**等价类**,从 runtime.ts 解析出来 —— 不手写名字。
    //    手写的那一刻它就只是个字符串,而实现随时能换个同义词绕过去,且绕过去的方式恰好是**报绿**。
    //    正式 App 的远端档可直接钉成字面量 true；旧分支也可能仍由 `mode !== "mock"` 派生。
    //    解析面为空 = 判据失效,由下面的 `REMOTE_RAIL.length > 0` fail-closed 判红。
    const REMOTE_RAIL = [...readSrc("src/api/runtime.ts")
      .matchAll(/export const (\w+) = (?:apiRuntimeConfig\.mode !== "mock"|true);/g)].map((m) => m[1]);
    // 「这条腿被远端档闸挡住了吗」——钉**正向定型串** `if (<flag>) return`,不用词元正则:
    // 词元式对「守卫被取反」和「只剩装饰性提及」双双判绿(P-104),而这里两种都要抓。
    const railGated = (code) => REMOTE_RAIL.some((flag) => code.includes(`if (${flag}) return`));
    // 扣款腿的函数体单独切一份:退款腿那格要拿它做**同档**比较,而循环里的 `body` 是当轮那条腿的。
    // 切法与循环内逐字同形(含 fail-closed:切不出来即空串,下游判据据此判红)。
    const debitLegBody = (() => {
      const sig = "function applyWithdrawalDebit(wd: Withdrawal): boolean {";
      const at = appCode.indexOf(sig);
      const end = at < 0 ? -1 : appCode.indexOf("\n  }", at);
      return at >= 0 && end > at ? appCode.slice(at, end) : "";
    })();
    for (const fn of ["applyWithdrawalDebit", "refundWithdrawalDebit"]) {
      const signature = `function ${fn}(wd: Withdrawal): boolean {`;
      const at = appCode.indexOf(signature);
      const end = at < 0 ? -1 : appCode.indexOf("\n  }", at);
      // 🔴 fail-closed:签名找不到、或切不出函数体(indexOf 回 -1)一律判红。
      // 上一版写成 `slice(0, body.indexOf(...) + 4)`,-1 时切出 `"fun"` 三个字符 → 正则恒不命中
      // → 判据恒真(独立审计实测:函数体单行化后含 remoteApiEnabled 仍判 true)。
      const body = at >= 0 && end > at ? appCode.slice(at, end) : "";
      // 🔴 连**调用方**一起扫。独立复核实跑证伪:把 `if (remoteApiEnabled) return false;`
      // 从函数体挪进调用方 refundFailedWithdrawals,退款腿在 remote 下整体死掉,而只扫函数体的
      // 判据照绿 —— 早退挪个位置就绕过去了,判据必须覆盖「这条腿实际会不会执行」的整段路径。
      const callerAt = appCode.indexOf("function refundFailedWithdrawals(): string[] {");
      const callerEnd = callerAt < 0 ? -1 : appCode.indexOf("\n  }", callerAt);
      const callerBody = callerAt >= 0 && callerEnd > callerAt ? appCode.slice(callerAt, callerEnd) : "";
      if (PAGE_DEBITS_LOCALLY) {
        // 页面接的是本地扣款腿 → 余额由客户端维持,两条腿都不许在 remote 里 no-op。
        check(`🔴 ${fn} **不受 API 模式影响**(页面接的是本地扣款腿,它不能在 remote no-op)`,
          !!body && !!callerBody && !/remoteApiEnabled/.test(body) && !/remoteApiEnabled/.test(callerBody));
      } else if (fn === "applyWithdrawalDebit") {
        // 服务端持有余额 → 扣款腿**必须**被模式守卫挡住,否则与服务端同一笔事务双扣。
        // 🔴 钉**定型串**不用词元正则:判据方向一翻,词元式对「守卫被取反」判绿
        //    (`if (!remoteApiEnabled) return false;` 照样含 remoteApiEnabled)——
        //    这正是 2026-08-16 在同一个函数上栽过的那一跤,不重蹈。
        check(`🔴 ${fn} 必须被模式守卫挡住(服务端已在同一事务扣款,本地再扣 = 双扣)`,
          !!body && body.includes("if (remoteApiEnabled) return false;"));
      } else {
        // 🔴🔴【2026-08-16 别名假绿修正】上一版这格写的是「退款腿**保持模式无关**」,
        //    并警告「别顺手加一道会把 mock 轨退款打死的闸」—— 可那道闸**早就在了**:
        //    refundFailedWithdrawals 首行就是 `if (fundsServerEnabled) return [];`,
        //    而 runtime.ts 里 fundsServerEnabled 与 remoteApiEnabled **同为** `mode !== "mock"`。
        //    判据只认 `remoteApiEnabled` 这一个字面量,认不出同义别名,于是在
        //    「退款腿实际已被服务端档整条关掉」的情况下**一路报绿** ——
        //    正是本文件上面那句「能力上界①:换成别名函数就扫不到」一字不差地兑现。
        //
        //    修法**不是**把闸拆掉:服务端持有余额时扣与退都归服务端(app.ts 头注同口径),
        //    两条腿同档关闭是对的。要修的是判据 —— 让它如实描述架构,并把原注释担心的
        //    那件事**真正钉住**(原判据只是嘴上说,守不到):
        //      ① 与扣款腿**同档** —— 一开一关 = 扣了不退(丢钱)/ 没扣却退(印钞),两向同一格接住;
        //      ② 闸必须是远端档标志的**正向定型串** —— `if (true) return []` 或取反形
        //         `if (!fundsServerEnabled)` 都会把 **mock 轨**的退款打死(= 原注释的担心),
        //         定型串一并挡住,而词元正则对这两种都瞎;
        //      ③ 「没扣过就没得退」的前置还在 —— 它才是 remote 下不凭空造钱的真防线(上一版的贡献,保留)。
        check(`🔴 ${fn} 与扣款腿**同档**(标志按等价类解析,别名也认),且「没扣过就没得退」前置还在`,
          !!body && !!callerBody && REMOTE_RAIL.length > 0
            && railGated(body + callerBody) === railGated(debitLegBody)
            && body.includes("if (!currentUser.appliedRewardKeys?.[debitKey] && !storedKeys?.[debitKey]) return false;"),
          `远端档标志=${JSON.stringify(REMOTE_RAIL)} 退款腿被闸=${railGated(body + callerBody)} 扣款腿被闸=${railGated(debitLegBody)}`);
      }
      // 🔴 落盘失败必须回滚内存并报假。删掉这两行(退回「改了内存就当成功」),
      // money-receipt / withdrawfee / runtime 门**全部照绿** —— 它们的原语名单里没有这两个新函数。
      check(`🔴 ${fn} 落盘失败必须回滚内存并报假(否则刷新即回退,用户眼里钱凭空变化)`,
        !!body && /adoptAccountSnapshot\(previousSnapshot\);\s*return false;/.test(body.replace(/\s+/g, " ")));
      // 🔴 幂等判据必须**复读磁盘**,不能只查内存:内存必然陈旧(全仓无跨标签页 storage 监听),
      // 而 usdtBalance 按增量累加合并 —— 只查内存时两个标签页的 5s 对账会各退一次(实测退两倍)。
      check(`🔴 ${fn} 幂等要查**磁盘**快照(只查内存挡不住另一个标签页再动一次钱)`,
        !!body && /readAccountSnapshot\(accountKey\.value\)/.test(body));
    }
    // 🔴 接线门:判定对 ≠ 接上了。把提现页那一行调用删掉,上面全部静态判据照样绿,
    // 而 runtime 门在 mock 下也测不出 remote 的行为 —— 调用点必须自己被 pin 住。
    // 2026-08-16 重锚:同样按实际接线分流(理由见上面那段大注释)。
    if (PAGE_DEBITS_LOCALLY) {
      check("🔴 接线:提现建单成功后**真的调**了扣款(删掉调用行,其余判据全绿也拦不住)",
        withdrawPageCode.includes("app.applyWithdrawalDebit(wd)"));
    } else {
      // 🔴🔴 本轮唯一真正的覆盖漏洞:服务端持有余额时,「建单成功后必须重拉服务端余额」
      //   这条不变量**全仓一道门都没有**(实测:把那一行删掉,tsc / verify 449 格照样全绿,
      //   而用户提现成功后余额会停在旧数字直到下次重载 —— 还能照着旧数字接着提)。
      //   withdraw-bill-runtime ⑥ 守的是「不许影子扣款」(别多扣),守不到「必须重拉」(别不减)。
      //   两条是相反方向的漏,各守各的。
      // 🔴 判据切到 handleSubmit 函数体内:全文 includes 会被别处的同名调用哄绿(2026-08-17 接手合并实测:
      //    abandonPendingAttempt 里也有一句 await app.refreshRemoteFleet(),删掉建单成功后那句,全文 includes 照绿,
      //    withdraw-rail-alias 红测「建单成功后不重拉服务端余额」当场抓出这格无牙)。
      check("🔴 接线:服务端持有余额时,建单成功后**必须重拉服务端余额**(不拉 = 余额停在旧数字)",
        (functionBody(withdrawPageCode, "async function handleSubmit(") ?? "").includes("await app.refreshRemoteFleet();"));
    }
    // 服务端持有远端余额、订单与账本权威；同时保留更直接的负向接线门，
    // 防止页面或 store 在新分支重新引入本地扣款/账单伪造。
    const submitBody = functionBody(appSrc, "async function submitWithdrawal(");
    const pageSubmitBody = functionBody(readSrc("src/pages/me/wallet-withdraw.vue"), "async function handleSubmit(");
    check("🔴 远端提现提交不在客户端扣 USDT/NEX", !!submitBody && !!pageSubmitBody
      && !/(?:applyWithdrawalDebit|debitBalance|debitNex)\s*\(/.test(submitBody)
      && !/(?:applyWithdrawalDebit|debitBalance|debitNex)\s*\(/.test(pageSubmitBody));
    const billsCode = stripComments(readSrc("src/store/bills.ts"));
    check("🔴 远端账单只消费服务端投影，不由提现页面直接 add/伪造", !!pageSubmitBody
      && !/(?:bills\.)?(?:add|addMany|addManyForAccountOnce|postMoneyBill)\s*\(/.test(pageSubmitBody)
      && billsCode.includes("if (fundsServerEnabled) return null"));
    // 🔴🔴 扣款的**调用点集合等式** —— 上面两支都只看提现页,看不见**别的文件**里的第二个减记者。
    //    实测(2026-08-16,主线 b3b53d1):往 App.vue 对账里塞一句 `app.applyWithdrawalDebit(wd);`,
    //    fastlane 117 格、tsc、verify 全绿 —— 而「谁减记余额」这件事已经失控。
    //    这不是假想:同一段代码正下方那条 🗑 记着,2026-08-13 真的有人在 App.vue 对账里加过
    //    「扣款补扣格」,被 R1 独立审计**整格否决**(立论前提错 + z5 明令禁止无条件遍历补扣)。
    //    实现退役了,**禁令却没留下任何门** —— 下一个人照着同样的直觉再写一遍,没有一道门会拦。
    //  为什么第二个调用点是资金缺陷(不只是「不干净」):
    //    · 它写扣款幂等键,而退款腿的「没扣过就没得退」正是按这个键判 —— 键被凭空置位,
    //      失败终态时就会退一笔本客户端从没扣过的钱;
    //    · 它可以挂在对账循环上(5s 一拍)、重试里、别的页面里,时机完全不可控,
    //      而提现页那一处是有冻结账号 snap 保护的,别处没有。
    //  判据是**集合等式**不是「不许出现」:页面接了本地扣款腿时它就该有一处(且只在提现页),
    //  没接时一处都不许有 —— 与上面两支同一个分流,哪条架构赢都不必回来改。
    //  🔴 扫描面必须自证非空:没接本地腿时**期望就是空集**,于是「扫不到」与「没违规」
    //     产出同一个绿 —— 这一格若不自带扫描面证据,walkSrc 一坏它就变成永久的假绿。
    //     (日限那格也守 walkSrc,但守的是它自己那次调用;这里被改成扫别的目录时它不会红。)
    //  🔴🔴 扫的是**裸标识符**,不是 `.applyWithdrawalDebit(` 这种「调用写法」。按轴自查时实测出两个假绿面:
    //     ① **间接引用**:`const debitFn = app.applyWithdrawalDebit; debitFn(wd);` —— 缺陷实体与直接调用
    //        **完全相同**(第二个减记者、照写扣款幂等键),而带左括号的判据一个字都扫不到,全绿;
    //     ② **改名**:函数一改名,带括号的串恒不命中 → 实扫空集,而没接本地腿时期望**也是**空集 → 判绿
    //        (那次靠同块邻格连带报红兜住了,但本格自己是瞎的,不能指望邻格)。
    //     换成「提到这个名字的文件集合 + 每个文件提几行」之后,三条轴一并抓住:
    //     多一个文件 → 集合不等;改名 → 集合塌成空、与含定义处的期望不等;
    //     同一文件里多提一次(第二个减记者藏在 store 自己内部)→ 行数不等。
    //  🔴 期望里**含定义处**(app.ts 的函数声明 + 返回对象导出、types.ts 的接口声明),
    //     正是这一点让「改名/删除」也判红 —— 期望非空,空集就不可能等于它,「扫不到」再也换不到绿。
    //  能力上界(写下来免得下一个人高估):行数判据认的是「提了几次」,不是「提的是不是调用」——
    //     app.ts 内把导出行挪个位置、或写成等价的另一种导出语法,行数不变故不报;
    //     那属于同文件内重构,由同块另外三格(签名切片、定型串守卫、幂等读盘)接住。
    //  🔴 用**词边界**匹配,不用 includes:`applyWithdrawalDebitV2` 这种改名**包含**原名子串,
    //     includes 版对它照样计数、行数不变 → 改名轴仍旧判绿(实测过,这是第二次修同一格)。
    const scannedFiles = walkSrc();
    const debitMentions = {};
    for (const p of scannedFiles) {
      const lines = stripComments(readFileSync(p, "utf8"))
        .split(/\r?\n/).filter((l) => /\bapplyWithdrawalDebit\b/.test(l)).length;
      if (lines > 0) debitMentions[path.relative(root, p).replace(/\\/g, "/")] = lines;
    }
    const expectedMentions = {
      "src/store/app.ts": 2,                                    // 函数声明 + 返回对象里的导出
      "src/store/types.ts": 1,                                  // store 对外接口声明
      ...(PAGE_DEBITS_LOCALLY ? { "src/pages/me/wallet-withdraw.vue": 1 } : {}),
    };
    const norm = (o) => Object.keys(o).sort().map((k) => `${k}:${o[k]}`).join(",");
    check("🔴 扣款调用点**集合等式**(第二个减记者藏在别的文件里,上面两格都看不见)",
      scannedFiles.length >= 100 && norm(debitMentions) === norm(expectedMentions),
      `扫了 ${scannedFiles.length} 个源文件 实扫=${norm(debitMentions)} 应为=${norm(expectedMentions)}`);
    // 🗑 【2026-08-13 回退】这里曾加过一格「接线门②」,守 App.vue 对账里的扣款补扣格。
    //    实现被 R1 独立审计整格否决(立论前提错 + z5 已明令禁止无条件遍历补扣),
    //    门随实现一起退役 —— 留着就是绿着守一段不存在的代码。
    //    ⚠️ 下一个要重做这条自愈的人:门本身当时也被审出四类绕过,重建时别照抄那一版 ——
    //      · 三条合取都用全文件 indexOf、不含「在 reconcileBills 内」的作用域约束
    //        ⇒ 一段永不被调用的 decoy 就能让判据与真实现解耦(实测全绿);
    //      · 循环源不钉 ⇒ `for (const wd of [])` / 整块包 `if (false)` 照绿;
    //      · status 面完全没钉 ⇒ 加一句 `if (wd.status === "confirmed") continue;` 两道门都绿,
    //        而 11 种状态里 9 种的漏扣单永远补不上;
    //      · 只扫**被调用方**函数体里的 remoteApiEnabled,不看**调用点**
    //        ⇒ 给 reconcileBills 首行加一句早退,两道门全绿而生产档整格死掉。
    //    详见 docs/changes/2026-08-13-z6-audit-R1.md。
    // 赠金释放只动桶和余额、不写账单 → 那行「处理中」的赠金会永远停着。从数据推出它已落地。
    // 判据必须钉到**真正干活的那一句**(遍历 bills.bills 并 settleByRef),
    // 只查条件行的话,把循环源换成空数组照样绿(红测实证:改 `for (const row of [])` 不红)。
    check("🔴 赠金释放后账单跟着入账(释放路径不写账单,只能靠对账推出来)",
      appVueCode.includes("b.pendingReviewUsdt <= 0 && b.bonusLockedUsdt <= 0")
        && /for \(const row of bills\.bills\)[\s\S]{0,220}row\.type === "bonus"[\s\S]{0,160}bills\.settleByRef\(row\.ref, "posted"\)/.test(appVueCode));
    // 🗑 【C·判据已废弃】「单号里的日期用平台日」(2026-08-13 判决)。
    //    它守的是**客户端铸造单号**那条路 —— c37e642 起单号一律由服务端签发:
    //    两个建单分支写进列表的都是 canonical(toCanonicalWithdrawal / canonicalFundsSandboxWithdrawal),
    //    而 withdrawal-api.ts 对 `row.idSource !== "server"` 直接拒收(selfcheck-withdraw-freeze 钉住)。
    //    客户端已无从决定单号的日期口径,判据没有对象。
    //    「今天」的平台日口径本身没丢:日限计数与可再提时刻仍由本文件 §7 的边界固定靶
    //    (RESET-1 / RESET / RESET-DAY / RESET-DAY-1 四格 + platformDayIndex 非 UTC 日那格)守着。

    check("🔴 钱包入口与追踪页读**主单**(优先最早的在途单),不读最新一笔",
      walletSrc.includes("app.primaryWithdrawal") && trackSrc.includes("app.primaryWithdrawal")
        && !/computed\(\(\) => app\.latestWithdrawal\)/.test(walletSrc)
        && !/computed\(\(\) => app\.latestWithdrawal\)/.test(trackSrc));
    // 🔴 换址闸(更换提现地址前的在途单拦截)问**整张在途列表**,不问最新一笔 ——
    // 只看最新一笔时,一张在途单 + 一张更新的已到账单会把闸静默架空,
    // 收款地址能在放款前被换掉(独立验收实测)。RM01a 收窄为按网络拦:
    // 判据 = 从整张 inFlightWithdrawals 列表按网络过滤,仍是列表级问法。
    check("🔴 换址闸问**整张在途列表**(按网络过滤,不读 latestWithdrawal)",
      payoutSrc.includes("useApp().inFlightWithdrawals.some((w) => w.network === CHAIN_TO_WITHDRAW_NETWORK[network])")
        && !/latestWithdrawal/.test(stripComments(payoutSrc)));
    // 🔴 同一个概念只许有一份判据。曾经有两份:白名单 IN_FLIGHT_WITHDRAWAL_STATUSES(漏 sent / frozen)
    // 与黑名单 occupiesWithdrawalSlot(非终态即占用)。换绑闸挂在漏的那份上 ——
    // 风控冻结中、钱已扣的账户能改收款地址(2026-08-01 审计,资金安全级)。
    // 白名单的失败方向是「新状态默认不在途 = 放行」,黑名单是「默认在途 = 拦住」;涉及钱一律取保守侧。
    check("🔴 全站不得再出现第二份「在途」判据(白名单谓词已删,只走 occupiesWithdrawalSlot)",
      ["src/store/payout-address-core.ts", "src/store/payout-address.ts", "src/pages/me/wallet-withdraw.vue", "src/pages/me/wallet-address-rebind.vue"]
        .every((f) => {
          const s = readSrc(f).replace(/^\s*\/\/.*$/gm, "");   // 剥注释:历史说明里会提到这个名字
          return !s.includes("IN_FLIGHT_WITHDRAWAL_STATUSES") && !s.includes("isInFlightWithdrawal");
        }));
    // 🔴 判定对 ≠ 接上(quota_claim_before_create 同族):在途闸必须真喂进 store 的
    // changeAddress 动作(hasInFlightWithdrawal 实参来自列表派生),页面的更换入口
    // 必须问 store 同一个判据 —— 页面自己另算一份迟早漂移。
    check("🔴 换址动作的在途实参来自列表派生(store 接线),且 changeAddress 首步过闸",
      payoutSrc.includes("hasInFlightWithdrawal: hasInFlightWithdrawalOn(network)")
        && payoutSrc.includes("const blocked = changeBlockReason(network);"));
    check("🔴 地址管理页的更换入口问 store 同一个判据(不自算)",
      stripComments(readSrc("src/pages/me/wallet-address-rebind.vue")).includes("payout.changeBlockReason("));
    check("🔴 store 暴露列表级派生值(inFlightWithdrawals / primaryWithdrawal)",
      appSrc.includes("const inFlightWithdrawals = computed(")
        && appSrc.includes("const primaryWithdrawal = computed<Withdrawal | null>("));
  }
  // 🔴 提现单是**列表**不是单条 —— 【A·判据过期,2026-08-13 重锚】。
  //
  // 原判据钉三串字面量:boot 表达式、latestWithdrawal 的定义行、一处 prepend 的写法。
  // remote 对齐把三串**全部**改写(boot 在远端模式恒空、prepend 改成按 id 去重再前插),
  // 而不变量一分没丢 —— 典型的「钉字面串,轨道一改门就红」。
  // 重锚到**行为落点**,两条合取:
  //   ① 状态本身是数组(改回 `Withdrawal | null` 即红,且会连带 tsc 全线报错);
  //   ② 全 store 每一次 `withdrawals.value =` 都不许用「凭空造一张新表」顶掉旧表 ——
  //      判的是**失败形状**(数组字面量 · 非空 · 里面一个展开都没有),不是枚举合法写法,
  //      所以新增写法不必来改这里,而「一张新单顶掉整张表」这种写法一出现就红。
  //   这一条同时吸收了原来那格「建单是追加不是覆盖」:它钉的 `latestWithdrawal.value = wd`
  //   对一个 computed 是 tsc 错误,在能编译的代码里**恒不可能出现** = 空转的绿灯。
  // 扫描面为空 / 骤降 = 判据失效(如状态被改名),必须红,不许「扫不到就当没违规」。
  //
  // 🔴 能力上界(写下来免得下一个人高估它):判的是「有没有展开」,不是「展开的是不是**这张**表」——
  //    `[wd, ...someStaleAlias]` 这种「展开错了对象」它抓不到,那属于另一族(读陈旧快照),
  //    由「到账推进全表扫」「换址闸问整张在途列表」那几格覆盖。故意放宽到这里为止:
  //    收紧成必须写 `...withdrawals.value` 的话,`const prev = withdrawals.value` 这种
  //    完全正当的重构会假红,而假红会把门推进逃生阀,比漏那一格更坏。
  // 🔴 右值取到**分号**为止而不是行尾:多行数组字面量的行尾只有一个 `[`,按行截断会把
  //    合法写法误判成「没有展开」(假红)。本仓这些右值内部无分号,已回源逐个核过。
  {
    const appCode = stripComments(appSrc).replace(/\s+/g, " ");
    const writes = [...appCode.matchAll(/withdrawals\.value = ([^;]*);/g)].map((m) => m[1].trim());
    const clobbers = writes.filter((rhs) =>
      rhs.startsWith("[") && !rhs.startsWith("[]") && !rhs.includes("..."));
    check(`🔴 提现单是**列表**不是单条:状态是数组,且 ${writes.length} 处赋值没有一处用新单顶掉旧表`,
      /const withdrawals = ref<Withdrawal\[\]>\(/.test(appCode)
        && writes.length >= 10
        && clobbers.length === 0,
      `writes=${writes.length} 顶掉旧表的写法=${JSON.stringify(clobbers)}`);
  }
  // 2026-08-11:调用多了第三个必填参数「谁是权威」(远端模式 client 不自推),
  // 判据只钉「全表扫 + 每笔都过 advanceArrival」这层语义,不再钉死实参写法 ——
  // 权威闸本身由 selfcheck-arrival 第 0 节与 remote-authority-simulation 行为门守。
  check("🔴 到账推进**全表扫**(单条版只看最新一笔,前面那笔到点了也永远推不动)",
    /const next = prev\.map\(\(w\) => advanceArrival\(w, now,[^)]*\) \?\? w\);/.test(appSrc));
  check("🔴 推进落盘失败要回滚内存(否则内存说已到账、磁盘还是处理中,轮询永不重试)",
    /withdrawals\.value = next;[\s\S]{0,400}?if \(!persistAccountSnapshot\(\)\) \{[\s\S]{0,80}?withdrawals\.value = prev;/.test(appSrc));
  check("🔴 单槽产品限制已删除(列表化后新单不再顶掉在途单,那条闸只会锁死用户)",
    !/occupiesWithdrawalSlot\(latestWithdrawal/.test(appSrc));
  // z1 B4(2026-08-10):remote-only 后扣款在后端事务里,客户端义务收缩为「建单成功后
  // 同步登记风控台账」—— submitWithdrawal 在 await withdrawalApi.submit **之后**调
  // commitWithdrawal(首提标记 + 地址登记),本地预检引擎吃的就是这份台账,
  // 漏接 = 首提/换址闸对提过现的账户永不触发。三合取逐项:
  // (a) 调用在 submitWithdrawal 函数体内(functionBody 抠体再找,防命中别处);
  // (b) 调用在建单 await 之后(建单失败会 throw 冒泡,不得先记台账);
  // (c) commitWithdrawal 函数体内两笔台账(地址登记 + 首提标记)都落。
  // (d) 🔴 账号必须是**入口冻结值**(z4 R1):本函数跨一个最长 30s 的 await,期间跨标签页
  //     登出 / 吊销 / 重登都会 bindAccount 改掉 accountKey.value。台账记到换后的账号 =
  //     首提标记与共用地址强信号全落到别人头上,而钱是从冻结那个账号扣的。
  //     判据用「一个都不许读活值」而不是「至少有一处读冻结值」—— 后者放得过「两条分支
  //     一条对一条错」,而本包的原始缺陷正是这种半修状态(账单钉死、单据没钉)。
  check("🔴 风控台账接线:submitWithdrawal 建单成功后同步 commitWithdrawal(首提标记 + 地址登记,账号取入口冻结值)",
    (() => {
      const body = functionBody(appSrc, "async function submitWithdrawal(");
      if (!body) return false;
      if (!/const acct = accountKey\.value;/.test(body)) return false; // 入口没冻结 = 后面无从谈起
      const calls = [...body.matchAll(/commitWithdrawal\(([^)]*)\)/g)];
      if (!calls.length) return false;
      if (calls.some((m) => /accountKey\.value/.test(m[1]))) return false; // 任一处读活值即判红
      if (!calls.every((m) => /^\s*acct\s*,\s*network\s*,\s*address\s*$/.test(m[1]))) return false;
      const call = body.indexOf("commitWithdrawal(");
      const submit = body.indexOf("await withdrawalApi.submit");
      if (call < 0 || submit < 0 || submit > call) return false;
      const elgBody = functionBody(elgSrc, "function commitWithdrawal(");
      return !!elgBody
        && elgBody.includes("recordWithdrawAddressUse(accountKey, network, address);")
        && elgBody.includes("markWithdrawn(accountKey);");
    })());
  check("🔴 commitWithdrawal 不再事后计数(挪回去 = 把并发漏洞放回去)",
    !/bumpWithdrawCounter\s*\(/.test(elgSrc));
  // ── 日限接线门(z1 审计 P0-1 的回归门,2026-08-11)────────────────
  // 判定层已被上面 §7 的行为断言全覆盖;这里守的是**接没接上、接的是不是那个源**。
  // 缺陷史:计数器无人递增(判定恒 0)+ 文案取服务端 policy 而判定取本地 config
  // (同一个「每日 N 笔」有两个数)。两处都是「判定对 ≠ 接对」,只有源码级判据守得住。
  {
    const pgSrc2 = readSrc("src/pages/me/wallet-withdraw.vue");
    const trackSrc2 = readSrc("src/pages/me/wallet-withdraw-tracking.vue");
    const files = walkSrc();
    // 扫描面为空 = 判据失效,必须红(禁「扫不到=没违规」)
    check(`🔴 日限扫描面非空(扫 ${files.length} 个源文件)`, files.length >= 100, `只扫到 ${files.length} 个`);

    // 🔴 G2:正向判据也走剥注释版原文。旧版正向用生文本 includes,把判据行整段注释掉
    //    或挪进行尾注释,门照样绿(实测两种都过)。
    const pgCode = stripComments(pgSrc2);
    const trackCode = stripComments(trackSrc2);
    const elgCode = stripComments(elgSrc);
    const coreCode = stripComments(readSrc("src/store/withdrawal-eligibility-core.ts"));

    // ① 🔴🔴 G3:计数源守**赋值点集合等式**,不守禁名清单。
    //
    //    禁名清单是封闭集合,而「再存一份计数」的写法是开放集合 —— 实测把计数器改名成
    //    `bumpDailyWithdrawCount` + 换个 storage 键就整条溜过去(R1 独立审计 + 我复跑确认)。
    //    换个问法就构造性了:不管那份计数叫什么、存在哪,它**要生效就必须流进
    //    `todayWithdrawCount`**(判定唯一读的那个字段)。于是守它的赋值点集合:
    //    全 src 恰好一处,在 core 的 toRawFacts 里,右值恰为对提现单列表的现算。
    const assignSites = files.flatMap((p) => {
      const code = stripComments(readFileSync(p, "utf8"));
      // 取到**行尾**再剥尾逗号 —— 用 `[^,\n]+` 会被右值内部的逗号
      // (`count(s.withdrawals, s.now)`)提前截断,判据落在半截表达式上红绿都不可信。
      return [...code.matchAll(/todayWithdrawCount\s*:\s*(.+)$/gm)]
        .map((m) => ({ file: path.relative(root, p).replace(/\\/g, "/"), rhs: m[1].trim().replace(/[,;]\s*$/, "") }));
    // 类型声明(`todayWithdrawCount: number;`)不是赋值,排除
    }).filter((s) => s.rhs !== "number" && !s.rhs.startsWith("number"));
    const assignDesc = assignSites.map((s) => `${s.file} ← ${s.rhs}`);
    check("🔴🔴 今日笔数的赋值点**集合等式**:全 src 恰 2 处(core 现算 + core 内转发),右值只许来自提现单列表",
      assignSites.length === 2
        && assignSites.every((s) => s.file === "src/store/withdrawal-eligibility-core.ts")
        && assignSites.some((s) => s.rhs === "countWithdrawalsOnPlatformDay(s.withdrawals, s.now)")
        && assignSites.some((s) => s.rhs === "f.todayWithdrawCount"),
      assignDesc.join(" | "));

    // ② 限额源:类型级删除是真判据 —— 字段不在 config 类型里,任何取用都是 tsc 错。
    //    所以守「字段保持删除」比守「没人取用」更靠前(后者在字段不存在时恒真、零信息)。
    const cfgTypes = stripComments(readSrc("src/store/config-types.ts"));
    const localLimitUsers = files
      .filter((p) => /withdrawRules\s*[.?]*\.?\s*dailyWithdrawLimitCount|rules\.dailyWithdrawLimitCount/.test(stripComments(readFileSync(p, "utf8"))))
      .map((p) => path.relative(root, p).replace(/\\/g, "/"));
    check("🔴 每日笔数上限:本地配置字段保持删除(类型里加回来即红),且全 src 无人从 withdrawRules 取",
      !/\bdailyWithdrawLimitCount\b/.test(cfgTypes) && localLimitUsers.length === 0,
      `cfgTypes=${/\bdailyWithdrawLimitCount\b/.test(cfgTypes)} users=${localLimitUsers.join(",")}`);

    // ③ 🔴🔴 G3:消费点**集合等式** —— 不是「这两个页面接对了」,而是「全 src 只有这些页面
    //    在问日限,且每一处都喂了事实」。新页面漏喂 dailyFacts 时旧版枚举门全绿(审计点名)。
    const CONSUMER_ALLOWLIST = [
      "src/pages/me/wallet-withdraw-tracking.vue",
      "src/pages/me/wallet-withdraw.vue",
      "src/store/withdrawal-eligibility.ts", // 引擎自身(requestWithdrawalEligibility 内部转发)
    ];
    const consumers = files
      .filter((p) => /\b(evaluateWithdrawal|dailyLimitStatus|requestWithdrawalEligibility)\s*\(/.test(stripComments(readFileSync(p, "utf8"))))
      .map((p) => path.relative(root, p).replace(/\\/g, "/"))
      .sort();
    check("🔴🔴 日限消费点集合等式:只有登记在册的文件在问日限(新增消费面必须来改这张名单)",
      consumers.join(",") === CONSUMER_ALLOWLIST.join(","), consumers.join(","));

    // ③b 每个消费点都真的喂了事实(集合等式管「有谁」,这条管「喂没喂」)
    check("🔴 提现页:日限事实来自服务端 policy + app.withdrawals,且文案与闸共用同一个数",
      pgCode.includes("limitCount: withdrawalPolicy.value?.dailyLimitCount ?? 0,")
        && pgCode.includes("withdrawals: app.withdrawals,")
        && pgCode.includes("const limitFacts = computed(() => withdrawalLimitFacts({")
        && pgCode.includes("dailyLimitCount: dailyFacts.value.limitCount,")
        && pgCode.includes("withdrawals: dailyFacts.value.withdrawals,")
        && pgCode.includes("limit: String(dailyFacts.value.limitCount),")
        // 🔴 说不说使用量 ⟺ 服务端是否配置了计数闸；未配置时必须明确显示未设，
        // 不能把 0 伪装成每日额度。
        && pgCode.includes('<text v-if="dailyFactsDisplayable && limitFacts.dailyLimitConfigured" class="block">{{ dailyUsageText }}</text>')
        && pgCode.includes('<text v-else-if="dailyFactsDisplayable && withdrawalPolicy" class="block">{{ t.wallet.dailyWithdrawalCountNotSet }}</text>'));
    check("🔴 提现页:显示 / 降额 CTA / 提交前复检均走服务端事实或冻结快照",
      (() => {
        // mock 轨的纯函数评估必须吃 dailyFacts；remote 轨的显示与降额 CTA 使用
        // 服务端 remoteSmallLineEligibility，不应被旧门强行要求本地再算一遍。
        const all = (pgCode.match(/evaluateWithdrawal\s*\(/g) || []).length;
        const fed = (pgCode.match(/evaluateWithdrawal\([^)]*dailyFacts\.value/g) || []).length;
        // 提交前复检吃的是 snap.daily —— 与 snap.account 同源同刻。取活值会在弹窗期间
        // 切账号时拿新账号的单据判旧账号的额度(R1 三份独立审计各自抓到),
        // 且它声称的跨标签页收益不存在(别的标签页的写入根本不进本标签页内存)。
        //
        // 🔴 2026-08-16 重锚:上一版最后一条是一句**无锚的否定式** ——「全文不许出现
        //    `requestWithdrawalEligibility(…dailyFacts.value,`」。它成立的前提是全页只有
        //    提交前复检这一处调用;而现在有三处,另外两处是**展示侧**(可提额度显示、
        //    降额 CTA),吃活值本来就对。于是这条否定式对**正确的实现**判红:
        //    实测三处调用一处不漏地喂了事实,这格却是唯一红的那格。
        //    改成按调用点**各自该吃什么**分别断言 —— 严格更强:旧版只会说「有活值就红」,
        //    新版还会抓「展示侧漏喂」(旧版对漏喂判绿,因为否定式只管别出现)。
        //    判据构造性:调用实参用括号配对抠,按首参是不是冻结的 snap.* 分两类。
        const callArgs = [];
        for (const m of pgCode.matchAll(/requestWithdrawalEligibility\s*\(/g)) {
          let depth = 0;
          let i = m.index + m[0].length - 1;
          const start = i;
          for (; i < pgCode.length; i++) {
            if (pgCode[i] === "(") depth++;
            else if (pgCode[i] === ")" && --depth === 0) break;
          }
          callArgs.push(pgCode.slice(start, i + 1));
        }
        // 提交前复检 = 拿冻结账号 snap.account 的那一处;其余都是展示侧。
        const submitRechecks = callArgs.filter((a) => a.includes("snap.account"));
        const liveReads = callArgs.filter((a) => !a.includes("snap.account"));
        return all >= 2 && all === fed
          && pgCode.includes("remoteSmallLineEligibility.value")
          && pgCode.includes("daily: dailyFacts.value,")
          // 提交前复检:必须吃同刻冻结的 snap.daily,且**绝不能**掺活值
          && submitRechecks.length >= 1
          && submitRechecks.every((a) => a.includes("snap.daily") && !a.includes("dailyFacts.value"))
          // 展示侧:一处不落地吃活值(漏喂在这里红 —— 旧的否定式抓不到这一向)
          && liveReads.length >= 1
          && liveReads.every((a) => a.includes("dailyFacts.value"))
          && /fresh\s*=\s*await\s+requestWithdrawalEligibility\s*\([\s\S]{0,500}?snap\.daily,/.test(pgCode);
      })());
    check("🔴 追踪页「再提一笔」与提现页同源(否则一页说能提、一页说不能提)",
      trackCode.includes("dailyLimitStatus({")
        && trackCode.includes("limitCount: withdrawalPolicy.value?.dailyLimitCount ?? 0,")
        && trackCode.includes("withdrawals: app.withdrawals,")
        // 集合等式是**文件粒度**的,同一文件里再多问一次它看不见 —— 所以这里也要
        // 「全部调用 === 喂了服务端限额的调用」,补上文件内那一格。
        && (trackCode.match(/dailyLimitStatus\s*\(/g) || []).length
           === (trackCode.match(/dailyLimitStatus\(\{[\s\S]{0,200}?withdrawalPolicy\.value\?\.dailyLimitCount/g) || []).length);
    // ③c 判定结论必须被**消费**(喂进去 ≠ 用起来):追踪页置灰 + 点击守卫,提现页拦截分支
    check("🔴 判定结论真的被消费:追踪页据此置灰并挡点击,提现页据此给拦截理由",
      trackCode.includes("const againDisabled = computed(() => dailyLimit.value.reached);")
        && /aria-disabled="againDisabled/.test(trackCode)
        && pgCode.includes("if (decision.dailyLimitReached) return dailyLimitReachedText.value;"));
    // ③d 🔴 两个页面都必须**跨平台日边界重算**。判定里的「今天」走 mockServerNow(非响应源),
    //     没有边界依赖就会:跨过 0 点后按钮不解灰、理由行念一个已经过去的时刻 —— 页面自己
    //     打自己脸。提现页早有 eligibilityClock,追踪页此前没有(R1 四份独立审计各自点名),
    //     而闸此前恒不触发所以这个失效是休眠的,本包让它变成可达死路。
    check("🔴 两页的日限判定都挂了平台日边界依赖(跨日必重算,不停在旧结论上)",
      /platformDayIndex\(now\)/.test(pgCode) && pgCode.includes("void eligibilityClock.value;")
        && trackCode.includes("void platformDayIndex(nowTick.value);")
        && /setInterval\(\(\) => \(nowTick\.value = mockServerNow\(\)\)/.test(trackCode));
    // ③e 🔴 policy 拉取必须可重来。只拉一次且失败静默吞 = 该页实例终身 fail-open:
    //     「再提一笔」永不置灰,点进去却被拦死 —— 换了触发条件的同一种两页分裂。
    check("🔴 追踪页的 policy 拉取可重来(onShow 补拉),不是一次性静默失败",
      trackCode.includes("async function loadWithdrawalPolicy()")
        && /onShow\([\s\S]{0,400}?loadWithdrawalPolicy\(\);/.test(trackCode));
    // 🔴🔴 族 C(「抄一半」)的三条回归门。R2 跨端镜头点名:我照着现成写法改,
    //     却没把那处写法的**全部约束**一起带过来 —— 守卫抄丢了、钩子只挂了一半、还加错了页。
    check("🔴 两个页面**都**在 onShow 重取 policy(真正靠限额拦人的是提现页 —— 上一版只给了追踪页)",
      (functionBody(pgCode, "onShow(") ?? "").includes("retryWithdrawalFacts();")
        && (functionBody(pgCode, "async function retryWithdrawalFacts(") ?? "").includes("loadWithdrawalPolicy(),")
        && /onShow\([\s\S]{0,400}?loadWithdrawalPolicy\(\);/.test(trackCode));
    check("🔴 追踪页的 loader 有在途守卫(抄提现页那份时漏抄 → 重复发请求 + 后到的覆盖先到的)",
      trackCode.includes("if (withdrawalPolicyLoading.value) return;")
        && trackCode.includes("withdrawalPolicyLoading.value = true;"));
    check("🔴 policy 取数失败**不清空**已拿到的好值(清空 = 网络抖一下就把闸放开,与仓内钱路径惯例相反)",
      !/catch\s*\{[^}]*withdrawalPolicy\.value = null/.test(trackCode));
    check("🔴 60s 时钟起停 onShow/onHide **成对**(仓内硬规则 P-063:页面保活时 onUnmounted 不触发 → 定时器泄漏)",
      (functionBody(trackCode, "onHide(") ?? "").includes("stopDayTimer();")
        && /onShow\([\s\S]{0,300}?setInterval\(/.test(trackCode)
        && (functionBody(trackCode, "onUnmounted(") ?? "").includes("stopDayTimer();"));

    // 🗑🗑 【C·判据已迁移】幂等键 / 意图签名 / 失败分诊接线 3 格(2026-08-13 判决)。
    //
    // 三条不变量一条没丢,**守它们的门换了地方而且更强**,原判据钉的是已被取代的那套实现:
    //  ① 「幂等键跨重试复用」:内存轨(currentIdempotencyKey / clearSubmitIntent)已于
    //     2026-08-12 合并收口时删除,换成**落盘轨** src/lib/withdraw-attempt.ts ——
    //     键连同整个请求体在**发请求之前**落盘,重放逐字节原样重发。
    //     内存轨活不过刷新页面,而「请求在途时被杀进程 / 刷页面」正是这条链要兜的那一刻。
    //     现在由 selfcheck-withdraw-freeze.mjs 三格钉:「幂等键不在提交函数里现铸」
    //     「快照优先取落盘的冻结件」「未收口的尝试在请求发出前落盘,且落盘失败即拒发」。
    //  ② 「签名含地址、不含 policyVersion」:键不再由签名派生(newWithdrawKey 是随机 UUID),
    //     policyVersion 与地址都在**冻结的 body 里**跟着一起重放 ——「后台发版把键换掉」
    //     这条路结构上消失,不再需要一条「签名里不许有它」的负向断言。
    //     ⚠️ 地址那一半是**有意的口径变更**(改地址不再算另一笔意图,重放仍发冻结的旧地址),
    //     取舍与残余缺口写在 wallet-withdraw.vue 的 `currentIdempotencyKey` 墓志铭里。
    //     契约面由 scripts/withdraw-idempotency-contract.test.mjs 守(run-contract-suite)。
    //  ③ 「失败分诊接线」:判定已从 src/api/errors.ts 的 isAmbiguousOutcome 搬到
    //     src/lib/withdraw-failure-triage.ts 的 triageWithdrawFailure。原判据其实**早已空转**——
    //     页面里 `isAmbiguousOutcome` 只剩一行 import、零调用,那一行正好喂饱了这根字符串针
    //     (wallet-withdraw.vue:386 的注释记着这件事)。现在三道门分工守:
    //     selfcheck-withdraw-replay-triage.mjs(48 格:真函数全矩阵 + 4 格接线)、
    //     selfcheck-withdraw-triage-dataflow.mjs(跑真 catch 段,验**输入域**对不对)、
    //     selfcheck-withdraw-freeze.mjs(退役与刷费率各只有一处且由判决门控)。

    // ④ 外壳仍然只转发:今日笔数在 core 现算,页面/外壳不许自己 filter 出一个数来
    //    (外壳里留表达式 = 行为门覆盖不到那一层,这是本文件反复栽过的跟头)。
    check("🔴 今日笔数在 core 现算,外壳只转发(外壳自算一个数即红)",
      elgCode.includes("withdrawals: daily.withdrawals,")
        && elgCode.includes("dailyWithdrawLimitCount: daily.limitCount,")
        // 不再只禁三个方法名:先取别名再算同样绕过(`const l = daily.withdrawals; l.filter(...)`)。
        // 改判「外壳里除了转发,不许出现任何对该列表的下标/遍历/聚合」——只认「原样转发」这一种形态。
        && !/daily\.withdrawals\s*[.[]/.test(elgCode.replace("withdrawals: daily.withdrawals,", ""))
        && !/\bdaily\.withdrawals\b(?![\s,)\]}])/.test(elgCode.replace("withdrawals: daily.withdrawals,", "")));
    // ④b 计数函数的调用点集合等式:只许 core 自己调(外壳/页面各自调一次 = 各算各的)
    const counterCallers = files
      .filter((p) => /\bcountWithdrawalsOnPlatformDay\s*\(/.test(stripComments(readFileSync(p, "utf8"))))
      .map((p) => path.relative(root, p).replace(/\\/g, "/"));
    check("🔴 计数函数只许 core 内部调用(页面/外壳各自再算一遍 = 又出第二份口径)",
      counterCallers.join(",") === "src/store/withdrawal-eligibility-core.ts", counterCallers.join(","));
  }
  // 🔴 双向告知的接线门。判定再准,页面不接 = 用户看不见(走查实证:快车道跑了
  // 一整轮,表单一个字都没提,用户以为「提多少都要审」)。两条判据都必须来自判定结果。
  const pgSrc = readSrc("src/pages/me/wallet-withdraw.vue");
  // 判据全用 includes 精确串,不用正则 —— 这几行历史上被 shell 转义吃掉反斜杠后
  // 会退化成「几乎什么都匹配」的假绿正则(同替换串静默损坏那族坑)。
  check("🔴 正向横幅三层前提齐全:真免了闸 + 路由放行 + **这笔现在提交得了**",
    pgSrc.includes('waivedLines.value.length > 0 && eligibility.value.route === "pass" && submitDisabledReason.value === ""')
      && pgSrc.includes("waivedGateLines(t.value, eligibility.value.waivedGates)"));
  // 🔴 CTA 承诺「改成小额线就能立刻处理」,判据必须和**提交拦截**同一个源。只看 route 不够:
  // core 把 dailyLimitReached 单独返回、不并进 route,费率不可用更是页面层的事 ——
  // 日限已达时旧判据照样劝你改成 $50,点完什么都不会发生,还把当天唯一一次机会的金额改小了。
  check("🔴 降额 CTA 与提交拦截同源(disabledReasonFor),不是只看 route 或 amount > line",
    (() => {
      const k = pgSrc.indexOf("const fastLaneOverLine = computed(");
      if (k < 0) return false;
      const body = balancedBody(pgSrc, k);
      if (!body) return false;
      return body.includes('disabledReasonFor(smallAmountLine.value, smallLineDecision.value) === ""')
        // 假设金额那次评估必须**连日限事实一起**问 —— 少喂 dailyFacts 就等于拿一份
        // 「日限恒不触发」的答案去劝用户降额,又回到 z1 P0-1 那个空头承诺。
        && pgSrc.includes("evaluateWithdrawal(app.accountKey, network.value, boundAddress.value, maxWithdrawable.value, dailyFacts.value, smallAmountLine.value)")
        // 提交拦截本身必须是「入参为金额」的函数,否则 CTA 没法对假设金额问同一个问题
        && pgSrc.includes("function disabledReasonFor(amount: number, decision: WithdrawalEligibility): string")
        && pgSrc.includes("const submitDisabledReason = computed(() => disabledReasonFor(amountNum.value, eligibility.value));");
    })());
  check("🔴 CTA 可点(说了「改小就行」必须给一键改,否则等于没下一步)",
    pgSrc.includes('@click.stop="useSmallAmountLine"') && pgSrc.includes("function useSmallAmountLine()"));
  // 🔴 判定必须跨时间边界重算。eligibility 的依赖里原本没有时间(mockServerNow 非响应源),
  // 于是冻结倒计时归零后判定还停在 freeze(横幅换个壳再说一遍冻结原因、提交被无原因兜底挡死),
  // 日限重置时刻到了也照样拦着 —— 页面刚承诺的那个时刻自己打自己脸。
  // 但也不许直接依赖每秒 tick(evaluateWithdrawal 同步读多行 storage);只取边界穿越信号。
  check("🔴 判定跨时间边界重算(冻结到期 / 平台日切),且不是每秒重算",
    (() => {
      const c = stripComments(pgSrc);
      return c.includes("const eligibilityClock = computed(")
        && c.includes("void eligibilityClock.value;")
        && c.includes("platformDayIndex(now)");
    })());
  // 🔴 账单跳交易详情必须带真实参数。只传 hash 的话,tx 页缺参会按 hash 播种**随机编**金额、
  // 网络硬回落 Ethereum —— 用户点自己那笔 $30,看到的是一笔跟他无关的四位数交易。
  // 入金侧早焊了这道防线,账单侧一直没焊(同型只修一半)。
  check("🔴 账单跳详情带真实参数(金额 / 网络 / 时间),不让 tx 页按 hash 编数",
    (() => {
      const c = stripComments(readSrc("src/pages/me/wallet-bills.vue"));
      return c.includes('p.set("amount"') && c.includes('p.set("net"') && c.includes('p.set("age"')
        // 网络必须大写:tx 页用 `options.net in NET_LINES` 白名单校验,小写会被静默丢弃
        && c.includes("m[1].toUpperCase()");
    })());
  // 🔴 账单分流三件套(2026-08-02 审计修复的机器 pin)。上一条的四根针脚**兜底分支单独即可喂饱**——
  // 把「按 ref 反查入金记录取真实确认数」的 rec 分支整个删掉照样绿,故单独 pin:
  // ① withdraw 行深链追踪页(单据真状态,不再被 tx 页恒「已确认」编造);
  // ② topup 行优先反查入金记录、传真实 confs;
  // ③ 入金面板非 credited 的链上记录不进 tx 页(在途记录渲成「已确认」=编造)。
  check("🔴 账单分流:withdraw→追踪页深链 / topup 反查记录传真实 confs / pane 非 credited 不进 tx",
    (() => {
      const bills = stripComments(readSrc("src/pages/me/wallet-bills.vue"));
      const pane = stripComments(readSrc("src/components/me/deposit-usdt-pane.vue"));
      return bills.includes("wallet-withdraw-tracking?id=")
        && bills.includes("deposits.records.find")
        && bills.includes('p.set("confs"')
        && pane.includes('r.status !== "credited"');
    })());
  // 🔴 小额线取后台配置,且**三处用同一个落地值**(比较 / 写入输入框 / 文案显示)。
  // 原来比较用原值、写入 toFixed(2)、显示 toFixed(0):线配成 49.999 时写进去的 50.00 反而超过原值,
  // 快车道不生效而 CTA 判据仍成立 → 一个点多少次都没反应、也永不消失的按钮;
  // 线配成 20.5 时按钮写「改为 $21」而实际填 20.50,照字面手输 21 反被送出免审区间。
  // 🗑 【C·判据已废弃,2026-08-13 判决】它守的是**快车道在跑**这个前提,而主人 2026-08-11
  // 已拍板真停用:`const smallAmountLine = computed(() => 0)`(WD01 HOLD —— 后端没有执行面,
  // 不许把一个持久化/显示出来的值当成生效)。判据前半句「取后台配置」正是被删掉的那件事;
  // 后半句「三处同一落地值」在停用态下也没有对象 —— 比较 / 写入 / 显示三处现在都读同一个常量,
  // 单源靠「一个 computed 喂三处」结构性成立,不再依赖「向下取 2 位」这条对齐规则。
  //
  // 现在谁守:
  //  · 停用本身 —— scripts/hard-block-d5-runtime-contract.test.mjs 断言
  //    `const smallAmountLine = computed(() => 0)`(接回配置即红,run-contract-suite 跑);
  //  · 端到端不生效 —— scripts/selfcheck-config-compat.mjs ④ 拿出厂配置跑真判定,断言
  //    fastLaneApplied=false / waivedGates 为空,并带一格阈值 50 的红测(接回来就该亮)。
  // ⚠️ 重新启用时,「向下取到 2 位」的落地值必须一并恢复 —— 那条历史缺陷(配 49.999 写进
  // 50.00 反而超线 → 点不动也不消失的按钮)的完整说明留在 wallet-withdraw.vue 里
  // smallAmountLine 定义正上方,别只把那个 computed 改掉。
  check("🔴 首审提示按判定结果显示,不再常显(否则与免审横幅当场对打)",
    pgSrc.includes('const firstTimeReviewApplies = computed(() => eligibility.value.riskReasons.includes("first-withdrawal-review"))')
      && pgSrc.includes('v-if="firstTimeReviewApplies"'));
  // 🔴 首审提示**不给时间承诺**。系统对人工复核没有任何推进机制(advanceArrival 对非 pass 恒不推进,
  // 实测把时间推到十年后仍不动),承诺一个没人兑现的时限是硬谎。
  // 曾试图新建配置项 manualReviewSlaHours 来「接单源」——但后台 D5 参数集里没有它、PRD 零命中,
  // 那只是把写死的 24 换个地方藏。这条同时守「不许再引入没有后台配置面的假配置项」。
  check("🔴 首审提示不做时间承诺,也不许再引入没有后台配置面的假配置项",
    pgSrc.includes("const firstTimeReviewText = computed(() => t.value.wallet.firstTimeReview);")
      && !readSrc("src/store/config-types.ts").includes("manualReviewSlaHours")
      && !readSrc("src/mock/platform-config.ts").includes("manualReviewSlaHours")
      && ["zh", "en", "vi"].every((l) => {
        const src = readSrc(`src/i18n/messages/${l}.ts`);
        const m = src.match(/firstTimeReview: "([^"]*)"/);
        // 判据写成语义:挖掉占位符后不许剩任何数字。不用 \b(只认 ASCII,中文那面完全不设防)、
        // 也不用「位数」近似(写「3 天」不红、含 $1,000 的正当文案反而假红)。
        return !!m && !/\d/.test(m[1].replace(/\{\w+\}/g, ""));
      }));
  check("🔴 免闸话术三语齐备且占位符是 {g}(写成 ${g} 会漏出一个裸美元符号)",
    ["zh", "en", "vi"].every((l) => {
      const src = readSrc(`src/i18n/messages/${l}.ts`);
      const m = src.match(/fastLaneOnBody: "([^"]*)"/);
      if (!m || !m[1].includes("{g}") || m[1].includes("${g}")) return false;
      // 🔴 码表必须在 waivedGates 这个块里查。原本做整文件子串搜索,而同名 code 在
      //    riskReasons 里也各有一份 —— 把 waivedGates 整块删掉这条照样 PASS,
      //    而删掉会让 waivedGateLines 对 undefined 取下标、横幅计算直接抛异常。
      const k = src.indexOf("waivedGates: {");
      if (k < 0) return false;
      const block = src.slice(k, src.indexOf("},", k));
      return block.includes('"new-address-hold":') && block.includes('"first-withdrawal-review":');
    }));
  check("🔴 码表缺失时降级为少显示一行,不炸页面",
    readSrc("src/lib/risk-reason-text.ts").includes("(t.wallet.waivedGates ?? {})"));
  // 🔴 提交在途,**参与建单的每一个输入都必须冻成快照**。
  // 曾经只冻了费用报价与 NEX 余额,唯独漏了报价的分母 —— 金额。而改金额的入口不止输入框:
  // 「全部提现」和降额 CTA 都是裸 <view @click>,提交转圈那 1.2 秒里照样点得动。
  // 后果(两个独立 agent 各自实测):下单读调用那一刻的值、写账单是 await 之后**重新读一次**同一个 ref
  // → 扣款 $30 / 单据 $30 / 账单 -$24,856;反向还能用 $50 的小额免审裁决建出全余额的自动放行单。
  check("🔴 提交在途金额冻结:handleSubmit 开头取快照,await 之后一律用它",
    (() => {
      const sig = pgSrc.indexOf("async function handleSubmit()");
      if (sig < 0) return false;
      // 从函数体的 `{` 开始配对 —— 从签名开始会被 `handleSubmit()` 的空参数括号立刻闭合
      const k = pgSrc.indexOf("{", sig);
      const body = k < 0 ? null : balancedBody(pgSrc, k);
      if (!body) return false;
      // 剥注释后找第一个真 await:金额快照必须在它之前,其后不许再出现裸 amountNum.value
      // (2026-08-04:金额快照并入统一提交快照 snap —— 账号/网络/地址/报价同刻冻结,
      //  全族判据在 selfcheck-withdraw-freeze;这里只守金额这一条,两边互为交叉验证)
      // 2026-08-11 幂等 P0:金额的来源多了一个 —— 未收口的上一次尝试(重放要发的是那一笔的
      // 金额,不是当前输入)。判据只放行这一个前缀,别的来源照红;「await 之后不许再读活值」
      // 这半条一字不改。
      const code = body.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");
      const s = code.search(/amount: (pending\?\.amount \?\? )?amountNum\.value,/);
      const a = code.indexOf("await ");
      if (s < 0 || a < 0 || s > a) return false;
      return !code.slice(a).includes("amountNum.value");
    })());
  check("🔴 提交在途金额冻结:两个改金额的入口都有 inputsLocked 守卫(输入框有 :disabled,它俩没有)",
    ["function useMax() {", "function useSmallAmountLine() {"].every((sig) => {
      const k = pgSrc.indexOf(sig);
      if (k < 0) return false;
      return pgSrc.slice(k, k + 200).includes("if (inputsLocked.value) return;");
    }));
  // 🔴 账单的运行余额只认服务端下发的 balanceAfter。旧实现把**自己算错的**值写进每条账单并落盘,
  // 读盘不剥的话页面会把那批旧错值(实测盘上就有 60.3065,真实余额两万四)原样渲染 ——
  // 等于把已修的 P0 换个方式放回去。
  check("🔴 读盘剥掉存量脏 balanceAfter(不剥 = 把旧错值原样渲染回去)",
    readSrc("src/store/bills.ts").includes("balanceAfter: _drop, ...rest"));
  check("🔴 store 不再自己算 balanceAfter(账单是**部分**流水,正推倒推都对不上)",
    !/b\.balanceAfter\s*=/.test(readSrc("src/store/bills.ts"))
      && !readSrc("src/pages/me/wallet-bills.vue").includes("const runningBalance = computed"));
  check("🔴 提现路径的时钟统一走 mockServerNow(不直读 Date.now)",
    !/Date\.now\(\)/.test(elgSrc));
}

// 🔴🔴 删除向的门(2026-08-11 R1)。门集体的盲区是**「该有的还在不在」**:
// 独立审计实测 —— 把本文件的日限整节删掉,输出是 `73 pass / 0 fail`、退出码 0,
// 没有任何东西会红。而本包处理旧门用的正是「删掉整节」这个动作,下一次即静默失守。
//
// 判据是**下限不是等式**:新增断言天天有,不该每次都来改这里;而删断言是罕见动作,
// 必须撞线。下限按「当前条数 - 5」留一点重构余量,加断言时不必动它,
// 真删掉一整节(几十条)必然击穿。
// 2026-08-16:112(提现本地扣款/账单旧门 11 格由服务端权威负向门替代,保留 5 格余量)。
const ASSERT_FLOOR = 107;
if (pass + fail < ASSERT_FLOOR) {
  console.log(`  FAIL  🔴🔴 断言总数 ${pass + fail} 跌破下限 ${ASSERT_FLOOR} —— 有断言被整段删除?`
    + ` 删门是重大动作:确要删,连同本行下限一起改,并在 commit 里写明删了哪一节、为什么。`);
  fail++;
}
// 🔴 汇总行报**实测覆盖**,不报循环上界(族 B 的根治:声明的数量 ≠ 实际的覆盖)。
console.log(`\n${pass} pass / ${fail} fail(断言总数 ${pass + fail},下限 ${ASSERT_FLOOR}`
  + ` · 实测:风控随机层 ${selfProof.s6?.fingerprints}/${selfProof.s6?.rounds} 种指纹`
  + ` · 日限 property ${selfProof.g1?.fingerprints} 种指纹,最长列表 ${selfProof.g1?.maxLen} 笔,拦/不拦 ${selfProof.g1?.reachedCases}/${selfProof.g1?.notReachedCases})`);
process.exit(fail ? 1 : 0);
