// run-compose.mjs — render compose.html scenes to PNG (deterministic, headless Chromium)
// Usage (cwd = Nexion-uniapp root):  node docs/changes/assets/nexgrid-imgs-composite/run-compose.mjs box rack
// Output: out-box.png / out-rack.png in this directory → review, then copy over
//   src/static/img/products/nexionbox-pro-v2.png / nexionrack-p1-v2.png (backup old to .trash first).
// box.png / rack.png here are the ORIGINAL (old-brand) sources the composition erases+relabels.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, "/");
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ["box", "rack"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, deviceScaleFactor: 1 });
for (const s of scenes) {
  await page.goto(`file:///${DIR}/compose.html?scene=${s}`);
  await page.waitForFunction("window.READY === 1", null, { timeout: 15000 });
  await page.locator("#stage").screenshot({ path: `${DIR}/out-${s}.png` });
  console.log("rendered", s);
}
await browser.close();
