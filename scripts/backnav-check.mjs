#!/usr/bin/env node
/**
 * backnav-check.mjs — empirical test that the chassis nav header survives uni's
 * page-stack back-navigation (the onActivated linchpin for the SubPageHeader
 * registrar). A→B via uni.navigateTo, then uni.navigateBack → A's header must
 * re-appear. Usage: node scripts/backnav-check.mjs <hashRouteA> <uniRouteB>
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
const routeA = process.argv[2] || "/#/pages/team/rank";
const routeB = process.argv[3] || "/pages/team/rank-how";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 414, height: 896 }, colorScheme: "dark" });
const errors = [];
page.on("console", collectAppConsoleErrors(errors, BASE));
page.on("pageerror", (e) => errors.push(String(e)));
await installFormalProbeSession(page);
const title = () => page.$eval(".spv-title", (e) => e.textContent.trim()).catch(() => null);

await page.goto(directAppUrl(BASE, routeA), { waitUntil: "networkidle", timeout: 30000 });
await page.waitForFunction(() => typeof globalThis.uni !== "undefined" && !!document.querySelector(".spv-title"), undefined, { timeout: 15_000 });
const tA = await title();
await page.evaluate((r) => globalThis.uni.navigateTo({ url: r }), routeB);
await page.waitForFunction((previous) => {
  const current = document.querySelector(".spv-title")?.textContent?.trim() ?? null;
  return current !== null && current !== previous;
}, tA, { timeout: 15_000 });
const tB = await title();
await page.evaluate(() => globalThis.uni.navigateBack());
await page.waitForFunction((expected) => document.querySelector(".spv-title")?.textContent?.trim() === expected, tA, { timeout: 15_000 });
const tBack = await title();

const result = {
  routeA, routeB, titleA: tA, titleB: tB, titleBackToA: tBack,
  backNavOK: tBack !== null && tBack === tA && tBack !== tB,
  consoleErrors: errors,
};
const runtimeIdentity = await collectUniAppRuntimeIdentity(page);
const routeWitness = await collectDirectPageWitness(page, errors);
console.log(JSON.stringify(result, null, 2));
await browser.close();
assertNoRuntimeErrors(errors, "backnav-check");
assertUniAppRuntimeIdentity(runtimeIdentity, "backnav-check");
assertDirectPageCoverage(routeA.slice(routeA.indexOf("#") + 1), routeWitness, "backnav-check");
if (!result.backNavOK) {
  throw new Error(`back navigation coverage failed: A=${String(tA)}, B=${String(tB)}, back=${String(tBack)}`);
}
console.log("BACKNAV-CHECK: PASS");
