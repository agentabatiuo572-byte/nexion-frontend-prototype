#!/usr/bin/env node
// 卡纯逻辑自检 — node 直跑,不起 Vue/uni:
//   node scripts/selfcheck-cards.mjs
// 用 esbuild(vite 传递依赖)现场转译 src/store/cards-core.ts 后 import,
// 断言:卡组织判定边界 / 三类字段规范化 / 可提交判定(full 与 cvv-only 两模式)。
// 这些逻辑真实现里发生在收单方 iframe 内,mock 对等物必须自己守住。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { transformSync } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(path.join(root, "src", "store", "cards-core.ts"), "utf8");
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

const { detectBrand, brandLabel, normalizeCardField, panDigits, isCardComplete } = core;

console.log("\n[1] 卡组织判定(展示与落库同源)");
check("Visa = 4 开头", detectBrand("4111111111111111") === "visa");
check("Mastercard = 51-55", ["51", "52", "53", "54", "55"].every((p) => detectBrand(`${p}00000000000000`) === "mastercard"));
check("Mastercard = 22-27(2-series)", ["22", "25", "27"].every((p) => detectBrand(`${p}00000000000000`) === "mastercard"));
check("Amex = 34 / 37", detectBrand("340000000000000") === "amex" && detectBrand("370000000000000") === "amex");
check("UnionPay = 62 开头", detectBrand("6200000000000000") === "unionpay");
// 回归靶:充值页此前自带的宽松判断把「2 开头一律 Mastercard」,与落库判定打架。
check("20 / 21 / 28 / 29 不是 Mastercard(旧宽松判断的回归靶)",
  ["20", "21", "28", "29"].every((p) => detectBrand(`${p}00000000000000`) === "unknown"));
check("50 / 56 不是 Mastercard", detectBrand("5000000000000000") === "unknown" && detectBrand("5600000000000000") === "unknown");
check("空串 = unknown", detectBrand("") === "unknown");
check("brandLabel 覆盖全部 5 值", ["visa", "mastercard", "amex", "unionpay", "unknown"]
  .every((b) => typeof brandLabel(b) === "string" && brandLabel(b).length > 0));

console.log("\n[2] 字段规范化(卡号 / 有效期 / CVV)");
check("卡号四位分组", normalizeCardField("pan", "4111111111111111") === "4111 1111 1111 1111");
check("卡号剥非数字", normalizeCardField("pan", "4111-1111 abc1111x1111") === "4111 1111 1111 1111");
check("卡号封顶 19 位(不是 16)", panDigits(normalizeCardField("pan", "1".repeat(30))).length === 19);
check("卡号尾部不留悬空空格", !normalizeCardField("pan", "41111111").endsWith(" "));
check("有效期 4 位 → MM/YY", normalizeCardField("expiry", "1228") === "12/28");
check("有效期 ≤2 位不加斜杠", normalizeCardField("expiry", "1") === "1" && normalizeCardField("expiry", "12") === "12");
check("有效期封顶 4 位数字", normalizeCardField("expiry", "122899") === "12/28");
check("CVV 封顶 4 位", normalizeCardField("cvv", "12345") === "1234");
check("CVV 剥非数字", normalizeCardField("cvv", "a1b2c3") === "123");

console.log("\n[3] 可提交判定(对齐 SDK complete)");
const full = { pan: "4111 1111 1111 1111", expiry: "12/28", cvv: "123" };
check("full:三项齐 → 可提交", isCardComplete("full", full) === true);
check("full:缺 CVV → 不可提交", isCardComplete("full", { ...full, cvv: "" }) === false);
check("full:CVV 只 2 位 → 不可提交", isCardComplete("full", { ...full, cvv: "12" }) === false);
check("full:有效期形态不对 → 不可提交", isCardComplete("full", { ...full, expiry: "1228" }) === false);
check("full:卡号不足 13 位 → 不可提交", isCardComplete("full", { ...full, pan: "4111 1111" }) === false);
check("full:卡号恰 13 位 → 可提交(Visa 短号)", isCardComplete("full", { ...full, pan: "4".repeat(13) }) === true);
check("cvv-only:只看 CVV,卡号有效期空也可提交",
  isCardComplete("cvv-only", { pan: "", expiry: "", cvv: "123" }) === true);
check("cvv-only:CVV 空 → 不可提交", isCardComplete("cvv-only", { pan: "", expiry: "", cvv: "" }) === false);
check("cvv-only:4 位 CVV(Amex)→ 可提交", isCardComplete("cvv-only", { pan: "", expiry: "", cvv: "1234" }) === true);

console.log(`\n卡纯逻辑自检:${pass} pass / ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
