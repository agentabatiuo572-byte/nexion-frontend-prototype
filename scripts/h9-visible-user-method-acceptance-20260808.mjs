import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const evidenceDir = process.env.H9_VISIBLE_EVIDENCE_DIR
  ?? "D:/workspace/bug-pic/.restricted/hard-block-method-acceptance-20260808/H9-F5-UA-20260808-0330/H9-user";
const expectedFleet = Number(process.env.H9_EXPECTED_FLEET ?? "");
mkdirSync(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const consoleErrors = [];
const responses = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", (item) => {
  if (item.url().includes("127.0.0.1:8110")) responses.push({ url: item.url(), status: item.status() });
});
await page.route("http://127.0.0.1:8110/**", async (route) => {
  await route.continue({ headers: { ...route.request().headers(), "x-nexion-edge-country": "JP" } });
});

const platformResponse = page.waitForResponse((response) => response.url().includes("/api/config/platform"));
await page.goto("http://127.0.0.1:5173/#/pages/index/index", { waitUntil: "domcontentloaded" });
const response = await platformResponse;
const platformBody = await response.json().catch(() => null);
const platformData = platformBody?.data ?? platformBody ?? {};
const publicStats = platformData.publicStats ?? platformData.h9PublicStats ?? {};
const publicValues = publicStats.values ?? publicStats;
const projectedFleet = Number(publicValues.fleetDevices);
const projectedOnlineRate = Number(publicValues.onlineRatePct);
const expectedActiveDevices = Number.isFinite(expectedFleet) && Number.isFinite(projectedOnlineRate)
  ? Math.round(expectedFleet * (projectedOnlineRate / 100))
  : NaN;
let renderFailure = "";
let h9VisibleFinding = "";
let appFrame;
try {
  await page.waitForFunction(() => Array.from(document.querySelectorAll("iframe")).some((frame) => frame.src.includes("nx_device_inner=1")), undefined, { timeout: 30_000 });
  appFrame = page.frames().find((frame) => frame.url().includes("nx_device_inner=1"));
  if (!appFrame) throw new Error("UniApp inner device frame is unavailable");
  await appFrame.waitForFunction(() => (document.body?.innerText ?? "").trim().length > 0, undefined, { timeout: 30_000 });
  try {
    await appFrame.waitForFunction(() => {
      const text = document.body?.innerText ?? "";
      return text.includes("在线设备") && !text.includes("在线设备\n0\n");
    }, undefined, { timeout: 30_000 });
  } catch {
    h9VisibleFinding = "H9_USER_FLEET_STAYS_ZERO_AFTER_VALID_SERVER_CONFIG";
  }
} catch (cause) {
  renderFailure = cause instanceof Error ? cause.message : String(cause);
}
const body = appFrame ? await appFrame.locator("body").innerText() : await page.locator("body").innerText();
const html = await page.content();
await page.screenshot({ path: `${evidenceDir}/01-entry.png`, fullPage: true });
let globeBody = "";
if (appFrame && !renderFailure) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const milestone = appFrame.locator(".ms-overlay");
    if (!(await milestone.isVisible().catch(() => false))) break;
    await milestone.click({ position: { x: 5, y: 5 } });
  }
  const voucherDismiss = appFrame.locator(".vcs-dismiss");
  if (await voucherDismiss.isVisible().catch(() => false)) await voucherDismiss.click();
  const pulse = appFrame.getByText("网络脉搏", { exact: true });
  await pulse.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidenceDir}/02-network-pulse.png`, fullPage: true });
  const globeLink = appFrame.getByText("地图 →", { exact: true });
  await globeLink.scrollIntoViewIfNeeded();
  await globeLink.click();
  await appFrame.waitForURL(/pages\/globe\/globe/);
  await appFrame.waitForFunction(() => (document.body?.innerText ?? "").trim().length > 0, undefined, { timeout: 30_000 });
  globeBody = await appFrame.locator("body").innerText();
  if (Number.isFinite(expectedActiveDevices)
      && !globeBody.includes(expectedActiveDevices.toLocaleString("en-US"))) {
    h9VisibleFinding = `H9_GLOBE_DOES_NOT_SHOW_EXPECTED_ACTIVE_DEVICES:${expectedActiveDevices}`;
  }
  await page.screenshot({ path: `${evidenceDir}/03-visible-globe.png`, fullPage: true });
}
if (response.status() !== 200) renderFailure ||= `PLATFORM_CONFIG_HTTP_${response.status()}`;
if (Number.isFinite(expectedFleet) && projectedFleet !== expectedFleet) {
  h9VisibleFinding = `H9_PLATFORM_FLEET_MISMATCH:${projectedFleet}!=${expectedFleet}`;
}
const evidence = {
  entryUrl: page.url(),
  platformStatus: response.status(),
  platformBody,
  expectedFleet,
  projectedFleet,
  projectedOnlineRate,
  expectedActiveDevices,
  entryBody: body,
  globeBody,
  html,
  frames: page.frames().map((frame) => frame.url()),
  consoleErrors,
  responses,
  renderFailure,
  h9VisibleFinding,
};
writeFileSync(`${evidenceDir}/entry-probe.json`, `${JSON.stringify(evidence, null, 2)}\n`);
await browser.close();
if (renderFailure || h9VisibleFinding) {
  throw new Error([renderFailure, h9VisibleFinding].filter(Boolean).join(" | "));
}
console.log(JSON.stringify({ entryUrl: evidence.entryUrl, platformStatus: evidence.platformStatus,
  projectedFleet, expectedActiveDevices, visible: true }, null, 2));
