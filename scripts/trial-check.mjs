#!/usr/bin/env node
/**
 * trial-check.mjs — the trial claim sheet opens only on a user action
 * (UX audit 2026-10-25 B1: Home no longer auto-opens marketing sheets; trial
 * lives in the single Home benefit slot). Fresh context (no cooldown), eligible
 * trial with autoPushEnabled=true in config:
 *   · Home and /me: after the old autoPushDelayMs(1500) the TrialClaimSheet
 *     (.tcs-root) is still closed.
 *   · Home: tapping the benefit slot's trial CTA opens the sheet.
 * Usage: node scripts/trial-check.mjs
 */
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { directAppUrl } from "./lib/direct-app-url.mjs";
import { installFormalProbeSession } from "./lib/formal-probe-session.mjs";
import {
  assertNoRuntimeErrors,
  assertDirectPageCoverage,
  assertUniAppRuntimeIdentity,
  collectDirectPageWitness,
  collectUniAppRuntimeIdentity,
} from "./lib/probe-coverage.mjs";
const BASE = process.env.BASE_URL || "http://localhost:5173";

const trialConfig = {
  trialDays: "3", graceDays: "7", discountRate: "0.15", discountCapUSD: "20",
  trialOffsetCapUSD: "50", trialProductId: "stellarbox-s1", trialPriceUSD: "649",
  shadowDailyUSD: "7", shadowDailyNEX: "40", seatsLeftToday: "47", phaseOpen: true,
  autoPushEnabled: true, autoPushDelayMs: "1500", autoPushCooldownHours: "24",
  autoPushMaxPerSession: "1",
};
const eligibleTrial = {
  authoritative: true,
  state: "ELIGIBLE",
  canStart: true,
  serverNowEpochMs: 1781700000000,
  version: 1,
  claimNo: null,
  shadowUsdt: 0,
  shadowNex: 0,
  source: "nx_trial_claim",
  serverCanonical: true,
  sourceEnvironment: "PRODUCTION",
  runId: "",
  provenance: {
    serverCanonical: true,
    source: "nx_trial_claim",
    sourceEnvironment: "PRODUCTION",
    runId: "",
  },
  paymentRail: "UVEL_USDT_WALLET",
  config: trialConfig,
};
const emptyVoucherState = {
  vouchers: [],
  source: "nx_growth_voucher + nx_growth_voucher_grant",
  serverCanonical: true,
  provenance: { source: "nx_growth_voucher", sourceEnvironment: "PRODUCTION", runId: "" },
};

async function check(route, { tapHomeTrial = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    // The voucher sheet intentionally opens 200ms before the trial sheet. Put it
    // on cooldown so this probe measures the trial auto-push instead of the
    // mutually-exclusive voucher priority rule.
    localStorage.setItem("nexgrid-voucher-claim-sheet-v1", JSON.stringify({
      type: "object",
      data: { lastClosedAt: 9999999999999 },
    }));
  });
  const errors = [];
  page.on("console", collectAppConsoleErrors(errors, BASE));
  page.on("pageerror", (e) => errors.push(String(e)));
  await installFormalProbeSession(page, {
    responseFor: (url) => {
      if (url.pathname === "/api/trial/state" || url.pathname === "/api/trial/eligibility") return eligibleTrial;
      if (url.pathname === "/api/vouchers") return emptyVoucherState;
      return undefined;
    },
  });
  await page.goto(directAppUrl(BASE, route), { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2600); // > 1500ms auto-push delay
  const sheetSelector = ".tcs-root, .tcs-panel";
  const open = await page.evaluate((sel) => !!document.querySelector(sel), sheetSelector);
  let openedByTap = null;
  if (tapHomeTrial) {
    const cta = page.locator('[data-home-section="benefits"] .nx-trial-hero .trial-cta').first();
    await cta.click({ timeout: 10000 });
    openedByTap = await page.waitForSelector(sheetSelector, { timeout: 5000 }).then(() => true, () => false);
  }
  const runtimeIdentity = await collectUniAppRuntimeIdentity(page);
  const routeWitness = await collectDirectPageWitness(page, errors);
  await ctx.close();
  return { route, sheetOpen: open, openedByTap, errors, runtimeIdentity, routeWitness };
}

const browser = await chromium.launch();
try {
  const home = await check("/#/pages/index/index", { tapHomeTrial: true });
  const me = await check("/#/pages/me/me");
  const userActionOnlyOK = home.sheetOpen === false && me.sheetOpen === false && home.openedByTap === true;
  console.log(JSON.stringify({ home, me, userActionOnlyOK }, null, 2));
  assertNoRuntimeErrors([...home.errors, ...me.errors], "trial-check");
  assertUniAppRuntimeIdentity(home.runtimeIdentity, "trial-check home");
  assertUniAppRuntimeIdentity(me.runtimeIdentity, "trial-check me");
  assertDirectPageCoverage(home.route.slice(home.route.indexOf("#") + 1), home.routeWitness, "trial-check home");
  assertDirectPageCoverage(me.route.slice(me.route.indexOf("#") + 1), me.routeWitness, "trial-check me");
  if (!userActionOnlyOK) throw new Error("trial sheet coverage failed: expected no auto-open on Home or Me, and the Home trial CTA to open it");
  console.log("TRIAL-CHECK: PASS");
} finally {
  await browser.close();
}
