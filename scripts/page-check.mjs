#!/usr/bin/env node
/**
 * page-check.mjs — quick single-route render check for the alignment task.
 *   node scripts/page-check.mjs "<hashRoute>" [name] [sel1,sel2,...]
 * Navigates :5173<hashRoute>, reports console errors, screenshots to
 * scripts/.baseline/_check/<name>.png, and prints existence+text of each selector.
 * Same determinism freezes as chrome-baseline (time / setInterval / Math.random).
 */
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { directAppUrl } from "./lib/direct-app-url.mjs";
import {
  assertNoRuntimeErrors,
  assertDirectPageCoverage,
  assertSemanticSelectors,
  assertUniAppRuntimeIdentity,
  collectDirectPageWitness,
  collectUniAppRuntimeIdentity,
} from "./lib/probe-coverage.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, ".baseline", "_check");
const BASE = process.env.BASE_URL || "http://localhost:5173";

const route = process.argv[2] || "/";
const name = process.argv[3] || "check";
const sels = (process.argv[4] || "").split(",").map((s) => s.trim()).filter(Boolean);
assertSemanticSelectors(sels, "page-check");

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 414, height: 896 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
  reducedMotion: "reduce",
});
await ctx.addInitScript(() => {
  window.setInterval = () => 0;
  const FIXED = 1781700000000;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
    static now() { return FIXED; }
  }
  window.Date = FakeDate;
  let s = 0x12345678;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});
const page = await ctx.newPage();
const errors = [];
page.on("console", collectAppConsoleErrors(errors, BASE));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(directAppUrl(BASE, route), { waitUntil: "networkidle", timeout: 30000 });
await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, `${name}.png`) });
const found = {};
for (const sel of sels) {
  found[sel] = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { exists: false };
    return { exists: true, text: (el.textContent || "").trim().slice(0, 80) };
  }, sel);
}
const directAppDocument = await page.evaluate(() => ({
  appChildren: document.querySelector("#app")?.childElementCount ?? 0,
  iframeCount: document.querySelectorAll("iframe").length,
}));
const runtimeIdentity = await collectUniAppRuntimeIdentity(page);
const routeWitness = await collectDirectPageWitness(page, errors);
const result = { route, consoleErrors: errors, directAppDocument, selectors: found };
console.log(JSON.stringify(result, null, 2));
await browser.close();
const missingSelectors = Object.entries(found).filter(([, value]) => !value.exists).map(([selector]) => selector);
assertNoRuntimeErrors(errors, "page-check");
assertUniAppRuntimeIdentity(runtimeIdentity, "page-check");
const expectedRoute = directAppUrl(BASE, route).split("#", 2)[1] || "/";
assertDirectPageCoverage(expectedRoute, routeWitness, "page-check");
if (directAppDocument.appChildren === 0 || directAppDocument.iframeCount > 0) {
  throw new Error(`page-check did not land on the direct app document: ${JSON.stringify(directAppDocument)}`);
}
if (missingSelectors.length) throw new Error(`page-check selectors missing: ${missingSelectors.join(", ")}`);
console.log("PAGE-CHECK: PASS");
