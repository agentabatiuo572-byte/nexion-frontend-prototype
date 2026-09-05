#!/usr/bin/env node
// TRIAL02 试用价双源等值哨兵 — node 直跑,零依赖,不起 dev server:
//   node scripts/selfcheck-trial-price-parity.mjs
//
// 守什么:checkout 促销折扣行算自 trial-config 的 trialPriceUSD(subtotal,
// checkout.vue computeDiscountedPrice),结算基数用商品目录 products.ts 里
// trialProductId 对应商品的 price(checkout.vue p.price)。今天两侧相等
// (649/649)没有任何机器门看守;后台将来独立改任意一侧即静默脱节 ——
// 页面显示的折扣算基 ≠ 实际结算基数。
// 运行时保持双源不耦合(生产 = 目录表 + 试用配置表两张后端表,一致性由后端
// 保证)——mock 侧焊这道值 parity 机器门代替耦合。
//
// 防删除盲区(gates-blind-to-deletion):任何一侧提取不到(字段被删/商品
// 下架/改名/悬空指针)一律 exit 1 转红,不允许「找不到 = 静默全过」。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const die = (msg) => {
  console.error(`FAIL ${msg}`);
  process.exit(1);
};

// ── 侧 1:trial-config.ts 的 DEFAULT_TRIAL_CONFIG ──
const cfgSrc = readFileSync(path.join(root, "src", "store", "trial-config.ts"), "utf8");
const defIdx = cfgSrc.indexOf("DEFAULT_TRIAL_CONFIG");
if (defIdx < 0) die("trial-config.ts: DEFAULT_TRIAL_CONFIG 不存在(被改名/删除?)");
const defBlock = cfgSrc.slice(defIdx);
const pidM = defBlock.match(/trialProductId:\s*"([^"]+)"/);
if (!pidM) die("trial-config.ts: DEFAULT_TRIAL_CONFIG 里提取不到 trialProductId");
const priceCfgM = defBlock.match(/trialPriceUSD:\s*([0-9]+(?:\.[0-9]+)?)/);
if (!priceCfgM) die("trial-config.ts: DEFAULT_TRIAL_CONFIG 里提取不到 trialPriceUSD 数值");
const pid = pidM[1];
const cfgPrice = Number(priceCfgM[1]);

// ── 侧 2:products.ts 目录里该商品的 price ──
const prodSrc = readFileSync(path.join(root, "src", "mock", "products.ts"), "utf8");
const idIdx = prodSrc.indexOf(`id: "${pid}"`);
if (idIdx < 0) die(`products.ts: 找不到 id: "${pid}" 的商品(trialProductId 悬空指针)`);
// 搜索范围钉死在当前商品对象内(到下一个 id: " 为止),防「本商品缺 price 时
// 静默读到下一个商品的价」;monthlyPrice 大写 P 不会误中(前置非字母守卫)。
const nextIdIdx = prodSrc.indexOf('id: "', idIdx + 1);
const objSlice = prodSrc.slice(idIdx, nextIdIdx > 0 ? nextIdIdx : undefined);
const priceProdM = objSlice.match(/(?:^|[^a-zA-Z])price:\s*([0-9]+(?:\.[0-9]+)?)/);
if (!priceProdM) die(`products.ts: "${pid}" 商品对象内提取不到 price`);
const prodPrice = Number(priceProdM[1]);

if (cfgPrice !== prodPrice) {
  die(`试用价双源脱节: trial-config.trialPriceUSD=${cfgPrice} != products[${pid}].price=${prodPrice}`);
}
console.log(`trialPriceUSD=${cfgPrice} == products[${pid}].price=${prodPrice}`);
