#!/usr/bin/env node
/**
 * a11y-activate-gate 的红测:逐条证明每个判据**真的会红**。
 *
 * 为什么必须有:一道从没红过的门,和一道正则写错了永远不匹配的门,在 CI 上长得一模一样
 * (都是绿的)。本仓吃过这个亏。首版红测当场抓出 2 条判据是死的(子串判据没剥注释,
 * 把代码注释掉之后照样报绿)。
 *
 * 🔴 每条判据**单独隔离**注入:多条一起注入时,只要有一条能让门变红,其余几条完全失效
 * 也看不出来(合取项互相掩护)。
 *
 * 【v2 两处改进,来自独立审计】
 *  ① 不再原地改写真源文件。首版直接 writeFileSync 到 App.vue / login.vue 等,写入窗口约
 *     1.9s,而 legacy-suite 的 dev server 正在 watch 这些文件;SIGINT 不走 finally,中断
 *     就会留下坏文件。现在模板类判据一律注入**临时新建的 .vue 文件**,真文件一个不碰。
 *  ② 顺带补上首版证明不了的那一族:「整个文件被静默漏扫」。首版 8 条注入全落在已被扫到的
 *     文件里,所以哪怕解析器整份跳过某个文件,红测照样全绿。临时文件注入天然覆盖它 ——
 *     文件是新的,门必须先能扫到它,才谈得上抓到里面的违例。
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const GATE = join(ROOT, "scripts", "a11y-activate-gate.mjs");
const BEHAVIOR = join(ROOT, "scripts", "a11y-activate-behavior.test.mjs");
// 探针名带 pid:两条门链(verify.sh 与 npm run test:a11y-activate)都会调本脚本,
// 固定路径在并发下会互删探针,让双方的结论同时失真。
const PROBE = join(ROOT, "src", `__a11y-redtest-probe-${process.pid}.vue`);

/**
 * 🔴 中断时不只清探针,**还要还原被注入的源文件**。
 * 实测(独立审计):源码类注入的改写窗口 lib 约 720ms / App.vue 约 165ms,而 SIGINT
 * 既不走 finally 也不走 try —— 上一版只 unlink 探针,Ctrl-C 正好落在窗口内就会在仓里
 * 留下一个被注释掉的 `installKeyboardActivation();`,它长得和正常代码一模一样。
 */
const pending = new Map();
const cleanup = () => {
  if (existsSync(PROBE)) { try { unlinkSync(PROBE); } catch { /* 已被清掉 */ } }
  for (const [p, original] of pending) { try { writeFileSync(p, original); } catch { /* 尽力还原 */ } }
  pending.clear();
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { cleanup(); process.exit(130); });
process.on("exit", cleanup);
process.on("uncaughtException", (e) => { cleanup(); console.error(e); process.exit(2); });

/**
 * 🔴 stdout 与 stderr 都要取。门把 F 段(可见但不阻断)打在 stderr 上,而门**通过**时
 * execFileSync 的返回值只有 stdout —— 只看它会得出「F 段不存在」的结论,把一条工作正常的
 * 判据判成死的。观察方式失真的方向总是「看起来更干净」。
 */
function runGate() {
  const r = spawnSync(process.execPath, [GATE], { encoding: "utf8" });
  return { failed: r.status !== 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
function runBehavior() {
  // 行为门 import 的是 .ts 源。Node 23.6+ 默认剥类型,更早的版本必须带 flag,
  // 否则整条新链在旧 Node 上直接炸(同仓 earnings-accrual 就是带 flag 的先例)。
  try { execFileSync(process.execPath, ["--experimental-strip-types", "--test", BEHAVIOR], { stdio: "ignore" }); return { failed: false }; }
  catch { return { failed: true }; }
}

/**
 * 模板类判据:把违例写进一个**临时新建**的 .vue,断言门变红且命中指定判据。
 * 真源文件全程不动。
 */
function redtestTemplate(name, tag, templateBody) {
  writeFileSync(PROBE, `<template>\n${templateBody}\n</template>\n\n<script setup lang="ts">\nfunction noop() {}\n</script>\n`);
  try {
    const { failed, out } = runGate();
    if (!failed) return `✗ ${name}: 注入违例后门仍然是绿的 —— 这条判据是死的`;
    if (!out.includes(`[${tag}]`)) return `✗ ${name}: 门红了,但报的不是 [${tag}](被别的判据顺带抓到,本条仍未被验证)`;
    return `✓ ${name}: 注入 → 门红,命中 [${tag}]`;
  } finally {
    cleanup();
  }
}

/**
 * 可见性断言:有些形态**故意不阻断**(F 类「静态判不出」里多是合法写法,个体不该拦),
 * 但它必须始终被打印出来 —— 否则就是静默放过。这类判据的红测断的是「看得见」,不是「会变红」。
 * 两种断言不能混用:拿阻断断言去测一条不阻断的判据,只会得到一条永远失败的红测。
 */
function redtestVisible(name, tag, needle, templateBody) {
  writeFileSync(PROBE, `<template>\n${templateBody}\n</template>\n\n<script setup lang="ts">\nfunction noop() {}\n</script>\n`);
  try {
    const { out } = runGate();
    if (!out.includes(`[${tag}]`)) return `✗ ${name}: 门的输出里没有 [${tag}] 段 —— 该形态被静默放过`;
    if (!out.includes(needle)) return `✗ ${name}: [${tag}] 段里没提到这一处 —— 计数进去了但看不见是哪个`;
    return `✓ ${name}: 注入 → 在 [${tag}] 中可见(按设计不阻断)`;
  } finally {
    cleanup();
  }
}

/** 源码类判据(平台层被删/被掏空):必须动真文件,用内容备份 + finally 还原 + 逐字节校验。 */
function redtestSource(name, tag, file, mutate, runner = runGate) {
  const path = join(ROOT, file);
  const original = readFileSync(path, "utf8");
  let verdict;
  try {
    const mutated = mutate(original);
    if (mutated === original) throw new Error(`注入无效:${file} 内容没变 —— 红测在测一个不存在的改动`);
    pending.set(path, original);   // 登记到中断还原表,再写盘
    writeFileSync(path, mutated);
    const r = runner();
    if (!r.failed) verdict = `✗ ${name}: 注入违例后门仍然是绿的 —— 这条判据是死的`;
    else if (tag && !String(r.out ?? "").includes(`[${tag}]`)) verdict = `✗ ${name}: 门红了,但报的不是 [${tag}]`;
    else verdict = `✓ ${name}: 注入 → 门红${tag ? `,命中 [${tag}]` : ""}`;
  } finally {
    writeFileSync(path, original);
    pending.delete(path);
    if (readFileSync(path, "utf8") !== original) {
      console.error(`\n  🔴 致命:${file} 还原失败,请手动检查\n`);
      process.exit(2);
    }
  }
  return verdict;
}

const baseline = runGate();
if (baseline.failed) {
  console.error("  ✗ 基线不绿,红测无意义。先让门通过:\n" + baseline.out);
  process.exit(1);
}

const results = [
  // ── 模板类:注入临时新建文件(同时证明「新文件会被扫到」)──
  redtestTemplate("A 有 role 无 tabindex", "A", `  <view role="button" @click="noop">x</view>`),
  redtestTemplate("A 动态 role 无 tabindex(旧版漏检的形态)", "A", `  <view :role="ok ? 'button' : undefined" @click="noop">x</view>`),
  // tabindex="-1" 可能是正当的 roving(tablist 非活动项),门判不出它在不在 roving 组里,
  // 所以归 F:不阻断,但必须看得见。
  redtestVisible("F tabindex=-1 不进 Tab 序", "F", "__a11y-redtest-probe", `  <view role="button" tabindex="-1" @click="noop">x</view>`),
  redtestVisible("F v-on 对象展开藏住事件", "F", "__a11y-redtest-probe", `  <view role="button" tabindex="0" v-on="handlers">x</view>`),
  // 死控件:有身份、能聚焦、却没有任何激活 handler。本层还会先 preventDefault 再打空,
  // 连 Space 翻页都被吃掉 —— 用户得到"看起来能按、按了绝对没反应"。
  redtestTemplate("A 死控件(有 role+tabindex 无 handler)", "A", `  <view role="button" tabindex="0">dead</view>`),
  // 解析器被吞元素必须阻断:属性里的未平衡引号会让状态机跨过后续标签。
  // 未闭合的引号会让状态机一路吃到下一个引号,把中间的元素整个吞掉 —— 正是"扫得少所以全绿"。
  redtestTemplate("D 解析基数不符(元素被静默吞掉)", "D", `  <view :style="unclosed><text>x</text></view>`),
  redtestTemplate("B tabindex+click 无 role", "B", `  <view tabindex="0" @click="noop">x</view>`),
  redtestTemplate("B @tap 也算可点", "B", `  <view tabindex="0" @tap="noop">x</view>`),
  redtestTemplate("C keydown 缺 .prevent", "C", `  <view role="button" tabindex="0" @click="noop" @keydown.enter="noop">x</view>`),
  redtestTemplate("C keyup 上的 .prevent 拦不住 keydown 层", "C", `  <view role="button" tabindex="0" @click="noop" @keyup.enter.prevent="noop">x</view>`),
  // 弹层没接焦点管理:遮罩只拦指针不拦键盘,打开后 Tab 会走到背景(那里有花钱的按钮)。
  redtestTemplate("G 弹层无焦点管理", "G", `  <view v-if="open" style="position: fixed; inset: 0">panel</view>`),
  redtestTemplate("E 悬空 aria 引用", "E", `  <view role="button" tabindex="0" aria-describedby="nope" @click="noop">x</view>`),
  redtestTemplate("E 同文件 id 重复", "E", `  <view><text id="dup">a</text><text id="dup">b</text></view>`),

  // ── 源码类:平台层本身 ──
  redtestSource("D 平台层未挂载", "D", "src/App.vue",
    (s) => s.replace("installKeyboardActivation();", "// installKeyboardActivation();")),
  redtestSource("D 平台层空壳化", "D", "src/lib/a11y-activate.ts",
    (s) => s.replace("target.click();", "/* target.click(); */")),
  redtestSource("D role 表被掏空(门与平台层同源)", "D", "src/lib/a11y-activate.ts",
    // 🔴 行尾用 \r?\n(2026-08-12 合并收口):本仓源文件是 CRLF,原正则钉死 \n 永不命中,
    // 注入落空 —— 本仓家法「判据正则一律 \r?」,这条漏了。
    (s) => s.replace(/ {2}button: \[[^\]]*\],\r?\n/, "")),
  redtestSource("D 行为门被清空", "D", "scripts/a11y-activate-behavior.test.mjs",
    (s) => s.replace(/^test\(/gm, "//test(")),

  // ── 行为门自己也要红测:永不失败的测试等于没有测试 ──
  redtestSource("行为门 Enter→click", null, "src/lib/a11y-activate.ts",
    (s) => s.replace("target.click();", "if (false) target.click();"), runBehavior),
  redtestSource("行为门 双触发防线", null, "src/lib/a11y-activate.ts",
    (s) => s.replace("if (ev.defaultPrevented) return;", ""), runBehavior),
  redtestSource("行为门 置灰闸", null, "src/lib/a11y-activate.ts",
    // 🔴 允许前导空格(2026-08-12 合并收口):该闸在 a11y-activate.ts:96 是缩进两格的,
    // 原正则从行首匹配,注入永远命中不了 —— 而本红测的设计正确地把「注入没生效」
    // 判成失败(不静默放过),于是整条链崩在这里。修正则,不动产品代码。
    (s) => s.replace(/[ \t]*if \(target\.getAttribute\("aria-disabled"\) === "true"\) return;/, ""), runBehavior),
  redtestSource("行为门 按住防抖", null, "src/lib/a11y-activate.ts",
    (s) => s.replace("if (ev.repeat) return;", ""), runBehavior),
];

for (const r of results) console.log(`  ${r}`);
const bad = results.filter((r) => r.startsWith("✗"));

// 收尾复跑:证明所有还原都成功、临时文件已清、门与行为门都回到绿。
if (existsSync(PROBE)) { console.error("\n  🔴 临时探针文件未清理\n"); process.exit(2); }
if (runGate().failed) { console.error("\n  🔴 红测结束后门是红的 —— 还原不完整\n"); process.exit(2); }
if (runBehavior().failed) { console.error("\n  🔴 红测结束后行为门是红的 —— lib 还原不完整\n"); process.exit(2); }

if (bad.length) {
  console.error(`\n  a11y gate REDTEST FAILED: ${bad.length}/${results.length} 条判据未被证明有效\n`);
  process.exit(1);
}
console.log(`  ✓ a11y gate redtest: ${results.length}/${results.length} 条判据均已证明会红,且还原后门复绿`);
