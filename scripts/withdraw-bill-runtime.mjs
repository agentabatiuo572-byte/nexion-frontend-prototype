#!/usr/bin/env node
// Remote withdrawal runtime boundary.
//
// The former gate exercised a retired local debit + receipt flow. In the
// current D5 contract the server transaction owns wallet reservation, fees,
// order and ledger rows; the App mirrors the canonical order only. This gate
// runs the real store with only the transport method stubbed and proves that a
// successful submission (and an idempotent replay) does not mutate local
// balances or manufacture local bill rows. It also retains the remote parser
// hardening by feeding one malformed canonical receipt through the real API.
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { installFormalProbeSession } from "./lib/formal-probe-session.mjs";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await installFormalProbeSession(page);
const errors = [];
const failedResponses = [];
page.on("console", (msg) => { if (msg.type() === "error") collectAppConsoleErrors(errors, baseUrl)(msg); });
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
});

try {
  await page.goto(`${baseUrl}/?nx_device=off#/pages/me/wallet-withdraw`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof window.uni !== "undefined" && document.querySelector("#app")?.children.length,
    null,
    { timeout: 20_000 },
  );
  // Ignore unrelated startup prefetch noise; the gate owns the submission
  // transaction below and checks console errors produced during that window.
  errors.length = 0;
  const submitCalls = [];
  await page.route("**/api/withdrawals", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() || {};
    const malformed = body.policyVersion === "runtime-malformed";
    if (!malformed) submitCalls.push(body);
    const amount = malformed ? 100 : 480.25;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 0,
        message: "OK",
        data: {
          withdrawalNo: malformed ? "WD-RUNTIME-MALFORMED" : "WD-RUNTIME-SERVER-0001",
          amount,
          chain: body.chain,
          status: "SUBMITTED",
          holdUntil: new Date(Date.now() + 86_400_000).toISOString(),
          networkConfirmUsd: 1,
          networkFee: 1,
          penaltyFee: 0,
          grossFee: 1,
          nexBurned: 0,
          feeWaived: 0,
          actualFee: 1,
          netReceive: malformed ? 999 : amount - 1,
          policyVersion: body.policyVersion,
          useNexFeeOffset: body.useNexFeeOffset,
          riskRoute: "fast-pass",
          idSource: "server",
        },
      }),
    });
  });
  errors.length = 0;

  const result = await page.evaluate(async () => {
    // Vite's HMR graph gives the already-loaded runtime a timestamp query;
    // importing the query-less URL would create a second session vault.
    const runtimeUrl = performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((name) => name.includes("/src/api/runtime.ts"));
    if (!runtimeUrl) throw new Error("withdraw-bill-runtime cannot locate loaded runtime module");
    const [rt, appMod, billsMod, withdrawalApiMod] = await Promise.all([
      import(runtimeUrl),
      import("/src/store/app.ts"),
      import("/src/store/bills.ts"),
      import("/src/api/withdrawal-api.ts"),
    ]);
    const app = appMod.useApp();
    const bills = billsMod.useBills();
    if (!rt.fundsServerEnabled || rt.developmentFundsEnabled) {
      throw new Error("withdraw-bill-runtime requires the remote/server funds rail");
    }
    rt.sessionVault.save({
      accessToken: "runtime-access",
      refreshToken: "runtime-refresh",
      tokenType: "Bearer",
      user: { userId: 900001, countryCode: "+84", phone: "900000001", nickname: "Runtime", onboardingComplete: true },
    });

    const account = app.accountKey;
    const balanceBefore = app.user.usdtBalance;
    const billsBefore = bills.bills.length;
    const storageBefore = JSON.stringify(uni.getStorageSync("nexgrid-bills-accounts-v1") || {});
    const fee = { networkConfirmUsd: 1, nexBurned: 0, actualFeeUsd: 1, feeWaivedUsd: 0 };
    const first = await app.submitWithdrawal(500, "USDT-TRC20", "TRX9Yh7mQ2vK8pLxN4dW6sJ3fBcHgR5tZa", fee, false,
      "runtime-policy", "runtime-idempotency-1", "pass", [], false, []);
    const balanceAfterFirst = app.user.usdtBalance;
    const billsAfterFirst = bills.bills.length;
    const second = await app.submitWithdrawal(500, "USDT-TRC20", "TRX9Yh7mQ2vK8pLxN4dW6sJ3fBcHgR5tZa", fee, false,
      "runtime-policy", "runtime-idempotency-1", "pass", [], false, []);
    const balanceAfterReplay = app.user.usdtBalance;
    const billsAfterReplay = bills.bills.length;
    const storageAfter = JSON.stringify(uni.getStorageSync("nexgrid-bills-accounts-v1") || {});
    const cloud = uni.getStorageSync("nexgrid-account-cloud-v1") || {};
    const cloudBalance = cloud[account]?.user?.usdtBalance;
    const localBillRows = bills.bills.filter((row) => row.ref === "WD-RUNTIME-SERVER-0001");
    let parserAlive = false;
    try {
      await withdrawalApiMod.createWithdrawalApi(rt.apiClient).submit(
        100, "USDT-TRC20", "TRX9Yh7mQ2vK8pLxN4dW6sJ3fBcHgR5tZa",
        "runtime-malformed", false, "runtime-parser-negative",
      );
    } catch (cause) {
      parserAlive = /WITHDRAWAL_RESPONSE_INVALID/.test(String(cause?.message ?? cause));
    }
    return {
      account,
      balanceBefore,
      balanceAfterFirst,
      balanceAfterReplay,
      cloudBalance,
      billsBefore,
      billsAfterFirst,
      billsAfterReplay,
      localBillRows: localBillRows.length,
      storageChanged: storageBefore !== storageAfter,
      firstId: first.id,
      secondId: second.id,
      serverAmount: first.amount,
      parserAlive,
    };
  });
  result.calls = submitCalls;

  console.log("withdraw-bill-runtime — remote server-authority boundary");
  check("远端提交返回服务端 canonical 单据", result.firstId === "WD-RUNTIME-SERVER-0001"
    && result.secondId === result.firstId && result.serverAmount === 480.25);
  check("远端提交不修改本地 USDT 余额", result.balanceAfterFirst === result.balanceBefore
    && result.balanceAfterReplay === result.balanceBefore);
  check("远端提交不写本地账单(含重放)", result.billsAfterFirst === result.billsBefore
    && result.billsAfterReplay === result.billsBefore && result.localBillRows === 0);
  check("本地账单存储没有被提现路径改写", result.storageChanged === false);
  check("服务端回执金额被镜像而非用页面输入伪造", result.serverAmount !== 500);
  check("重放沿用同一幂等键且没有创建第二张本地单", result.calls.length === 2
    && result.calls[0].idempotencyKey === result.calls[1].idempotencyKey);
  check("本地持久钱包余额没有被提现路径改写", result.cloudBalance === undefined
    || result.cloudBalance === result.balanceBefore);
  check("服务端回执解析器拒绝费用等式错误的报文", result.parserAlive === true);
  check("零 console error", errors.length === 0,
    [...errors.slice(0, 3), ...failedResponses.slice(0, 3)].join(" | "));
} finally {
  await browser.close();
}

console.log(`\n${pass} pass / ${fail} fail(真 store + 真远端提交边界;仅桩 withdrawal transport)`);
process.exit(fail ? 1 : 0);
