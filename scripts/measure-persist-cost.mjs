#!/usr/bin/env node
// 账户快照落盘代价基线测量 — node 直跑,不起浏览器:
//   node scripts/measure-persist-cost.mjs
//
// 为什么要它:完全版 A 的墨菲①判据是「静置 60 秒的落盘**次数**与**总字节数**」,
// 而「改完之后比改前低」这种判据,**没有改前的数就无法成立**。先把基线钉在地上。
//
// 方法:载真 store(与 selfcheck 同一套 esbuild + pinia/vue stub),挂一个会数
// 次数与字节的假 storage,然后**真的按 1 秒一拍推 60 拍**(不是估算),
// 数 `nexgrid-account-cloud-v1` 被写了几次、每次序列化多少字节。
//
// 输出是台账,不是断言 —— 本脚本**不进 verify**(它测的是性能基线不是不变量),
// 由重构前后各跑一次、把两次数字并排贴进 docs/changes/。
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");
const CLOUD_KEY = "nexgrid-account-cloud-v1";
const BILLS_KEY = "nexgrid-bills-accounts-v1";

// ── 假 storage:按 key 记「写了几次 / 每次多少字节」──────────────────────────────
const disk = new Map();
/** @type {Record<string, {count:number, bytes:number[]}>} */
const stat = {};
const uni = {
  getStorageSync(key) {
    const raw = disk.get(key);
    return raw === undefined ? "" : JSON.parse(raw);
  },
  setStorageSync(key, value) {
    const json = JSON.stringify(value);
    (stat[key] ??= { count: 0, bytes: [] }).count++;
    stat[key].bytes.push(Buffer.byteLength(json, "utf8"));
    disk.set(key, json);
  },
  removeStorageSync(key) { disk.delete(key); },
  getSystemInfoSync() { return { language: "en" }; },
};
globalThis.uni = uni;

const STUBS = {
  "pinia-stub": `const cache = new Map();
const unwrap = (v) => (v && typeof v === "object" && v.__nxRef === true);
export const defineStore = (id, setup) => () => {
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
    contents: `export { useApp } from "@/store/app";
export { useBills } from "@/store/bills";
export { useConfig } from "@/store/config";`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, write: false, format: "esm",
  define: { "import.meta.env": JSON.stringify({ PROD: false, DEV: true, MODE: "measure" }) },
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
      b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "measure-persist-cost"));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
    },
  }],
});
const { useApp, useBills } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64"));

const ACCT = "persist-cost@nexgrid.test";
const app = useApp();
const bills = useBills();
app.bindAccount(ACCT);
bills.bindAccount(ACCT);

// 让设备真的在产出:激活全部可激活的设备,并把锚点设成「刚登记」。
const activeKinds = app.devices.filter((d) => d.status === "online").length;

// 基线:先落一次盘把种子写进去,再清计数,只数「静置期」的写入。
app.persistAccountSnapshot();
const seedBills = bills.bills.length;
for (const k of Object.keys(stat)) delete stat[k];

// ── 真的推 60 拍(每拍 1 秒的墙钟增量)──────────────────────────────────────────
const TICKS = 60;
const realNow = Date.now;
let fakeNow = realNow();
Date.now = () => fakeNow;
for (let i = 0; i < TICKS; i++) {
  fakeNow += 1000;
  app.tick(1000);
}
Date.now = realNow;

// ── 报表 ──────────────────────────────────────────────────────────────────────
const sum = (a) => a.reduce((s, x) => s + x, 0);
console.log(`落盘代价基线 — 静置 ${TICKS} 秒(不做任何用户操作)· 账号种子:${app.devices.length} 台设备 / ${seedBills} 条账单`);
console.log("");
for (const [key, s] of Object.entries(stat).sort((a, b) => sum(b[1].bytes) - sum(a[1].bytes))) {
  const total = sum(s.bytes);
  const avg = Math.round(total / s.bytes.length);
  const mark = key === CLOUD_KEY ? " 🔴" : key === BILLS_KEY ? " 📒" : "";
  console.log(`  ${key}${mark}`);
  console.log(`    写入 ${s.count} 次 · 单次均 ${avg.toLocaleString()} B · 合计 ${(total / 1024).toFixed(1)} KB / ${TICKS}s`);
}
const cloud = stat[CLOUD_KEY];
console.log("");
if (!cloud) {
  console.log("  ⚠️ 账户快照一次都没写 —— 设备可能全是离线态,基线不成立,查种子。");
  process.exit(1);
}
console.log(`账户快照:${cloud.count} 次 / ${TICKS}s · 合计 ${(sum(cloud.bytes) / 1024).toFixed(1)} KB`);
console.log(`账单当前不在这张表里,${seedBills} 条种子账单序列化 ${Buffer.byteLength(JSON.stringify(bills.bills), "utf8").toLocaleString()} B ——`);
console.log(`并表后若不节流,60 秒代价将升到约 ${((sum(cloud.bytes) + cloud.count * Buffer.byteLength(JSON.stringify(bills.bills), "utf8")) / 1024).toFixed(1)} KB(这就是必须节流的量化理由)`);
