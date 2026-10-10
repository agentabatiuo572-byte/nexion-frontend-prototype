import { expect, it } from "vitest";
// @ts-expect-error The application tsconfig omits Node globals used by this browser gate test.
import { readFileSync } from "node:fs";
// @ts-expect-error Execute the checked-in collector without starting its full route traversal.
import { runInNewContext } from "node:vm";
import { chromium, type Page } from "playwright";
// @ts-expect-error Shared Node-only production and runtime copy gate.
import { INTERNAL_COPY_PATTERNS } from "../../scripts/lib/public-copy-patterns.mjs";

it("checks internal copy in each accessible attribute while retaining financial disclosures", async () => {
  const source = readFileSync(new URL("../../scripts/ui-consistency-runtime.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function collectDOM(page)");
  const end = source.indexOf("\nasync function visit(", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const collectDOM = runInNewContext(`(${source.slice(start, end)})`) as (page: Page) => Promise<{ body: string; accessibilityCopy: string[] }>;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const attribute of ["aria-label", "title", "placeholder", "alt"]) {
      for (const [copy, forbidden] of [["来源：服务端设备在线状态", true], ["手续费 2 USDT；确认后不可取消", false]] as const) {
        await page.setContent(`<p>正常产品内容</p><img ${attribute}="${copy}" width="24" height="24">`);
        const dom = await collectDOM(page);
        expect(dom.body).not.toContain(copy);
        expect(dom.accessibilityCopy).toContain(copy);
        expect(INTERNAL_COPY_PATTERNS.some((pattern: RegExp) => pattern.test([dom.body, ...dom.accessibilityCopy].join("\n")))).toBe(forbidden);
      }
    }
  } finally {
    await browser.close();
  }
}, 30_000);
