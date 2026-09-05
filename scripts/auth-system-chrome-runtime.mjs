import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import fs from "node:fs";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const runId = Date.now();
const flowRoutePattern = /^pages\/(?:onboarding|login|register|ref|session)\//;
const pagesManifest = JSON.parse(fs.readFileSync(new URL("../src/pages.json", import.meta.url), "utf8"));
const pages = pagesManifest.pages
  .map(({ path }) => path)
  .filter((path) => flowRoutePattern.test(path))
  .map((path) => ({
    name: path.replace(/^pages\//, "").replaceAll("/", "-"),
    route: `/${path}`,
    delay: path === "pages/onboarding/estimator" ? 1500 : 0,
  }));
const viewports = [
  { name: "device", width: 430, height: 940, devicePreview: true },
  { name: "compact", width: 320, height: 568, devicePreview: false },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 🔴 超时 12s→30s(2026-07-23 C3):断言问的是「页面能不能渲染出来」,不是「能不能在
// 12 秒内渲染出来」。12s 是个任意值,它把「机器负载」这个与产品无关的变量引进了判据 ——
// 本轮并发跑多个 headless chromium 时这条稳定误报,回退代码后又「通过」,险些据此改错代码
// (实为偶发:同一份代码连跑 2 次都过)。30s 仍能抓住「页面根本渲染不出来」的真故障,
// 断言强度不变,只是不再把慢启动算成失败。
async function waitUntil(check, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
let page;
const consoleErrors = [];

async function appFrame(rootSelector) {
  let match;
  await waitUntil(async () => {
    for (const frame of [...page.frames().filter((candidate) => candidate !== page.mainFrame()), page.mainFrame()]) {
      if (await frame.locator(rootSelector).count()) {
        match = frame;
        return true;
      }
    }
    return false;
  }, `app frame not ready for ${rootSelector}`);
  return match;
}

const results = {};
try {
  for (const viewport of viewports) {
    if (page) await page.close();
    page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    page.on("console", collectAppConsoleErrors(consoleErrors, baseUrl));
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    results[viewport.name] = {};
    for (let index = 0; index < pages.length; index += 1) {
      const { name, route, delay } = pages[index];
      const deviceParam = viewport.devicePreview ? "" : "&nx_device=off&nx_device_inner=1";
      await page.goto(`${baseUrl}/?systemChrome=${runId}-${viewport.name}-${index}${deviceParam}#${route}`, { waitUntil: "domcontentloaded" });
      const frame = await appFrame(".nx-standalone-page");
      await frame.locator(".nx-statusbar__inner").waitFor({ state: "visible", timeout: 30_000 }).catch((error) => {
        throw new Error(`${viewport.name}/${name}: status bar did not render at ${page.url()}: ${error.message}`);
      });
      await frame.locator(".nx-standalone-home .nx-home-indicator").waitFor({ state: "visible" });
      const control = frame.locator("[data-system-chrome-primary]").first();
      await control.waitFor({ state: "attached" });
      if (delay) await frame.waitForTimeout(delay);
      let initialReachability;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const reachability = await frame.evaluate(() => {
          const status = document.querySelector(".nx-statusbar__inner")?.getBoundingClientRect();
          const home = document.querySelector(".nx-standalone-home .nx-home-indicator")?.getBoundingClientRect();
          const control = document.querySelector("[data-system-chrome-primary]")?.getBoundingClientRect();
          return status && home && control ? {
            statusBottom: status.bottom,
            homeTop: home.top,
            control: { top: control.top, right: control.right, bottom: control.bottom, left: control.left },
          } : null;
        });
        if (!reachability) throw new Error(`${viewport.name}/${name}: reachability elements missing`);
        if (!initialReachability) initialReachability = reachability;
        if (reachability.control.top >= reachability.statusBottom && reachability.control.bottom <= reachability.homeTop - 16) break;
        await frame.locator(".nx-standalone-page").hover({ position: { x: 160, y: 300 } });
        if (!viewport.devicePreview) await page.mouse.move(viewport.width / 2, viewport.height / 2);
        await page.mouse.wheel(0, reachability.control.bottom > reachability.homeTop - 16 ? 1200 : -1200);
        await frame.waitForTimeout(100);
      }

      results[viewport.name][name] = await frame.evaluate(() => {
      const root = document.querySelector(".nx-standalone-page");
      const status = document.querySelector(".nx-statusbar__inner");
      const home = document.querySelector(".nx-standalone-home .nx-home-indicator");
      const control = document.querySelector("[data-system-chrome-primary]");
      if (!(root instanceof HTMLElement) || !(status instanceof HTMLElement) || !(home instanceof HTMLElement) || !(control instanceof HTMLElement)) {
        throw new Error("required runtime element missing");
      }
      const rr = root.getBoundingClientRect();
      const sr = status.getBoundingClientRect();
      const hr = home.getBoundingClientRect();
      const cr = control.getBoundingClientRect();
      const rootStyle = getComputedStyle(root);
      const homeAfter = getComputedStyle(home, "::after");
      return {
        root: { top: rr.top, right: rr.right, bottom: rr.bottom, left: rr.left },
        status: { top: sr.top, bottom: sr.bottom, display: getComputedStyle(status).display },
        home: { top: hr.top, bottom: hr.bottom, width: homeAfter.width, height: homeAfter.height },
        control: { top: cr.top, right: cr.right, bottom: cr.bottom, left: cr.left },
        controlRole: control.getAttribute("role"),
        controlTabIndex: control.tabIndex,
        controlAriaDisabled: control.getAttribute("aria-disabled"),
        paddingTop: parseFloat(rootStyle.paddingTop),
        paddingBottom: parseFloat(rootStyle.paddingBottom),
        scrollTop: root.scrollTop,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      };
      });

      const row = results[viewport.name][name];
      row.initialControl = initialReachability.control;
      assert(row.paddingTop >= 54, `${viewport.name}/${name}: status-bar space is ${row.paddingTop}px`);
      assert(row.status.display !== "none" && row.status.bottom <= row.paddingTop, `${viewport.name}/${name}: status bar is missing or overlaps content`);
      assert(row.home.width === "134px" && row.home.height === "5px", `${viewport.name}/${name}: Home Indicator geometry drifted`);
      assert(row.controlRole === "button" || row.controlRole === "link", `${viewport.name}/${name}: primary control has no semantic role`);
      assert(row.controlTabIndex >= 0 || row.controlAriaDisabled === "true", `${viewport.name}/${name}: primary control is missing from keyboard flow`);
      assert(row.control.top >= row.status.bottom, `${viewport.name}/${name}: primary control overlaps the status bar`);
      assert(row.control.bottom <= row.home.top - 16, `${viewport.name}/${name}: primary control enters the Home Indicator reserve (${row.control.bottom}/${row.home.top}; scroll=${row.scrollTop}/${row.scrollHeight - row.clientHeight})`);

      if (name === "login-login" && viewport.devicePreview) {
        await frame.locator(".lg-phone__cc").click();
        await frame.locator(".cc-sheet").waitFor({ state: "visible" });
        const layers = await frame.evaluate(() => ({
          status: Number(getComputedStyle(document.querySelector(".nx-statusbar")).zIndex),
          home: Number(getComputedStyle(document.querySelector(".nx-standalone-home")).zIndex),
          mask: Number(getComputedStyle(document.querySelector(".cc-mask")).zIndex),
          sheet: Number(getComputedStyle(document.querySelector(".cc-sheet")).zIndex),
        }));
        assert(layers.status > layers.mask && layers.home > layers.sheet, `modal obscures system chrome: ${JSON.stringify(layers)}`);
        await frame.locator("body").press("Escape");
      }
    }

    const estimator = results[viewport.name]["onboarding-estimator"].initialControl;
    const success = results[viewport.name]["register-success"].initialControl;
    assert(Math.abs(estimator.left - success.left) <= 0.5, `${viewport.name} CTA left mismatch: estimator=${estimator.left}, success=${success.left}`);
    assert(Math.abs(estimator.right - success.right) <= 0.5, `${viewport.name} CTA right mismatch: estimator=${estimator.right}, success=${success.right}`);
    assert(Math.abs(estimator.bottom - success.bottom) <= 0.5, `${viewport.name} CTA bottom mismatch: estimator=${estimator.bottom}, success=${success.bottom}`);
  }

  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);

  console.log(JSON.stringify({
    routes: pages.map(({ route }) => route),
    viewports: Object.fromEntries(Object.entries(results).map(([viewport, rows]) => [viewport, Object.fromEntries(Object.entries(rows).map(([name, row]) => [name, {
      paddingTop: row.paddingTop,
      paddingBottom: row.paddingBottom,
      initialControlBottom: row.initialControl.bottom,
      controlBottom: row.control.bottom,
      homeTop: row.home.top,
    }]))])),
    consoleErrors: consoleErrors.length,
  }, null, 2));
} finally {
  await browser.close();
}
