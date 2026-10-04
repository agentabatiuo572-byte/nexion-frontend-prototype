import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { installFormalProbeSession } from "./lib/formal-probe-session.mjs";
import fs from "node:fs";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const runId = Date.now();
const flowRoutePattern = /^pages\/(?:onboarding|login|register|ref|session)\//;
const authenticatedRoutes = new Set([
  "/pages/onboarding/estimator",
  "/pages/onboarding/connect",
  "/pages/register/success",
]);
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

const downloadGuideRoutes = new Set(["/pages/onboarding/estimator", "/pages/onboarding/connect"]);
const downloadGuideHash = "#/pages/register/success?download=1";
const localeFiles = {
  en: new URL("../src/i18n/messages/en.ts", import.meta.url),
  zh: new URL("../src/i18n/messages/zh.ts", import.meta.url),
  vi: new URL("../src/i18n/messages/vi.ts", import.meta.url),
};
const locales = Object.keys(localeFiles);
const diskLocales = fs.readdirSync(new URL("../src/i18n/messages/", import.meta.url)).filter((name) => /^[a-z]{2}\.ts$/.test(name)).map((name) => name.slice(0, -3)).sort();
assert(JSON.stringify([...locales].sort()) === JSON.stringify(diskLocales), "flow runtime must cover every bundled locale");
const localeCopy = Object.fromEntries(locales.map((locale) => [locale, fs.readFileSync(localeFiles[locale], "utf8")]));
function copyValue(locale, key) {
  const line = localeCopy[locale].split(/\r?\n/).find((line) => line.trimStart().startsWith(`${key}:`));
  const value = line?.match(/:\s*("(?:\\.|[^"\\])*")/);
  assert(value, `missing ${locale} runtime witness: ${key}`);
  return JSON.parse(value[1]);
}
const downloadGuideCopy = Object.fromEntries(locales.map((locale) => [locale, {
  title: copyValue(locale, "doneOfficialDownloadLink"),
  body: copyValue(locale, "phoneActivationAppOnlyBody"),
}]));

function assertFlowDestination(route, witness, context, locale) {
  assert(witness.locale === locale && locales.includes(locale), `${context}: requested ${locale}, rendered locale ${witness.locale}`);
  if (!downloadGuideRoutes.has(route)) {
    assert(witness.hash.split("?")[0] === `#${route}`, `${context}: unexpected redirect to ${witness.hash}`);
    return;
  }
  assert(witness.hash === downloadGuideHash, `${context}: expected ${downloadGuideHash}, received ${witness.hash}`);
  assert(witness.successRoots === 1 && witness.onboardingRoots === 0, `${context}: download guide is not the rendered flow page`);
  const expectedCopy = downloadGuideCopy[locale];
  assert(witness.title === expectedCopy.title && witness.body === expectedCopy.body, `${context}: ${locale} download-only copy is missing`);
  assert(witness.gifts === 0, `${context}: download-only guide rendered a registration gift`);
}

function flowDestinationSelftest() {
  const counts = {};
  for (const locale of locales) {
    let count = 0;
    const guide = { hash: downloadGuideHash, locale, successRoots: 1, onboardingRoots: 0, ...downloadGuideCopy[locale], gifts: 0 };
    const otherCopy = downloadGuideCopy[locales.find((candidate) => candidate !== locale)];
    const positive = (route, witness) => { assertFlowDestination(route, witness, "positive flow", locale); count += 1; };
    const negative = (route, witness) => {
      let rejected = false;
      try { assertFlowDestination(route, witness, "negative flow", locale); } catch { rejected = true; }
      assert(rejected, `flow destination selftest accepted ${locale}/${route}: ${JSON.stringify(witness)}`);
      count += 1;
    };
    for (const route of downloadGuideRoutes) {
      positive(route, guide);
      for (const change of [
        { hash: `#${route}` }, { hash: "#/pages/register/success" }, { hash: "#/pages/register/success?download=0" },
        { hash: "#/pages/login/login?download=1" }, { hash: `${downloadGuideHash}&gift=1` },
        { successRoots: 0 }, { onboardingRoots: 1 }, { title: "Registration complete" }, { body: "" }, { gifts: 1 },
        { locale: "unsupported" }, { title: otherCopy.title }, { body: otherCopy.body },
      ]) {
        negative(route, { ...guide, ...change });
      }
    }
    positive("/pages/login/login", { hash: "#/pages/login/login", locale });
    negative("/pages/login/login", guide);
    negative("/pages/login/login", { hash: "#/pages/login/login", locale: "unsupported" });
    counts[locale] = count;
  }
  return counts;
}
const destinationSelftests = flowDestinationSelftest();
if (process.argv.includes("--selftest")) {
  console.log(`PASS flow destination selftest: ${JSON.stringify(destinationSelftests)} positive/negative cases`);
  process.exit(0);
}

async function flowWitness(frame) {
  return frame.evaluate(() => ({
    hash: location.hash,
    locale: globalThis.uni?.getStorageSync("nexgrid-locale-v1")?.code,
    successRoots: document.querySelectorAll(".rs-root").length,
    onboardingRoots: document.querySelectorAll(".est-root, .cn-root").length,
    title: document.querySelector(".rs-title")?.textContent?.trim() || "",
    body: document.querySelector(".rs-sub")?.textContent?.trim() || "",
    gifts: document.querySelectorAll(".rs-gift, .rs-wrap--gift").length,
  }));
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
  for (const locale of locales) for (const viewport of viewports) {
    const variant = `${locale}/${viewport.name}`;
    results[variant] = {};
    for (let index = 0; index < pages.length; index += 1) {
      const { name, route, delay } = pages[index];
      if (page) await page.close();
      page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.addInitScript((code) => {
        localStorage.setItem("nexgrid-locale-v1", JSON.stringify({ type: "object", data: { code, userSet: true } }));
      }, locale);
      // Private onboarding pages require a restored session. A fresh carrier
      // also prevents one page's restore or navigation leaking into the next.
      await installFormalProbeSession(page, {
        authenticated: authenticatedRoutes.has(route),
        responseFor: (url, request) => authenticatedRoutes.has(route) && url.pathname === "/api/app/profile" && request.method() === "GET"
          ? { nickname: "Formal Probe", avatarUrl: "", avatarRevision: "", language: locale }
          : undefined,
      });
      page.on("console", collectAppConsoleErrors(consoleErrors, baseUrl));
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      const deviceParam = viewport.devicePreview ? "" : "&nx_device=off&nx_device_inner=1";
      await page.goto(`${baseUrl}/?systemChrome=${runId}-${variant}-${index}${deviceParam}#${route}`, { waitUntil: "domcontentloaded" });
      const frame = await appFrame("[data-system-chrome-primary]").catch(async (error) => {
        const frameBodies = await Promise.all(page.frames().map(async (candidate) => ({
          url: candidate.url(),
          body: (await candidate.locator("body").innerText().catch(() => "")).slice(0, 240),
        })));
        throw new Error(`${viewport.name}/${name}: ${error.message}; url=${page.url()}; frames=${JSON.stringify(frameBodies)}`);
      });
      await frame.locator(".nx-statusbar__inner").waitFor({ state: "visible", timeout: 30_000 }).catch((error) => {
        throw new Error(`${viewport.name}/${name}: status bar did not render at ${page.url()}: ${error.message}`);
      });
      await frame.locator(".nx-standalone-home .nx-home-indicator").waitFor({ state: "visible" });
      const control = frame.locator("[data-system-chrome-primary]").first();
      await control.waitFor({ state: "attached", timeout: 30_000 }).catch(async (error) => {
        const body = (await frame.locator("body").innerText().catch(() => "")).slice(0, 500);
        throw new Error(`${viewport.name}/${name}: primary chrome control missing at ${page.url()}; body=${body}; ${error.message}`);
      });
      if (delay) await frame.waitForTimeout(delay);
      if (downloadGuideRoutes.has(route)) {
        await waitUntil(() => frame.evaluate((expected) => location.hash === expected, downloadGuideHash),
          `${viewport.name}/${name}: expected download-guide redirect at ${frame.url()}`);
        await frame.locator(".rs-title").waitFor({ state: "visible", timeout: 30_000 });
      }
      const destination = await flowWitness(frame);
      assertFlowDestination(route, destination, `${variant}/${name}`, locale);
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

      results[variant][name] = await frame.evaluate(() => {
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

      const row = results[variant][name];
      assertFlowDestination(route, await flowWitness(frame), `${variant}/${name}: after geometry measurement`, locale);
      row.locale = destination.locale;
      row.destination = destination.hash;
      row.downloadOnly = downloadGuideRoutes.has(route);
      if (row.downloadOnly) row.downloadCopy = { title: destination.title, body: destination.body };
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

    const estimator = results[variant]["onboarding-estimator"].initialControl;
    const success = results[variant]["register-success"].initialControl;
    assert(Math.abs(estimator.left - success.left) <= 0.5, `${viewport.name} CTA left mismatch: estimator=${estimator.left}, success=${success.left}`);
    assert(Math.abs(estimator.right - success.right) <= 0.5, `${viewport.name} CTA right mismatch: estimator=${estimator.right}, success=${success.right}`);
    assert(Math.abs(estimator.bottom - success.bottom) <= 0.5, `${viewport.name} CTA bottom mismatch: estimator=${estimator.bottom}, success=${success.bottom}`);
  }

  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);

  console.log(JSON.stringify({
    destinationSelftests,
    locales,
    routes: pages.map(({ route }) => route),
    viewports: Object.fromEntries(Object.entries(results).map(([viewport, rows]) => [viewport, Object.fromEntries(Object.entries(rows).map(([name, row]) => [name, {
      paddingTop: row.paddingTop,
      paddingBottom: row.paddingBottom,
      locale: row.locale,
      destination: row.destination,
      downloadOnly: row.downloadOnly,
      downloadCopy: row.downloadCopy,
      initialControlBottom: row.initialControl.bottom,
      controlBottom: row.control.bottom,
      homeTop: row.home.top,
    }]))])),
    consoleErrors: consoleErrors.length,
  }, null, 2));
} finally {
  await browser.close();
}
