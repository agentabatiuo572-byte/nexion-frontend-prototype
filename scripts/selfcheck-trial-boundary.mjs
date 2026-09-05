#!/usr/bin/env node
// TRIAL02 试用时间边界单一不变量自检 — node 直跑,零额外依赖,不起 dev server:
//   node scripts/selfcheck-trial-boundary.mjs
//
// 守什么(2026-08-03 缺陷族 1×P0+3×P1 同根):时间边界判定必须全部收敛到
// src/store/trial-boundary.ts 的 resolveTrialAt 一个纯函数。固定靶:
//   ① 离线跨宽限期后 convert 必拒(级联一次到位,resolve 即 ended)
//   ② 后台改 trialDays 不追溯影响存量用户已冻结窗口(调大/调小各靶)
//   ③ 边界推进的 finishedAt = 真实越过的边界值,不是 now
//   ④ graceEndsAt=null 的存量行就地补齐并能走到 ended(fail-closed 不留敞口)
//   ⑤ 全迁移矩阵:5 档旧枚举(idle/extended/redeemed/failed/cancelled)×
//     各时间形态(未到期/已过期未过宽限/已过宽限/无 graceEndsAt)逐档落点
//   ⑥ converted/ended 终态不被 resolver 改动(同引用返回)
// 外加接线门(判定对 ≠ 接上了,两道门缺一即漏):convert/poll/eligibility/
// liveShadow*/migrateRow 必须真的路由到 resolver;cancel 显式取消窗口不被抢;
// convert() 签名冻结(无参返回 boolean,并发协作契约)。
//
// 执行的是真实现:trial-boundary.ts 经 esbuild bundle 直接跑;migrateRow/INITIAL
// 从 free-trial.ts 源码切片转译后跑(与 selfcheck-deposits.mjs 同模式)。
// 防空集假绿:切片缺失/断言总数低于地板 → exit 1,不允许「找不到 = 全过」。
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
const counts = { boundary: 0, matrix: 0, wiring: 0 };
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

// ── 载入真实现 1:trial-boundary.ts(bundle,连 server-time 常量一起)──
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
  die("trial-boundary.ts: resolveTrialAt/accruedShadow export 缺失(被改名/删除?)");
}

// ── 载入真实现 2:free-trial.ts 的 INITIAL + migrateRow(源码切片 → 转译执行)──
const ftSrc = readFileSync(path.join(root, "src", "store", "free-trial.ts"), "utf8").replace(/\r\n/g, "\n");
function sliceDecl(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) die(`free-trial.ts 切片缺失: ${marker}`);
  const open = src.indexOf("{", i);
  if (open < 0) die(`free-trial.ts 切片无起始大括号: ${marker}`);
  let depth = 0;
  let j = open;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) {
        // 对象型返回值注解(如 eligibility 的 `: { ok; reason? }`)会先于函数体
        // 闭合 —— 若紧随其后的非空白字符仍是 `{`,说明真正的函数体在后面,继续吃。
        let k = j + 1;
        while (k < src.length && (src[k] === " " || src[k] === "\t" || src[k] === "\n" || src[k] === "\r")) k++;
        if (src[k] === "{") continue;
        // 🔴 2026-08-14:还有第二种形状 —— `Promise<{ … }>`。这时对象大括号闭合后
        //   跟的是 `>`(可能还有 `[]`/空白)而不是 `{`,上面那条认不出来,于是切片
        //   在**函数签名处就停了**。实测 `async function cancel(): Promise<{ ok; reason? }>`
        //   被切成 74 字的签名,而真身 1495 字 —— 判据全在一段空文本上跑:
        //   `indexOf(x) >= 0` 恒假(判红,这次就是它),而 `indexOf(x) < 0` **恒真(假绿)**。
        //   后者更危险:同一格里两个方向的合取项,红的那半掩盖了绿的那半没在守东西。
        //   这里继续往后吃到真正的函数体大括号。
        let m = k;
        while (m < src.length && (src[m] === ">" || src[m] === "[" || src[m] === "]"
          || src[m] === " " || src[m] === "\t" || src[m] === "\n" || src[m] === "\r")) m++;
        if (src[m] === "{") { j = m - 1; depth = 0; continue; }
        break;
      }
    }
  }
  if (depth !== 0) die(`free-trial.ts 切片大括号不配对: ${marker}`);
  const out = src.slice(i, j + 1);
  if (out.length < 40) die(`free-trial.ts 切片过短(空集?): ${marker}`);
  return out;
}
const initialSlice = sliceDecl(ftSrc, "const INITIAL");
const migrateSlice = sliceDecl(ftSrc, "function migrateRow");
const assembled = `export function makeMigrate(accruedShadow) {\n${initialSlice};\n${migrateSlice}\nreturn migrateRow;\n}\n`;
const { code: migCode } = transformSync(assembled, { loader: "ts", format: "esm" });
const migMod = await import("data:text/javascript;base64," + Buffer.from(migCode, "utf8").toString("base64"));
const migrateRow = migMod.makeMigrate(accruedShadow);
if (typeof migrateRow !== "function") die("migrateRow 切片装配失败");

// ── 固定参照系 ──
const D = 86_400_000;
const T0 = 1_700_000_000_000;
const cfg = { trialDays: 3, graceDays: 7, shadowDailyUSD: 7, shadowDailyNEX: 40 };
const rowActive = {
  status: "active", startedAt: T0, expiresAt: T0 + 3 * D, graceEndsAt: T0 + 10 * D,
  finishedAt: null, shadowFrozenAtUSD: 0, shadowFrozenAtNEX: 0, legacyCardMigrated: false,
};

// ── ① 离线跨宽限期 → 一次 resolve 级联到 ended,convert 门必拒 ──
{
  const res = resolveTrialAt(rowActive, T0 + 11 * D, cfg);
  check("boundary", "①离线跨宽限期:active 一次级联到 ended(不一格一停)", res.status === "ended");
  check("boundary", "①convert 门按解析后状态拒绝(非 active/grace)", res.status !== "active" && res.status !== "grace");
  check("boundary", "①路过 grace 时按冻结窗口定格影子值 21/120", res.shadowFrozenAtUSD === 21 && res.shadowFrozenAtNEX === 120);
  check("boundary", "①resolver 不改输入行(纯函数)", rowActive.status === "active" && rowActive.finishedAt === null);
  check("boundary", "①幂等:对 ended 结果再 resolve 返回同引用", resolveTrialAt(res, T0 + 11 * D, cfg) === res);
  // ── ③ finishedAt = 真边界,不是 now ──
  check("boundary", "③finishedAt = graceEndsAt 真边界值", res.finishedAt === T0 + 10 * D);
  check("boundary", "③finishedAt ≠ 调用时刻 now", res.finishedAt !== T0 + 11 * D);
}

// ── ② 后台改 trialDays 不追溯影响存量用户冻结窗口 ──
{
  const cfg30 = { ...cfg, trialDays: 30 };
  const cfg1 = { ...cfg, trialDays: 1 };
  const up = resolveTrialAt(rowActive, T0 + 4 * D, cfg30);
  check("boundary", "②调大 trialDays=30:存量 3 天窗口到点仍转 grace(不续命)", up.status === "grace");
  check("boundary", "②调大后冻结影子仍 = 冻结窗口 3d(21/120,非 28+)", up.shadowFrozenAtUSD === 21 && up.shadowFrozenAtNEX === 120);
  check("boundary", "②调大后累计上限仍 = 冻结窗口(5d 时点累计 21 非 35)", accruedShadow(rowActive, T0 + 5 * D, cfg30).usd === 21);
  check("boundary", "②调小 trialDays=1:存量窗口内累计不受压(2d 累计 14 非 7)", accruedShadow(rowActive, T0 + 2 * D, cfg1).usd === 14);
  check("boundary", "②调小不提前掐断存量窗口(2d 时点仍 active,同引用)", resolveTrialAt(rowActive, T0 + 2 * D, cfg1) === rowActive);
}

// ── ④ graceEndsAt=null 存量行:就地补齐 / fail-closed,绝不永久卡死 ──
{
  const stuck = { ...rowActive, status: "grace", graceEndsAt: null, shadowFrozenAtUSD: 21, shadowFrozenAtNEX: 120 };
  const thaw = resolveTrialAt(stuck, T0 + 4 * D, cfg);
  check("boundary", "④补齐:grace+null 边界补为 expiresAt+graceDays(倒计时解冻)", thaw.status === "grace" && thaw.graceEndsAt === T0 + 10 * D);
  const done = resolveTrialAt(stuck, T0 + 11 * D, cfg);
  check("boundary", "④补齐后可走到 ended(不再永久卡宽限态)", done.status === "ended");
  check("boundary", "④补齐路径 finishedAt 也取真边界(T0+10d)", done.finishedAt === T0 + 10 * D);
  const voidRow = { status: "grace", startedAt: null, expiresAt: null, graceEndsAt: null, finishedAt: null, shadowFrozenAtUSD: 5, shadowFrozenAtNEX: 10, legacyCardMigrated: false };
  const closed = resolveTrialAt(voidRow, T0 + 99 * D, cfg);
  check("boundary", "④fail-closed:边界完全不可知的 grace 行立即收敛 ended", closed.status === "ended" && closed.finishedAt === T0 + 99 * D);
  const noExp = { ...rowActive, expiresAt: null, graceEndsAt: null };
  const cascaded = resolveTrialAt(noExp, T0 + 20 * D, cfg);
  check("boundary", "④active 缺 expiresAt:从 startedAt 补齐并级联到 ended", cascaded.status === "ended" && cascaded.finishedAt === T0 + 10 * D);
  const bare = { status: "active", startedAt: null, expiresAt: null, graceEndsAt: null, finishedAt: null, shadowFrozenAtUSD: 0, shadowFrozenAtNEX: 0, legacyCardMigrated: false };
  const bareRes = resolveTrialAt(bare, T0, cfg);
  check("boundary", "④fail-closed:无任何锚点的 active 行收敛 ended 且零影子", bareRes.status === "ended" && bareRes.shadowFrozenAtUSD === 0);
}

// ── ⑥ 终态不可变 + 显式取消窗口不被抢 ──
{
  const conv = { ...rowActive, status: "converted", finishedAt: T0 + 2 * D, shadowFrozenAtUSD: 14, shadowFrozenAtNEX: 80 };
  check("boundary", "⑥converted 终态:时间全越界也同引用返回,零改动", resolveTrialAt(conv, T0 + 99 * D, cfg) === conv);
  const endedRow = { ...rowActive, status: "ended", finishedAt: T0 + 5 * D };
  check("boundary", "⑥ended 终态:同引用返回,finishedAt 不被重写", resolveTrialAt(endedRow, T0 + 99 * D, cfg) === endedRow);
  const noneRow = { ...rowActive, status: "none" };
  check("boundary", "⑥none 行同引用返回(无时钟可推)", resolveTrialAt(noneRow, T0 + 99 * D, cfg) === noneRow);
  check("boundary", "⑥未到界的 active 行同引用返回(cancel 显式窗口不被隐性关闭)", resolveTrialAt(rowActive, T0 + 1 * D, cfg) === rowActive);
}

// ── ⑤ 全迁移矩阵:5 档旧枚举 × 时间形态(真 migrateRow → 真 resolver 全链)──
{
  const mig = (row) => migrateRow(row, cfg);
  const m1 = mig({ status: "idle", startedAt: T0 });
  check("matrix", "⑤idle → none;resolver 同引用", m1.status === "none" && resolveTrialAt(m1, T0 + 99 * D, cfg) === m1);

  const m2 = mig({ status: "extended", startedAt: T0, activeEndsAt: T0 + 3 * D, extendedEndsAt: T0 + 9 * D });
  check("matrix", "⑤extended(未过宽限)→ grace;activeEndsAt→expiresAt;边界取 extendedEndsAt", m2.status === "grace" && m2.expiresAt === T0 + 3 * D && m2.graceEndsAt === T0 + 9 * D);
  check("matrix", "⑤extended 缺冻结影子 → 按冻结窗口补齐 21/120(同根一并修)", m2.shadowFrozenAtUSD === 21 && m2.shadowFrozenAtNEX === 120);
  check("matrix", "⑤extended(未过宽限)resolver 不动(同引用)", resolveTrialAt(m2, T0 + 4 * D, cfg) === m2);
  const m3 = resolveTrialAt(m2, T0 + 9 * D, cfg);
  check("matrix", "⑤extended(已过宽限)→ ended,finishedAt=真边界 T0+9d", m3.status === "ended" && m3.finishedAt === T0 + 9 * D);

  const m4 = mig({ status: "extended", startedAt: T0, activeEndsAt: T0 + 3 * D, graceEndsAt: T0 + 8 * D, extendedEndsAt: T0 + 9 * D });
  check("matrix", "⑤extended 双边界取较晚者(max 合并)", m4.graceEndsAt === T0 + 9 * D);

  const m5 = mig({ status: "extended", startedAt: T0, activeEndsAt: T0 + 3 * D });
  check("matrix", "⑤extended(无 graceEndsAt)→ grace 且边界为 null(留待 resolver 补)", m5.status === "grace" && m5.graceEndsAt === null);
  const m5a = resolveTrialAt(m5, T0 + 4 * D, cfg);
  check("matrix", "⑤null 边界存量行 resolver 补齐 T0+10d 并维持 grace", m5a.status === "grace" && m5a.graceEndsAt === T0 + 10 * D);
  const m5b = resolveTrialAt(m5, T0 + 11 * D, cfg);
  check("matrix", "⑤null 边界存量行越界后落 ended,finishedAt=补齐边界", m5b.status === "ended" && m5b.finishedAt === T0 + 10 * D);

  const cfgHot = { ...cfg, shadowDailyUSD: 99, shadowDailyNEX: 999 };
  const m6 = migrateRow({ status: "extended", startedAt: T0, activeEndsAt: T0 + 3 * D, extendedEndsAt: T0 + 9 * D, shadowFrozenAtUSD: 33, shadowFrozenAtNEX: 200 }, cfgHot);
  check("matrix", "⑤已有冻结影子的行不被重算(33/200 保留,改档费率不追溯)", m6.shadowFrozenAtUSD === 33 && m6.shadowFrozenAtNEX === 200);

  const m7 = mig({ status: "redeemed", startedAt: T0, finishedAt: T0 + 2 * D });
  check("matrix", "⑤redeemed → converted;resolver 终态同引用", m7.status === "converted" && resolveTrialAt(m7, T0 + 99 * D, cfg) === m7);
  const m8 = mig({ status: "failed", startedAt: T0, finishedAt: T0 + 2 * D });
  check("matrix", "⑤failed → ended;finishedAt 保留;resolver 同引用", m8.status === "ended" && m8.finishedAt === T0 + 2 * D && resolveTrialAt(m8, T0 + 99 * D, cfg) === m8);
  const m9 = mig({ status: "cancelled", startedAt: T0 });
  check("matrix", "⑤cancelled → ended;resolver 同引用", m9.status === "ended" && resolveTrialAt(m9, T0 + 99 * D, cfg) === m9);

  const m10 = mig({ status: "active", startedAt: T0, activeEndsAt: T0 + 3 * D, cardTokenId: "tok_1" });
  check("matrix", "⑤卡时代 active:activeEndsAt→expiresAt + legacyCardMigrated 标记", m10.status === "active" && m10.expiresAt === T0 + 3 * D && m10.legacyCardMigrated === true);
  const m10a = resolveTrialAt(m10, T0 + 4 * D, cfg);
  check("matrix", "⑤卡时代 active(已过期未过宽限)→ grace,冻结 21/120", m10a.status === "grace" && m10a.shadowFrozenAtUSD === 21 && m10a.shadowFrozenAtNEX === 120);
  const m10b = resolveTrialAt(m10, T0 + 11 * D, cfg);
  check("matrix", "⑤卡时代 active(已过宽限)→ ended,finishedAt=补齐边界 T0+10d", m10b.status === "ended" && m10b.finishedAt === T0 + 10 * D);

  const m11 = mig({ status: "garbage-unknown" });
  check("matrix", "⑤未知枚举 → INITIAL(none,全空)", m11.status === "none" && m11.startedAt === null && m11.expiresAt === null);
  const m12 = mig({ status: "grace", startedAt: T0, expiresAt: T0 + 3 * D, graceEndsAt: T0 + 10 * D, shadowFrozenAtUSD: 21, shadowFrozenAtNEX: 120 });
  check("matrix", "⑤现行 grace 行直通(冻结值原样,不触发补齐)", m12.shadowFrozenAtUSD === 21 && m12.graceEndsAt === T0 + 10 * D);
}

// ── 接线门:判定函数存在且各调用点真的路由到 resolver(摘线即红)──
{
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const body = (marker) => stripComments(sliceDecl(ftSrc, marker));
  const convertBody = body("async function convert(");
  const advanceBody = body("function advanceTo(");
  const pollBody = body("function poll(");
  const eligBody = body("function eligibility(");
  const cancelStart = ftSrc.indexOf("async function cancel()");
  const cancelEnd = ftSrc.indexOf("// PRODUCTION: client polls", cancelStart);
  if (cancelStart < 0 || cancelEnd <= cancelStart) die("free-trial.ts cancel 函数边界缺失");
  const cancelBody = stripComments(ftSrc.slice(cancelStart, cancelEnd));
  const shadowUSDBody = body("export function liveShadowUSD(");
  const shadowNEXBody = body("export function liveShadowNEX(");
  const migBody = stripComments(migrateSlice);

  check("wiring", "W-convert 签名冻结:async 返回结果对象(并发协作契约)", /async function convert\([^)]*\): Promise<\{/.test(ftSrc));
  check("wiring", "W-convert 内部自取 mockServerNow(不吃调用方缓存 now)", convertBody.indexOf("mockServerNow()") >= 0 && convertBody.indexOf("Date.now") < 0);
  check("wiring", "W-convert 先走 advanceTo 推进边界再判可转化", convertBody.indexOf("advanceTo(") >= 0);
  check("wiring", "W-convert 远程分支调用权威 convert 并读回 converted", convertBody.indexOf("trialApi.convert(") >= 0
    && convertBody.indexOf("refreshRemote(true)") >= 0 && convertBody.indexOf('status.value !== "converted"') >= 0);
  check("wiring", "W-advanceTo 路由到 resolveTrialAt 且变更才落盘", advanceBody.indexOf("resolveTrialAt(") >= 0 && advanceBody.indexOf("persist()") >= 0);
  check("wiring", "W-poll 整体委托 advanceTo(无手写边界比对)", pollBody.indexOf("advanceTo(") >= 0 && pollBody.indexOf(">=") < 0);
  check("wiring", "W-eligibility 按解析后状态判(resolveTrialAt 接上)", eligBody.indexOf("resolveTrialAt(") >= 0);
  check("wiring", "W-cancel 显式取消窗口语义不变(不被 resolver 抢占)", cancelBody.indexOf("resolveTrialAt(") < 0 && cancelBody.indexOf("advanceTo(") < 0 && cancelBody.indexOf('status.value !== "active"') >= 0);
  check("wiring", "W-liveShadowUSD 只读 resolver 结果,渲染路径零落盘", shadowUSDBody.indexOf("resolveTrialAt(") >= 0 && shadowUSDBody.indexOf("persist(") < 0 && shadowUSDBody.indexOf("advanceTo(") < 0);
  check("wiring", "W-liveShadowNEX 只读 resolver 结果,渲染路径零落盘", shadowNEXBody.indexOf("resolveTrialAt(") >= 0 && shadowNEXBody.indexOf("persist(") < 0 && shadowNEXBody.indexOf("advanceTo(") < 0);
  check("wiring", "W-migrateRow 冻结补齐走 accruedShadow 单源公式", migBody.indexOf("accruedShadow(") >= 0);
  const handRolled = stripComments(ftSrc);
  check("wiring", "W-free-trial.ts 无残留手写边界比对(>= expiresAt/graceEndsAt)", !/>=\s*expiresAt\.value/.test(handRolled) && !/>=\s*graceEndsAt\.value/.test(handRolled));
}

// ── 收口:样本量地板(防空集假绿)──
const total = pass + fail;
if (total < 35) die(`断言总数 ${total} < 35 地板 —— 固定靶被整段删除/跳过?`);
if (fail > 0) {
  console.error(`FAIL trial-boundary: ${fail}/${total} 固定靶未过(boundary=${counts.boundary} matrix=${counts.matrix} wiring=${counts.wiring})`);
  process.exit(1);
}
console.log(`PASS trial-boundary invariant: ${total} asserts (boundary=${counts.boundary} matrix=${counts.matrix} wiring=${counts.wiring}), 0 fail`);
