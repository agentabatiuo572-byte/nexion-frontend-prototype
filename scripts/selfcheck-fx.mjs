#!/usr/bin/env node
// A5 汇率牌价纯逻辑自检 — node 直跑,不起 Vue/uni:
//   node scripts/selfcheck-fx.mjs
// 用 esbuild(vite 传递依赖)现场转译 src/store/fx-core.ts 后 import,
// 断言:quoteRate 固定靶 26,390 / 取整到十位 / vndForUsdt 精确到盾不凑千 /
// spread 越界判不可用 / fmtVnd 千分位。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { transformSync } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(path.join(root, "src", "store", "fx-core.ts"), "utf8");
const { code } = transformSync(src, { loader: "ts", format: "esm" });
const core = await import(
  "data:text/javascript;base64," + Buffer.from(code, "utf8").toString("base64")
);

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`);
  }
}

const { SPREAD_MAX, computeQuoteRate, vndForUsdt, fmtVnd, isFxQuoteUsable } = core;

console.log("selfcheck-fx — fx-core 纯逻辑断言([FEAT-PAY03])");

// 1) 牌价派生固定靶 + 取整到十位
{
  check("固定靶 26,000 × 1.5% → 26,390", computeQuoteRate(26000, 1.5) === 26390);
  check("取整到十位(26,000 × 1.53% = 26,397.8 → 26,400)", computeQuoteRate(26000, 1.53) === 26400);
  check("取整到十位(26,001 × 1.5% = 26,391.015 → 26,390)", computeQuoteRate(26001, 1.5) === 26390);
  check("spread 0 → 原价取十位(26,000 → 26,000)", computeQuoteRate(26000, 0) === 26000);
}

// 2) 应付 VND:精确到盾、不凑整千(规格 PAY02 ③ vndAmount 生成规则)
{
  check("固定靶 vndForUsdt(25, 26,390) = 659,750", vndForUsdt(25, 26390) === 659750);
  const odd = vndForUsdt(25.5, 26390);
  check("25.5 USDT → 672,945(精确零头)", odd === 672945);
  check("不凑整千(672,945 % 1000 = 945 ≠ 0)", odd % 1000 === 945);
  check("小数金额取整到盾(10.01 × 26,390 = 264,163.9 → 264,164)", vndForUsdt(10.01, 26390) === 264164);
}

// 3) spread 越界 / 异常数据判不可用(规格 ② 异常3)
{
  check("SPREAD_MAX = 3", SPREAD_MAX === 3);
  check("spread 3.01 越上界 → 不可用", isFxQuoteUsable(26000, 3.01) === false);
  check("spread -0.01 越下界 → 不可用", isFxQuoteUsable(26000, -0.01) === false);
  check("base 0(缺字段)→ 不可用", isFxQuoteUsable(0, 1.5) === false);
  check("base 负值 → 不可用", isFxQuoteUsable(-26000, 1.5) === false);
  check("base NaN → 不可用", isFxQuoteUsable(NaN, 1.5) === false);
  check("spread NaN → 不可用", isFxQuoteUsable(26000, NaN) === false);
  check("边界合法:spread 0 可用", isFxQuoteUsable(26000, 0) === true);
  check("边界合法:spread 3 可用", isFxQuoteUsable(26000, 3) === true);
  check("正常档 26,000 / 1.5 可用", isFxQuoteUsable(26000, 1.5) === true);
}

// 3b) 浮点边界回归靶(code-review 2026-07-24 抓获:IEEE754 把 .5 进位边界压成 .4999…)
//     + BigInt 精确参照网格扫,永久封死同类静默算错。
{
  check("回归靶 27,000 × 1.5% → 27,410(曾错出 27,400)", computeQuoteRate(27000, 1.5) === 27410);
  check("回归靶 vndForUsdt(16.65, 26,390) = 439,394(曾错出 439,393)", vndForUsdt(16.65, 26390) === 439394);
  // BigInt 参照:quote = round(base×(10000+bps)/10000/10)×10,全整数精确。
  function refQuote(base, bps) {
    const num = BigInt(base) * BigInt(10000 + bps); // base×(10000+bps)
    const tens = num / 100000n; // ÷10000÷10 的整数部分
    const rem = num % 100000n;
    return Number((rem * 2n >= 100000n ? tens + 1n : tens) * 10n);
  }
  function refVnd(cents, rate) {
    const num = BigInt(cents) * BigInt(rate);
    const q = num / 100n;
    const r = num % 100n;
    return Number(r * 2n >= 100n ? q + 1n : q);
  }
  let quoteBad = 0;
  for (let base = 20000; base <= 32000; base += 250) {
    for (const bps of [0, 50, 100, 150, 200, 250, 300]) {
      if (computeQuoteRate(base, bps / 100) !== refQuote(base, bps)) quoteBad++;
    }
  }
  check("quoteRate 网格 vs BigInt 参照(49 base × 7 spread)零漂移", quoteBad === 0);
  let vndBad = 0;
  for (let cents = 1000; cents <= 500000; cents += 3337) {
    for (const rate of [25990, 26390, 26400, 27410]) {
      if (vndForUsdt(cents / 100, rate) !== refVnd(cents, rate)) vndBad++;
    }
  }
  check("vndForUsdt 网格 vs BigInt 参照(150 金额 × 4 牌价)零漂移", vndBad === 0);
}

// 4) fmtVnd 千分位 + ₫
{
  check('fmtVnd(659750) = "659,750₫"', fmtVnd(659750) === "659,750₫");
  check('fmtVnd(26390) = "26,390₫"', fmtVnd(26390) === "26,390₫");
  check('fmtVnd(500) = "500₫"(不足千无分隔)', fmtVnd(500) === "500₫");
  check('fmtVnd(1234567890) 三级分隔', fmtVnd(1234567890) === "1,234,567,890₫");
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
