import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";

function unwrap(raw, fallback) {
  if (!raw) return fallback;
  const parsed = JSON.parse(raw);
  return parsed && parsed.type && Object.prototype.hasOwnProperty.call(parsed, "data") ? parsed.data : parsed;
}

function wrap(data) {
  return JSON.stringify({ type: "object", data });
}

function stableAccountView(snapshot) {
  return JSON.stringify({
    user: snapshot?.default?.user,
    devices: snapshot?.default?.devices,
    earnings: snapshot?.default?.earnings,
    latestWithdrawal: snapshot?.default?.latestWithdrawal,
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") collectAppConsoleErrors(errors, baseUrl)(msg);
});
page.on("pageerror", (err) => errors.push(err.message));

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

let registry = await page.evaluate((unwrapText) => {
  const unwrap = eval(`(${unwrapText})`);
  return unwrap(localStorage.getItem("nexgrid-account-sessions-v1"), { schema: 1, sessions: {} });
}, unwrap.toString());
let current = Object.values(registry.sessions).find((s) => !s.endedAt && !s.killedAt);
if (!current) throw new Error("active session missing before revoke");

await page.goto(`${baseUrl}/#/pages/me/security`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
registry = await page.evaluate((unwrapText) => {
  const unwrap = eval(`(${unwrapText})`);
  return unwrap(localStorage.getItem("nexgrid-account-sessions-v1"), { schema: 1, sessions: {} });
}, unwrap.toString());
const sameDeviceActive = Object.values(registry.sessions).filter(
  (s) =>
    s.accountKey === current.accountKey &&
    s.deviceId === current.deviceId &&
    s.entrySurface === current.entrySurface &&
    !s.endedAt &&
    !s.killedAt,
);
if (sameDeviceActive.length !== 1) {
  throw new Error(`same device refresh created duplicate active sessions: ${sameDeviceActive.length}`);
}
current = sameDeviceActive[0];
registry.sessions[current.sessionId] = { ...current, killedAt: Date.now() };

await page.evaluate(({ next, wrapText }) => {
  const wrap = eval(`(${wrapText})`);
  localStorage.setItem("nexgrid-account-sessions-v1", wrap(next));
}, { next: registry, wrapText: wrap.toString() });

await page.waitForTimeout(1800);
const hashAfterKick = await page.evaluate(() => location.hash);
if (!hashAfterKick.includes("/pages/session/kicked")) {
  throw new Error(`session revoke did not route to kicked page: ${hashAfterKick}`);
}

const coldPage = await context.newPage();
coldPage.on("console", (msg) => {
  if (msg.type() === "error") collectAppConsoleErrors(errors, baseUrl)(msg);
});
coldPage.on("pageerror", (err) => errors.push(err.message));
await coldPage.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
await coldPage.waitForTimeout(2500);
const hashAfterColdStart = await coldPage.evaluate(() => location.hash);
if (!hashAfterColdStart.includes("/pages/session/kicked")) {
  throw new Error(`revoked session cold-start minted a new session instead of staying ended: ${hashAfterColdStart}`);
}
const registryAfterColdStart = await coldPage.evaluate((unwrapText) => {
  const unwrap = eval(`(${unwrapText})`);
  return unwrap(localStorage.getItem("nexgrid-account-sessions-v1"), { schema: 1, sessions: {} });
}, unwrap.toString());
const activeAfterColdStart = Object.values(registryAfterColdStart.sessions).filter(
  (s) => s.accountKey === current.accountKey && !s.endedAt && !s.killedAt,
);
if (activeAfterColdStart.length) {
  throw new Error(`revoked session cold-start left active sessions: ${activeAfterColdStart.length}`);
}
await coldPage.close();

const afterKick = await page.evaluate((unwrapText) => {
  const unwrap = eval(`(${unwrapText})`);
  return unwrap(localStorage.getItem("nexgrid-account-cloud-v1"), {});
}, unwrap.toString());
const stableAfterKick = stableAccountView(afterKick);

await page.waitForTimeout(7500);
const finalSnapshot = await page.evaluate((unwrapText) => {
  const unwrap = eval(`(${unwrapText})`);
  return unwrap(localStorage.getItem("nexgrid-account-cloud-v1"), {});
}, unwrap.toString());
const stableFinal = stableAccountView(finalSnapshot);

await browser.close();

if (stableAfterKick !== stableFinal) {
  throw new Error("business pollers kept writing account data after session revoke");
}
if (errors.length) {
  throw new Error(`browser errors: ${errors.slice(0, 5).join(" | ")}`);
}

console.log("SPEC-4 runtime session guard PASS");
