#!/usr/bin/env node
// 门的门(元门):机器门的固定靶必须覆盖代码里已有的真实集合,禁手写子集清单。
//   node scripts/selfcheck-gate-targets.mjs
//
// 出处:2026-08-05 包 G 强制结构性反思(docs/changes/2026-08-05-pkgG-structural-reflection.md)。
// 修复轮自伤 44%,「门假绿」两轮共 8 条,共同根因只有一个:
//   **手写闭集 × 开放集合 = 必漏,且失败形态是静默全绿。**
//   实测三例:① 靶列 6 个机型,加一个 SKU 门照样全绿放行;② 门循环只造 6 类设备,
//   pc-gpu 整条判 0 仍 57 pass;③ 语言豁免表不带语言维,vi 真丢占位符照样绿。
//
// 判据(存在性级,扫 scripts/ 下的门脚本):
//   ① 机型面:脚本里引用(**带引号字面量**)≥2 个机型名时,引用集必须恰好等于
//      「全集 / 递减豁免集 / 其补集」之一(三者都从真模块导出派生,不在本文件抄一份)。
//      🔴 growth 向:新增 SKU → 全集变大 → 旧脚本的引用集不再等于任何认可集 → 本门变红,
//      逼所有涉机型的门同步补靶 —— 这正是上一版缺的那一向(EXPECTED_CHECKS 只守删不守增)。
//   ② 语言面:脚本里点名任一 i18n 语言文件(en.ts / zh.ts / vi.ts)时必须三语齐点;
//      语言清单从磁盘 readdir 派生,新增语言文件自动进判据。
//   ③ ground truth 自证:机型数 < 8 或语言数 < 3 = 解析失败,直接红(候选缩集必炸,
//      不许静默把「解析坏了」过成「没有违例」)。
//
// 🔴 本文件自身的纪律:红测样本从 ground truth **动态构造**,源码里零机型字面量
//   (否则扫到自己);例外台账每条必须带理由,且 0 命中即红(防静默扩权)。
import { build } from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { atAliasPlugin } from "./lib/at-alias.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SELF = path.basename(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` —— ${detail}` : ""}`); }
}

// ── ground truth:真模块导出,不抄清单 ──────────────────────────────────────
globalThis.uni = { getStorageSync: () => "", setStorageSync: () => {}, removeStorageSync: () => {}, getSystemInfoSync: () => ({}) };
const bundle = await build({
  stdin: {
    contents: `
      export { DEVICE_SPECS } from "@/store/device-types";
      export { CAPACITY_EXEMPT_KINDS } from "@/store/device-lifecycle";
    `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true, write: false, format: "esm",
  plugins: [atAliasPlugin(path.join(root, "src"), "selfcheck-gate-targets")],
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const ALL_KINDS = Object.keys(mod.DEVICE_SPECS).sort();
const EXEMPT = [...mod.CAPACITY_EXEMPT_KINDS].sort();
const NON_EXEMPT = ALL_KINDS.filter((k) => !EXEMPT.includes(k));
const LOCALES = readdirSync(path.join(root, "src", "i18n", "messages"))
  .filter((f) => /^[a-z]{2}\.ts$/.test(f)).sort();

check("③ ground truth 自证:机型全集 ≥ 8(解析失败不许静默过)", ALL_KINDS.length >= 8, `实得 ${ALL_KINDS.length}`);
check("③ ground truth 自证:语言文件 ≥ 3", LOCALES.length >= 3, `实得 ${LOCALES.join(",")}`);
check("③ ground truth 自证:豁免集非空且真属于全集",
  EXEMPT.length >= 3 && EXEMPT.every((k) => ALL_KINDS.includes(k)), EXEMPT.join(","));

// ── 判定函数(先自测再扫真脚本)──────────────────────────────────────────
const RECOGNIZED = [
  { name: "全集", set: ALL_KINDS },
  { name: "递减豁免集(CAPACITY_EXEMPT_KINDS)", set: EXEMPT },
  { name: "豁免补集(参与递减的托管机型)", set: NON_EXEMPT },
];
const setEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 提取脚本里被引号包住的机型字面量(注释里的中文散文不带引号,天然不误伤)。 */
function mentionedKinds(text) {
  return ALL_KINDS.filter((k) => text.includes(`"${k}"`) || text.includes(`'${k}'`) || text.includes(`\`${k}\``));
}
/** null = 合规;字符串 = 违例说明。 */
function judgeKinds(text) {
  const m = mentionedKinds(text).sort();
  if (m.length < 2) return null; // 0/1 个 = 定点引用,不构成「枚举一个集合」
  for (const r of RECOGNIZED) if (setEq(m, r.set)) return null;
  const best = RECOGNIZED.map((r) => ({ r, miss: r.set.filter((k) => !m.includes(k)) }))
    .sort((a, b) => a.miss.length - b.miss.length)[0];
  return `引用了 ${m.length} 个机型但不等于任何认可集;最接近「${best.r.name}」还缺 ${best.miss.join(", ") || "(反向多出)"}`;
}
function judgeLocales(text) {
  const named = LOCALES.filter((f) => new RegExp(`(?<![A-Za-z])${f.replace(".", "\\.")}`).test(text));
  if (named.length === 0 || named.length === LOCALES.length) return null;
  return `点名了 ${named.join(",")} 却漏 ${LOCALES.filter((f) => !named.includes(f)).join(",")} —— 语言面缺面`;
}

// ── 自测:合成样本红测(样本动态构造,源码零机型字面量)────────────────────
{
  const quote = (ks) => ks.map((k) => `"${k}"`).join(", ");
  check("自测:引用 2/N 机型的脚本必须判红", judgeKinds(`const targets = [${quote(ALL_KINDS.slice(0, 2))}];`) !== null);
  check("自测:引用全集 − 1 的脚本必须判红(growth 向的等价形态)",
    judgeKinds(`x = [${quote(ALL_KINDS.slice(0, ALL_KINDS.length - 1))}]`) !== null);
  check("自测:恰好全集必须判绿", judgeKinds(`x = [${quote(ALL_KINDS)}]`) === null);
  check("自测:恰好豁免集必须判绿", judgeKinds(`x = [${quote(EXEMPT)}]`) === null);
  check("自测:恰好豁免补集必须判绿", judgeKinds(`x = [${quote(NON_EXEMPT)}]`) === null);
  check("自测:单个定点引用必须判绿(不构成枚举)", judgeKinds(`if (d.kind === "${ALL_KINDS[0]}")`) === null);
  const l2 = LOCALES.slice(0, 2).map((f) => `"src/i18n/messages/${f}"`).join(",");
  check("自测:只点两语必须判红", judgeLocales(`const L = [${l2}]`) !== null);
  check("自测:三语齐点必须判绿", judgeLocales(LOCALES.map((f) => `"src/i18n/messages/${f}"`).join(",")) === null);
  check("自测:一个语言文件都不提必须判绿", judgeLocales(`const x = 1;`) === null);
}

// ── 扫真脚本 ────────────────────────────────────────────────────────────────
// 例外台账:每条必须带理由;0 命中即红(授权失效就删,不许留着静默扩权)。
// 🔴 判「该不该进台账」的标准:引号机型是**集合枚举**(一张当数据用的清单)还是
//   **定点引用**(规格点名的具体对象 / 带完备性断言的排除清单 / 取样探针)。
//   前者必须改派生;后者进台账留痕。2026-08-05 首扫 9 处:2 处真缺陷已修
//   (yield-parity 清单改派生 + 补 vi 数值锚)、1 个死脚本退役(placeholder-parity,
//   已被 mirror 门的占位符判据取代)、其余 7 处 = 下面这些定点引用。
const EXCEPTIONS = {
  "check-device-yield-parity.mjs:机型面":
    "SHARED 集合已从 DEVICE_SPECS 派生(完备性断言在门内,红测①实证新增 SKU 必红);" +
    "残余引号 = DEVICE_ONLY 排除清单(逐条带理由 + 存在性断言)与 phone/S1 副行锚,定点引用非枚举",
  "r7-device-detail-runtime.mjs:机型面":
    "runtime 走查:按种子设备取样跑真页面,不声称机型集合覆盖;种子结构变了它运行时自己会断",
  "release-gate-walkthrough.mjs:机型面": "同上:发布走查按种子取样,非集合枚举",
  "selfcheck-checkout-trial-quote.mjs:机型面":
    "试用报价的定义性 fixtures —— 试用 SKU 与升级目标是规格点名的具体两台,非集合枚举",
  "spec4-account-cloud-merge-check.mjs:机型面": "账号↔云合并的 fixtures 取样,非集合枚举",
  "selfcheck-exchange-genesis-guard.mjs:语言面":
    "en 仅作 t() 渲染桩,断言对象是守卫行为不是翻译;跨语言键/占位符奇偶由 i18n-key-mirror 门独占管辖",
  "spec7-risk-gate-runtime.mjs:语言面":
    "runtime 旅程按 en/zh 取样是全仓 runtime 门既有约定(verify 的 AUTH02 (en)/(zh) 同款);" +
    "vi 的数值锚已在 yield-parity 补上;journey 级 vi 面是已知账,扩三语 = 独立决策不在结构轮夹带",
};
const usedExceptions = new Set();

const scanned = [];
const targets = readdirSync(path.join(root, "scripts"))
  .filter((f) => /\.mjs$/.test(f) && f !== SELF)
  .concat(["verify.sh"]);
for (const f of targets) {
  const full = path.join(root, "scripts", f);
  let text;
  try { text = readFileSync(full, "utf8"); } catch { continue; }
  scanned.push(f);
  for (const [judge, face] of [[judgeKinds, "机型面"], [judgeLocales, "语言面"]]) {
    const verdict = judge(text);
    if (verdict === null) continue;
    const exKey = `${f}:${face}`;
    if (EXCEPTIONS[exKey]) { usedExceptions.add(exKey); continue; }
    check(`① ${f} ${face}`, false, verdict);
  }
}
check(`扫描面非空(候选=0 必炸):实扫 ${scanned.length} 个脚本`, scanned.length >= 10, scanned.join(","));
for (const exKey of Object.keys(EXCEPTIONS)) {
  check(`例外台账「${exKey}」仍有真实命中(0 命中=授权失效,删掉它)`, usedExceptions.has(exKey));
}
if (fail === 0) console.log(`  PASS  ① 全部 ${scanned.length} 个门脚本的机型面 / 语言面靶完整`);

console.log(`\n${pass} pass / ${fail} fail(元门:靶完整性 ${scanned.length} 脚本 × 2 面 · ${ALL_KINDS.length} 机型 · ${LOCALES.length} 语言 · 9 条判据自测)`);
process.exit(fail === 0 ? 0 : 1);
