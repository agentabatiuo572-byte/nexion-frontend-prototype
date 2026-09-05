#!/usr/bin/env node
// 账单跨标签页丢失的**实测靶**(改前基线)— node 直跑:
//   node scripts/measure-bills-crosstab-loss.mjs
//
// 为什么要它:完全版 A 的墨菲② 判据是「双标签页各写一条账单,合并后必须是 2 条不是 1 条」。
// 但「现在是 1 条」这件事我此前只是**推断**(bills 走 writeAccountRow 裸覆盖、无合并、无 CAS),
// 没有实测过。推断当靶子会出两种错:① 其实现在就是 2 条 → 这条墨菲点根本不成立,白改;
// ② 丢失形态与我想的不同(比如丢的是先写那条还是后写那条)→ 修法对不上真实事故现场。
//
// 本脚本用**两个 store 实例 = 两个标签页**共享同一份 JSON 序列化 storage
// (与 localStorage 同语义:跨标签页拿不到同一个对象引用),把两条轨道各跑一遍:
//   轨道甲:账单(bills.ts,裸 writeAccountRow)
//   轨道乙:账户快照(account-cloud.ts,三路增量合并)—— 对照组,证明合并层确实能保住两笔
// 两条一起跑才说明问题:同一个并发形态下,一条丢一条不丢 → 差别就在有没有合并层。
//
// 输出是台账,不是断言,**不进 verify**。重构后再跑一次,两次数字并排。
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");
const BILLS_KEY = "nexgrid-bills-accounts-v1";
const CLOUD_KEY = "nexgrid-account-cloud-v1";
const ACCT = "crosstab-loss@nexgrid.test";

// ── 假 storage:JSON 序列化,与 localStorage 同语义 ────────────────────────────
const disk = new Map();
const uni = {
  getStorageSync(key) {
    const raw = disk.get(key);
    return raw === undefined ? "" : JSON.parse(raw);
  },
  setStorageSync(key, value) { disk.set(key, JSON.stringify(value)); },
  removeStorageSync(key) { disk.delete(key); },
  getSystemInfoSync() { return { language: "en" }; },
};
globalThis.uni = uni;
globalThis.__nxTab = 0;

// pinia stub 按 __nxTab 分实例 = 同一份磁盘、两套内存态 = 两个标签页。
const STUBS = {
  "pinia-stub": `const tabs = new Map();
const unwrap = (v) => (v && typeof v === "object" && v.__nxRef === true);
export const defineStore = (id, setup) => () => {
  const tab = globalThis.__nxTab ?? 0;
  if (!tabs.has(tab)) tabs.set(tab, new Map());
  const cache = tabs.get(tab);
  if (!cache.has(id)) cache.set(id, new Proxy(setup(), {
    get(t, k) { const v = Reflect.get(t, k); return unwrap(v) ? v.value : v; },
    set(t, k, val) { const v = Reflect.get(t, k); if (unwrap(v)) { v.value = val; return true; } return Reflect.set(t, k, val); },
  }));
  return cache.get(id);
};`,
  "vue-stub": `export const ref = (v) => ({ __nxRef: true, value: v });
export const computed = (fn) => ({ __nxRef: true, get value() { return typeof fn === "function" ? fn() : fn.get(); } });
export const reactive = (v) => v;
export const watch = () => {};`,
};
const bundle = await build({
  stdin: {
    contents: `export { useApp } from "@/store/app";\nexport { useBills } from "@/store/bills";`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, write: false, format: "esm",
  define: { "import.meta.env": JSON.stringify({ PROD: false, DEV: true, MODE: "measure" }) },
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
      b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "measure-bills-crosstab-loss"));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
    },
  }],
});
const { useApp, useBills } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64"));

const tab = (n) => { globalThis.__nxTab = n; return { app: useApp(), bills: useBills() }; };
const diskBills = () => uni.getStorageSync(BILLS_KEY)?.[ACCT]?.bills ?? [];
const diskUsdt = () => uni.getStorageSync(CLOUD_KEY)?.[ACCT]?.user?.usdtBalance ?? null;

console.log("账单跨标签页丢失 — 改前实测靶\n");

// ── 轨道甲:账单(裸 writeAccountRow,无合并层)──────────────────────────────
disk.clear();
{
  const t0 = tab(0); t0.bills.bindAccount(ACCT); t0.bills.bills = []; t0.bills.add({ type: "bonus", symbol: "USDT", amount: 1, status: "posted", memo: "seed" });
  const t1 = tab(1); t1.bills.bindAccount(ACCT); // 1 号在此刻读盘,拿到 1 条
  const base = diskBills().length;

  // 两页各自写一条(交错:两页都基于同一份基线,先后落盘)
  tab(0).bills.add({ type: "bonus", symbol: "USDT", amount: 10, status: "posted", memo: "TAB-A" });
  tab(1).bills.add({ type: "bonus", symbol: "USDT", amount: 20, status: "posted", memo: "TAB-B" });

  const rows = diskBills();
  const memos = rows.map((b) => b.memo);
  console.log("轨道甲 · 账单表(bills.ts → writeAccountRow 裸覆盖)");
  console.log(`  基线 ${base} 条 → 两页各写 1 条 → 磁盘 ${rows.length} 条`);
  console.log(`  磁盘上的 memo:${JSON.stringify(memos)}`);
  console.log(`  TAB-A 在不在:${memos.includes("TAB-A") ? "在" : "🔴 丢了"} · TAB-B 在不在:${memos.includes("TAB-B") ? "在" : "🔴 丢了"}`);
  console.log(`  ⇒ 预期(改后)必须两条都在,当前:${memos.includes("TAB-A") && memos.includes("TAB-B") ? "两条都在" : "有丢失"}\n`);
}

// ── 轨道乙:账户快照(三路增量合并)—— 对照组 ────────────────────────────────
disk.clear();
{
  const t0 = tab(0); t0.app.bindAccount(ACCT);
  const u = t0.app.user;
  t0.app.user = { ...u, usdtBalance: 100, earningBuckets: { ...u.earningBuckets, withdrawableUsdt: 100 } };
  t0.app.persistAccountSnapshot();
  const t1 = tab(1); t1.app.bindAccount(ACCT); // 1 号读到 100
  const base = diskUsdt();

  tab(0).app.creditBalance(10); // A 页 +10
  tab(1).app.creditBalance(20); // B 页 +20(基线同为 100)

  const after = diskUsdt();
  console.log("轨道乙 · 账户快照(account-cloud.ts → 三路增量合并)· 对照组");
  console.log(`  基线 $${base} → A 页 +$10 / B 页 +$20 → 磁盘 $${after}`);
  console.log(`  两笔都记上了吗:${after === 130 ? "是($130,合并层生效)" : `否($${after},丢了一笔)`}\n`);
}

console.log("结论口径:两条轨道跑的是**同一个并发形态**,差别只有『有没有合并层』。");
console.log("完全版 A 把账单并进账户快照后,轨道甲应当变得与轨道乙同样安全 —— 这就是墨菲② 的固定靶。");
