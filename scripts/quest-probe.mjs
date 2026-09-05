#!/usr/bin/env node
/** quest-probe.mjs — observe the home day-one-quest-card real (store-driven) state. */
import { chromium } from "playwright";
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
const p = await ctx.newPage();
await p.goto(`${BASE}/?nx_device=off#/pages/index/index`, { waitUntil: "networkidle", timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));
// 🔴 按账号分行的 accounts 键;旧单键 nexgrid-quest-v1 已废(src/store/quest.ts:71),读它恒 null。
const questLocalStorage = await p.evaluate(() => localStorage.getItem("nexgrid-quest-accounts-v1"));
const completedCounterText = await p.evaluate(() => {
  const el = [...document.querySelectorAll("text,view,span")].find((e) => /\/6/.test(e.textContent || "") && (e.textContent || "").length < 12);
  return el ? el.textContent.trim() : "(not found)";
});
const checkmarkCount = await p.evaluate(() => document.querySelectorAll("path[d='M5 12l5 5L20 7']").length);
console.log(JSON.stringify({ questLocalStorage, completedCounterText, checkmarkCount }, null, 2));
await b.close();
