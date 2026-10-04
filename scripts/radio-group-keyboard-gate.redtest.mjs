#!/usr/bin/env node
/**
 * radio-group-keyboard-gate 的红测:逐条证明判据**真的会红**。
 *
 * 为什么必须有:从没红过的门,和正则写错了永远不匹配的门,在 CI 上长得一模一样(都是绿的)。
 * 本仓已有先例(a11y-activate-gate 首版当场抓出 2 条死判据)。
 *
 * 🔴 每条判据**单独隔离**注入到临时新建的 .vue 文件,绝不改写真源文件 ——
 * 多条一起注入时,只要有一条能让门变红,其余失效的判据就看不出来(合取项互相掩护);
 * 而改真文件会在中断时留下坏文件(a11y-activate-gate.redtest 的教训)。
 * 临时文件还顺带证明「新文件不会被静默漏扫」。
 */
import { writeFileSync, existsSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const GATE = join(ROOT, "scripts", "radio-group-keyboard-gate.mjs");
const PROBE = join(ROOT, "src", `__radio-gate-redtest-probe-${process.pid}.vue`);

const cleanup = () => { if (existsSync(PROBE)) { try { unlinkSync(PROBE); } catch { /* 已清 */ } } };
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { cleanup(); process.exit(130); });
process.on("exit", cleanup);

/** 跑门,返回 {code, out}。stdout/stderr 都要取:门把不同信息打在两个流上。 */
function runGate() {
  const r = spawnSync(process.execPath, [GATE], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** 注入一个探针文件 → 跑门 → 断言变红 → 清掉探针。 */
function expectRed(name, body, expectPattern) {
  writeFileSync(PROBE, body, "utf8");
  const { code, out } = runGate();
  cleanup();
  if (code === 0) {
    console.error(`✖ 红测失败:${name} 注入后门仍然通过 —— 该判据是死的`);
    process.exit(1);
  }
  if (expectPattern && !expectPattern.test(out)) {
    console.error(`✖ 红测失败:${name} 让门变红了,但不是预期判据。输出:\n${out}`);
    process.exit(1);
  }
  console.log(`✓ ${name} → 门变红(${code})`);
}

// ── 基线:探针不存在时门必须绿 ────────────────────────────────────────────────
{
  const { code, out } = runGate();
  if (code !== 0) {
    console.error(`✖ 基线失败:干净仓库上门本该通过,实际退出码 ${code}:\n${out}`);
    process.exit(1);
  }
  console.log("✓ 基线:干净仓库 → 门通过");
}

// ── R1:成员缺 roving tabindex(字面量 tabindex="0",复现 #94 的半截修复) ──────
expectRed("R1 成员写成字面量 tabindex=\"0\"", `<template>
  <view role="radiogroup" aria-label="probe">
    <view role="radio" tabindex="0" aria-checked="true" @click="a = 1" @keydown.left.prevent="m(-1)" @keydown.right.prevent="m(1)">A</view>
    <view role="radio" tabindex="0" aria-checked="false" @click="a = 2" @keydown.left.prevent="m(-1)" @keydown.right.prevent="m(1)">B</view>
  </view>
</template>
<script setup lang="ts">
const a = 1; const m = (_d: number) => {};
</script>
`, /\[R1\]/);

// ── R2:组内完全没有方向键(成员 tabindex 正确,但键盘不能移动) ────────────────
expectRed("R2 组内无任何方向键", `<template>
  <view role="radiogroup" aria-label="probe">
    <view role="radio" :tabindex="a === 1 ? 0 : -1" aria-checked="true" @click="a = 1">A</view>
    <view role="radio" :tabindex="a === 2 ? 0 : -1" aria-checked="false" @click="a = 2">B</view>
  </view>
</template>
<script setup lang="ts">
const a = 1;
</script>
`, /\[R2\]/);

// ── R1 的 tablist 分支:role=tab 成员也必须 roving ────────────────────────────
expectRed("R1 tablist 成员写成字面量 tabindex=\"0\"", `<template>
  <view role="tablist" aria-label="probe">
    <view role="tab" tabindex="0" aria-selected="true" @click="a = 1" @keydown.left.prevent="m(-1)" @keydown.right.prevent="m(1)">A</view>
    <view role="tab" tabindex="0" aria-selected="false" @click="a = 2" @keydown.left.prevent="m(-1)" @keydown.right.prevent="m(1)">B</view>
  </view>
</template>
<script setup lang="ts">
const a = 1; const m = (_d: number) => {};
</script>
`, /\[R1\]/);

// ── 单成员组豁免:一个成员谈不上 roving,方向键也无意义 → 必须绿 ───────────────
{
  writeFileSync(PROBE, `<template>
  <view role="radiogroup" aria-label="probe">
    <view role="radio" tabindex="0" aria-checked="true" @click="a = 1">A</view>
  </view>
</template>
<script setup lang="ts">
const a = 1;
</script>
`, "utf8");
  const { code, out } = runGate();
  cleanup();
  if (code !== 0) {
    console.error(`✖ 单成员组被误判:本该豁免,实际退出码 ${code}:\n${out}`);
    process.exit(1);
  }
  console.log("✓ 单成员组正确豁免(1 个成员无需 roving/方向键)");
}

// ── 基数不变量:漏扫必须报红,而不是「少扫了也报绿」 ─────────────────────────
// 用临时目录跑一个 src/ 下没有 .vue 的仓库:门必须拒绝下结论。
{
  const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "radio-gate-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  const r = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  if (r.status === 0) {
    console.error("✖ 基数不变量失效:扫不到任何 .vue 时门仍报绿");
    process.exit(1);
  }
  console.log(`✓ 基数不变量:无 .vue 可扫 → 门拒绝报绿(${r.status})`);
}

console.log("\n✓ 红测全部通过:每条判据都证明会红,豁免与下界也确实生效");
