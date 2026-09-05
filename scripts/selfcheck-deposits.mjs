#!/usr/bin/env node
// A2 入金纯逻辑自检 — node 直跑,不起 Vue/uni:
//   node scripts/selfcheck-deposits.mjs
// 用 esbuild(vite 传递依赖)现场转译 src/store/deposits-core.ts 后 import,
// 断言:地址派生确定性 / 网络形态 / 跨账号跨网络互异 / 费表 / credited 计算 /
// txHash 幂等判重 / DP 单号格式 / 银行轨(容差+上限常量 · 账户池轮换取模+启停过滤 · 附言码格式)。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { transformSync } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(path.join(root, "src", "store", "deposits-core.ts"), "utf8");
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

const {
  CHAIN_DEPOSIT_FEE_USDT,
  CHAIN_REQUIRED_CONFIRMATIONS,
  MIN_DEPOSIT_USDT,
  chainDepositFeeUsdt,
  computeCreditedUsdt,
  deriveDepositAddress,
  isDuplicateTxHash,
  mockDepositId,
  mockChainTxHash,
} = core;

console.log("selfcheck-deposits — deposits-core 纯逻辑断言");

// 1) 地址派生确定性:同 key 同网络恒定(重复 50 次全等)
{
  const first = deriveDepositAddress("user@a.com", "usdt-trc20");
  let stable = true;
  for (let i = 0; i < 50; i++) {
    if (deriveDepositAddress("user@a.com", "usdt-trc20") !== first) stable = false;
  }
  check("同 key 同网络地址恒定(×50)", stable);
}

// 2) 网络形态:TRC20 = T 开头 34 位;ERC20/BEP20 = 0x + 40 hex
{
  const trc = deriveDepositAddress("user@a.com", "usdt-trc20");
  const erc = deriveDepositAddress("user@a.com", "usdt-erc20");
  const bep = deriveDepositAddress("user@a.com", "usdt-bep20");
  check("TRC20 形态 T+33(34 位总长)", /^T[0-9A-F]{33}$/.test(trc) && trc.length === 34);
  check("ERC20 形态 0x+40hex", /^0x[0-9a-f]{40}$/.test(erc));
  check("BEP20 形态 0x+40hex", /^0x[0-9a-f]{40}$/.test(bep));
  check("同 key 跨网络地址互异", trc !== erc && erc !== bep && trc !== bep);
}

// 3) 跨账号互异(同网络不同 key)
{
  const a = deriveDepositAddress("user@a.com", "usdt-trc20");
  const b = deriveDepositAddress("user@b.com", "usdt-trc20");
  check("不同 key 同网络地址互异", a !== b);
}

// 4) 费表 + credited 计算
{
  check("费表 trc20=1 / bep20=1 / erc20=5", CHAIN_DEPOSIT_FEE_USDT["usdt-trc20"] === 1
    && CHAIN_DEPOSIT_FEE_USDT["usdt-bep20"] === 1
    && CHAIN_DEPOSIT_FEE_USDT["usdt-erc20"] === 5);
  check("chainDepositFeeUsdt 与费表一致", chainDepositFeeUsdt("usdt-erc20") === 5
    && chainDepositFeeUsdt("usdt-trc20") === 1);
  check("credited = gross − fee(100−5=95)", computeCreditedUsdt(100, 5) === 95);
  check("credited 两位小数取整(19.9−1=18.9 / 浮点 0.3−0.1=0.2)",
    computeCreditedUsdt(19.9, 1) === 18.9 && computeCreditedUsdt(0.3, 0.1) === 0.2);
  check("最低额常量 $10", MIN_DEPOSIT_USDT === 10);
  check("确认数 TRC20 20 / ERC20 12 / BEP20 15", CHAIN_REQUIRED_CONFIRMATIONS["usdt-trc20"] === 20
    && CHAIN_REQUIRED_CONFIRMATIONS["usdt-erc20"] === 12
    && CHAIN_REQUIRED_CONFIRMATIONS["usdt-bep20"] === 15);
}

// 5) txHash 幂等判重
{
  const records = [{ txHash: "0xabc" }, { txHash: "0xdef" }, {}];
  check("已存在 txHash → 判重 true", isDuplicateTxHash(records, "0xabc") === true);
  check("新 txHash → 判重 false", isDuplicateTxHash(records, "0x999") === false);
  check("空 txHash → false(银行轨无哈希不误伤)", isDuplicateTxHash(records, "") === false);
}

// 6) MOCK 单号 / 哈希格式
{
  const id = mockDepositId(Date.parse("2026-07-24T12:00:00Z"));
  check("DP 单号格式 DP-YYYYMMDD-NNNN", /^DP-20260724-\d{4}$/.test(id));
  check("mock txHash 形态 0x+64hex", /^0x[0-9a-f]{64}$/.test(mockChainTxHash()));
}

// 7) 银行轨([FEAT-PAY02]):容差/上限常量 · 账户池轮换取模+启停过滤 · 附言码格式
{
  const { BANK_RECEIVE_ACCOUNTS, BANK_MAX_DEPOSIT_USDT, BANK_VND_TOLERANCE, pickBankAccount, mockMemoCode } = core;
  check("回单容差常量 ±1,000₫", BANK_VND_TOLERANCE === 1000);
  check("单笔上限常量 $5,000", BANK_MAX_DEPOSIT_USDT === 5000);
  const n = BANK_RECEIVE_ACCOUNTS.length;
  check("账户池 ≥2 户且种子全启用", n >= 2 && BANK_RECEIVE_ACCOUNTS.every((a) => a.enabled === true));
  check(
    "轮换取模:rotation 0..2n-1 依次循环命中池序",
    Array.from({ length: 2 * n }, (_, i) => pickBankAccount(i)).every(
      (acct, i) => acct && acct.accountNumber === BANK_RECEIVE_ACCOUNTS[i % n].accountNumber,
    ),
  );
  check("轮换负数/越界防御(取模不越界)", pickBankAccount(-1) !== null && pickBankAccount(10 ** 9) !== null);
  const onlySecond = BANK_RECEIVE_ACCOUNTS.map((a, i) => ({ ...a, enabled: i === 1 }));
  check(
    "停用户被过滤(仅剩 1 户时任意 rotation 恒命中该户)",
    pickBankAccount(0, onlySecond)?.accountNumber === onlySecond[1].accountNumber &&
      pickBankAccount(5, onlySecond)?.accountNumber === onlySecond[1].accountNumber,
  );
  check("全禁用 → null(通道维护禁下单)", pickBankAccount(0, onlySecond.map((a) => ({ ...a, enabled: false }))) === null);
  check("派发对象剥掉 enabled 位(意向单只存派发字段)", !("enabled" in pickBankAccount(0)));
  const codes = Array.from({ length: 200 }, () => mockMemoCode());
  check("附言码 NX-+6 位且全用无易混字符集(×200)", codes.every((c) => /^NX-[346789ACDEFHJKMNPRTWXY]{6}$/.test(c)));
}

// 8) 卡通道:费另收(charge = credited + fee,与链上 gross−fee 反向)· 限额 · 授权号幂等
{
  const {
    CARD_FEE_RATE, MIN_CARD_DEPOSIT_USDT, MAX_CARD_DEPOSIT_USDT, CARD_DECLINE_RATE,
    cardFeeUsd, cardChargeUsd, mockCardAuthCode, isDuplicateAuthCode,
  } = core;
  check("卡费率 3.5% / 最低 $30 / 上限 $5,000 / 拒付率 10%",
    CARD_FEE_RATE === 0.035 && MIN_CARD_DEPOSIT_USDT === 30
    && MAX_CARD_DEPOSIT_USDT === 5000 && CARD_DECLINE_RATE === 0.1);
  check("卡费两位小数(100 → 3.5 / 33.33 → 1.17)",
    cardFeeUsd(100) === 3.5 && cardFeeUsd(33.33) === 1.17);
  // 🔴 浮点回归靶(同 fx-core 的 27,000×1.5% → 27,410):237 × 3.5% = 8.295 属半分进位边界,
  // 浮点直乘 + toFixed 会被 IEEE754 压成 8.29(全区间穷举 11 个金额中招)。整数域算法必得 8.30。
  check("卡费半分边界不被浮点压低(237 → 8.30 · 923 → 32.31 · 3917 → 137.10)",
    cardFeeUsd(237) === 8.3 && cardFeeUsd(923) === 32.31 && cardFeeUsd(3917) === 137.1);
  check("实扣 = 入账额 + 费(100 → 103.5),用户到账额不缩水",
    cardChargeUsd(100) === 103.5 && cardChargeUsd(30) === 31.05);
  // 🔴 与链上反向的核心不变量:credited = gross − fee 在卡轨同样成立(记账口径统一)
  check("卡轨仍满足 credited = gross − fee(账本口径与链上一致)",
    [30, 100, 33.33, 4999.99].every((c) => {
      const credited = +c.toFixed(2);
      return +(cardChargeUsd(credited) - cardFeeUsd(credited)).toFixed(2) === credited;
    }));
  const auths = Array.from({ length: 200 }, () => mockCardAuthCode());
  check("授权号 CK-+6 位数字(×200)", auths.every((a) => /^CK-\d{6}$/.test(a)));
  // fixture 里必须有一条 authCode 为空串的记录:否则「空授权号 → false」是空断言 ——
  // 删掉被测函数的 `if (!authCode) return false` guard 也不会红(变异测试实证)。
  const cardRecords = [{ authCode: "CK-123456" }, { txHash: "0xabc" }, { authCode: "" }];
  check("已存在授权号 → 判重 true", isDuplicateAuthCode(cardRecords, "CK-123456") === true);
  check("新授权号 → 判重 false", isDuplicateAuthCode(cardRecords, "CK-999999") === false);
  check("空授权号 → false(即便 fixture 里存在空串记录,也不得判成重复)",
    isDuplicateAuthCode(cardRecords, "") === false);
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
