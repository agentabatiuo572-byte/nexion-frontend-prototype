#!/usr/bin/env node
/**
 * profile-identity-check.mjs — profile 身份行「联系身份,非内部 key」运行时门。
 *
 * 守的不变量:页面文案禁字段名/枚举值 —— user.email 的兜底链一旦吃进账号内部
 * key("default"),profile 昵称正下方会把裸 "default" 当邮箱渲出来
 * (2026-08-15 date-locale T1 独立验收发现#2;修法 = app.ts asEmailIdentity 收敛)。
 *
 * 两个场景:
 *   A fresh mock boot:身份行渲 demo 邮箱 alex@nexgrid.ai,且全页无 standalone
 *     "default" 文本节点(构造性判据:扫渲染结果,不扫源码形状)。
 *   B 毒快照痊愈:注入旧 bug 真实会持久化出的形状(account-cloud "default" 行
 *     user.email="default"),重载后启动绑定闸(App.vue → bindAccount)应把它治成
 *     demo 邮箱 —— 存量污染用户升级后自动痊愈,不能靠清存储。
 *
 * Usage: BASE_URL=http://127.0.0.1:<port> node scripts/profile-identity-check.mjs
 */
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { directAppUrl } from "./lib/direct-app-url.mjs";
import { waitForUniAppPage } from "./lib/probe-readiness.mjs";
import { installFormalProbeSession } from "./lib/formal-probe-session.mjs";
import {
  assertNoRuntimeErrors,
  assertDirectPageCoverage,
  assertUniAppRuntimeIdentity,
  collectDirectPageWitness,
  collectUniAppRuntimeIdentity,
} from "./lib/probe-coverage.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const ROUTE = "/#/pages/me/profile";

// 旧 bug(bindAccount 把 rawAccountKey 直灌 email)会真实持久化出的快照形状。
// 夹具钉死时戳保证确定性;字段集与 UserState/createSeedSnapshot 同形。
const POISONED_AT = 1755300000000;
const POISONED_TABLE = {
  default: {
    schema: 1,
    accountKey: "default",
    entrySurface: "h5",
    updatedAt: POISONED_AT,
    user: {
      email: "default",
      tier: "L2",
      joinedAt: POISONED_AT - 30 * 86400000,
      cumulativeDepositUsdt: 0,
      referralCode: "NEXGRID-8K9X",
      usdtBalance: 24856.56,
      nexBalance: 1240,
      pendingEarnings: 2.31,
      earningBuckets: {
        withdrawableUsdt: 24856.56,
        pendingReviewUsdt: 0,
        bonusLockedUsdt: 0,
        lockedNex: 0,
        policyVersion: "mock-seed-v1",
        lastBucketedAt: POISONED_AT,
      },
    },
    devices: [],
    earnings: { today: 0, todayNEX: 0, thisWeek: 0, thisMonth: 0, total: 0, history: [] },
    withdrawals: [],
  },
};

async function check(label, poisonTable) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  if (poisonTable) {
    await page.addInitScript((table) => {
      localStorage.setItem("nexgrid-account-cloud-v1", JSON.stringify({ type: "object", data: table }));
    }, poisonTable);
  }
  const errors = [];
  page.on("console", collectAppConsoleErrors(errors, BASE));
  page.on("pageerror", (e) => errors.push(String(e)));
  await installFormalProbeSession(page);
  await page.goto(directAppUrl(BASE, ROUTE), { waitUntil: "networkidle", timeout: 30000 });
  // The actual readiness boundary is the mounted route and first rendered text.
  await waitForUniAppPage(page, "pages/me/profile");
  const witness = await page.evaluate(() => {
    const bare = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((node.textContent || "").trim() === "default") {
        const parent = node.parentElement;
        bare.push(`<${parent?.tagName?.toLowerCase() ?? "?"} class="${parent?.className ?? ""}">`);
      }
    }
    const text = document.body.innerText || "";
    return {
      bareDefaultNodes: bare,
      hasServerIdentity: text.includes("Formal Probe") || text.includes("13800000000") || text.includes("+86"),
    };
  });
  const runtimeIdentity = await collectUniAppRuntimeIdentity(page);
  const routeWitness = await collectDirectPageWitness(page, errors);
  await ctx.close();
  return { label, ...witness, errors, runtimeIdentity, routeWitness };
}

const browser = await chromium.launch();
try {
  const fresh = await check("fresh-boot", null);
  const healed = await check("poisoned-snapshot-heal", POISONED_TABLE);
  console.log(JSON.stringify({ fresh, healed }, null, 2));
  for (const result of [fresh, healed]) {
    assertNoRuntimeErrors(result.errors, `profile-identity ${result.label}`);
    assertUniAppRuntimeIdentity(result.runtimeIdentity, `profile-identity ${result.label}`);
    assertDirectPageCoverage(ROUTE.slice(ROUTE.indexOf("#") + 1), result.routeWitness, `profile-identity ${result.label}`);
    if (result.bareDefaultNodes.length > 0) {
      throw new Error(`profile-identity ${result.label}: internal account key rendered as bare text at ${result.bareDefaultNodes.join(", ")}`);
    }
    if (!result.hasServerIdentity) {
      throw new Error(`profile-identity ${result.label}: identity line does not show the restored server profile`);
    }
  }
  console.log("PROFILE-IDENTITY-CHECK: PASS");
} finally {
  await browser.close();
}
