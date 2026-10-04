#!/usr/bin/env node
/**
 * sticky-check.mjs — verify the sticky SubPageHeader pins on scroll + frosts.
 *   node scripts/sticky-check.mjs <hashRoute> <name>
 * Loads route, reads .spv top, scrolls .nx-content 400px, re-reads top (must stay
 * pinned), injects backdrop-filter:invert(1) on .spv + screenshots (frosting proof
 * = inverted band over scrolled content), reports console errors.
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
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, ".baseline", "_check");
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || "http://localhost:5173";
const route = process.argv[2] || "/#/pages/team/rank";
const name = process.argv[3] || "sticky";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, colorScheme: "dark" });
const errors = [];
page.on("console", collectAppConsoleErrors(errors, BASE));
page.on("pageerror", (e) => errors.push(String(e)));
await installFormalProbeSession(page);
await page.goto(directAppUrl(BASE, route), { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1300);
const before = await page.evaluate(() => {
  const el = document.querySelector(".spv");
  return el ? Math.round(el.getBoundingClientRect().top) : null;
});
await page.evaluate(() => {
  const sc = document.querySelector(".nx-content");
  if (sc) sc.scrollTop = 400;
});
await page.waitForTimeout(500);
const after = await page.evaluate(() => {
  const el = document.querySelector(".spv");
  return el ? Math.round(el.getBoundingClientRect().top) : null;
});
const title = await page.evaluate(() => document.querySelector(".spv-title")?.textContent?.trim() ?? null);
// frosting proof — invert the header backdrop; if it samples scrolled content the
// band visibly inverts (screenshot for the human/agent to eyeball).
await page.addStyleTag({ content: ".spv{backdrop-filter:invert(1)!important;-webkit-backdrop-filter:invert(1)!important}" });
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(OUT, `${name}-frost.png`) });
const result = {
  route, title, spvExists: before !== null,
  topBeforeScroll: before, topAfterScroll: after,
  pinnedOK: before !== null && after !== null && Math.abs(after - before) <= 2,
  consoleErrors: errors,
  frostShot: `scripts/.baseline/_check/${name}-frost.png`,
};
const runtimeIdentity = await collectUniAppRuntimeIdentity(page);
const routeWitness = await collectDirectPageWitness(page, errors);
console.log(JSON.stringify(result, null, 2));
await browser.close();
assertNoRuntimeErrors(errors, "sticky-check");
assertUniAppRuntimeIdentity(runtimeIdentity, "sticky-check");
assertDirectPageCoverage(route.slice(route.indexOf("#") + 1), routeWitness, "sticky-check");
if (!result.pinnedOK || !result.title) {
  throw new Error(`sticky header coverage failed: exists=${result.spvExists}, title=${String(result.title)}, pinned=${result.pinnedOK}`);
}
console.log("STICKY-CHECK: PASS");
