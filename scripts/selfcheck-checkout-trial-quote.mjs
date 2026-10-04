#!/usr/bin/env node
// 结算页试用报价「单源」自检 — node 直跑,零额外依赖,不起 dev server:
//   node scripts/selfcheck-checkout-trial-quote.mjs
//
// 守什么(2026-08-04 R2 P0,第一轮 trial-boundary 收敛的同型漏网):
// 第一轮把时间边界收敛成纯函数 resolveTrialAt,但只收了 store 内部,没收
// checkout.vue 这个消费者 —— 该页一半读 store 里未推进的原始 `status` ref
// (模式/促销/抵扣),一半读实时解析器(liveShadow*)。宽限期刚过、4s poll
// 未到的窗口里两边给出互斥答案,net 被拼成一个报价页从未展示过的数字并直接
// 从余额扣走。本门焊死三条不变量:
//   ① 单一时刻、单一解析:结算路径所有试用派生值出自一次 trialQuoteAt(now)
//   ② 展示与扣款同源:确认页净额 == 实际扣款净额(同一份报价快照)
//   ③ 越界拒单:解析说不可转化 → 零扣款零建单;convert() 返回 false(裁决在扣款之后,
//     见 W8)→ 不建单且刚扣的钱精确退回,退不回去走响亮终态
//
// 执行的是真实现:resolveTrialAt/accruedShadow 由 esbuild bundle 真跑;
// computeTrialOffset/computeDiscountedPrice 从 trial-config.ts 源码切片转译;
// trialQuoteAt / 展示侧 computed / netPrice / 支付时刻整段结算块 全部从
// checkout.vue 源码切片转译后执行 —— 把守卫从页面里摘掉,本门立刻转红。
// 防空集假绿:任一切片提取不到 / 断言总数低于地板 → exit 1,不允许「找不到 = 全过」。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildSync, transformSync } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const die = (msg) => {
  console.error(`FAIL ${msg}`);
  process.exit(1);
};

let pass = 0;
let fail = 0;
const counts = { quote: 0, settle: 0, wiring: 0 };
function check(bucket, name, cond) {
  counts[bucket]++;
  if (cond) {
    pass++;
    console.log(`  PASS  [${bucket}] ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  [${bucket}] ${name}`);
  }
}

// ── 切片工具(与 selfcheck-trial-boundary.mjs 同手法)──
const readSrc = (...p) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");
function sliceDecl(src, marker, where) {
  const i = src.indexOf(marker);
  if (i < 0) die(`${where} 切片缺失: ${marker}`);
  const open = src.indexOf("{", i);
  if (open < 0) die(`${where} 切片无起始大括号: ${marker}`);
  let depth = 0;
  let j = open;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) {
        let k = j + 1;
        while (k < src.length && /\s/.test(src[k])) k++;
        if (src[k] === "{") continue;
        break;
      }
    }
  }
  if (depth !== 0) die(`${where} 切片大括号不配对: ${marker}`);
  const out = src.slice(i, j + 1);
  if (out.length < 40) die(`${where} 切片过短(空集?): ${marker}`);
  return out;
}
/** [from, to] 闭区间文本切片 —— 任一端标记消失即 die(不许静默少测一段)。 */
function sliceRange(src, from, to, where) {
  const i = src.indexOf(from);
  if (i < 0) die(`${where} 区间起点缺失: ${from}`);
  const j = src.indexOf(to, i);
  if (j < 0) die(`${where} 区间终点缺失: ${to}`);
  const out = src.slice(i, j + to.length);
  if (out.length < 80) die(`${where} 区间切片过短(空集?): ${from}`);
  return out;
}
/** 无花括号的表达式声明(如 `const netPrice = computed(() => ...);`):按括号深度
 *  走到第 0 层的 `;` 为止 —— 用 sliceDecl 的「找第一个 {」会吃到后面别的声明。 */
function sliceStatement(src, marker, where) {
  const i = src.indexOf(marker);
  if (i < 0) die(`${where} 语句切片缺失: ${marker}`);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ";" && depth === 0) {
      const out = src.slice(i, j + 1);
      if (out.length < 40) die(`${where} 语句切片过短(空集?): ${marker}`);
      return out;
    }
  }
  die(`${where} 语句切片找不到结束分号: ${marker}`);
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ── 载入真实现 1:trial-boundary.ts(bundle)──
const bundle = buildSync({
  entryPoints: [path.join(root, "src", "store", "trial-boundary.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const boundaryMod = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64")
);
const { resolveTrialAt, accruedShadow } = boundaryMod;
if (typeof resolveTrialAt !== "function" || typeof accruedShadow !== "function") {
  die("trial-boundary.ts: resolveTrialAt/accruedShadow export 缺失");
}

// ── 载入真实现 2:trial-config.ts 的两个纯价格函数(源码切片)──
const cfgSrc = readSrc("src", "store", "trial-config.ts");
const priceSlices = [
  sliceDecl(cfgSrc, "const TRIAL_CHECKOUT_PRODUCT_IDS", "trial-config.ts"),
  sliceDecl(cfgSrc, "export function resolveTrialCheckoutProductId", "trial-config.ts"),
  sliceDecl(cfgSrc, "export function computeDiscountedPrice", "trial-config.ts"),
  sliceDecl(cfgSrc, "export function computeTrialOffset", "trial-config.ts"),
].join("\n");

// ── 载入真实现 3:checkout.vue 的报价 + 结算真代码(源码切片)──
const coSrc = readSrc("src", "pages", "store", "checkout.vue");
const ifaceSlice = sliceDecl(coSrc, "interface TrialQuote", "checkout.vue");
const noTrialSlice = sliceDecl(coSrc, "const NO_TRIAL: TrialQuote", "checkout.vue");
const quoteFnSlice = sliceDecl(coSrc, "function trialQuoteAt(", "checkout.vue");
// 展示侧四个 computed:整块取,任何一个被改回读原始 status 都会带进来一起测
const viewSlice = sliceRange(
  coSrc,
  "const trialView = computed(",
  "const trialOffsetView = computed(() => trialView.value);",
  "checkout.vue",
);
const netPriceSlice = sliceStatement(coSrc, "const netPrice = computed(", "checkout.vue");
// 支付时刻结算块:从单一解析取时间戳,到扣款 + 试用转化裁决结束(含全部守卫)。
// 🔴 终点锚是**下一条语句的开头**(扣款成功后的旧机下架),再把这半截 if 削掉 ——
// 2026-08-04 R5 把 convert() 挪到扣款之后,原来以扣款行为终点的切片会把转化裁决
// 与退款分支整段切掉,门就再也看不见它们(切少了 = 静默漏测,与找不到同样危险)。
const PAY_END = "if (ti) {";
const paySlice = sliceRange(coSrc, "const payNow = mockServerNow();", PAY_END, "checkout.vue")
  .slice(0, -PAY_END.length);
if (!/freeTrial\.convert\(\s*p\.id\s*\)/.test(paySlice)) die("checkout.vue 结算切片里没有 convert(p.id) —— 切片区间与实现已经对不上");

// ── 装配可执行模块 ──
const assembled = `
${priceSlices}
export function build(deps) {
  // 2026-08-13 补两个桩:netPrice 切片里读了 remoteApiEnabled 与 tradein.appliedTradein,
  //   少任何一个,注入执行直接 ReferenceError —— 整道门崩掉、一格判据都没跑到
  //   (verify 里表现成「门失败」,极易被读成判据判红)。
  //   注意 tradein 与既有的 tradeinCredit 不是一回事:前者是 tradein store(带服务端
  //   权威报价),后者是本地折抵金额;同名近形,漏掉一个就静默少测一条分支。
  //   本段活在**模板字符串里**,注释里别用反引号 —— 会把模板提前闭合(实测栽过一次)。
  const { computed, resolveTrialAt, accruedShadow, mockServerNow, cardFeeUsd,
          toast, t, fmt, app, freeTrial, trialCfg, productId, product,
          voucherDiscount, tradeinCredit, nowTick, reportStuckFunds,
          remoteApiEnabled, tradein, activeSession, pending, voucher, appliedTradeinView } = deps;
${ifaceSlice}
${noTrialSlice}
${quoteFnSlice}
${viewSlice}
${netPriceSlice}
  async function settle(ctx) {
    const { trialQuote, quotedTotal, p, discount, ti, isCard, step, usedVoucherId } = ctx;
${paySlice}
    return { charged: true, chargeTotal, net, fee, applyTrial, promo,
             trialOffsetUSD, trialRemainderUSD, shadowNEXNow };
  }
  return { trialQuoteAt, trialView, trialConversionMode, promoDiscount, trialOffsetView, netPrice, settle };
}
`;
const { code } = transformSync(assembled, { loader: "ts", format: "esm" });
const mod = await import("data:text/javascript;base64," + Buffer.from(code, "utf8").toString("base64"));
if (typeof mod.build !== "function") die("checkout.vue 切片装配失败");

// ── 参照系:S1 试用机,3 天试用 + 7 天宽限,$649 ──
const D = 86_400_000;
const T0 = 1_700_000_000_000;
const CFG = {
  trialDays: 3, graceDays: 7, discountRate: 0.15, discountCapUSD: 20,
  trialOffsetCapUSD: 50, trialProductId: "stellarbox-s1", trialPriceUSD: 649,
  shadowDailyUSD: 7, shadowDailyNEX: 40,
};
const PRODUCT = { id: "stellarbox-s1", name: "StellarBox S1", price: 649 };
const rowGrace = {
  status: "grace", startedAt: T0, expiresAt: T0 + 3 * D, graceEndsAt: T0 + 10 * D,
  finishedAt: null, shadowFrozenAtUSD: 21, shadowFrozenAtNEX: 120, legacyCardMigrated: false,
};

const computedShim = (fn) => ({ get value() { return fn(); } });
const fmtShim = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ""));
const T = {
  value: {
    store: {
      coTrialQuoteChanged: "TRIAL_QUOTE_CHANGED",
      coTotalQuoteChanged: "TOTAL_QUOTE_CHANGED",
    },
    errors: { insufficientBalanceMsg: "INSUFFICIENT {amt}", txNotSavedTitle: "TX_NOT_SAVED", txNotSavedMsg: "TX_NOT_SAVED_MSG" },
    voucher: { quoteChanged: "VOUCHER_QUOTE_CHANGED" },
  },
};

/**
 * 搭一台结算台:注入指定的 store 行 / 时钟 / 余额 / 券 / 抵扣,拿到
 * 展示侧数字 + 结算结果。clockAt = 展示时刻,payClockAt = 支付时刻(模拟
 * 「确认页看到 → 几秒后落单」),两者可分别越界。
 */
async function bench(opts) {
  const {
    row, clockAt, payClockAt = clockAt, balance = 100_000, voucher = 0, tradein = 0,
    isCard = false, convertReturns = null, productId = "stellarbox-s1",
    // 上游污染注入(R3 P1 固定靶):商品价被写成非数值时,金额链全线 NaN。
    productPrice = null,
    // R5 固定靶:退款自己也落盘失败(补偿链的下一层),必须走响亮终态而不是通用文案。
    restoreFails = false,
    // 2026-08-17 pkg/ad(审计 R5 P1:R4 的两条钱路规则零机器门):
    //   invoiceAmount = 本页持有的链上发票票面;结算必须恰好按它成交(≠ 即拒单)。null = 无发票(卡 / 余额)。
    //   voucherClaimOk = 单次券核销 CAS 的判决(false = 别处已用掉这张券 → 必须拒单、零扣款)。
    invoiceAmount = null,
    voucherClaimOk = true,
  } = opts;
  const store = { row: { ...row }, converted: false };
  const toasts = [];
  const debits = [];
  const restores = [];
  const stuck = [];
  const voucherClaims = [];
  const voucherReleases = [];
  let payClock = payClockAt;
  const deps = {
    computed: computedShim,
    resolveTrialAt,
    accruedShadow,
    mockServerNow: () => payClock,
    cardFeeUsd: (n) => +(n * 0.029).toFixed(2),
    toast: { warn: (m) => toasts.push(m), error: (m) => toasts.push(m), success: () => {}, info: () => {} },
    t: T,
    fmt: fmtShim,
    app: {
      user: { usdtBalance: balance },
      debitBalance: (amt) => { debits.push(amt); if (balance < amt) return false; return true; },
      // 冲正基准与冲正本身(真语义在 app.ts / selfcheck-money-rollback):这里只需可观测
      // 「有没有退、退的是不是扣款前那份快照」,以及退款失败时页面怎么处置。
      captureMoney: () => ({ usdtBalance: balance, nexBalance: 0, withdrawableUsdt: balance, applied: { usdtBalance: 0, nexBalance: 0, withdrawableUsdt: 0 } }),
      restoreMoney: (snap) => { restores.push(snap); return !restoreFails; },
    },
    reportStuckFunds: (snap) => { stuck.push(snap); return "stuck"; },
    freeTrial: {
      snapshot: () => ({ ...store.row }),
      // convert() 的真判据在 free-trial.ts(已由 selfcheck-trial-boundary 的接线门
      // 看守:自取 server now → advanceTo → 非 active/grace 即 false)。这里复刻同一
      // 判据,并允许固定靶强制返回 false 以测「状态机拒绝」这条路径。
      convert: () => {
        if (convertReturns !== null) return { ok: convertReturns };
        const r = resolveTrialAt(store.row, payClock, CFG);
        if (r.status !== "active" && r.status !== "grace") return { ok: false, reason: "used" };
        store.row = { ...r, status: "converted", finishedAt: payClock };
        store.converted = true;
        return { ok: true };
      },
    },
    // 本 harness 验的是**本地报价链**;服务端权威抵扣报价(canonicalQuote)另有契约覆盖。
    // 钉成「没有服务端」让 netPrice 走本地那一支,与本门其余固定靶同一前提。
    // ⚠️ 这里的 `tradein` 是 tradein **store**,与下面 `tradeinCredit: { value: tradein }`
    //   里那个同名的**数字**折抵额不是一回事(后者是 bench 的 opts 参数)。
    remoteApiEnabled: false,
    tradein: { appliedTradein: null, state: { kind: "none" } },
    trialCfg: { value: CFG },
    productId: { value: productId },
    product: { value: PRODUCT },
    voucherDiscount: { value: voucher },
    tradeinCredit: { value: tradein },
    tradein: { appliedTradein: null },
    remoteApiEnabled: false,
    nowTick: { value: clockAt },
    // 2026-08-16 pkg/ad:结算块在扣款前先原子消费待支付发票(pending.consume);本 harness 验的是
    // 报价链,不持发票 —— 桩成「无发票」让该段跳过(发票一次性语义由 pending-checkout.test.ts 与
    // 运行时门 pending-checkout-runtime 场景 E 看守)。少这两个桩 = ReferenceError 整门崩掉。
    activeSession: { value: invoiceAmount == null ? null : { id: "inv-1", amountUsdt: invoiceAmount } },
    // R6:netPrice 的服务端权威抵扣报价改从 appliedTradeinView 读(不再直读全局槽);本 harness 钉本地链 → null
    appliedTradeinView: { value: null },
    pending: { consume: () => "consumed" },
    // 券 store:核销 = CAS 判决(先占后花);release = 之后失败面放回。真语义在 store/voucher.ts。
    voucher: {
      markUsed: (id) => { voucherClaims.push(id); return voucherClaimOk; },
      release: (id) => { voucherReleases.push(id); return true; },
    },
  };
  const api = mod.build(deps);
  // ── 展示侧:确认页此刻渲染的净额 / 总额(卡费按净额算,与页面同式)──
  const shownNet = api.netPrice.value;
  const shownFee = isCard ? deps.cardFeeUsd(shownNet) : 0;
  const shownTotal = +(shownNet + shownFee).toFixed(2);
  const snapshot = api.trialView.value; // = onConfirmPay 里的 trialQuote
  const mode = api.trialConversionMode.value;
  // ── 支付时刻:时钟推进到 payClockAt,跑真结算块(convert 会改写 store 行,
  //    所以展示侧读数必须在此之前取完 —— computed shim 无缓存,读一次算一次)──
  payClock = payClockAt;
  const step = { value: "confirmed" };
  const out = await api.settle({
    trialQuote: snapshot,
    quotedTotal: shownTotal,
    p: productPrice === null ? PRODUCT : { ...PRODUCT, price: productPrice },
    discount: voucher,
    ti: tradein > 0 ? { credit: tradein, device: { id: "dev-old", name: "Old" } } : null,
    isCard: { value: isCard },
    step,
    usedVoucherId: voucher > 0 ? "V-1" : null,
  });
  return { shownNet, shownTotal, snapshot, mode, out, step: step.value, toasts, debits, restores, stuck,
    converted: store.converted, voucherClaims, voucherReleases };
}

// ── ② 正常 grace 内 → 按展示净额扣款(基线:守卫不能误伤正常单)──
{
  const b = await bench({ row: rowGrace, clockAt: T0 + 5 * D });
  // grace 冻结影子 21 → offset 21(未触 50 上限);促销 min(649*0.15, 20) = 20
  check("quote", "②grace 内:模式生效,促销 20 / 抵扣 21 全部出自单次解析",
    b.mode === true && b.snapshot.promo === 20 && b.snapshot.offsetUSD === 21 && b.snapshot.remainderUSD === 0);
  check("quote", "②grace 内:展示净额 = 649 − 20 − 21 = 608", b.shownNet === 608);
  check("settle", "②grace 内:正常成交,扣款一次", b.out && b.out.charged === true && b.debits.length === 1);
  check("settle", "④展示净额 == 扣款净额(同一次解析)", b.out.chargeTotal === b.shownTotal && b.out.chargeTotal === 608);
  check("settle", "②转化落地:convert 成功且 NEX 影子 120 随快照入账",
    b.converted === true && b.out.shadowNEXNow === 120);
  check("settle", "②未误报任何拒单 toast", b.toasts.length === 0);
}

// ── ① 宽限期刚过、poll 未到 → 拒单,零扣款(本轮 P0 固定靶)──
{
  // 展示时刻还在 grace 内(报价含抵扣),支付时刻已越过 graceEndsAt。
  const b = await bench({ row: rowGrace, clockAt: T0 + 9 * D, payClockAt: T0 + 10 * D + 1000 });
  check("quote", "①展示时刻仍在 grace:报价含促销 + 抵扣", b.snapshot.applied === true && b.shownNet === 608);
  check("settle", "①支付时刻已越界 → 拒单(未返回成交)", b.out === undefined);
  check("settle", "①拒单时零扣款(debitBalance 一次都没调)", b.debits.length === 0);
  check("settle", "①退回 select-payment 并提示重新确认",
    b.step === "select-payment" && b.toasts.includes("TRIAL_QUOTE_CHANGED"));
  check("settle", "①拒单时试用未被转化(状态机没被烧掉)", b.converted === false);
  // 同一行、同一支付时刻,展示侧也已收回抵扣(≤1s ticker)——不再出现
  // 「模式说还能转化、影子说已结束」的互斥答案。
  const after = await bench({ row: rowGrace, clockAt: T0 + 10 * D + 1000 });
  check("quote", "①越界后展示侧同步收回:模式 false、促销/抵扣归零、净额回全价 649",
    after.mode === false && after.snapshot.promo === 0 && after.snapshot.offsetUSD === 0 && after.shownNet === 649);
}

// ── ①c 隔离越界守卫本身:强制状态机误放行(convert 返回 true),守卫若被摘掉
//    就会按报价把钱扣走 —— 这条靶专盯那道守卫,不靠 convert 兜底 ──
{
  const b = await bench({ row: rowGrace, clockAt: T0 + 9 * D, payClockAt: T0 + 10 * D + 1000, convertReturns: true });
  check("settle", "①c 状态机误放行时,越界解析仍独立拒单零扣款",
    b.out === undefined && b.debits.length === 0 && b.step === "select-payment");
}

// ── ①b 离线跨很久(级联):resolver 一次到 ended,同样拒单 ──
{
  const b = await bench({ row: rowGrace, clockAt: T0 + 9 * D, payClockAt: T0 + 90 * D });
  check("settle", "①b 离线跨 80 天:级联到 ended 仍拒单零扣款",
    b.out === undefined && b.debits.length === 0 && b.step === "select-payment");
}

// ── ③ $0 应付路径同样受守卫保护(券 + 抵扣把总额压到 0)──
{
  // 649 − 券 400 − 旧机 208 − 促销 20 − 抵扣 21 = 0
  const zeroOpts = { row: rowGrace, voucher: 400, tradein: 208 };
  const okZero = await bench({ ...zeroOpts, clockAt: T0 + 5 * D });
  check("quote", "③$0 路径:展示净额确为 0(直跳完成的判据来源)", okZero.shownNet === 0 && okZero.shownTotal === 0);
  check("settle", "③$0 路径正常时成交且扣款额为 0", okZero.out && okZero.out.chargeTotal === 0);
  const badZero = await bench({ ...zeroOpts, clockAt: T0 + 9 * D, payClockAt: T0 + 10 * D + 1000 });
  check("settle", "③$0 路径越界 → 同样拒单,绝不出现「展示 $0 却扣钱」",
    badZero.out === undefined && badZero.debits.length === 0 && badZero.step === "select-payment");
  // 缺陷复现基线:旧实现在此窗口会算出 net = 649−400−208−20−0 = 21 并扣走。
  check("settle", "③旧缺陷金额(21)不会被扣走", !badZero.debits.includes(21));
}

// ── ⑤ convert() 返回 false → 不建单,且刚扣的钱原样退回(返回值不许丢弃)──
//    2026-08-04 R5 改序:convert 是不可逆终态,排在扣款**之后**(扣款还有一条预检堵不住的
//    落盘失败路径,先 convert 就会「试用烧了、单没下」且不可恢复)。于是这条路径的正确处置
//    从「零扣款」变成「扣了必须精确退回」,退不回去则走响亮终态。
{
  const b = await bench({ row: rowGrace, clockAt: T0 + 5 * D, convertReturns: false });
  check("settle", "⑤convert 拒绝 → 不成交", b.out === undefined);
  check("settle", "⑤convert 拒绝 → 刚扣的钱被精确退回(退到扣款前那份快照)",
    b.debits.length === 1 && b.restores.length === 1 && b.restores[0].usdtBalance === 100_000);
  check("settle", "⑤convert 拒绝 → 回报价步 + 提示", b.step === "select-payment" && b.toasts.includes("TRIAL_QUOTE_CHANGED"));
  check("settle", "⑤convert 拒绝 → 未走响亮终态(退款成功时不该惊动客服)", b.stuck.length === 0);
  // R5 固定靶:退款自己也失败 —— 钱真扣着,不许再弹「报价已变」了事。
  const s = await bench({ row: rowGrace, clockAt: T0 + 5 * D, convertReturns: false, restoreFails: true });
  check("settle", "⑤🔴 退款也失败 → 走响亮终态(交易号 + 待对账),而不是通用「报价已变」",
    s.stuck.length === 1 && !s.toasts.includes("TRIAL_QUOTE_CHANGED"));
  check("settle", "⑤退款失败时仍然不建单、仍退回报价步", s.out === undefined && s.step === "select-payment");
  const okc = await bench({ row: rowGrace, clockAt: T0 + 5 * D, convertReturns: true });
  check("settle", "⑤convert 通过 → 正常扣款且不退款(守卫不误伤)",
    okc.out && okc.debits.length === 1 && okc.restores.length === 0);
}

// ── ④b 族级兜底闸:确认页之后总额变贵(旧机抵扣跌档)→ 拒单不静默补扣 ──
{
  const b = await bench({ row: rowGrace, clockAt: T0 + 5 * D, tradein: 100 });
  check("settle", "④b 基线:带旧机抵扣正常成交(649−20−21−100=508)", b.out && b.out.chargeTotal === 508);
  // 直接把「支付时刻的抵扣」调低,模拟累计收益跌档:quotedTotal 仍是确认页的 508
  const api = mod.build({
    computed: computedShim, resolveTrialAt, accruedShadow, mockServerNow: () => T0 + 5 * D,
    cardFeeUsd: (n) => +(n * 0.029).toFixed(2),
    toast: { warn: () => {}, success: () => {}, info: () => {} }, t: T, fmt: fmtShim,
    app: { user: { usdtBalance: 100_000 }, debitBalance: () => true },
    freeTrial: { snapshot: () => ({ ...rowGrace }), convert: () => ({ ok: true }) },
    trialCfg: { value: CFG }, productId: { value: "stellarbox-s1" }, product: { value: PRODUCT },
    voucherDiscount: { value: 0 }, tradeinCredit: { value: 100 }, nowTick: { value: T0 + 5 * D },
  });
  const step = { value: "confirmed" };
  const drift = await api.settle({
    trialQuote: api.trialView.value, quotedTotal: 508, p: PRODUCT, discount: 0,
    ti: { credit: 40, device: { id: "dev-old", name: "Old" } }, isCard: { value: false }, step,
  });
  check("settle", "④b 抵扣跌档(100→40,应付 508→568)→ 拒单,不静默多扣 60",
    drift === undefined && step.value === "select-payment");
}

// ── ④c 非试用 SKU / 非试用用户:守卫不改变原有普通购买 ──
{
  const other = await bench({ row: rowGrace, clockAt: T0 + 5 * D, productId: "stellarbox-pro" });
  check("quote", "④c 非试用 SKU:模式 false,净额 = 全价", other.mode === false && other.shownNet === 649);
  check("settle", "④c 非试用 SKU:照常成交,不调 convert", other.out && other.converted === false && other.debits.length === 1);
  const noneRow = { ...rowGrace, status: "none", startedAt: null, expiresAt: null, graceEndsAt: null, shadowFrozenAtUSD: 0, shadowFrozenAtNEX: 0 };
  const plain = await bench({ row: noneRow, clockAt: T0 + 5 * D, isCard: true });
  check("settle", "④c 无试用 + 卡支付:展示总额 == 扣款总额(含卡费)",
    plain.out && plain.out.chargeTotal === plain.shownTotal && plain.out.chargeTotal === +(649 + 649 * 0.029).toFixed(2));
}

// ── ④d active 态:抵扣随时间累计,但扣款只认确认页那份快照(不反向多扣)──
{
  const rowActive = { ...rowGrace, status: "active", shadowFrozenAtUSD: 0, shadowFrozenAtNEX: 0 };
  // 展示时刻 T0+2d → 累计 14;支付时刻 T0+2.5d → 累计 17.5(更多)。
  const b = await bench({ row: rowActive, clockAt: T0 + 2 * D, payClockAt: T0 + 2.5 * D });
  check("quote", "④d active:展示时刻抵扣 = 累计 14(冻结窗口内)", b.snapshot.offsetUSD === 14);
  check("settle", "④d 扣款仍按快照 649−20−14=615(所见即所付,不因期间累计而变)",
    b.out && b.out.chargeTotal === 615 && b.out.chargeTotal === b.shownTotal);
}

// ── 接线门:守卫真的接在页面上(摘线即红)──
{
  const bare = stripComments(coSrc);
  check("wiring", "W1 页面不再直接读原始 freeTrial.status(单源铁律)", !/freeTrial\.status/.test(bare));
  check("wiring", "W2 页面不再 import liveShadowUSD/liveShadowNEX(混源入口已封)",
    !/liveShadowUSD|liveShadowNEX/.test(bare));
  check("wiring", "W3 展示侧四个 computed 全部由 trialView 派生",
    /const trialView = computed\(\(\) => trialQuoteAt\(nowTick\.value\)\)/.test(bare) &&
    /const trialConversionMode = computed\(\(\) => trialView\.value\.applied\)/.test(bare) &&
    /const promoDiscount = computed\(\(\) => trialView\.value\.promo\)/.test(bare) &&
    /const trialOffsetView = computed\(\(\) => trialView\.value\)/.test(bare));
  check("wiring", "W4 报价快照直接取展示侧那次解析(不二次重算)", /trialQuote = trialView\.value;/.test(bare));
  const payBare = stripComments(paySlice);
  check("wiring", "W5 结算块只解析一次(单个 trialQuoteAt 调用 + 单个 mockServerNow)",
    (payBare.match(/trialQuoteAt\(/g) || []).length === 1 && (payBare.match(/mockServerNow\(/g) || []).length === 1);
  check("wiring", "W6 结算金额全部取自 trialQuote 快照,不读展示 computed 的活值",
    /trialQuote\.promo/.test(payBare) && /trialQuote\.offsetUSD/.test(payBare) &&
    /trialQuote\.remainderUSD/.test(payBare) && /trialQuote\.shadowNEX/.test(payBare) &&
    !/promoDiscount\.value/.test(payBare) && !/trialOffsetView\.value/.test(payBare) &&
    !/trialConversionMode\.value/.test(payBare));
  const idxDebit = bare.indexOf("app.debitBalance(chargeTotal)");
  const convertCalls = [...bare.matchAll(/freeTrial\.convert\(\s*p\.id\s*\)/g)];
  const localConvert = convertCalls.find((match) => match.index > idxDebit);
  const idxConvert = localConvert?.index ?? -1;
  check("wiring", "W7 convert(p.id) 返回值被判定(不许丢弃)", /if\s*\(applyTrial\s*&&\s*!\(\s*await\s+freeTrial\.convert\(\s*p\.id\s*\)\)\.ok\s*\)/.test(payBare));
  const idxOrder = bare.indexOf("orders.createOrder(");
  // 🔴 R5 反转:convert() 是不可逆终态,必须排在扣款**之后** —— 扣款的落盘失败路径是
  // 只读预检堵不住的,先 convert 就会「试用烧了、钱没扣、单没下」,且用户无从恢复。
  check("wiring", "W8 convert 判定在扣款之后(不可逆终态不许排在钱扣住之前)",
    idxConvert > 0 && idxDebit > 0 && idxDebit < idxConvert);
  check("wiring", "W8b convert 失败分支必须退款,且退款返回值被消费(退不回去 → 响亮终态)",
    /(?:if\s*\(|const \w+ = )app\.restoreMoney\(beforePay\)/.test(payBare) && /reportStuckFunds\(beforePay/.test(payBare));
  check("wiring", "W9 建单在扣款之后(任一前置守卫 return 都必然零建单)", idxOrder > idxDebit);
  check("wiring", "W10 族级兜底闸在位:扣款额超过展示总额一律拒单",
    /if\s*\(chargeTotal > quotedTotal\)/.test(payBare));
  check("wiring", "W11 quotedTotal 来自确认页展示的净额 + 卡费",
    /quotedTotal = \+\(netPrice\.value \+ cardFee\.value\)\.toFixed\(2\)/.test(bare));
  check("wiring", "W12 $0 直跳完成的判据也走快照总额(与扣款同一个数)",
    /step\.value = quotedTotal === 0 \? "confirmed" : "pay-instructions"/.test(bare));
  // i18n:拒单提示必须有真文案(三语),否则 toast 渲染 undefined = 守卫等于哑火
  for (const lang of ["en", "zh", "vi"]) {
    const m = readSrc("src", "i18n", "messages", `${lang}.ts`);
    check("wiring", `W13-${lang} store.coTotalQuoteChanged 文案存在`, /coTotalQuoteChanged:\s*"[^"]{4,}"/.test(m));
  }
}

// ── ⑥ 非数值金额(R3 P1):NaN 比较恒为假 → 族级兜底闸与余额预检**都会静默放行**,
//    convert() 会把试用打成不可逆终态,而 debitBalance(NaN) 被 store 守卫拒掉 ——
//    净结果「单没下、钱没扣、试用永久没了」。守卫必须排在任何终态副作用之前。
{
  const b = await bench({ row: rowGrace, clockAt: T0 + 5 * D, productPrice: Number.NaN });
  check("settle", "⑥金额非数值 → 拒单(不成交)", b.out === undefined);
  check("settle", "⑥金额非数值 → 零扣款", b.debits.length === 0);
  check("settle", "⑥金额非数值 → 试用**未被烧成终态**(守卫排在 convert 之前)", b.converted === false);
  check("settle", "⑥金额非数值 → 回报价步 + 提示", b.step === "select-payment" && b.toasts.length > 0);
}

// ── ⑦ 链上发票按票面恰好成交(R4 P1 / R5 P1 机器门):实扣 ≠ 票面 → 拒单零扣款;相等 → 成交 ──
{
  const exact = await bench({ row: rowGrace, clockAt: T0 + 5 * D, invoiceAmount: 608 });
  check("settle", "⑦票面 608 = 实扣 608 → 成交", exact.out && exact.out.charged === true && exact.debits.length === 1);
  const under = await bench({ row: rowGrace, clockAt: T0 + 5 * D, invoiceAmount: 649 });
  check("settle", "⑦票面 649 > 实扣 608(窗内多出的优惠)→ 拒单,零扣款", under.out === undefined && under.debits.length === 0);
  check("settle", "⑦票面不等 → 回报价步 + 「金额已变」提示", under.step === "select-payment" && under.toasts.includes("TOTAL_QUOTE_CHANGED"));
  const over = await bench({ row: rowGrace, clockAt: T0 + 5 * D, invoiceAmount: 600 });
  check("settle", "⑦票面 600 < 实扣 608(优惠没了)→ 票面闸拒单,零扣款", over.out === undefined && over.debits.length === 0);
  check("settle", "⑦拒单时试用未被烧成终态", under.converted === false && over.converted === false);
}

// ── ⑧ 单次券先占后花(R5 P0):核销 CAS 排在扣款之前;抢不到 → 拒单零扣款;之后失败 → 放回 ──
{
  const win = await bench({ row: rowGrace, clockAt: T0 + 5 * D, voucher: 100 });
  check("settle", "⑧券核销成功 → 成交,核销恰一次且排在扣款之前", win.out && win.voucherClaims.length === 1 && win.debits.length === 1);
  const lose = await bench({ row: rowGrace, clockAt: T0 + 5 * D, voucher: 100, voucherClaimOk: false });
  check("settle", "⑧券已在别处用掉(CAS 失败)→ 拒单,零扣款,试用未烧", lose.out === undefined && lose.debits.length === 0 && lose.converted === false);
  check("settle", "⑧券 CAS 失败 → 回报价步 + 券提示", lose.step === "select-payment" && lose.toasts.includes("VOUCHER_QUOTE_CHANGED"));
  const later = await bench({ row: rowGrace, clockAt: T0 + 5 * D, voucher: 100, convertReturns: false });
  check("settle", "⑧核销后 convert 拒绝 → 券放回(release 恰一次)+ 退款", later.out === undefined && later.voucherReleases.length === 1 && later.restores.length === 1);
  const noVoucher = await bench({ row: rowGrace, clockAt: T0 + 5 * D });
  check("settle", "⑧无券单不碰券 store(既不核销也不放回)", noVoucher.voucherClaims.length === 0 && noVoucher.voucherReleases.length === 0);
}

// ── 收口:样本量地板(防空集假绿)──
const total = pass + fail;
if (total < 40) die(`断言总数 ${total} < 40 地板 —— 固定靶被整段删除/跳过?`);
if (fail > 0) {
  console.error(`FAIL checkout-trial-quote: ${fail}/${total} 固定靶未过(quote=${counts.quote} settle=${counts.settle} wiring=${counts.wiring})`);
  process.exit(1);
}
console.log(`PASS checkout trial quote single-source: ${total} asserts (quote=${counts.quote} settle=${counts.settle} wiring=${counts.wiring}), 0 fail`);
