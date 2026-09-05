#!/usr/bin/env node
/**
 * trial-check.mjs — behavior-parity test for the Home trial-sheet auto-push
 * (BEHAVIOR-PARITY #1, the one 主人 flagged). Fresh context (no cooldown):
 *   · Home: after the autoPushDelayMs(1500) the TrialClaimSheet (.tcs-root) auto-opens.
 *   · /me (non-home tab): NO auto-push (confirms it is Home-specific, not global).
 * Usage: node scripts/trial-check.mjs
 */
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { directAppUrl } from "./lib/direct-app-url.mjs";
import {
  assertNoRuntimeErrors,
  assertDirectPageCoverage,
  assertUniAppRuntimeIdentity,
  collectDirectPageWitness,
  collectUniAppRuntimeIdentity,
} from "./lib/probe-coverage.mjs";
const BASE = process.env.BASE_URL || "http://localhost:5173";

async function check(route) {
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
  await page.goto(directAppUrl(BASE, route), { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2600); // > 1500ms auto-push delay
  const open = await page.evaluate(() => !!document.querySelector(".tcs-root, .tcs-panel"));
  const runtimeIdentity = await collectUniAppRuntimeIdentity(page);
  const routeWitness = await collectDirectPageWitness(page, errors);
  await ctx.close();
  return { route, sheetOpen: open, errors, runtimeIdentity, routeWitness };
}

const browser = await chromium.launch();
try {
  const home = await check("/#/pages/index/index");
  const me = await check("/#/pages/me/me");
  const autoPushOK = home.sheetOpen === true && me.sheetOpen === false;
  console.log(JSON.stringify({ home, me, autoPushOK }, null, 2));
  assertNoRuntimeErrors([...home.errors, ...me.errors], "trial-check");
  assertUniAppRuntimeIdentity(home.runtimeIdentity, "trial-check home");
  assertUniAppRuntimeIdentity(me.runtimeIdentity, "trial-check me");
  assertDirectPageCoverage(home.route.slice(home.route.indexOf("#") + 1), home.routeWitness, "trial-check home");
  assertDirectPageCoverage(me.route.slice(me.route.indexOf("#") + 1), me.routeWitness, "trial-check me");
  if (!autoPushOK) throw new Error("trial auto-push coverage failed: expected Home=true and Me=false");
  console.log("TRIAL-CHECK: PASS");
} finally {
  await browser.close();
}
