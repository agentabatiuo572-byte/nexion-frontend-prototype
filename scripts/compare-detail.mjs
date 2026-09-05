#!/usr/bin/env node
/** compare-detail.mjs — current UniApp detail-page section spacing probe. */
import { chromium } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".baseline", "_check");
fs.mkdirSync(OUT, { recursive: true });
const PROD = process.argv[2] || "stellarrack-p1";
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const apps = [
  { name: "uni", url: `${BASE}/?nx_device=off#/pages/store/detail?id=${PROD}`, scrollSel: ".nx-content" },
];
const browser = await chromium.launch();
for (const a of apps) {
  const page = await browser.newPage({ viewport: { width: 414, height: 896 }, colorScheme: "dark" });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  try {
    await page.goto(a.url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1600);
    await page.evaluate((sel) => {
      let el = sel ? document.querySelector(sel) : null;
      if (!el) el = [...document.querySelectorAll("*")].find((e) => { const s = getComputedStyle(e); return (s.overflowY === "auto" || s.overflowY === "scroll") && e.scrollHeight - e.clientHeight > 300; });
      if (el) el.scrollTop = 720; else window.scrollTo(0, 720);
    }, a.scrollSel);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `detail-cmp-${a.name}.png`) });
    const spec = await page.evaluate(() => {
      const sig = new Set();
      document.querySelectorAll("*").forEach((e) => {
        const s = getComputedStyle(e);
        if (s.paddingTop === "22px") sig.add("wrapPad=" + s.padding);
        if (s.marginTop === "22px") sig.add("secMargin=" + s.margin);
      });
      return [...sig];
    });
    console.log(a.name, JSON.stringify({ spacingSignatures: spec, pageErrors: errs }));
  } catch (e) { console.log(a.name, "ERR", String(e)); }
  await page.close();
}
await browser.close();
