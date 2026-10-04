#!/usr/bin/env node
/**
 * 提现资金门**整族**的红测 —— 哨兵失效即门失效。
 * (文件名沿用首次落地时的由头「rail-alias」;现已扩到钉 fastlane 里提现资金那一族门。)
 *
 * 覆盖四格,每格都要求变异后红的**正是那一格**(不是隔壁格):
 *   · 扣退**同档**(标志按等价类解析 + 正向定型串)
 *   · 扣款腿**必须被模式守卫挡住**(定型串)
 *   · 建单成功后**必须重拉服务端余额**
 *   · 提现页**三个评估点**(提交前复检必须吃冻结快照)
 * 后三格是 P-105 重锚时新立的,落地时**一道红测都没有** —— 而其中「必须重拉服务端余额」
 * 那格,重锚它的人自己在注释里写着「本轮唯一真正的覆盖漏洞…全仓一道门都没有」:
 * 门补上了,门的牙齿却没人证过。新门同样适用「哨兵失效即门失效」,这里把那笔补齐。
 *
 * 为什么先有这支:「同档」那格 2026-08-16 因**同义别名**假绿被修过一轮。上一版判据写的是
 * 「退款腿保持模式无关」,并警告「别顺手加一道会把 mock 轨退款打死的闸」——
 * 可那道闸早就在了(`refundFailedWithdrawals` 首行 `if (fundsServerEnabled) return [];`,
 * 而正式 App 的 runtime.ts 把它与 `remoteApiEnabled` 都钉成 `true`)。判据只认后者的字面量,
 * 于是在退款腿实际已被整条关掉的情况下**一路报绿**。
 * 修法是让判据按**等价类**认标志(从 runtime.ts 解析)并钉**正向定型串**。
 * 关系型 + 解析型判据比字面量判据更容易在重构里悄悄失去牙齿,所以每条都要有变异证明。
 *
 * 纪律(踩过的坑,别省):
 *   · 靶只用**单行**串,且在**函数体切片内**定位 —— `if (fundsServerEnabled) return [];`
 *     在 app.ts 里有两处,全文级替换会打错地方;跨行靶则受混用行尾影响(本仓 .vue 实测混用),
 *     而不命中的变异**看起来正是「门抓到了」**。故每个靶都先验「切片内恰好命中 1 次」并打印出来。
 *   · 变异走字节级替换后原样回写 Buffer(本仓 CRLF;按行重写的工具会把行尾成片归一)。
 *   · 🔴 本文件会**真的改写 src/store/app.ts 等资金源文件**(改完立刻还原)。try/finally 挡不住
 *     kill -9 / 断电,故走**进程外落盘台账 + 下次启动先还原**;信号处理在这里证不出有效
 *     (跑门用的 execFileSync 同步阻塞事件循环,信号回调进不来)。
 *   · 收尾复跑门 + 逐字节比对还原,证明红测自己没把树改脏。
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = path.join(root, "src/store/app.ts");
const RUNTIME = path.join(root, "src/api/runtime.ts");
const PAGE = path.join(root, "src/pages/me/wallet-withdraw.vue");
const APPVUE = path.join(root, "src/App.vue");
/** 门脚本自己 —— 只有「扫描面塌成空」那一靶变异它(证明判据自带的扫描面自证真会红)。 */
const GATEFILE = path.join(root, "scripts/selfcheck-fastlane.mjs");

const REFUND_CALLER = "function refundFailedWithdrawals(): string[] {";
const REFUND_LEG = "function refundWithdrawalDebit(wd: Withdrawal): boolean {";
const DEBIT_LEG = "function applyWithdrawalDebit(wd: Withdrawal): boolean {";
/** 各格的可辨识片段。红测不只要求「有格红了」,还要求红的是**这一格** ——
 *  否则某天判据串味、红的是隔壁那格,这里照样绿(元验证实测过这种情形)。 */
const G_SAME_RAIL = "扣款腿**同档**";
const G_DEBIT_GUARD = "必须被模式守卫挡住";
const G_REFETCH = "必须重拉服务端余额";
const G_THREE_POINTS = "提交前复检均走"; // 格名 2026-08-16 主线改成「提现页:显示 / 降额 CTA / 提交前复检均走服务端事实或冻结快照」,钉稳定片段
const G_CALLSITES = "调用点**集合等式**";

/**
 * 在指定函数体切片内做单行替换,再拼回全文。hits !== 1 即靶没打准。
 * sig 传 null = 该靶在**全文**唯一(已逐个核过),直接全文替换,不必切片。
 * 切片存在的唯一理由是「靶串在全文有重名」(如 `if (fundsServerEnabled) return [];` 有两处)。
 */
function editInFn(text, sig, from, to) {
  if (sig === null) {
    const hits = text.split(from).length - 1;
    return hits === 1 ? { text: text.replace(from, to), hits } : { text, hits };
  }
  const at = text.indexOf(sig);
  const end = at < 0 ? -1 : text.indexOf("\n  }", at);
  if (at < 0 || end <= at) return { text, hits: -1 };
  const body = text.slice(at, end);
  const hits = body.split(from).length - 1;
  return hits === 1
    ? { text: text.slice(0, at) + body.replace(from, to) + text.slice(end), hits }
    : { text, hits };
}

const TARGETS = [
  {
    // 缺陷实体:服务端持有余额时退款腿也放开 → 服务端冲正之外 client 再退一笔 = 印钞。
    // 🔴 这一条正是**旧判据报绿**的那个形状,本红测的正身。
    name: "退款腿档闸被拆掉(印钞;旧判据对它报绿)",
    gate: G_SAME_RAIL,
    file: APP,
    ops: [[REFUND_CALLER, "if (fundsServerEnabled) return [];", "if (false) return [];"]],
  },
  {
    // 取反 = 把 **mock 轨**的退款打死(失败提现永不退款)—— 正是上一版注释担心、
    // 却没能守住的那件事。词元式判据对取反天生瞎(P-104)。
    name: "退款腿档闸被取反(打死 mock 轨退款)",
    gate: G_SAME_RAIL,
    file: APP,
    ops: [[REFUND_CALLER, "if (fundsServerEnabled) return [];", "if (!fundsServerEnabled) return [];"]],
  },
  {
    name: "退款腿档闸只剩装饰性提及(闸没了,名字还在)",
    gate: G_SAME_RAIL,
    file: APP,
    ops: [[REFUND_CALLER, "if (fundsServerEnabled) return [];", "const _unusedRail = fundsServerEnabled;"]],
  },
  {
    // 缺陷实体:生产轨上 client 在服务端原子扣款之外再扣一遍 = 双扣。
    name: "扣款腿档闸被拆掉(生产轨双扣)",
    gate: G_SAME_RAIL,
    file: APP,
    ops: [[DEBIT_LEG, "if (remoteApiEnabled) return false;", "if (false) return false;"]],
  },
  {
    // 「没扣过就没得退」才是 remote 下不凭空造钱的真防线,这条判据是上一版的贡献,不许弄丢。
    name: "「没扣过就没得退」前置被删(真防线)",
    gate: G_SAME_RAIL,
    file: APP,
    ops: [[REFUND_LEG,
      "if (!currentUser.appliedRewardKeys?.[debitKey] && !storedKeys?.[debitKey]) return false;",
      "if (false) return false;"]],
  },
  {
    // 标志等价类从 runtime.ts 解析。解析面为空 = 判据失效,必须红,不许「扫不到就当没违规」。
    name: "标志等价类解析面为空(fail-closed)",
    gate: G_SAME_RAIL,
    file: RUNTIME,
    plain: [
      ['export const remoteApiEnabled = true;',
        "export const remoteApiEnabled = !isMockMode(apiRuntimeConfig);"],
      ['export const fundsServerEnabled = true;',
        "export const fundsServerEnabled = !isMockMode(apiRuntimeConfig);"],
      ['export const payoutAddressServerEnabled = true;',
        "export const payoutAddressServerEnabled = !isMockMode(apiRuntimeConfig);"],
    ],
  },
  // ══ 以下四靶钉的是 P-105 重锚时新立的三格 —— 它们落地时**没有任何红测**,
  //    而其中「必须重拉服务端余额」那格,重锚它的人自己在注释里写着
  //    「本轮唯一真正的覆盖漏洞…全仓一道门都没有」。门补上了,门的牙齿没人证过。
  //    「哨兵失效即门失效」对新门同样成立,这四靶把那笔补上。
  {
    // 缺陷实体(重锚者原话实测):删掉这一行,tsc / verify 449 格照样全绿,
    // 而用户提现成功后余额停在旧数字,还能照着旧数字接着提。
    name: "建单成功后不重拉服务端余额(余额停在旧数字,还能照旧数字接着提)",
    gate: G_REFETCH,
    file: PAGE,
    ops: [[null,
      "if (app.accountKey === snap.account) await app.refreshRemoteFleet();",
      "if (app.accountKey === snap.account) { /* REDTEST MUTANT */ }"]],
  },
  {
    // 「必须被模式守卫挡住」那格钉的是定型串;取反后守卫形状不匹配 → 必须红。
    // 缺陷实体:生产轨上 client 在服务端原子扣款之外再扣一遍 = 双扣。
    name: "扣款腿守卫被取反(生产轨双扣;定型串格)",
    gate: G_DEBIT_GUARD,
    file: APP,
    ops: [[DEBIT_LEG, "if (remoteApiEnabled) return false;", "if (!remoteApiEnabled) return false;"]],
  },
  {
    // 缺陷实体:弹窗期间切账号 → 拿新账号的单据判旧账号的额度(独立审计三次抓到)。
    name: "提交前复检改吃活值(不吃冻结快照)",
    gate: G_THREE_POINTS,
    file: PAGE,
    ops: [[null, "        snap.daily,", "        dailyFacts.value,"]],
  },
  {
    // 复检整段消失时判据的扫描面为空 —— 同样必须红(禁「扫不到就当没违规」)。
    name: "提交前复检整段消失(扫描面为空)",
    gate: G_THREE_POINTS,
    file: PAGE,
    ops: [[null, "      fresh = await requestWithdrawalEligibility(",
      "      fresh = await requestWithdrawalEligibilityREMOVED("]],
  },
  {
    // 🔴 2026-08-16 实测:补这格之前,同一个变异让 fastlane 117 格 + tsc + verify **全绿** ——
    //    「谁减记余额」已经失控而一道门都不响。而这不是假想:2026-08-13 真有人在 App.vue
    //    对账里加过「扣款补扣格」,被 R1 独立审计整格否决;实现退役了,禁令却没留下任何门。
    //    第二个调用点会写扣款幂等键,而退款腿的「没扣过就没得退」正是按这个键判 ——
    //    键被凭空置位 = 退一笔本客户端从没扣过的钱。
    name: "第二个减记者藏在别的文件(App.vue 对账里偷偷再扣一次)",
    gate: G_CALLSITES,
    file: APPVUE,
    ops: [[null, "      postReceiptForAccount(app.accountKey, drafts, wd.submittedAt);",
      "      app.applyWithdrawalDebit(wd);\r\n      postReceiptForAccount(app.accountKey, drafts, wd.submittedAt);"]],
  },
  {
    // 该格的失败方向特殊:页面没接本地腿时**期望就是空集**,于是「扫不到」与「没违规」
    // 产出同一个绿。故判据自带扫描面证据,这一靶证明那道自证真的会红。
    name: "调用点扫描面塌成空(扫不到 ≠ 没违规)",
    gate: G_CALLSITES,
    file: GATEFILE,
    ops: [[null, "    const scannedFiles = walkSrc();", "    const scannedFiles = [];"]],
  },
  {
    // 🔴 **间接引用轴**(2026-08-16 按轴自查实测出来的假绿面):先把函数取出来再调,
    //    缺陷实体与直接调用**完全相同**(第二个减记者、照写扣款幂等键),
    //    而扫「调用写法」`.applyWithdrawalDebit(` 的判据一个字都扫不到 —— 补此轴前主线全绿。
    name: "间接引用规避(先取函数再调,缺陷实体不变)",
    gate: G_CALLSITES,
    file: APPVUE,
    ops: [[null, "      postReceiptForAccount(app.accountKey, drafts, wd.submittedAt);",
      "      const debitFn = app.applyWithdrawalDebit;\r\n      debitFn(wd);\r\n"
      + "      postReceiptForAccount(app.accountKey, drafts, wd.submittedAt);"]],
  },
  {
    // 🔴 **改名轴**:函数一改名,扫「调用写法」的判据恒不命中 → 实扫空集,
    //    而没接本地腿时期望**也是**空集 → 判绿。改成「含定义处的集合等式」后期望非空,
    //    空集再也换不到绿。⚠️ 且必须用**词边界**匹配:`applyWithdrawalDebitV2` 包含原名子串,
    //    `includes` 版对它照样计数、行数不变 → 改名轴仍旧判绿(实测过,这一格修了两次)。
    name: "函数被改名(词边界;includes 版对它是瞎的)",
    gate: G_CALLSITES,
    file: APP,
    ops: [
      [null, "  function applyWithdrawalDebit(wd: Withdrawal): boolean {",
        "  function applyWithdrawalDebitV2(wd: Withdrawal): boolean {"],
      [null, "    submitWithdrawal, applyWithdrawalDebit, advanceWithdrawalArrival,",
        "    submitWithdrawal, applyWithdrawalDebit: applyWithdrawalDebitV2, advanceWithdrawalArrival,"],
    ],
  },
];

const runGate = () => {
  try {
    return execFileSync(process.execPath, [path.join(root, "scripts/selfcheck-fastlane.mjs")],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) { return (e.stdout ?? "") + (e.stderr ?? ""); }
};
const failsOf = (out) => [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());

// ── 崩溃恢复:上一轮死在变异态时先无条件还原(覆盖 kill -9) ──
const STASH = path.join(os.tmpdir(),
  `nexgrid-withdraw-rail-alias-${createHash("sha1").update(root).digest("hex").slice(0, 12)}.stash`);
const META = `${STASH}.json`;
if (existsSync(META)) {
  const meta = JSON.parse(readFileSync(META, "utf8"));
  if (meta.root === root && existsSync(STASH)) {          // 只认本仓台账,别拿别的检出的去覆盖
    writeFileSync(meta.file, readFileSync(STASH));
    console.error(`  ⚠️ 上一轮红测死在变异态,已从台账还原:${path.relative(root, meta.file)}`);
  }
  rmSync(META, { force: true });                                          // ALLOW-HARD-DELETE
  rmSync(STASH, { force: true });                                        // ALLOW-HARD-DELETE
}
const stashOn = (file, bytes) => { writeFileSync(STASH, bytes); writeFileSync(META, JSON.stringify({ root, file }), "utf8"); };
const stashOff = () => { rmSync(META, { force: true }); rmSync(STASH, { force: true }); }; // ALLOW-HARD-DELETE

// 基线判定必须排在崩溃恢复**之后**:死在变异态时树本来就是红的,先判基线只会报错方向。
const baseline = failsOf(runGate());
if (baseline.length) {
  console.error("  🔴 基线就不是绿的,红测无意义 —— 先把 selfcheck-fastlane 跑绿:");
  baseline.forEach((f) => console.error(`      ${f}`));
  process.exit(2);
}

const results = [];
for (const t of TARGETS) {
  const original = readFileSync(t.file);
  const text0 = original.toString("utf8");
  let text = text0;
  let hits;
  if (t.plain) {
    const miss = t.plain.find(([from]) => text.split(from).length - 1 !== 1);
    hits = miss ? text.split(miss[0]).length - 1 : t.plain.length;
    if (!miss) text = t.plain.reduce((acc, [from, to]) => acc.replace(from, to), text);
    else hits = -1;
  } else {
    for (const [sig, from, to] of t.ops) { const r = editInFn(text, sig, from, to); text = r.text; hits = r.hits; }
    if (hits !== 1) hits = -1;
  }
  // 🔴 靶没打准就 exit 2 —— 不命中的变异会让门「照绿」,而那看起来正像「门没牙」,
  //    也可能被读成「门抓到了」。两种误读都比直接报错糟,所以这里硬停。
  if (hits === -1) {
    console.error(`  🔴 靶没打准(切片内须恰好命中 1 次):「${t.name}」于 ${path.basename(t.file)}`);
    process.exit(2);
  }
  let fails;
  try {
    stashOn(t.file, original);                    // 先落台账再动文件:顺序反了就有裸窗口
    writeFileSync(t.file, text, "utf8");
    fails = failsOf(runGate());
  } finally {
    writeFileSync(t.file, original);              // Buffer 回写 = 逐字节还原,行尾不受影响
    stashOff();
  }
  if (!readFileSync(t.file).equals(original)) {
    console.error(`  🔴 还原后字节不一致:${t.file} —— 红测把树改脏了,立即停`);
    process.exit(2);
  }
  const hit = fails.some((f) => f.includes(t.gate));
  results.push(hit
    ? `✓ ${t.name}(锚点命中 ${hits} 次)`
    : `✗ ${t.name} —— 变异后「${t.gate}」没红(实际红的:${fails.length ? fails.join(" | ") : "一格都没红"})`);
}

for (const r of results) console.log(`  ${r}`);
if (failsOf(runGate()).length) {
  console.error("\n  🔴 红测结束后门是红的 —— 还原不完整\n");
  process.exit(2);
}
const bad = results.filter((r) => r.startsWith("✗"));
if (bad.length) {
  console.error(`\n  withdraw-rail-alias REDTEST FAILED: ${bad.length}/${results.length} 条判据未被证明有效\n`);
  process.exit(1);
}
console.log(`  ✓ withdraw-rail-alias redtest: ${results.length}/${results.length} 条变异均已证明会红,且还原后门复绿`);
