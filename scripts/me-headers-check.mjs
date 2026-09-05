#!/usr/bin/env node
/** me-headers-check.mjs — confirm the 3 me-page section headers render + no Vue warn. */
import { chromium } from "playwright";
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
const page = await ctx.newPage();
const msgs = [];
page.on("console", (m) => msgs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => msgs.push("PAGEERROR: " + String(e)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/?nx_device=off#/pages/me/me`, { waitUntil: "networkidle", timeout: 30000 });
await wait(4000);
const txt = await page.evaluate(() => document.body.innerText);
const has = (s) => txt.includes(s);
const sectionHeaderWarns = msgs.filter((m) => /SectionHeader|Failed to resolve/i.test(m));
const errors = msgs.filter((m) => m.startsWith("error") || m.startsWith("PAGEERROR"));
await page.screenshot({ path: "scripts/.baseline/_check/me-after-fix.png", fullPage: true });
console.log(JSON.stringify({
  headerMyNetwork: has("My Network"),
  headerMyOrders: has("My Orders"),
  headerMyDevices: has("My devices"),
  sectionHeaderWarnings: sectionHeaderWarns,
  consoleErrors: errors,
  titleLines: txt.split("\n").filter((l) => /network|order|device|fleet|toward/i.test(l)).slice(0, 12),
}, null, 2));
await browser.close();
