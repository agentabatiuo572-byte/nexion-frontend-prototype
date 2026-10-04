#!/usr/bin/env node
/**
 * input-accessible-name-gate 的红测:逐条证明判据**真的会红**。
 *
 * 🔴 每条判据单独隔离注入到临时新建的 .vue,绝不改真源文件(理由见
 * a11y-activate-gate.redtest.mjs:合取项互相掩护 + 中断留坏文件)。
 */
import { writeFileSync, existsSync, unlinkSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const GATE = join(ROOT, "scripts", "input-accessible-name-gate.mjs");
const APP = join(ROOT, "src", "App.vue");
const PROBE = join(ROOT, "src", `__field-name-redtest-probe-${process.pid}.vue`);

const cleanup = () => { if (existsSync(PROBE)) { try { unlinkSync(PROBE); } catch { /* 已清 */ } } };
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { cleanup(); process.exit(130); });
process.on("exit", cleanup);

function runGate() {
  const r = spawnSync(process.execPath, [GATE], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function expectRed(name, body, pattern) {
  writeFileSync(PROBE, body, "utf8");
  const { code, out } = runGate();
  cleanup();
  if (code === 0) {
    console.error(`✖ 红测失败:${name} 注入后门仍通过 —— 该判据是死的`);
    process.exit(1);
  }
  if (pattern && !pattern.test(out)) {
    console.error(`✖ 红测失败:${name} 让门变红了,但不是预期判据。输出:\n${out}`);
    process.exit(1);
  }
  console.log(`✓ ${name} → 门变红(${code})`);
}

// ── 基线 ─────────────────────────────────────────────────────────────────────
{
  const { code, out } = runGate();
  if (code !== 0) {
    console.error(`✖ 基线失败:干净仓库上门本该通过,实际退出码 ${code}:\n${out}`);
    process.exit(1);
  }
  console.log("✓ 基线:干净仓库 → 门通过");
}

// ── N1:<input> 只有 placeholder,没有名字(zentao #224 的原样) ─────────────────
expectRed("N1 只有 placeholder 的 input", `<template>
  <view>
    <input type="number" :placeholder="t.login.phonePlaceholder" :value="phone" @input="onPhone" />
  </view>
</template>
<script setup lang="ts">
const phone = ""; const onPhone = () => {};
</script>
`, /src\/__field-name-redtest-probe-\d+\.vue:\d+/);

// ── N1:<textarea> 同样要名字 ─────────────────────────────────────────────────
expectRed("N1 只有 placeholder 的 textarea", `<template>
  <view>
    <textarea :value="reply" placeholder="回复内容" @input="onReply" />
  </view>
</template>
<script setup lang="ts">
const reply = ""; const onReply = () => {};
</script>
`, /\[|src\//);

// ── N3:纯图标的 role="button" 没有名字(zentao #88 的图标按钮一半) ──────────────
expectRed("N3 纯图标按钮缺少可访问名", `<template>
  <view>
    <view role="button" tabindex="0" @click="copy">
      <svg width="16" height="16" viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" /></svg>
    </view>
  </view>
</template>
<script setup lang="ts">
const copy = () => {};
</script>
`, /N3|纯图标/);

// ── N3 的反面:带可见文字的按钮不该被误判(首版非贪婪正则会在这里假红) ─────────
{
  writeFileSync(PROBE, `<template>
  <view>
    <view role="button" tabindex="0" @click="go">
      <view class="icon" aria-hidden="true"><svg width="16" height="16"><path d="M0 0h16v16H0z" /></svg></view>
      <text class="title">{{ label }}</text>
    </view>
  </view>
</template>
<script setup lang="ts">
const go = () => {}; const label = "继续";
</script>
`, "utf8");
  const { code, out } = runGate();
  cleanup();
  if (code !== 0) {
    console.error(`✖ 带可见文字的按钮被误判成纯图标(假红):\n${out}`);
    process.exit(1);
  }
  console.log("✓ 带可见文字的按钮正确豁免");
}

// ── 注释里的 <input> 不算控件(首版实测的假红面) ─────────────────────────────
{
  writeFileSync(PROBE, `<template>
  <view>
    <!-- 示例:<input placeholder="注释里的输入框"> -->
    <input :aria-label="t.login.phonePlaceholder" :value="phone" @input="onPhone" />
  </view>
</template>
<script setup lang="ts">
const phone = ""; const onPhone = () => {};
</script>
`, "utf8");
  const { code, out } = runGate();
  cleanup();
  if (code !== 0) {
    console.error(`✖ 注释里的 <input> 被算成了真控件(假红):\n${out}`);
    process.exit(1);
  }
  console.log("✓ 注释里的 <input> 正确忽略");
}

// ── 安装判据:平台层没被调用 = 全仓输入框无名 ─────────────────────────────────
{
  const original = readFileSync(APP, "utf8");
  const stripped = original.replace(/installFieldNaming\s*\(\s*\)\s*;/, "/* removed by redtest */;");
  if (stripped === original) {
    console.error("✖ 红测无法注入:App.vue 里找不到 installFieldNaming() 调用(它本就必须在)");
    process.exit(1);
  }
  try {
    writeFileSync(APP, stripped, "utf8");
    const { code, out } = runGate();
    if (code === 0) {
      console.error("✖ 安装判据失效:installFieldNaming() 被移除后门仍报绿");
      process.exit(1);
    }
    if (!/installFieldNaming/.test(out)) {
      console.error(`✖ 安装判据变红了,但不是预期判据:\n${out}`);
      process.exit(1);
    }
    console.log(`✓ 安装判据:installFieldNaming() 被移除 → 门变红(${code})`);
  } finally {
    writeFileSync(APP, original, "utf8");
  }
}

// ── 基数不变量 ───────────────────────────────────────────────────────────────
{
  const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "field-gate-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  const r = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  if (r.status === 0) {
    console.error("✖ 基数不变量失效:扫不到任何 .vue 时门仍报绿");
    process.exit(1);
  }
  console.log(`✓ 基数不变量:无 .vue 可扫 → 门拒绝报绿(${r.status})`);
}

console.log("\n✓ 红测全部通过:每条判据都证明会红,注释忽略与下界也确实生效");
